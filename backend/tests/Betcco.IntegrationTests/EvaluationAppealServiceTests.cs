using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Betcco.IntegrationTests;

public sealed class EvaluationAppealServiceTests
{
    [Fact]
    public async Task Appeal_requires_a_released_result_and_an_independent_lead_verifier_without_mutating_the_grade()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Completed,
            CalculatedGrade = EvaluationGrade.Merit
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment { EvaluationRequestId = request.Id, EvaluatorUserId = "assessor", AssignedByUserId = "reviewer" });
        db.InternalVerifications.Add(new InternalVerification { EvaluationRequestId = request.Id, VerifierUserId = "prior-verifier", Decision = "Approved" });
        await db.SaveChangesAsync();

        var service = new EvaluationAppealService(db, new AcademicStaff());
        var appeal = await service.CreateAsync("student", new CreateEvaluationAppealCommand(request.Id, "The criterion evidence was not considered in the recorded decision."));

        Assert.NotNull(appeal);
        Assert.Null(await service.CreateAsync("student", new CreateEvaluationAppealCommand(request.Id, "A duplicate appeal cannot remain open for the same completed decision.")));
        Assert.False(await service.ReviewAsync("assessor", appeal!.Id, new ReviewEvaluationAppealCommand(EvaluationAppealStatus.Upheld, "This reviewer assessed the original work.")));
        Assert.False(await service.ReviewAsync("prior-verifier", appeal.Id, new ReviewEvaluationAppealCommand(EvaluationAppealStatus.Upheld, "This reviewer performed the original verification.")));
        Assert.True(await service.ReviewAsync("lead", appeal.Id, new ReviewEvaluationAppealCommand(EvaluationAppealStatus.Upheld, "The decision requires independent reassessment under the approved process.")));

        var stored = await db.EvaluationAppeals.SingleAsync();
        Assert.Equal(EvaluationAppealStatus.Upheld, stored.Status);
        Assert.Equal(EvaluationGrade.Merit, request.CalculatedGrade);
        Assert.Equal(EvaluationStatus.Completed, request.Status);
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), item => item.EventType == "AppealUpheld");
        Assert.Contains(await db.Notifications.ToListAsync(), item => item.UserId == "student" && item.DeepLink == "/student/appeals");
    }

    [Fact]
    public async Task Audit_export_is_lead_verifier_only_and_has_a_reproducible_payload_checksum()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Completed,
            CalculatedGrade = EvaluationGrade.Pass,
            AssessmentRuleSetSnapshotJson = "{\"version\":\"approved-v1\"}",
            AssessmentRuleSetVersion = "approved-v1"
        };
        db.EvaluationRequests.Add(request);
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = request.Id,
            StudentUserId = "student",
            AttemptNumber = 1,
            PolicyVersion = "authenticity-v1",
            StatementSnapshot = "I confirm this is my work."
        });
        db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            EvaluationRequestId = request.Id,
            ActorUserId = "student",
            EventType = "AuthenticityDeclared"
        });
        await db.SaveChangesAsync();

        var exports = new AssessmentAuditExportService(db, new AcademicStaff());
        Assert.Null(await exports.CreateAsync("not-a-lead", request.Id));
        var export = await exports.CreateAsync("lead", request.Id);

        Assert.NotNull(export);
        Assert.Matches("^[a-f0-9]{64}$", export!.PayloadSha256);
        using var json = JsonDocument.Parse(export.JsonContent);
        Assert.Equal(export.PayloadSha256, json.RootElement.GetProperty("payloadSha256").GetString());
        Assert.Equal("betcco-assessment-audit-v1", json.RootElement.GetProperty("payload").GetProperty("schemaVersion").GetString());
        Assert.Contains(await db.AuditLogs.ToListAsync(), item => item.Action == "AssessmentAuditExported" && item.ActorUserId == "lead");
    }

    private sealed class AcademicStaff : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(userId is "assessor" or "prior-verifier" or "lead");
    }
}
