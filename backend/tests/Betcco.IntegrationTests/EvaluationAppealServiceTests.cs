using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

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
    public async Task Audit_export_is_lead_verifier_only_minimizes_identifiers_and_preserves_academic_evidence()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var requestId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var submissionId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var qualificationVersionId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var auditEventId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var paymentId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var assessor = User("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "Assigned Assessor");
        var assigner = User("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Assessment Administrator");
        var verifier = User("cccccccc-cccc-cccc-cccc-cccccccccccc", "Regular Internal Verifier");
        var leadVerifier = User("dddddddd-dddd-dddd-dddd-dddddddddddd", "Lead Internal Verifier");
        var legacyAdmin = User("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "Legacy Admin Verifier");
        var request = new EvaluationRequest
        {
            Id = requestId,
            StudentUserId = "student-id-sentinel",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Completed,
            CalculatedGrade = EvaluationGrade.Pass,
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson,
            AssessmentRuleSetVersion = "approved-v1",
            QualificationVersionId = qualificationVersionId,
            QualificationVersionSnapshotJson = "{\"qualificationCode\":\"BTEC-L3-IT\",\"versionCode\":\"2026\",\"sourceReference\":\"SR-2026\"}",
            CriteriaSnapshotJson = "[\"A.P1\"]",
            EvaluatorCriteriaPlanJson = "[\"A.P1\"]",
            SectionResultsJson = "[{\"section\":\"A\",\"grade\":\"Pass\"}]"
        };
        request.SubmissionFiles.Add(new SubmissionFile
        {
            Id = submissionId,
            OriginalFileName = "learner-evidence.pdf",
            StorageKey = "private/internal/storage-key-sentinel",
            ContentType = "application/pdf",
            LengthBytes = 4096,
            ScanStatus = UploadScanStatus.Clean
        });
        request.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            StudentUserId = "student-id-sentinel",
            AttemptNumber = 1,
            PolicyVersion = "authenticity-v1",
            StatementSnapshot = "I confirm this is my work.",
            IpAddress = "203.0.113.77",
            UserAgent = "SentinelUserAgent/9.9"
        });
        request.CriterionResults.Add(new CriterionResult
        {
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved,
            Evidence = "Executed test evidence",
            Comment = "Criterion met"
        });
        request.EvidenceItems.Add(new EvaluationEvidence
        {
            CriterionCode = "A.P1",
            Narrative = "Repository history and executed tests support the decision."
        });
        request.FeedbackItems.Add(new EvaluationFeedback
        {
            AuthorUserId = assessor.Id.ToString(),
            Body = "The assigned assessor documented the criterion decision.",
            RequestsResubmission = false
        });
        request.FeedbackItems.Add(new EvaluationFeedback
        {
            AuthorUserId = verifier.Id.ToString(),
            Body = "The regular internal verifier confirmed the evidence.",
            RequestsResubmission = false
        });
        request.FeedbackItems.Add(new EvaluationFeedback
        {
            AuthorUserId = leadVerifier.Id.ToString(),
            Body = "The lead internal verifier confirmed the evidence.",
            RequestsResubmission = false
        });
        request.FeedbackItems.Add(new EvaluationFeedback
        {
            AuthorUserId = legacyAdmin.Id.ToString(),
            Body = "The legacy admin acted through the verifier workflow.",
            RequestsResubmission = false
        });
        request.InternalVerifications.Add(new InternalVerification
        {
            VerifierUserId = verifier.Id.ToString(),
            Decision = "Accepted",
            Comment = "The decision is supported by the evidence."
        });
        var plan = new InternalVerificationPlan { SelectionRationale = "Risk-based sample" };
        request.InternalVerificationSamples.Add(new InternalVerificationSample
        {
            InternalVerificationPlan = plan,
            SubmissionAttemptNumber = 1,
            SelectedByUserId = leadVerifier.Id.ToString(),
            AssignedVerifierUserId = verifier.Id.ToString(),
            SelectionRationale = "Representative completed assessment",
            Status = InternalVerificationSampleStatus.Accepted,
            DecisionComment = "Sample accepted",
            DecidedAtUtc = DateTimeOffset.UtcNow
        });
        request.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            AuthorizedByUserId = verifier.Id.ToString(),
            AttemptNumber = 1,
            RuleSetVersion = request.AssessmentRuleSetVersion,
            Reason = "The regular internal verifier authorized a further submission.",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(7)
        });
        request.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            AuthorizedByUserId = leadVerifier.Id.ToString(),
            AttemptNumber = 2,
            RuleSetVersion = request.AssessmentRuleSetVersion,
            Reason = "The lead internal verifier authorized a further submission.",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(7)
        });
        request.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            AuthorizedByUserId = legacyAdmin.Id.ToString(),
            AttemptNumber = 3,
            RuleSetVersion = request.AssessmentRuleSetVersion,
            Reason = "The legacy admin acted through the verifier workflow.",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(7)
        });
        request.Appeals.Add(new EvaluationAppeal
        {
            StudentUserId = "student-id-sentinel",
            Reason = "Please review the criterion decision.",
            Status = EvaluationAppealStatus.Upheld,
            ReviewedByUserId = leadVerifier.Id.ToString(),
            DecisionRationale = "The academic evidence supported the appeal.",
            ReviewedAtUtc = DateTimeOffset.UtcNow
        });
        request.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            Id = auditEventId,
            ActorUserId = assessor.Id.ToString(),
            EventType = "AssessmentDecisionUpdated",
            FromStatus = "Assigned",
            ToStatus = "UnderReview",
            Reason = "Academic decision recorded.",
            AttemptNumber = 1,
            CorrelationId = "secret-token-sentinel"
        });
        request.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            ActorUserId = "student-id-sentinel",
            EventType = "PaymentConfirmed",
            Reason = paymentId.ToString(),
            AttemptNumber = 1
        });
        var assignment = new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = assessor.Id.ToString(),
            AssignedByUserId = assigner.Id.ToString()
        };
        db.AddRange(assessor, assigner, verifier, leadVerifier, legacyAdmin, request, assignment);
        await db.SaveChangesAsync();

        var exports = new AssessmentAuditExportService(db, new AcademicStaff());
        Assert.Null(await exports.CreateAsync("not-a-lead", request.Id));
        var export = await exports.CreateAsync("lead", request.Id);

        Assert.NotNull(export);
        Assert.Matches("^[a-f0-9]{64}$", export!.PayloadSha256);
        Assert.DoesNotContain(request.Id.ToString("N"), export.FileName, StringComparison.OrdinalIgnoreCase);
        using var json = JsonDocument.Parse(export.JsonContent);
        Assert.Equal(export.PayloadSha256, json.RootElement.GetProperty("payloadSha256").GetString());
        var payload = json.RootElement.GetProperty("payload");
        Assert.Equal("betcco-assessment-audit-v2", payload.GetProperty("schemaVersion").GetString());
        var checksumBytes = JsonSerializer.SerializeToUtf8Bytes(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(export.PayloadSha256, Convert.ToHexString(SHA256.HashData(checksumBytes)).ToLowerInvariant());

        var criterion = payload.GetProperty("criterionDecisions")[0];
        Assert.Equal("A.P1", criterion.GetProperty("criterionCode").GetString());
        Assert.Equal("Achieved", criterion.GetProperty("achievement").GetString());
        Assert.Equal("Executed test evidence", criterion.GetProperty("evidence").GetString());
        Assert.Equal("Criterion met", criterion.GetProperty("comment").GetString());
        Assert.Equal("Repository history and executed tests support the decision.", payload.GetProperty("evidence")[0].GetProperty("narrative").GetString());
        Assert.Equal("Assigned Assessor", payload.GetProperty("evaluatorAssignments")[0].GetProperty("assessor").GetProperty("displayName").GetString());
        Assert.Equal("2026", payload.GetProperty("evaluation").GetProperty("qualification").GetProperty("versionCode").GetString());
        Assert.Equal("Assessor", payload.GetProperty("academicAuditTrail")[0].GetProperty("actor").GetProperty("role").GetString());
        Assert.Equal("Regular Internal Verifier", payload.GetProperty("internalVerification").GetProperty("decisions")[0].GetProperty("verifier").GetProperty("displayName").GetString());
        Assert.NotEqual(default, payload.GetProperty("academicAuditTrail")[0].GetProperty("occurredAtUtc").GetDateTimeOffset());
        AssertActor(payload.GetProperty("feedback"), "author", "Assigned Assessor", "Assessor");
        AssertActor(payload.GetProperty("feedback"), "author", "Regular Internal Verifier", "InternalVerifier");
        AssertActor(payload.GetProperty("feedback"), "author", "Lead Internal Verifier", "InternalVerifier");
        AssertActor(payload.GetProperty("feedback"), "author", "Legacy Admin Verifier", "InternalVerifier");
        AssertActor(payload.GetProperty("resubmissionAuthorizations"), "authorizedBy", "Regular Internal Verifier", "InternalVerifier");
        AssertActor(payload.GetProperty("resubmissionAuthorizations"), "authorizedBy", "Lead Internal Verifier", "InternalVerifier");
        AssertActor(payload.GetProperty("resubmissionAuthorizations"), "authorizedBy", "Legacy Admin Verifier", "InternalVerifier");

        AssertJsonHasNoProperties(json.RootElement,
            "id", "evaluationRequestId", "qualificationVersionId", "evaluatorUserId", "assignedByUserId",
            "authorUserId", "verifierUserId", "selectedByUserId", "assignedVerifierUserId", "authorizedByUserId",
            "reviewedByUserId", "actorUserId", "studentUserId", "storageKey", "ipAddress", "userAgent", "correlationId");
        AssertJsonHasNoStringValues(json.RootElement,
            requestId.ToString(), submissionId.ToString(), qualificationVersionId.ToString(), auditEventId.ToString(), paymentId.ToString(),
            assessor.Id.ToString(), assigner.Id.ToString(), verifier.Id.ToString(), leadVerifier.Id.ToString(), legacyAdmin.Id.ToString(),
            "student-id-sentinel", "private/internal/storage-key-sentinel", "203.0.113.77", "SentinelUserAgent/9.9", "secret-token-sentinel");
        Assert.Contains(await db.AuditLogs.ToListAsync(), item => item.Action == "AssessmentAuditExported" && item.ActorUserId == "lead");
    }

    [Fact]
    public void Audit_export_controller_requires_the_assessment_appeal_reviewer_policy()
    {
        var attribute = Assert.Single(typeof(AssessmentAuditExportsController).GetCustomAttributes<AuthorizeAttribute>());

        Assert.Equal("AssessmentAppealReviewer", attribute.Policy);
    }

    private static ApplicationUser User(string id, string displayName) => new()
    {
        Id = Guid.Parse(id),
        UserName = $"{displayName.Replace(" ", ".", StringComparison.Ordinal).ToLowerInvariant()}@betcco.test",
        DisplayName = displayName
    };

    private static void AssertActor(JsonElement collection, string actorProperty, string displayName, string expectedRole)
    {
        var actor = collection.EnumerateArray()
            .Select(item => item.GetProperty(actorProperty))
            .Single(item => item.GetProperty("displayName").GetString() == displayName);

        Assert.Equal(expectedRole, actor.GetProperty("role").GetString());
    }

    private static void AssertJsonHasNoProperties(JsonElement root, params string[] forbiddenProperties)
    {
        var properties = Descendants(root)
            .Where(item => item.PropertyName is not null)
            .Select(item => item.PropertyName!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var forbiddenProperty in forbiddenProperties)
            Assert.DoesNotContain(forbiddenProperty, properties);
    }

    private static void AssertJsonHasNoStringValues(JsonElement root, params string[] forbiddenValues)
    {
        var values = Descendants(root)
            .Where(item => item.StringValue is not null)
            .Select(item => item.StringValue!)
            .ToArray();

        foreach (var forbiddenValue in forbiddenValues)
            Assert.DoesNotContain(values, value => value.Contains(forbiddenValue, StringComparison.OrdinalIgnoreCase));
    }

    private static IEnumerable<(string? PropertyName, string? StringValue)> Descendants(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                yield return (property.Name, null);
                foreach (var descendant in Descendants(property.Value)) yield return descendant;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
                foreach (var descendant in Descendants(item)) yield return descendant;
        }
        else if (element.ValueKind == JsonValueKind.String)
        {
            yield return (null, element.GetString());
        }
    }

    private sealed class AcademicStaff : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(userId is "assessor" or "prior-verifier" or "lead");
    }
}
