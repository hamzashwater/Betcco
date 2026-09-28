using System.Diagnostics;
using Betcco.Application.Common;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class PrivacyPortabilityArtifactCleanupPostgresTests
{
    [Fact]
    [Trait("Category", "PostgreSQLPrivacy")]
    public async Task Expired_export_cleanup_queries_enqueue_delete_and_audit_completed_storage_operation()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_portability_expiry_cleanup");
        const string storageKey = "objects/portability/expired-artifact";
        var exportId = await SeedExpiredExportAsync(database, storageKey);
        await using var db = database.CreateContext();

        var storage = new DeletedObjectStorage();
        var coordinator = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);
        var cleanup = new DataPortabilityArtifactCleanupService(db, coordinator);

        Assert.Equal(1, await cleanup.EnqueueExpiredArtifactDeletionsAsync());
        Assert.Equal(1, await coordinator.ProcessPendingAsync());
        Assert.Equal(1, await cleanup.AuditCompletedArtifactDeletionsAsync());
        Assert.Equal(0, await cleanup.EnqueueExpiredArtifactDeletionsAsync());
        Assert.Equal(0, await cleanup.AuditCompletedArtifactDeletionsAsync());

        Assert.True(storage.WasDeleted);
        Assert.NotNull(await db.DataPortabilityExports.SingleOrDefaultAsync(item => item.Id == exportId));
        Assert.Equal(storageKey, (await db.DataPortabilityExports.SingleAsync(item => item.Id == exportId)).StorageKey);
        Assert.Single(await db.StorageLifecycleOperations.Where(item => item.StorageKey == storageKey).ToListAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "DataPortabilityExportExpiredArtifactDeleted").ToListAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLPrivacy")]
    public async Task Concurrent_enqueue_creates_one_delete_operation()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_portability_enqueue_race");
        const string storageKey = "objects/portability/concurrent-enqueue";
        await SeedExpiredExportAsync(database, storageKey);
        var gate = new SaveGate();
        await using var firstDb = database.CreateContext(gate);
        await using var secondDb = database.CreateContext();

        var firstTask = CreateCleanup(firstDb).EnqueueExpiredArtifactDeletionsAsync();
        await gate.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            var secondTask = CreateCleanup(secondDb).EnqueueExpiredArtifactDeletionsAsync();
            await WaitForPostgresExportLockAsync(database.ConnectionString);
            Assert.False(secondTask.IsCompleted);
            gate.Release();

            Assert.Equal(1, await firstTask);
            Assert.Equal(0, await secondTask);
        }
        finally
        {
            gate.Release();
        }

        await using var verify = database.CreateContext();
        Assert.Single(await verify.StorageLifecycleOperations.Where(item =>
            item.Action == StorageLifecycleAction.Delete && item.StorageKey == storageKey).ToListAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLPrivacy")]
    public async Task Concurrent_completed_delete_audit_creates_one_audit_event()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_portability_audit_race");
        const string storageKey = "objects/portability/concurrent-audit";
        var exportId = await SeedExpiredExportAsync(database, storageKey);
        await using (var seed = database.CreateContext())
        {
            seed.StorageLifecycleOperations.Add(new StorageLifecycleOperation
            {
                Action = StorageLifecycleAction.Delete,
                Status = StorageLifecycleStatus.Completed,
                StorageKey = storageKey,
                CompletedAtUtc = DateTimeOffset.UtcNow
            });
            await seed.SaveChangesAsync();
        }

        var gate = new SaveGate();
        await using var firstDb = database.CreateContext(gate);
        await using var secondDb = database.CreateContext();

        var firstTask = CreateCleanup(firstDb).AuditCompletedArtifactDeletionsAsync();
        await gate.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            var secondTask = CreateCleanup(secondDb).AuditCompletedArtifactDeletionsAsync();
            await WaitForPostgresExportLockAsync(database.ConnectionString);
            Assert.False(secondTask.IsCompleted);
            gate.Release();

            Assert.Equal(1, await firstTask);
            Assert.Equal(0, await secondTask);
        }
        finally
        {
            gate.Release();
        }

        await using var verify = database.CreateContext();
        Assert.Single(await verify.AuditLogs.Where(item =>
            item.Action == "DataPortabilityExportExpiredArtifactDeleted" &&
            item.EntityType == nameof(DataPortabilityExport) &&
            item.EntityId == exportId.ToString()).ToListAsync());
    }

    private static DataPortabilityArtifactCleanupService CreateCleanup(BetccoDbContext db) =>
        new(db, new StorageLifecycleCoordinator(db, new DeletedObjectStorage(), NullLogger<StorageLifecycleCoordinator>.Instance));

    private static async Task<Guid> SeedExpiredExportAsync(PostgresTestDatabase database, string storageKey)
    {
        await using var db = database.CreateContext();
        var request = new DataSubjectRequest
        {
            OwnerUserId = Guid.NewGuid().ToString(),
            RequestType = DataSubjectRequestType.Portability,
            Status = DataSubjectRequestStatus.InReview,
            IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
            IdentityVerifiedByUserId = "privacy-admin"
        };
        db.DataSubjectRequests.Add(request);
        var export = new DataPortabilityExport
        {
            DataSubjectRequestId = request.Id,
            SubjectUserId = request.OwnerUserId,
            Status = DataPortabilityExportStatus.Released,
            RequestedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            RequestedByUserId = "privacy-admin",
            GeneratedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            GeneratedByUserId = "privacy-admin",
            ExportFormat = "application/json",
            ExportVersion = "betcco-portability-v1",
            StorageKey = storageKey,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
            ReleasedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            ReleasedByUserId = "privacy-admin"
        };
        db.DataPortabilityExports.Add(export);
        await db.SaveChangesAsync();
        return export.Id;
    }

    private static async Task WaitForPostgresExportLockAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < TimeSpan.FromSeconds(10))
        {
            await using var command = new NpgsqlCommand(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DataPortabilityExports%FOR UPDATE%')", connection);
            if ((bool)(await command.ExecuteScalarAsync())!) return;
            await Task.Delay(25);
        }
        throw new TimeoutException("The second cleanup did not wait on the PostgreSQL export-row lock.");
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

    private sealed class DeletedObjectStorage : IFileStorage
    {
        public bool WasDeleted { get; private set; }

        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(null);

        public Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            WasDeleted = true;
            return Task.CompletedTask;
        }
    }
}
