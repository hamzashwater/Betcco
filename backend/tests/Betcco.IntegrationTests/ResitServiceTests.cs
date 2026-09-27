using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class ResitServiceTests
{
    private static readonly Guid ReviewerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherStaffId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid StudentId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid OtherStudentId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    [Fact]
    public async Task Activation_creates_fresh_draft_with_exact_academic_evidence_and_idempotent_audit()
    {
        await using var db = InMemory();
        var (original, authorization) = await SeedActivationAsync(db, persist: false);
        original.StudentComment = "Original learner note";
        original.Price = 17m;
        original.SectionResultsJson = "[\"old-result\"]";
        original.EvaluatorCriteriaPlanJson = "[\"old-plan\"]";
        original.QualificationVersionId = Guid.NewGuid();
        original.QualificationVersionSnapshotJson = "{ \"historic\": true }";
        original.SubmissionFiles.Add(new SubmissionFile
        {
            OriginalFileName = "old.pdf",
            StorageKey = "private/old",
            ContentType = "application/pdf",
            LengthBytes = 123
        });
        original.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            StudentUserId = original.StudentUserId,
            AttemptNumber = 2,
            PolicyVersion = "v1",
            StatementSnapshot = "I confirm"
        });
        original.CriterionResults.Add(new CriterionResult { CriterionCode = "A.P1" });
        var historicalDecision = new EvaluationReviewDecision
        {
            AttemptNumber = 2,
            ReviewerUserId = ReviewerId.ToString(),
            DecidedAtUtc = DateTimeOffset.UtcNow,
            CalculatedGrade = EvaluationGrade.NotYetAchieved,
            SectionResultsJson = "[]",
            Feedback = "old",
            CriterionCount = 1
        };
        historicalDecision.CriterionDecisions.Add(new EvaluationReviewCriterionDecision
        {
            EvaluationReviewDecisionId = historicalDecision.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.NotAchieved
        });
        original.ReviewDecisions.Add(historicalDecision);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = original.Id,
            EvaluatorUserId = ReviewerId.ToString(),
            AssignedByUserId = OtherStaffId.ToString()
        });
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var result = await service.ActivateAsync(StudentId.ToString(), authorization.Id);
        Assert.Equal(ResitActivationStatus.Activated, result.Status);
        Assert.Equal(original.Id, result.OriginalEvaluationRequestId);
        Assert.NotNull(result.ResitEvaluationRequestId);
        var resit = await db.EvaluationRequests.SingleAsync(item => item.Id == result.ResitEvaluationRequestId);
        Assert.NotEqual(original.Id, resit.Id);
        Assert.Equal(original.StudentUserId, resit.StudentUserId);
        Assert.Equal(original.GradeId, resit.GradeId);
        Assert.Equal(original.SpecializationId, resit.SpecializationId);
        Assert.Equal(original.TaskTypeId, resit.TaskTypeId);
        Assert.Equal(original.RubricTemplateId, resit.RubricTemplateId);
        Assert.Equal(original.CriteriaSnapshotJson, resit.CriteriaSnapshotJson);
        Assert.Equal(original.AssessmentRuleSetVersion, resit.AssessmentRuleSetVersion);
        Assert.Equal(original.AssessmentRuleSetSnapshotJson, resit.AssessmentRuleSetSnapshotJson);
        Assert.Equal(original.QualificationVersionId, resit.QualificationVersionId);
        Assert.Equal(original.QualificationVersionSnapshotJson, resit.QualificationVersionSnapshotJson);
        Assert.Equal(original.AssessmentScopeId, resit.AssessmentScopeId);
        Assert.Equal(original.AssessmentScopeSnapshotJson, resit.AssessmentScopeSnapshotJson);
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Equal(1, resit.SubmissionAttemptNumber);
        Assert.Equal(AssessmentPricing.StandardEvaluationPrice, resit.Price);
        Assert.Equal("JOD", resit.Currency);
        Assert.Null(resit.StudentComment);
        Assert.Null(resit.PaymentId);
        Assert.Null(resit.CalculatedGrade);
        Assert.Null(resit.CalculatedScore);
        Assert.Null(resit.RevisionDueAtUtc);
        Assert.Null(resit.RetakeOfEvaluationRequestId);
        Assert.Equal("[]", resit.SectionResultsJson);
        Assert.Equal("[]", resit.EvaluatorCriteriaPlanJson);
        Assert.Empty(await db.SubmissionFiles.Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        Assert.Empty(await db.AuthenticityDeclarations.Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        Assert.Empty(await db.CriterionResults.Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        Assert.Empty(await db.EvaluatorAssignments.Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        Assert.Empty(await db.EvaluationReviewDecisions.Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        Assert.Equal("Original learner note", original.StudentComment);
        Assert.Equal(17m, original.Price);
        Assert.Equal(EvaluationStatus.Completed, original.Status);
        Assert.Equal(EvaluationGrade.NotYetAchieved, original.CalculatedGrade);
        Assert.Equal(2, original.SubmissionAttemptNumber);
        Assert.Equal(resit.Id, authorization.ResitEvaluationRequestId);
        Assert.NotNull(authorization.ActivatedAtUtc);

        var events = await db.AssessmentAuditEvents.ToListAsync();
        Assert.Equal(2, events.Count);
        Assert.Contains(events, item => item.EvaluationRequestId == original.Id
            && item.EventType == "ResitActivated" && item.AttemptNumber == 2
            && item.FromStatus == "Completed" && item.ToStatus == "Completed"
            && item.CorrelationId == authorization.Id.ToString());
        Assert.Contains(events, item => item.EvaluationRequestId == resit.Id
            && item.EventType == "ResitDraftCreated" && item.AttemptNumber == 1
            && item.FromStatus == "Draft" && item.ToStatus == "Draft"
            && item.CorrelationId == authorization.Id.ToString());
        var audit = Assert.Single(await db.AuditLogs.ToListAsync());
        Assert.Equal("EvaluationResitActivated", audit.Action);
        Assert.Equal(nameof(ResitAuthorization), audit.EntityType);
        Assert.Equal(authorization.Id.ToString(), audit.EntityId);
        Assert.Contains(original.Id.ToString(), audit.MetadataJson);
        Assert.Contains(resit.Id.ToString(), audit.MetadataJson);
        Assert.DoesNotContain(authorization.Reason, audit.MetadataJson);

        original.Status = EvaluationStatus.Closed;
        original.CriteriaSnapshotJson = "broken after activation";
        await db.SaveChangesAsync();
        var replay = await service.ActivateAsync(StudentId.ToString(), authorization.Id);
        Assert.Equal(ResitActivationStatus.AlreadyActivated, replay.Status);
        Assert.Equal(resit.Id, replay.ResitEvaluationRequestId);
        Assert.Equal(2, await db.EvaluationRequests.CountAsync());
        Assert.Equal(2, await db.AssessmentAuditEvents.CountAsync());
        Assert.Single(await db.AuditLogs.ToListAsync());
    }

    [Theory]
    [InlineData("revoked", ResitActivationStatus.Revoked)]
    [InlineData("status", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("grade", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("attempt", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("no-revision", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("retake-root", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("missing-scope", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("bad-scope-snapshot", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("empty-criteria", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("bad-criteria", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("unusable-criteria", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("bad-rules", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("rule-version", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("qualification-pair", ResitActivationStatus.AcademicSnapshotInvalid)]
    [InlineData("retake-child", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("retake-authorization", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("resit-target", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("appeal-submitted", ResitActivationStatus.OriginalNoLongerValid)]
    [InlineData("appeal-under-review", ResitActivationStatus.OriginalNoLongerValid)]
    public async Task Activation_rechecks_mutable_original_and_historical_snapshots(
        string condition, ResitActivationStatus expected)
    {
        await using var db = InMemory();
        var (original, authorization) = await SeedActivationAsync(db);
        switch (condition)
        {
            case "revoked": authorization.RevokedAtUtc = DateTimeOffset.UtcNow; break;
            case "status": original.Status = EvaluationStatus.Closed; break;
            case "grade": original.CalculatedGrade = EvaluationGrade.Pass; break;
            case "attempt": original.SubmissionAttemptNumber = 1; break;
            case "no-revision": original.RevisionDueAtUtc = null; break;
            case "retake-root": original.RetakeOfEvaluationRequestId = Guid.NewGuid(); break;
            case "missing-scope": original.AssessmentScopeId = Guid.NewGuid(); break;
            case "bad-scope-snapshot": original.AssessmentScopeSnapshotJson = "{}"; break;
            case "empty-criteria": original.CriteriaSnapshotJson = "[]"; break;
            case "bad-criteria": original.CriteriaSnapshotJson = "not-json"; break;
            case "unusable-criteria": original.CriteriaSnapshotJson = "[\"unusable\"]"; break;
            case "bad-rules": original.AssessmentRuleSetSnapshotJson = "{}"; break;
            case "rule-version": original.AssessmentRuleSetVersion = "other"; break;
            case "qualification-pair": original.QualificationVersionId = Guid.NewGuid(); break;
            case "retake-child":
                var child = BareRequest();
                child.RetakeOfEvaluationRequestId = original.Id;
                db.EvaluationRequests.Add(child);
                break;
            case "retake-authorization":
                db.RetakeAuthorizations.Add(new RetakeAuthorization
                {
                    OriginalEvaluationRequestId = original.Id,
                    RetakeAssessmentScopeId = original.AssessmentScopeId!.Value,
                    RetakeEvaluationRequestId = Guid.NewGuid(),
                    AuthorizedByUserId = ReviewerId.ToString(),
                    Reason = "Historical Retake"
                });
                break;
            case "resit-target":
                db.ResitAuthorizations.Add(new ResitAuthorization
                {
                    OriginalEvaluationRequestId = Guid.NewGuid(),
                    ResitEvaluationRequestId = original.Id,
                    ActivatedAtUtc = DateTimeOffset.UtcNow,
                    AuthorizedByUserId = ReviewerId,
                    Reason = "Historical Resit target"
                });
                break;
            case "appeal-submitted":
            case "appeal-under-review":
                db.EvaluationAppeals.Add(new EvaluationAppeal
                {
                    EvaluationRequestId = original.Id,
                    StudentUserId = original.StudentUserId,
                    Reason = "Review pending",
                    Status = condition == "appeal-submitted"
                        ? EvaluationAppealStatus.Submitted : EvaluationAppealStatus.UnderReview
                });
                break;
        }
        await db.SaveChangesAsync();
        var requestCount = await db.EvaluationRequests.CountAsync();

        var result = await new ResitService(db).ActivateAsync(StudentId.ToString(), authorization.Id);
        Assert.Equal(expected, result.Status);
        Assert.Null(result.ResitEvaluationRequestId);
        Assert.Null(authorization.ResitEvaluationRequestId);
        Assert.Equal(requestCount, await db.EvaluationRequests.CountAsync());
        Assert.Empty(await db.AssessmentAuditEvents.ToListAsync());
    }

    [Fact]
    public async Task Activation_enforces_owner_actor_and_active_appeal_only()
    {
        await using var db = InMemory();
        var (original, authorization) = await SeedActivationAsync(db);
        db.Users.Add(User(OtherStudentId, "Other Student"));
        await db.SaveChangesAsync();
        var service = new ResitService(db);
        Assert.Equal(ResitActivationStatus.NotFound,
            (await service.ActivateAsync(OtherStudentId.ToString(), authorization.Id)).Status);
        Assert.Equal(ResitActivationStatus.InvalidActor,
            (await service.ActivateAsync("invalid", authorization.Id)).Status);
        var student = await db.Users.SingleAsync(item => item.Id == StudentId);
        student.IsFrozen = true;
        await db.SaveChangesAsync();
        Assert.Equal(ResitActivationStatus.InvalidActor,
            (await service.ActivateAsync(StudentId.ToString(), authorization.Id)).Status);
        student.IsFrozen = false;
        db.EvaluationAppeals.Add(new EvaluationAppeal
        {
            EvaluationRequestId = original.Id,
            StudentUserId = original.StudentUserId,
            Reason = "Already upheld",
            Status = EvaluationAppealStatus.Upheld
        });
        await db.SaveChangesAsync();
        var activation = await service.ActivateAsync(StudentId.ToString(), authorization.Id);
        Assert.Equal(ResitActivationStatus.Activated, activation.Status);
        var resit = await db.EvaluationRequests.SingleAsync(item => item.Id == activation.ResitEvaluationRequestId);
        Assert.Null(resit.QualificationVersionId);
        Assert.Null(resit.QualificationVersionSnapshotJson);
    }

    [Fact]
    public async Task Completed_second_attempt_nya_can_be_authorized_and_revoked_without_mutating_the_original()
    {
        await using var db = InMemory();
        var scope = Scope();
        var original = Eligible(scope.Id);
        original.PaymentId = Guid.NewGuid();
        var originalPayment = original.PaymentId;
        db.Users.AddRange(User(ReviewerId, "Course Reviewer"), User(OtherStaffId, "Other Staff"));
        db.AssessmentScopes.Add(scope);
        db.EvaluationRequests.Add(original);
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var eligible = Assert.Single((await service.ListEligibleAsync(ReviewerId)).Items);
        Assert.Equal(original.Id, eligible.OriginalEvaluationRequestId);
        Assert.Equal("NotYetAchieved", eligible.FinalEstimatedGrade);
        Assert.Equal(2, eligible.SubmissionAttemptNumber);
        Assert.NotNull(eligible.Academic);

        var created = await service.AuthorizeAsync(
            ReviewerId,
            original.Id,
            new("Documented exceptional BETCCO Resit approval."));
        Assert.Equal(ResitAuthorizationWriteStatus.Created, created.Status);
        Assert.NotNull(created.Authorization);
        Assert.Null(created.Authorization!.ResitEvaluationRequestId);

        Assert.Single((await service.ListAuthorizationsAsync(ReviewerId)).Items);
        Assert.Single(await db.ResitAuthorizations.ToListAsync());
        Assert.Single(await db.EvaluationRequests.ToListAsync());
        Assert.Equal(EvaluationStatus.Completed, original.Status);
        Assert.Equal(EvaluationGrade.NotYetAchieved, original.CalculatedGrade);
        Assert.Equal(2, original.SubmissionAttemptNumber);
        Assert.Equal(originalPayment, original.PaymentId);

        var authorizedEvent = Assert.Single(await db.AssessmentAuditEvents
            .Where(item => item.EventType == "ResitAuthorized").ToListAsync());
        Assert.Equal(original.Id, authorizedEvent.EvaluationRequestId);
        Assert.Null(authorizedEvent.Reason);
        Assert.Contains(await db.AuditLogs.ToListAsync(),
            item => item.Action == "EvaluationResitAuthorized");

        var revoked = await service.RevokeAsync(
            OtherStaffId,
            created.Authorization.AuthorizationId,
            new("Authorization withdrawn before any Resit activation."));
        Assert.Equal(ResitAuthorizationWriteStatus.Revoked, revoked.Status);
        Assert.NotNull(revoked.Authorization!.RevokedAtUtc);
        Assert.Equal(OtherStaffId, revoked.Authorization.RevokedByUserId);
        Assert.Equal(
            "Authorization withdrawn before any Resit activation.",
            revoked.Authorization.RevocationReason);

        Assert.Empty((await service.ListEligibleAsync(ReviewerId)).Items);
        Assert.Equal(
            ResitAuthorizationWriteStatus.NotEligible,
            (await service.AuthorizeAsync(
                ReviewerId,
                original.Id,
                new("A revoked lifetime authorization cannot be issued again."))).Status);
        var revokedEvent = Assert.Single(await db.AssessmentAuditEvents
            .Where(item => item.EventType == "ResitAuthorizationRevoked").ToListAsync());
        Assert.Null(revokedEvent.Reason);
    }

    [Fact]
    public async Task Activated_authorization_cannot_be_revoked()
    {
        await using var db = InMemory();
        var original = BareRequest();
        var resit = BareRequest();
        db.Users.Add(User(ReviewerId, "Course Reviewer"));
        db.EvaluationRequests.AddRange(original, resit);
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            AuthorizedByUserId = ReviewerId,
            AuthorizedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5),
            ActivatedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Previously activated authorization."
        };
        db.ResitAuthorizations.Add(authorization);
        await db.SaveChangesAsync();

        var result = await new ResitService(db).RevokeAsync(
            ReviewerId,
            authorization.Id,
            new("An activated authorization must remain immutable."));

        Assert.Equal(ResitAuthorizationWriteStatus.AlreadyActivated, result.Status);
        Assert.Null(authorization.RevokedAtUtc);
        Assert.Null(authorization.RevokedByUserId);
        Assert.Null(authorization.RevocationReason);
    }

    [Fact]
    public async Task Eligibility_blocks_incomplete_revision_history_retake_chain_active_appeal_and_involved_reviewer()
    {
        await using var db = InMemory();
        var scope = Scope();
        db.Users.Add(User(ReviewerId, "Course Reviewer"));
        db.AssessmentScopes.Add(scope);

        var valid = Eligible(scope.Id);

        var firstAttempt = Eligible(scope.Id);
        firstAttempt.SubmissionAttemptNumber = 1;

        var passing = Eligible(scope.Id);
        passing.CalculatedGrade = EvaluationGrade.Pass;

        var historicalRetake = Eligible(scope.Id);
        historicalRetake.RetakeOfEvaluationRequestId = Guid.NewGuid();

        var originalWithHistoricalRetake = Eligible(scope.Id);
        var historicalRetakeChild = BareRequest();
        historicalRetakeChild.RetakeOfEvaluationRequestId = originalWithHistoricalRetake.Id;

        var legacyNoRevisionDeadline = Eligible(scope.Id);
        legacyNoRevisionDeadline.RevisionDueAtUtc = null;

        var invalidSnapshot = Eligible(scope.Id);
        invalidSnapshot.AssessmentScopeSnapshotJson = "{}";

        var appealed = Eligible(scope.Id);
        appealed.Appeals.Add(new EvaluationAppeal
        {
            StudentUserId = appealed.StudentUserId,
            Reason = "The released estimate is being challenged.",
            Status = EvaluationAppealStatus.Submitted
        });

        var involvedReviewer = Eligible(scope.Id);
        involvedReviewerIdAssignment(involvedReviewer, db);

        var resitSource = Eligible(scope.Id);
        resitSource.Status = EvaluationStatus.Completed;
        var alreadyResit = Eligible(scope.Id);

        db.EvaluationRequests.AddRange(
            valid,
            firstAttempt,
            passing,
            historicalRetake,
            originalWithHistoricalRetake,
            historicalRetakeChild,
            legacyNoRevisionDeadline,
            invalidSnapshot,
            appealed,
            involvedReviewer,
            resitSource,
            alreadyResit);
        db.ResitAuthorizations.Add(new ResitAuthorization
        {
            OriginalEvaluationRequestId = resitSource.Id,
            ResitEvaluationRequestId = alreadyResit.Id,
            AuthorizedByUserId = ReviewerId,
            AuthorizedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            ActivatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1),
            Reason = "Previously activated Resit authorization."
        });
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var candidates = (await service.ListEligibleAsync(ReviewerId)).Items;

        Assert.Single(candidates);
        Assert.Equal(valid.Id, candidates[0].OriginalEvaluationRequestId);
        Assert.Equal(
            ResitAuthorizationWriteStatus.NotEligible,
            (await service.AuthorizeAsync(
                ReviewerId,
                originalWithHistoricalRetake.Id,
                new("A historical Retake already consumed the exceptional path."))).Status);
        Assert.Equal(
            ResitAuthorizationWriteStatus.NotEligible,
            (await service.AuthorizeAsync(
                ReviewerId,
                appealed.Id,
                new("An active appeal must block Resit authorization."))).Status);
        Assert.Equal(
            ResitAuthorizationWriteStatus.NotEligible,
            (await service.AuthorizeAsync(
                ReviewerId,
                involvedReviewer.Id,
                new("The original assessor must remain independent."))).Status);
        Assert.Equal(
            ResitAuthorizationWriteStatus.NotEligible,
            (await service.AuthorizeAsync(
                ReviewerId,
                alreadyResit.Id,
                new("A Resit must never create a Resit chain."))).Status);
    }

    [Fact]
    public async Task Eligible_pages_skip_invalid_snapshots_and_missing_scopes_without_losing_valid_rows()
    {
        await using var db = InMemory();
        var scope = Scope();
        db.Users.Add(User(ReviewerId, "Course Reviewer"));
        db.AssessmentScopes.Add(scope);

        var rows = Enumerable.Range(0, 57).Select(index =>
        {
            var request = Eligible(scope.Id, new Guid(57 - index, 0, 0, new byte[8]));
            if (index is 0 or 49) request.AssessmentScopeSnapshotJson = "{}";
            if (index == 1) request.AssessmentScopeId = Guid.NewGuid();
            return request;
        }).ToArray();
        db.EvaluationRequests.AddRange(rows);
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var expected = rows.Where((_, index) => index is not (0 or 1 or 49))
            .OrderByDescending(request => request.UpdatedAtUtc)
            .ThenByDescending(request => request.Id)
            .Select(request => request.Id).ToArray();
        var first = await service.ListEligibleAsync(ReviewerId);
        var second = await service.ListEligibleAsync(ReviewerId, 2, 20);
        var third = await service.ListEligibleAsync(ReviewerId, 3, 20);
        var beyond = await service.ListEligibleAsync(ReviewerId, 4, 20);

        Assert.Equal((1, 20, true), (first.Page, first.PageSize, first.HasNextPage));
        Assert.Equal(expected.Take(20), first.Items.Select(item => item.OriginalEvaluationRequestId));
        Assert.Equal((2, 20, true), (second.Page, second.PageSize, second.HasNextPage));
        Assert.Equal(expected.Skip(20).Take(20), second.Items.Select(item => item.OriginalEvaluationRequestId));
        Assert.Equal((3, 20, false), (third.Page, third.PageSize, third.HasNextPage));
        Assert.Equal(expected.Skip(40), third.Items.Select(item => item.OriginalEvaluationRequestId));
        Assert.Empty(beyond.Items);
        Assert.Equal((4, 20, false), (beyond.Page, beyond.PageSize, beyond.HasNextPage));
    }

    [Fact]
    public async Task Eligible_pages_use_id_tie_breaker_and_preserve_actor_validation()
    {
        await using var db = InMemory();
        var scope = Scope();
        var frozen = User(OtherStaffId, "Frozen Reviewer");
        frozen.IsFrozen = true;
        db.Users.AddRange(User(ReviewerId, "Course Reviewer"), frozen);
        db.AssessmentScopes.Add(scope);
        var now = DateTimeOffset.UtcNow;
        var requests = Enumerable.Range(0, 3).Select(_ => Eligible(scope.Id)).ToArray();
        foreach (var request in requests) request.UpdatedAtUtc = now;
        db.EvaluationRequests.AddRange(requests);
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var expected = requests.OrderByDescending(item => item.Id).Select(item => item.Id).ToArray();
        Assert.Equal(expected.Take(2), (await service.ListEligibleAsync(ReviewerId, 1, 2))
            .Items.Select(item => item.OriginalEvaluationRequestId));
        Assert.Equal(expected.Skip(2), (await service.ListEligibleAsync(ReviewerId, 2, 2))
            .Items.Select(item => item.OriginalEvaluationRequestId));
        Assert.Empty((await service.ListEligibleAsync(Guid.Empty)).Items);
        Assert.Empty((await service.ListEligibleAsync(Guid.Empty, 0, 0)).Items);
        Assert.Empty((await service.ListEligibleAsync(OtherStaffId)).Items);
        Assert.Equal(ResitAuthorizationWriteStatus.InvalidActor,
            (await service.AuthorizeAsync(Guid.Empty, requests[0].Id,
                new("Invalid reviewers must remain unable to authorize."))).Status);
    }

    [Fact]
    public async Task Authorization_pages_reach_past_two_hundred_and_preserve_projection_and_order()
    {
        await using var db = InMemory();
        db.Users.Add(User(ReviewerId, "Course Reviewer"));
        var originals = Enumerable.Range(0, 216).Select(_ => BareRequest()).ToArray();
        db.EvaluationRequests.AddRange(originals);
        var now = DateTimeOffset.UtcNow;
        var authorizations = Enumerable.Range(0, 215).Select(index => new ResitAuthorization
        {
            OriginalEvaluationRequestId = originals[index].Id,
            AuthorizedByUserId = ReviewerId,
            AuthorizedAtUtc = now.AddMinutes(-Math.Max(0, index - 1)),
            Reason = $"Authorization reason {index}",
            ResitEvaluationRequestId = index == 1 ? originals[215].Id : null,
            ActivatedAtUtc = index == 1 ? now.AddMinutes(1) : null,
            RevokedAtUtc = index == 0 ? now.AddMinutes(2) : null,
            RevokedByUserId = index == 0 ? OtherStaffId : null,
            RevocationReason = index == 0 ? "Authorization withdrawn." : null
        }).ToArray();
        db.ResitAuthorizations.AddRange(authorizations);
        await db.SaveChangesAsync();

        var service = new ResitService(db);
        var expected = authorizations.OrderByDescending(item => item.AuthorizedAtUtc)
            .ThenByDescending(item => item.Id).Select(item => item.Id).ToArray();
        var first = await service.ListAuthorizationsAsync(ReviewerId);
        var eleventh = await service.ListAuthorizationsAsync(ReviewerId, 11, 20);
        var beyond = await service.ListAuthorizationsAsync(ReviewerId, 12, 20);

        Assert.Equal((1, 20, true), (first.Page, first.PageSize, first.HasNextPage));
        Assert.Equal(expected.Take(20), first.Items.Select(item => item.AuthorizationId));
        Assert.Equal(expected.Skip(200), eleventh.Items.Select(item => item.AuthorizationId));
        Assert.Equal((11, 20, false), (eleventh.Page, eleventh.PageSize, eleventh.HasNextPage));
        Assert.Empty(beyond.Items);
        Assert.Equal((12, 20, false), (beyond.Page, beyond.PageSize, beyond.HasNextPage));

        var revoked = Assert.Single(first.Items, item => item.AuthorizationId == authorizations[0].Id);
        Assert.Equal(authorizations[0].OriginalEvaluationRequestId, revoked.OriginalEvaluationRequestId);
        Assert.Equal(authorizations[0].AuthorizedAtUtc, revoked.AuthorizedAtUtc);
        Assert.Equal(authorizations[0].Reason, revoked.Reason);
        Assert.Equal(authorizations[0].RevokedAtUtc, revoked.RevokedAtUtc);
        Assert.Equal(OtherStaffId, revoked.RevokedByUserId);
        Assert.Equal("Authorization withdrawn.", revoked.RevocationReason);
        var activated = Assert.Single(first.Items, item => item.AuthorizationId == authorizations[1].Id);
        Assert.Equal(originals[215].Id, activated.ResitEvaluationRequestId);
        Assert.Equal(authorizations[1].ActivatedAtUtc, activated.ActivatedAtUtc);
        Assert.Empty((await service.ListAuthorizationsAsync(Guid.Empty)).Items);
        Assert.Empty((await service.ListAuthorizationsAsync(Guid.Empty, 0, 0)).Items);
    }

    [Fact]
    public async Task Controller_rejects_invalid_page_bounds_and_passes_valid_page_to_service()
    {
        await using var db = InMemory();
        var scope = Scope();
        db.Users.Add(User(ReviewerId, "Course Reviewer"));
        db.AssessmentScopes.Add(scope);
        db.EvaluationRequests.AddRange(Eligible(scope.Id), Eligible(scope.Id));
        await db.SaveChangesAsync();
        var controller = new ResitsController(new ResitService(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, ReviewerId.ToString())], "test"))
                }
            }
        };

        foreach (var result in new IActionResult[]
                 {
                     await controller.Eligible(0, 20),
                     await controller.Eligible(1, 0),
                     await controller.Eligible(1, 51),
                     await controller.Authorizations(0, 20),
                     await controller.Authorizations(1, 51)
                 })
        {
            var bad = Assert.IsType<BadRequestObjectResult>(result);
            Assert.Equal(400, bad.StatusCode);
            Assert.Contains("RESIT_PAGE_INVALID", JsonSerializer.Serialize(bad.Value));
        }

        var ok = Assert.IsType<OkObjectResult>(await controller.Eligible(2, 1));
        var page = Assert.IsType<ResitEligibilityPage>(ok.Value);
        Assert.Equal((2, 1, false), (page.Page, page.PageSize, page.HasNextPage));
        Assert.Single(page.Items);
        var maxEligible = Assert.IsType<OkObjectResult>(await controller.Eligible(1, 50));
        Assert.Equal(50, Assert.IsType<ResitEligibilityPage>(maxEligible.Value).PageSize);
        var maxAuthorizations = Assert.IsType<OkObjectResult>(await controller.Authorizations(1, 50));
        Assert.Equal(50, Assert.IsType<ResitAuthorizationPage>(maxAuthorizations.Value).PageSize);
    }

    [Fact]
    public async Task Controller_validates_actor_before_pagination_bounds()
    {
        await using var db = InMemory();
        var controller = new ResitsController(new ResitService(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity())
                }
            }
        };

        Assert.IsType<UnauthorizedResult>(await controller.Eligible(0, 0));
        Assert.IsType<UnauthorizedResult>(await controller.Authorizations(0, 0));
    }

    [Fact]
    public void Resit_controller_is_course_reviewer_only()
    {
        var attribute = Assert.Single(typeof(ResitsController).GetCustomAttributes<AuthorizeAttribute>());
        Assert.Equal("CourseReviewer", attribute.Policy);
    }

    [Fact]
    public async Task Student_activation_controller_has_student_policy_bodyless_route_and_minimal_mapping()
    {
        var policy = Assert.Single(typeof(StudentResitAuthorizationsController)
            .GetCustomAttributes<AuthorizeAttribute>());
        Assert.Equal("Student", policy.Policy);
        Assert.Equal("api/v1/student/resit-authorizations", Assert.Single(
            typeof(StudentResitAuthorizationsController).GetCustomAttributes<RouteAttribute>()).Template);
        var method = typeof(StudentResitAuthorizationsController).GetMethod("Activate")!;
        Assert.Equal("{authorizationId:guid}/activate",
            Assert.Single(method.GetCustomAttributes<HttpPostAttribute>()).Template);
        Assert.Equal("write", Assert.Single(method.GetCustomAttributes<EnableRateLimitingAttribute>()).PolicyName);
        Assert.DoesNotContain(method.GetParameters(), parameter =>
            parameter.ParameterType != typeof(Guid)
            && parameter.ParameterType != typeof(CancellationToken));

        await using var db = InMemory();
        var (_, authorization) = await SeedActivationAsync(db);
        var controller = new StudentResitAuthorizationsController(new ResitService(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, StudentId.ToString())], "test"))
                }
            }
        };
        var success = Assert.IsType<OkObjectResult>(await controller.Activate(
            authorization.Id, CancellationToken.None));
        var body = JsonSerializer.Serialize(success.Value);
        Assert.Contains("resitEvaluationRequestId", body);
        Assert.Contains("originalEvaluationRequestId", body);
        Assert.DoesNotContain(authorization.Reason, body);
        Assert.DoesNotContain("authorizedBy", body, StringComparison.OrdinalIgnoreCase);
        Assert.IsType<NotFoundResult>(await controller.Activate(Guid.NewGuid(), CancellationToken.None));
        using (var replayBody = JsonDocument.Parse(JsonSerializer.Serialize(
            Assert.IsType<OkObjectResult>(await controller.Activate(
                authorization.Id, CancellationToken.None)).Value)))
            Assert.Equal("AlreadyActivated", replayBody.RootElement.GetProperty("status").GetString());

        controller.ControllerContext.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity());
        Assert.IsType<UnauthorizedResult>(await controller.Activate(
            authorization.Id, CancellationToken.None));
    }

    [Theory]
    [InlineData("revoked", "RESIT_AUTHORIZATION_REVOKED")]
    [InlineData("original", "RESIT_ORIGINAL_NO_LONGER_VALID")]
    [InlineData("snapshot", "RESIT_ACADEMIC_SNAPSHOT_INVALID")]
    [InlineData("conflict", "RESIT_ACTIVATION_CONFLICT")]
    public async Task Student_activation_controller_maps_owner_visible_conflicts(
        string condition, string expectedCode)
    {
        await using var db = InMemory();
        var (original, authorization) = await SeedActivationAsync(db);
        switch (condition)
        {
            case "revoked": authorization.RevokedAtUtc = DateTimeOffset.UtcNow; break;
            case "original": original.Status = EvaluationStatus.Closed; break;
            case "snapshot": original.CriteriaSnapshotJson = "[]"; break;
            case "conflict": authorization.ActivatedAtUtc = DateTimeOffset.UtcNow; break;
        }
        await db.SaveChangesAsync();
        var controller = new StudentResitAuthorizationsController(new ResitService(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, StudentId.ToString())], "test"))
                }
            }
        };

        var response = Assert.IsType<ConflictObjectResult>(await controller.Activate(
            authorization.Id, CancellationToken.None));
        var body = JsonSerializer.Serialize(response.Value);
        Assert.Contains(expectedCode, body);
        Assert.DoesNotContain(authorization.Reason, body);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_postgresql_activations_create_one_linked_request()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_activation_race");
        var authorizationId = await SeedPostgresActivationAsync(database);

        async Task<ResitActivationResult> Activate()
        {
            await using var worker = database.CreateContext();
            return await new ResitService(worker).ActivateAsync(StudentId.ToString(), authorizationId);
        }

        var results = await Task.WhenAll(Activate(), Activate());
        Assert.All(results, result => Assert.Contains(result.Status,
            new[] { ResitActivationStatus.Activated, ResitActivationStatus.AlreadyActivated }));
        Assert.Equal(results[0].ResitEvaluationRequestId, results[1].ResitEvaluationRequestId);
        await using var verify = database.CreateContext();
        var authorization = await verify.ResitAuthorizations.SingleAsync(item => item.Id == authorizationId);
        Assert.NotNull(authorization.ActivatedAtUtc);
        Assert.Equal(results[0].ResitEvaluationRequestId, authorization.ResitEvaluationRequestId);
        Assert.Equal(2, await verify.EvaluationRequests.CountAsync());
        Assert.Equal(2, await verify.AssessmentAuditEvents.CountAsync());
        Assert.Single(await verify.AuditLogs.ToListAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSQL_activation_and_revoke_race_has_one_terminal_outcome()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_revoke_race");
        var authorizationId = await SeedPostgresActivationAsync(database);

        async Task<ResitActivationResult> Activate()
        {
            await using var worker = database.CreateContext();
            return await new ResitService(worker).ActivateAsync(StudentId.ToString(), authorizationId);
        }

        async Task<ResitAuthorizationWriteResult> Revoke()
        {
            await using var worker = database.CreateContext();
            return await new ResitService(worker).RevokeAsync(ReviewerId, authorizationId,
                new("Revocation raced with learner activation."));
        }

        var activationTask = Activate();
        var revokeTask = Revoke();
        await Task.WhenAll(activationTask, revokeTask);
        var activationResult = await activationTask;
        var revokeResult = await revokeTask;
        await using var verify = database.CreateContext();
        var authorization = await verify.ResitAuthorizations.SingleAsync(item => item.Id == authorizationId);
        Assert.False(authorization.ActivatedAtUtc is not null
            && authorization.RevokedAtUtc is not null);
        if (authorization.ActivatedAtUtc is not null)
        {
            Assert.Equal(ResitActivationStatus.Activated, activationResult.Status);
            Assert.Equal(ResitAuthorizationWriteStatus.AlreadyActivated, revokeResult.Status);
            Assert.Equal(2, await verify.EvaluationRequests.CountAsync());
        }
        else
        {
            Assert.NotNull(authorization.RevokedAtUtc);
            Assert.Equal(ResitAuthorizationWriteStatus.Revoked, revokeResult.Status);
            Assert.Equal(ResitActivationStatus.Revoked, activationResult.Status);
            Assert.Single(await verify.EvaluationRequests.ToListAsync());
        }
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSQL_failure_after_save_rolls_back_request_link_and_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_activation_rollback");
        var authorizationId = await SeedPostgresActivationAsync(database);
        await using (var worker = database.CreateContext(new FailAfterSaveInterceptor()))
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                new ResitService(worker).ActivateAsync(StudentId.ToString(), authorizationId));
        }

        await using var verify = database.CreateContext();
        var authorization = await verify.ResitAuthorizations.SingleAsync(item => item.Id == authorizationId);
        Assert.Null(authorization.ResitEvaluationRequestId);
        Assert.Null(authorization.ActivatedAtUtc);
        Assert.Single(await verify.EvaluationRequests.ToListAsync());
        Assert.Empty(await verify.AssessmentAuditEvents.ToListAsync());
        Assert.Empty(await verify.AuditLogs.ToListAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Database_enforces_single_authorization_and_activation_invariants()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_authorization_constraints");

        Guid original1;
        Guid original2;
        Guid original3;
        Guid resitRequest;
        await using (var seed = database.CreateContext())
        {
            seed.Users.AddRange(
                User(ReviewerId, "Course Reviewer"),
                User(OtherStaffId, "Other Staff"));

            var requests = Enumerable.Range(0, 4)
                .Select(_ => BareRequest())
                .ToArray();
            seed.EvaluationRequests.AddRange(requests);
            await seed.SaveChangesAsync();

            original1 = requests[0].Id;
            original2 = requests[1].Id;
            original3 = requests[2].Id;
            resitRequest = requests[3].Id;
        }

        await using (var first = database.CreateContext())
        {
            first.ResitAuthorizations.Add(new ResitAuthorization
            {
                OriginalEvaluationRequestId = original1,
                AuthorizedByUserId = ReviewerId,
                Reason = "First lifetime authorization."
            });
            await first.SaveChangesAsync();
        }

        await using (var duplicateOriginal = database.CreateContext())
        {
            duplicateOriginal.ResitAuthorizations.Add(new ResitAuthorization
            {
                OriginalEvaluationRequestId = original1,
                AuthorizedByUserId = OtherStaffId,
                Reason = "A second authorization must be rejected."
            });
            await Assert.ThrowsAsync<DbUpdateException>(
                () => duplicateOriginal.SaveChangesAsync());
        }

        await using (var invalidPair = database.CreateContext())
        {
            invalidPair.ResitAuthorizations.Add(new ResitAuthorization
            {
                OriginalEvaluationRequestId = original2,
                ResitEvaluationRequestId = resitRequest,
                AuthorizedByUserId = ReviewerId,
                Reason = "Activation link without timestamp must fail."
            });
            await Assert.ThrowsAsync<DbUpdateException>(
                () => invalidPair.SaveChangesAsync());
        }

        await using (var activated = database.CreateContext())
        {
            activated.ResitAuthorizations.Add(new ResitAuthorization
            {
                OriginalEvaluationRequestId = original2,
                ResitEvaluationRequestId = resitRequest,
                AuthorizedByUserId = ReviewerId,
                AuthorizedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5),
                ActivatedAtUtc = DateTimeOffset.UtcNow,
                Reason = "Valid future activation shape."
            });
            await activated.SaveChangesAsync();
        }

        await using (var duplicateResitTarget = database.CreateContext())
        {
            duplicateResitTarget.ResitAuthorizations.Add(new ResitAuthorization
            {
                OriginalEvaluationRequestId = original3,
                ResitEvaluationRequestId = resitRequest,
                AuthorizedByUserId = OtherStaffId,
                AuthorizedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5),
                ActivatedAtUtc = DateTimeOffset.UtcNow,
                Reason = "One Resit request cannot belong to two authorizations."
            });
            await Assert.ThrowsAsync<DbUpdateException>(
                () => duplicateResitTarget.SaveChangesAsync());
        }
    }

    private static BetccoDbContext InMemory() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private sealed class FailAfterSaveInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData,
            int result,
            CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("Simulated failure before transaction commit.");
    }

    private static async Task<(EvaluationRequest Original, ResitAuthorization Authorization)>
        SeedActivationAsync(BetccoDbContext db, bool persist = true)
    {
        var scope = Scope();
        var original = Eligible(scope.Id);
        original.StudentUserId = StudentId.ToString();
        original.CriteriaSnapshotJson = "[\"A.P1\"]";
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            AuthorizedByUserId = ReviewerId,
            Reason = "Private staff rationale for exceptional Resit."
        };
        db.Users.Add(User(StudentId, "Student"));
        db.AssessmentScopes.Add(scope);
        db.EvaluationRequests.Add(original);
        db.ResitAuthorizations.Add(authorization);
        if (persist) await db.SaveChangesAsync();
        return (original, authorization);
    }

    private static async Task<Guid> SeedPostgresActivationAsync(PostgresTestDatabase database)
    {
        await using var db = database.CreateContext();
        var track = new LearningTrack
        {
            Slug = $"resit-{Guid.NewGuid():N}",
            ArabicName = "مسار",
            EnglishName = "Track"
        };
        var grade = new Grade
        {
            Slug = $"grade-{Guid.NewGuid():N}",
            ArabicName = "درجة",
            EnglishName = "Grade",
            LearningTrack = track
        };
        var specialization = new Specialization
        {
            Slug = $"specialization-{Guid.NewGuid():N}",
            ArabicName = "تخصص",
            EnglishName = "Specialization",
            LearningTrack = track
        };
        var qualification = new Qualification
        {
            Code = $"Q-{Guid.NewGuid():N}",
            ArabicName = "مؤهل",
            EnglishName = "Qualification"
        };
        var version = new QualificationVersion
        {
            Qualification = qualification,
            VersionCode = "v1",
            SourceReference = "test"
        };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit"
        };
        var definition = new AssessmentDefinition
        {
            UnitDefinition = unit,
            Code = "A1",
            ArabicTitle = "تقييم",
            EnglishTitle = "Assessment"
        };
        var rubric = new RubricTemplate { ArabicTitle = "معيار", EnglishTitle = "Rubric" };
        var scope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            RubricTemplateId = rubric.Id
        };
        var original = Eligible(scope.Id);
        original.StudentUserId = StudentId.ToString();
        original.GradeId = grade.Id;
        original.SpecializationId = specialization.Id;
        original.RubricTemplateId = rubric.Id;
        original.CriteriaSnapshotJson = "[\"A.P1\"]";
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            AuthorizedByUserId = ReviewerId,
            Reason = "Authorized historical second-attempt outcome."
        };
        db.AddRange(track, grade, specialization, qualification, version,
            unit, definition, rubric, scope, original, authorization,
            User(StudentId, "Student"), User(ReviewerId, "Reviewer"));
        await db.SaveChangesAsync();
        return authorization.Id;
    }

    private static ApplicationUser User(Guid id, string displayName) => new()
    {
        Id = id,
        UserName = $"{id:N}@betcco.test",
        Email = $"{id:N}@betcco.test",
        DisplayName = displayName
    };

    private static AssessmentScope Scope() => new()
    {
        Id = Guid.NewGuid(),
        AssessmentDefinitionId = Guid.NewGuid(),
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Version = 1,
        PublishedAtUtc = DateTimeOffset.UtcNow,
        IsActive = true,
        IsRetakeOnly = false
    };

    private static EvaluationRequest Eligible(Guid scopeId, Guid? id = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        StudentUserId = $"student-{Guid.NewGuid():N}",
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Status = EvaluationStatus.Completed,
        CalculatedGrade = EvaluationGrade.NotYetAchieved,
        SubmissionAttemptNumber = 2,
        RevisionDueAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
        AssessmentScopeId = scopeId,
        AssessmentScopeSnapshotJson = SnapshotJson(),
        AssessmentRuleSetVersion = BtecAssessmentRuleSet.Default.Version,
        AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
    };

    private static EvaluationRequest BareRequest() => new()
    {
        StudentUserId = $"student-{Guid.NewGuid():N}",
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Status = EvaluationStatus.Completed
    };

    private static string SnapshotJson()
    {
        var now = DateTimeOffset.UtcNow;
        return JsonSerializer.Serialize(new AssessmentScopeSnapshot(
            AssessmentScopeSnapshot.Version,
            new QualificationAcademicSnapshot(
                "Q", "مؤهل", "Qualification", "V1", "source", now.AddYears(-1), null),
            new UnitAcademicSnapshot("U1", "وحدة", "Unit", "source"),
            new AssessmentDefinitionAcademicSnapshot(
                "A1", 1, "مهمة", "Assignment", "source", now.AddMonths(-1)),
            new ScopeAcademicSnapshot(
                1, now.AddMonths(-1),
                "grade", "صف", "Grade",
                "spec", "تخصص", "Specialization"),
            [
                new AimAcademicSnapshot(
                    "A", "هدف", "Aim", "شرح", "Description", "source", 1)
            ],
            [
                new CriterionAcademicSnapshot(
                    "A.P1", "Pass", "A", "معيار", "Criterion", "source", 1)
            ],
            new RubricAcademicSnapshot(
                "روبرك", "Rubric", 1, BtecAssessmentRuleSet.Default.Version, ["A.P1"])));
    }

    private static void involvedReviewerIdAssignment(
        EvaluationRequest request,
        BetccoDbContext db)
    {
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = ReviewerId.ToString(),
            AssignedByUserId = OtherStaffId.ToString()
        });
    }
}
