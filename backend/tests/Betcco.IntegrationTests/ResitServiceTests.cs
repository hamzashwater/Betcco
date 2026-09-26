using System.Reflection;
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

public sealed class ResitServiceTests
{
    private static readonly Guid ReviewerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherStaffId = Guid.Parse("22222222-2222-2222-2222-222222222222");

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
        var eligible = Assert.Single(await service.ListEligibleAsync(ReviewerId));
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

        Assert.Single(await service.ListAuthorizationsAsync(ReviewerId));
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

        Assert.Empty(await service.ListEligibleAsync(ReviewerId));
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
        var candidates = await service.ListEligibleAsync(ReviewerId);

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
    public void Resit_controller_is_course_reviewer_only()
    {
        var attribute = Assert.Single(typeof(ResitsController).GetCustomAttributes<AuthorizeAttribute>());
        Assert.Equal("CourseReviewer", attribute.Policy);
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

    private static EvaluationRequest Eligible(Guid scopeId) => new()
    {
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
