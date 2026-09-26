using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class EvaluationReviewDecisionHistoryTests
{
    [Fact]
    public async Task Completed_initial_review_saves_each_criterion_with_the_current_grade()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var request = NewRequest(EvaluationStatus.Assigned);
        request.CriteriaSnapshotJson = JsonSerializer.Serialize(new[] { "A.P1", "A.P2" });
        request.EvaluatorCriteriaPlanJson = request.CriteriaSnapshotJson;
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "teacher",
            AssignedByUserId = "admin"
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.True(await service.SubmitReviewAsync("teacher", request.Id, new SubmitEvaluationReviewCommand(
            [new CriterionSubmission("A.P1", "Achieved", "Evidence one", "Comment one"),
             new CriterionSubmission("A.P2", "Achieved", "Evidence two", "Comment two")],
            "Both pass criteria achieved.", false, null)));

        var decision = await db.EvaluationReviewDecisions.AsNoTracking()
            .Include(item => item.CriterionDecisions).SingleAsync();
        Assert.Equal(EvaluationReviewStage.InitialReview, decision.ReviewStage);
        Assert.Equal(1, decision.AttemptNumber);
        Assert.Equal(EvaluationGrade.Pass, decision.CalculatedGrade);
        Assert.Equal(request.SectionResultsJson, decision.SectionResultsJson);
        Assert.Equal(2, decision.CriterionDecisions.Count);
        Assert.Equal(2, decision.CriterionCount);
        Assert.Contains(decision.CriterionDecisions, item => item.CriterionCode == "A.P1"
            && item.Achievement == CriterionAchievement.Achieved && item.Evidence == "Evidence one"
            && item.Comment == "Comment one");
        Assert.Contains(decision.CriterionDecisions, item => item.CriterionCode == "A.P2"
            && item.Achievement == CriterionAchievement.Achieved && item.Evidence == "Evidence two"
            && item.Comment == "Comment two");
        Assert.Equal(EvaluationStatus.Completed, request.Status);
        Assert.Equal(EvaluationGrade.Pass, request.CalculatedGrade);
        Assert.Equal(2, await db.CriterionResults.CountAsync());
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(),
            item => item.EventType == "InitialReviewCompleted");
    }

    [Fact]
    public async Task Completed_decisions_and_criteria_cannot_be_changed_through_the_context()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using (var db = NewInMemoryContext(databaseName))
        {
            var request = NewRequest(EvaluationStatus.Completed);
            db.EvaluationRequests.Add(request);
            var decision = NewDecision(request.Id);
            decision.CriterionDecisions.Add(new EvaluationReviewCriterionDecision
            {
                CriterionCode = "A.P1",
                Achievement = CriterionAchievement.Achieved
            });
            db.EvaluationReviewDecisions.Add(decision);
            await db.SaveChangesAsync();
        }

        await using (var db = NewInMemoryContext(databaseName))
        {
            var decision = await db.EvaluationReviewDecisions.SingleAsync();
            decision.Feedback = "rewritten";
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }
        await using (var db = NewInMemoryContext(databaseName))
        {
            var criterion = await db.EvaluationReviewCriterionDecisions.SingleAsync();
            db.EvaluationReviewCriterionDecisions.Remove(criterion);
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }
        await using (var db = NewInMemoryContext(databaseName))
        {
            var decision = await db.EvaluationReviewDecisions.SingleAsync();
            db.EvaluationReviewCriterionDecisions.Add(new EvaluationReviewCriterionDecision
            {
                EvaluationReviewDecisionId = decision.Id,
                CriterionCode = "A.P2",
                Achievement = CriterionAchievement.Achieved
            });
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    [Trait("Category", "PostgreSQLAssessment")]
    public async Task Additive_migration_preserves_legacy_results_without_fabricating_history_and_blocks_mutation()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("review_history",
            targetMigration: "20260926151412_AddEvaluationResitAuthorizations");
        var request = NewRequest(EvaluationStatus.Completed);
        request.CalculatedGrade = EvaluationGrade.Pass;
        await using (var before = database.CreateContext())
        {
            before.EvaluationRequests.Add(request);
            before.CriterionResults.Add(new CriterionResult
            {
                EvaluationRequestId = request.Id,
                CriterionCode = "A.P1",
                Achievement = CriterionAchievement.Achieved,
                Evidence = "legacy evidence"
            });
            await before.SaveChangesAsync();
            await before.GetService<IMigrator>().MigrateAsync();
        }

        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Contains(db.Database.GetAppliedMigrations(), item => item.EndsWith("_AddEvaluationReviewDecisionHistory", StringComparison.Ordinal));
        Assert.Empty(await db.EvaluationReviewDecisions.ToListAsync());
        Assert.Equal("legacy evidence", (await db.CriterionResults.SingleAsync()).Evidence);

        var decision = NewDecision(request.Id);
        decision.CriterionDecisions.Add(new EvaluationReviewCriterionDecision
        {
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved,
            Evidence = "snapshot evidence"
        });
        db.EvaluationReviewDecisions.Add(decision);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE \"EvaluationReviewDecisions\" SET \"Feedback\" = 'changed' WHERE \"Id\" = {decision.Id}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"DELETE FROM \"EvaluationReviewDecisions\" WHERE \"Id\" = {decision.Id}"));
        var criterionId = decision.CriterionDecisions.Single().Id;
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE \"EvaluationReviewCriterionDecisions\" SET \"Evidence\" = 'changed' WHERE \"Id\" = {criterionId}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"DELETE FROM \"EvaluationReviewCriterionDecisions\" WHERE \"Id\" = {criterionId}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "EvaluationReviewCriterionDecisions"
                ("Id", "EvaluationReviewDecisionId", "CriterionCode", "Achievement", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
            VALUES ({Guid.NewGuid()}, {decision.Id}, 'A.P2', 0, {DateTimeOffset.UtcNow}, {DateTimeOffset.UtcNow}, FALSE)
            """));
        Assert.Equal("snapshot evidence", (await db.EvaluationReviewCriterionDecisions.AsNoTracking().SingleAsync()).Evidence);
    }

    private static BetccoDbContext NewInMemoryContext(string name) => new(
        new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(name).Options);

    private static EvaluationRequest NewRequest(EvaluationStatus status) => new()
    {
        StudentUserId = "student",
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Status = status,
        CriteriaSnapshotJson = "[\"A.P1\"]",
        EvaluatorCriteriaPlanJson = "[\"A.P1\"]",
        AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
    };

    private static EvaluationReviewDecision NewDecision(Guid requestId) => new()
    {
        EvaluationRequestId = requestId,
        AttemptNumber = 1,
        ReviewStage = EvaluationReviewStage.InitialReview,
        ReviewerUserId = "teacher",
        DecidedAtUtc = DateTimeOffset.UtcNow,
        CalculatedGrade = EvaluationGrade.Pass,
        SectionResultsJson = "[]",
        Feedback = "Review completed",
        CriterionCount = 1
    };

    private sealed class NullFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult("unused");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }

    private sealed class CleanFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
