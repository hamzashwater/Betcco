using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class EvaluationCriteriaPlanTests
{
    [Fact]
    public async Task Rejected_evaluation_upload_is_never_stored_or_attached_to_the_request()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Draft
        };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();
        var storage = new TrackingFileStorage();
        var service = new EvaluationService(db, storage, new RejectedFileScanner());

        await using var content = new MemoryStream("unsafe"u8.ToArray());
        var result = await service.AddFileAsync("student", request.Id, "evidence.pdf", "application/pdf", content.Length, content);

        Assert.Equal(EvaluationFileAddStatus.Rejected, result);
        Assert.False(storage.WasWritten);
        Assert.Empty(await db.SubmissionFiles.ToListAsync());
    }

    [Fact]
    public async Task Teacher_can_only_submit_results_for_the_criteria_selected_in_the_plan()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Assigned,
            CriteriaSnapshotJson = JsonSerializer.Serialize(new[] { "P1", "M1", "D1" }),
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "teacher",
            AssignedByUserId = "admin"
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.False(await service.SetCriteriaPlanAsync("teacher", request.Id, new[] { "P1", "D1" }));
        Assert.True(await service.SetCriteriaPlanAsync("teacher", request.Id, new[] { "P1", "M1", "D1" }));
        Assert.False(await service.SubmitResultsAsync("teacher", request.Id, new[]
        {
            new CriterionSubmission("P1", "Achieved", null, null)
        }));
        Assert.False(await service.SubmitResultsAsync("teacher", request.Id, new[]
        {
            new CriterionSubmission("P1", "999", null, null),
            new CriterionSubmission("M1", "Achieved", null, null),
            new CriterionSubmission("D1", "Achieved", null, null)
        }));
        Assert.Equal(EvaluationStatus.Assigned, request.Status);
        Assert.Empty(await db.CriterionResults.Where(x => x.EvaluationRequestId == request.Id).ToListAsync());

        Assert.True(await service.SubmitResultsAsync("teacher", request.Id, new[]
        {
            new CriterionSubmission("P1", "Achieved", "Working implementation", null),
            new CriterionSubmission("M1", "Achieved", "Technical reasoning", null),
            new CriterionSubmission("D1", "Achieved", "Improvement analysis", "Strong improvement")
        }));
        var results = await db.CriterionResults.Where(x => x.EvaluationRequestId == request.Id).ToListAsync();
        Assert.Equal(EvaluationStatus.UnderReview, request.Status);
        Assert.Equal(new[] { "D1", "M1", "P1" }, results.Select(x => x.CriterionCode).Order().ToArray());
        Assert.Equal(EvaluationGrade.Distinction, request.CalculatedGrade);
        Assert.Null(request.CalculatedScore);
        Assert.All(results, result => Assert.Null(result.Score));
    }

    [Fact]
    public async Task Section_results_use_the_lowest_completed_section_as_the_final_award()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Assigned,
            CriteriaSnapshotJson = JsonSerializer.Serialize(new[] { "A.P1", "A.M1", "A.D1", "B.P1", "B.M1", "B.D1" }),
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "teacher",
            AssignedByUserId = "admin"
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.True(await service.SetCriteriaPlanAsync("teacher", request.Id, new[] { "A.P1", "A.M1", "A.D1", "B.P1", "B.M1", "B.D1" }));
        Assert.True(await service.SubmitResultsAsync("teacher", request.Id, new[]
        {
            new CriterionSubmission("A.P1", "Achieved", null, null),
            new CriterionSubmission("A.M1", "Achieved", null, null),
            new CriterionSubmission("A.D1", "Achieved", null, null),
            new CriterionSubmission("B.P1", "Achieved", null, null),
            new CriterionSubmission("B.M1", "PartiallyAchieved", null, null),
            new CriterionSubmission("B.D1", "NotAchieved", null, null)
        }));

        Assert.Equal(EvaluationGrade.Pass, request.CalculatedGrade);
        Assert.Null(request.CalculatedScore);
        var sections = JsonSerializer.Deserialize<EvaluationSectionResult[]>(request.SectionResultsJson);
        Assert.NotNull(sections);
        Assert.Contains(sections!, section => section.Section == "A" && section.Grade == "Distinction");
        Assert.Contains(sections!, section => section.Section == "B" && section.Grade == "Pass");
    }

    [Fact]
    public async Task Originality_declaration_is_server_owned_versioned_and_audited()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Draft
        };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.True(await service.DeclareAuthenticityAsync("student", request.Id, "ar", "203.0.113.10", "test-agent", "trace-1"));
        Assert.True(await service.DeclareAuthenticityAsync("student", request.Id, "ar", "203.0.113.10", "test-agent", "trace-2"));

        var declaration = await db.AuthenticityDeclarations.SingleAsync();
        Assert.Equal(1, declaration.AttemptNumber);
        Assert.Equal(AssessmentAuthenticityPolicy.Version, declaration.PolicyVersion);
        Assert.Equal(AssessmentAuthenticityPolicy.ArabicStatement, declaration.StatementSnapshot);
        Assert.Equal("203.0.113.10", declaration.IpAddress);
        Assert.Single(await db.AssessmentAuditEvents.Where(item => item.EventType == "AuthenticityDeclared").ToListAsync());
    }

    [Fact]
    public async Task Revision_submission_requires_new_work_and_a_fresh_originality_declaration()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1
        };
        var feedback = new EvaluationFeedback
        {
            EvaluationRequestId = request.Id,
            AuthorUserId = "teacher",
            Body = "Add the missing evidence, then send the revised assignment.",
            RequestsResubmission = true
        };
        db.EvaluationRequests.Add(request);
        db.EvaluationFeedbackItems.Add(feedback);
        await db.SaveChangesAsync();

        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = request.Id,
            OriginalFileName = "revised.pdf",
            StorageKey = "private/revised.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean,
            CreatedAtUtc = feedback.CreatedAtUtc.AddSeconds(1)
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.False(await service.ResubmitAsync("student", request.Id));
        Assert.True(await service.DeclareAuthenticityAsync("student", request.Id, "en", null, null, null));
        Assert.True(await service.ResubmitAsync("student", request.Id));

        Assert.Equal(EvaluationStatus.Assigned, request.Status);
        Assert.Equal(2, request.SubmissionAttemptNumber);
        Assert.Empty(await db.ResubmissionAuthorizations.ToListAsync());
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), item => item.EventType == "RevisionSubmitted" && item.AttemptNumber == 2);
    }

    [Fact]
    public async Task Betcco_review_allows_one_revision_check_and_then_completes()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Assigned,
            SubmissionAttemptNumber = 1,
            CriteriaSnapshotJson = JsonSerializer.Serialize(new[] { "A.P1" }),
            EvaluatorCriteriaPlanJson = JsonSerializer.Serialize(new[] { "A.P1" }),
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "teacher",
            AssignedByUserId = "admin"
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        var firstReview = new SubmitEvaluationReviewCommand(
            [new CriterionSubmission("A.P1", "PartiallyAchieved", "Some evidence", "Needs one more example")],
            "Add one clear example that directly satisfies P1.",
            true);

        Assert.False(await service.SubmitReviewAsync("teacher", request.Id, firstReview with
        {
            Results = [new CriterionSubmission("A.P1", "999", null, null)]
        }));
        Assert.Equal(EvaluationStatus.Assigned, request.Status);
        Assert.Empty(await db.CriterionResults.Where(item => item.EvaluationRequestId == request.Id).ToListAsync());
        Assert.True(await service.SubmitReviewAsync("teacher", request.Id, firstReview));
        Assert.Equal(EvaluationStatus.NeedsRevision, request.Status);
        Assert.Equal(EvaluationGrade.NotYetAchieved, request.CalculatedGrade);
        Assert.Single(await db.EvaluationFeedbackItems.Where(item => item.RequestsResubmission).ToListAsync());
        Assert.Empty(await db.ResubmissionAuthorizations.ToListAsync());

        var feedbackAt = await db.EvaluationFeedbackItems
            .Where(item => item.EvaluationRequestId == request.Id && item.RequestsResubmission)
            .Select(item => item.CreatedAtUtc)
            .SingleAsync();
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = request.Id,
            OriginalFileName = "revision.pdf",
            StorageKey = "private/revision.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean,
            CreatedAtUtc = feedbackAt.AddSeconds(1)
        });
        await db.SaveChangesAsync();
        Assert.True(await service.DeclareAuthenticityAsync("student", request.Id, "en", null, null, null));
        Assert.True(await service.ResubmitAsync("student", request.Id));
        Assert.Equal(2, request.SubmissionAttemptNumber);

        var secondReview = new SubmitEvaluationReviewCommand(
            [new CriterionSubmission("A.P1", "Achieved", "Revised evidence", "Now achieved")],
            "The requested revision is now complete.",
            false);
        Assert.True(await service.SubmitReviewAsync("teacher", request.Id, secondReview));
        Assert.Equal(EvaluationStatus.Completed, request.Status);
        Assert.Equal(EvaluationGrade.Pass, request.CalculatedGrade);

        request.Status = EvaluationStatus.Assigned;
        await db.SaveChangesAsync();
        var thirdChance = secondReview with { RequestRevision = true };
        Assert.False(await service.SubmitReviewAsync("teacher", request.Id, thirdChance));
    }

    [Fact]
    public async Task Internal_verification_authorizes_resubmission_only_with_a_valid_deadline()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.UnderReview,
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "reviewer"
        });
        db.CriterionResults.Add(new CriterionResult
        {
            EvaluationRequestId = request.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        Assert.False(await service.VerifyAsync("verifier", request.Id, false, "Please address the evidence gap.", DateTimeOffset.UtcNow.AddDays(31)));
        Assert.True(await service.VerifyAsync("verifier", request.Id, false, "Please address the evidence gap.", DateTimeOffset.UtcNow.AddDays(7)));

        var authorization = await db.ResubmissionAuthorizations.SingleAsync();
        Assert.Equal(2, authorization.AttemptNumber);
        Assert.Equal("verifier", authorization.AuthorizedByUserId);
        Assert.Equal(EvaluationStatus.NeedsRevision, request.Status);
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), item => item.EventType == "ResubmissionRequested" && item.AttemptNumber == 1);
    }

    [Fact]
    public async Task Assessment_audit_events_cannot_be_updated_or_deleted_after_creation()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var audit = new AssessmentAuditEvent
        {
            EvaluationRequestId = Guid.NewGuid(),
            EventType = "DraftCreated"
        };
        db.AssessmentAuditEvents.Add(audit);
        await db.SaveChangesAsync();

        audit.EventType = "Changed";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Assignment_rejects_an_account_that_is_not_an_eligible_assessor()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner(), new RejectingAssessorEligibilityService());
        Assert.False(await service.AssignAsync("reviewer", request.Id, "student"));
        Assert.Empty(await db.EvaluatorAssignments.ToListAsync());
        Assert.Equal(EvaluationStatus.PendingAssignment, request.Status);
    }

    [Fact]
    public async Task Internal_verification_rejects_an_unqualified_verifier_at_the_service_boundary()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.UnderReview,
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.EvaluationRequests.Add(request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "reviewer"
        });
        db.CriterionResults.Add(new CriterionResult
        {
            EvaluationRequestId = request.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved
        });
        await db.SaveChangesAsync();

        var service = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner(), new RejectingAssessorEligibilityService());

        Assert.False(await service.VerifyAsync("unqualified-verifier", request.Id, true, null, null));
        Assert.Equal(EvaluationStatus.UnderReview, request.Status);
        Assert.Empty(await db.InternalVerifications.ToListAsync());
    }

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

    private sealed class RejectedFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Rejected, "Test malware signature"));
    }

    private sealed class RejectingAssessorEligibilityService : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(false);
    }

    private sealed class TrackingFileStorage : IFileStorage
    {
        public bool WasWritten { get; private set; }

        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            WasWritten = true;
            return Task.FromResult("unexpected");
        }

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(null);
    }
}
