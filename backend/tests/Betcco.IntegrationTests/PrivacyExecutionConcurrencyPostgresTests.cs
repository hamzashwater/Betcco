using System.Data.Common;
using System.Diagnostics;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class PrivacyExecutionConcurrencyPostgresTests
{
    [Fact]
    public async Task Execution_and_completed_replay_write_one_fulfillment_and_success_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_execution_replay");
        var jobId = await SeedAsync(database, "first");

        await using (var firstDb = database.CreateContext())
        await using (var replayDb = database.CreateContext())
        {
            var first = await ExecuteAsync(firstDb, jobId);
            var job = await replayDb.PrivacyExecutionJobs.AsNoTracking().SingleAsync(item => item.Id == jobId);
            var reevaluated = await new PrivacyExecutionService(replayDb).EvaluateAsync(new(
                job.DataSubjectRequestId, job.RetentionPolicyId, true, "Repeated eligibility review.", "privacy-admin"));
            Assert.Equal(PrivacyExecutionJobStatus.Completed, reevaluated.Job!.Status);
            var replay = await ExecuteAsync(replayDb, jobId);
            Assert.Equal(first.Fulfillment!.Id, replay.Fulfillment!.Id);
        }

        await AssertCompletedOnceAsync(database, jobId);
    }

    [Fact]
    public async Task Simultaneous_execution_from_separate_contexts_waits_and_replays_the_winner()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_execution_race");
        var jobId = await SeedAsync(database, "first");
        var gate = new SaveGate();
        await using var firstDb = database.CreateContext(gate);
        await using var secondDb = database.CreateContext();

        var firstTask = ExecuteAsync(firstDb, jobId);
        await gate.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            var secondTask = ExecuteAsync(secondDb, jobId);
            await WaitForPostgresLockAsync(database.ConnectionString);
            Assert.False(secondTask.IsCompleted);
            gate.Release();

            var first = await firstTask;
            var second = await secondTask;
            Assert.Equal(first.Fulfillment!.Id, second.Fulfillment!.Id);
        }
        finally
        {
            gate.Release();
        }

        await AssertCompletedOnceAsync(database, jobId);
    }

    [Fact]
    public async Task Unrelated_requests_can_execute_while_another_request_is_paused()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_execution_independent");
        var firstJobId = await SeedAsync(database, "first");
        var secondJobId = await SeedAsync(database, "second");
        var gate = new SaveGate();
        await using var firstDb = database.CreateContext(gate);
        await using var secondDb = database.CreateContext();

        var firstTask = ExecuteAsync(firstDb, firstJobId);
        await gate.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            var second = await ExecuteAsync(secondDb, secondJobId).WaitAsync(TimeSpan.FromSeconds(10));
            Assert.NotNull(second.Fulfillment);
        }
        finally
        {
            gate.Release();
        }
        Assert.NotNull((await firstTask).Fulfillment);

        await AssertCompletedOnceAsync(database, firstJobId);
        await AssertCompletedOnceAsync(database, secondJobId);
    }

    [Fact]
    public async Task Failed_save_rolls_back_concealment_completion_and_audit_then_allows_retry()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_execution_rollback");
        var jobId = await SeedAsync(database, "first");
        await using (var failedDb = database.CreateContext(new FailAfterFulfillmentInsert()))
        {
            var failure = await Assert.ThrowsAsync<DbUpdateException>(() => ExecuteAsync(failedDb, jobId));
            Assert.IsType<InvalidOperationException>(failure.InnerException);
        }

        await using (var verify = database.CreateContext())
        {
            Assert.Equal(PrivacyExecutionJobStatus.AwaitingManualExecution,
                (await verify.PrivacyExecutionJobs.SingleAsync(item => item.Id == jobId)).Status);
            Assert.Equal("JO", (await verify.Users.SingleAsync()).CountryCode);
            Assert.Empty(await verify.DataSubjectFulfillments.ToListAsync());
            Assert.Empty(await verify.AuditLogs.Where(item => item.Action == "PrivacyProfileDemographicsConcealed").ToListAsync());
        }

        await using (var retryDb = database.CreateContext())
        {
            Assert.NotNull((await ExecuteAsync(retryDb, jobId)).Fulfillment);
        }
        await AssertCompletedOnceAsync(database, jobId);
    }

    private static async Task<Guid> SeedAsync(PostgresTestDatabase database, string name)
    {
        await using var db = database.CreateContext();
        var owner = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = $"{name}@betcco.test",
            NormalizedUserName = $"{name.ToUpperInvariant()}@BETCCO.TEST",
            Email = $"{name}@betcco.test",
            NormalizedEmail = $"{name.ToUpperInvariant()}@BETCCO.TEST",
            DisplayName = name,
            CountryCode = "JO",
            Gender = "PreferNotToSay",
            DateOfBirth = new DateOnly(2000, 1, 1)
        };
        var request = new DataSubjectRequest
        {
            OwnerUserId = owner.Id.ToString(),
            RequestType = DataSubjectRequestType.ErasureOrConcealment,
            Status = DataSubjectRequestStatus.InReview,
            IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
            IdentityVerifiedByUserId = "privacy-admin"
        };
        var policy = new RetentionPolicy
        {
            PolicyKey = $"profile-demographics-{name}",
            Version = "1.0",
            DataCategoryOrPurpose = "Configured profile demographics category",
            RetentionRule = "configured legal review rule",
            LegalOrBusinessBasis = "Configured legal or business basis",
            ActionAfterExpiry = RetentionActionAfterExpiry.Conceal,
            ExecutionCategory = PrivacyExecutionCategory.ProfileDemographics,
            IsEnabled = true,
            IsCurrent = true,
            EffectiveAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
        };
        var job = new PrivacyExecutionJob
        {
            DataSubjectRequestId = request.Id,
            SubjectUserId = request.OwnerUserId,
            RetentionPolicyId = policy.Id,
            RetentionPolicyVersion = policy.Version,
            RetentionRuleSnapshot = policy.RetentionRule,
            ActionAfterExpiry = policy.ActionAfterExpiry,
            ExecutionCategory = policy.ExecutionCategory,
            Status = PrivacyExecutionJobStatus.AwaitingManualExecution,
            EligibilityReason = "Reviewed eligibility",
            EvaluatedAtUtc = DateTimeOffset.UtcNow,
            EvaluatedByUserId = "privacy-admin"
        };
        db.Users.Add(owner);
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        db.PrivacyExecutionJobs.Add(job);
        await db.SaveChangesAsync();
        return job.Id;
    }

    private static Task<EraseConcealmentExecutionResult> ExecuteAsync(BetccoDbContext db, Guid jobId) =>
        new EraseConcealmentExecutionService(db, new DataSubjectFulfillmentService(db))
            .ExecuteAsync(jobId, "privacy-admin");

    private static async Task AssertCompletedOnceAsync(PostgresTestDatabase database, Guid jobId)
    {
        await using var verify = database.CreateContext();
        var job = await verify.PrivacyExecutionJobs.SingleAsync(item => item.Id == jobId);
        Assert.Equal(PrivacyExecutionJobStatus.Completed, job.Status);
        Assert.Single(await verify.DataSubjectFulfillments.Where(item => item.DataSubjectRequestId == job.DataSubjectRequestId).ToListAsync());
        Assert.Single(await verify.AuditLogs.Where(item => item.Action == "PrivacyProfileDemographicsConcealed" && item.EntityId == jobId.ToString()).ToListAsync());
        var ownerId = Guid.Parse(job.SubjectUserId);
        var owner = await verify.Users.SingleAsync(item => item.Id == ownerId);
        Assert.Null(owner.CountryCode);
        Assert.Null(owner.Gender);
        Assert.Null(owner.DateOfBirth);
    }

    private static async Task WaitForPostgresLockAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < TimeSpan.FromSeconds(10))
        {
            await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DataSubjectRequests%FOR UPDATE%')", connection);
            if ((bool)(await command.ExecuteScalarAsync())!) return;
            await Task.Delay(25);
        }
        throw new TimeoutException("The second execution did not wait on the PostgreSQL request-row lock.");
    }

    private sealed class SaveGate : SaveChangesInterceptor
    {
        private readonly TaskCompletionSource<bool> released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<bool> Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Entered.TrySetResult(true);
            await released.Task.WaitAsync(cancellationToken);
            return result;
        }

        public void Release() => released.TrySetResult(true);
    }

    private sealed class FailAfterFulfillmentInsert : DbCommandInterceptor
    {
        public override ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default) =>
            command.CommandText.Contains("INSERT INTO \"DataSubjectFulfillments\"", StringComparison.Ordinal)
                ? throw new InvalidOperationException("Injected failure after fulfillment insert")
                : new ValueTask<DbDataReader>(result);
    }
}
