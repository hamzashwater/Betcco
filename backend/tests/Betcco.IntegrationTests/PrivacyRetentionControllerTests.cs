using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Privacy;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PrivacyRetentionControllerTests
{
    [Fact]
    public async Task Active_retention_policy_lookup_returns_only_the_configured_current_effective_policy()
    {
        await using var db = CreateDb();
        db.RetentionPolicies.Add(Policy("account-profile", "1.0", isCurrent: false));
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var created = await controller.CreatePolicy(new CreateRetentionPolicyRequest(
            "account-profile",
            "2.0",
            "Account profile data",
            "reviewed-rule-reference-without-a-hard-coded-period",
            "Configured legal or business basis",
            RetentionActionAfterExpiry.Conceal,
            true,
            true,
            DateTimeOffset.UtcNow.AddMinutes(-1)), CancellationToken.None);
        Assert.IsType<CreatedAtActionResult>(created);

        var response = await controller.GetActivePolicy("account-profile", CancellationToken.None);

        var policy = Assert.IsType<RetentionPolicyView>(Assert.IsType<OkObjectResult>(response).Value);
        Assert.Equal("2.0", policy.Version);
        Assert.Equal("reviewed-rule-reference-without-a-hard-coded-period", policy.RetentionRule);
        Assert.Equal(RetentionActionAfterExpiry.Conceal, policy.ActionAfterExpiry);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "RetentionPolicyCreated" && audit.ActorUserId == "privacy-admin");
    }

    [Fact]
    public async Task Active_legal_hold_blocks_privacy_execution_and_records_the_job_audit()
    {
        await using var db = CreateDb();
        var request = await RequestAsync(db);
        var policy = Policy("account-profile", "1.0", isCurrent: true);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "privacy-admin");

        var holdResult = await controller.CreateLegalHold(
            new CreateLegalHoldRequest(request.OwnerUserId, policy.PolicyKey, "Matter preservation requirement."), CancellationToken.None);
        var hold = Assert.IsType<LegalHoldView>(Assert.IsType<CreatedAtActionResult>(holdResult).Value);
        Assert.Equal("privacy-admin", hold.CreatedByUserId);
        Assert.Equal(LegalHoldStatus.Active, hold.Status);
        var evaluation = await controller.EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Authorised reviewer recorded eligibility."), CancellationToken.None);

        var job = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(evaluation).Value);
        Assert.Equal(PrivacyExecutionJobStatus.BlockedByLegalHold, job.Status);
        Assert.Equal(hold.Id, job.BlockingLegalHoldId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "LegalHoldCreated" && audit.ActorUserId == "privacy-admin");
        Assert.Contains(db.AuditLogs, audit => audit.Action == "PrivacyExecutionJobCreated" && audit.EntityId == job.Id.ToString());
    }

    [Fact]
    public async Task Released_legal_hold_requires_explicit_reevaluation_and_does_not_create_a_second_job()
    {
        await using var db = CreateDb();
        var request = await RequestAsync(db);
        var policy = Policy("account-profile", "1.0", isCurrent: true);
        var hold = new LegalHold { SubjectUserId = request.OwnerUserId, ScopePolicyKey = policy.PolicyKey, Reason = "Preserve pending review." };
        db.RetentionPolicies.Add(policy);
        db.LegalHolds.Add(hold);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "privacy-admin");

        var blocked = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(await controller.EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Eligibility confirmed."), CancellationToken.None)).Value);
        Assert.Equal(PrivacyExecutionJobStatus.BlockedByLegalHold, blocked.Status);

        var released = await controller.ReleaseLegalHold(hold.Id, new ReleaseLegalHoldRequest("Preservation requirement ended."), CancellationToken.None);
        Assert.Equal(LegalHoldStatus.Released, Assert.IsType<LegalHoldView>(Assert.IsType<OkObjectResult>(released).Value).Status);
        Assert.Equal(PrivacyExecutionJobStatus.BlockedByLegalHold, (await db.PrivacyExecutionJobs.SingleAsync()).Status);

        var reevaluated = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(await controller.EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Eligibility rechecked after hold release."), CancellationToken.None)).Value);
        Assert.Equal(blocked.Id, reevaluated.Id);
        Assert.Equal(PrivacyExecutionJobStatus.AwaitingManualExecution, reevaluated.Status);
        Assert.Single(await db.PrivacyExecutionJobs.ToListAsync());
        Assert.Contains(db.AuditLogs, audit => audit.Action == "LegalHoldReleased");
        Assert.Contains(db.AuditLogs, audit => audit.Action == "PrivacyExecutionJobReevaluated");
    }

    [Fact]
    public async Task Repeated_evaluation_is_idempotent_and_does_not_perform_a_destructive_action()
    {
        await using var db = CreateDb();
        var request = await RequestAsync(db);
        var policy = Policy("account-profile", "1.0", isCurrent: true, action: RetentionActionAfterExpiry.Delete);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);

        var first = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(await controller.EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Eligibility documented."), CancellationToken.None)).Value);
        var repeated = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(await controller.EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Eligibility documented again."), CancellationToken.None)).Value);

        Assert.Equal(first.Id, repeated.Id);
        Assert.Equal(PrivacyExecutionJobStatus.AwaitingManualExecution, repeated.Status);
        Assert.Single(await db.PrivacyExecutionJobs.ToListAsync());
        Assert.NotNull(await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == request.Id));
    }

    [Fact]
    public async Task Inactive_retention_policy_records_a_failed_execution_job_without_touching_subject_data()
    {
        await using var db = CreateDb();
        var request = await RequestAsync(db);
        var policy = Policy("account-profile", "1.0", isCurrent: true);
        policy.IsEnabled = false;
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();

        var result = await ControllerFor(db).EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, true, "Eligibility was reviewed."), CancellationToken.None);

        var job = Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(PrivacyExecutionJobStatus.Failed, job.Status);
        Assert.NotNull(job.FailureDetail);
        Assert.NotNull(await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == request.Id));
    }

    [Fact]
    public async Task Existing_unrelated_privacy_legal_and_guardian_records_remain_preserved_after_evaluation()
    {
        await using var db = CreateDb();
        var request = await RequestAsync(db);
        var policy = Policy("account-profile", "1.0", isCurrent: true);
        var legalDocument = new LegalDocument
        {
            Slug = "unrelated-legal",
            Version = "1.0",
            ArabicTitle = "وثيقة",
            EnglishTitle = "Document",
            ArabicContent = "نص",
            EnglishContent = "Text"
        };
        var guardianInvitation = new GuardianInvitation
        {
            StudentUserId = "unrelated-student",
            RecipientEmail = "GUARDIAN@BETCCO.TEST",
            TokenHash = new string('A', 64),
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(1)
        };
        db.RetentionPolicies.Add(policy);
        db.LegalDocuments.Add(legalDocument);
        db.GuardianInvitations.Add(guardianInvitation);
        db.ConsentRecords.Add(new ConsentRecord
        {
            UserId = "unrelated-user",
            Purpose = ConsentPurpose.MarketingCommunications,
            Decision = ConsentDecision.Granted,
            PolicyVersion = "1.0",
            CaptureMethod = "Test"
        });
        await db.SaveChangesAsync();

        var result = await ControllerFor(db).EvaluateExecution(
            new EvaluatePrivacyExecutionRequest(request.Id, policy.Id, false, "The configured rule does not yet permit an action."), CancellationToken.None);

        Assert.Equal(PrivacyExecutionJobStatus.NotEligible, Assert.IsType<PrivacyExecutionJobView>(Assert.IsType<OkObjectResult>(result).Value).Status);
        Assert.NotNull(await db.LegalDocuments.SingleOrDefaultAsync(item => item.Id == legalDocument.Id));
        Assert.NotNull(await db.GuardianInvitations.SingleOrDefaultAsync(item => item.Id == guardianInvitation.Id));
        Assert.NotNull(await db.ConsentRecords.SingleOrDefaultAsync(item => item.UserId == "unrelated-user"));
    }

    [Fact]
    public async Task Legal_hold_management_requires_privacy_administrator_authorization()
    {
        var controllerAuthorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyRetentionController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("PrivacyAdmin", controllerAuthorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private static RetentionPolicy Policy(string policyKey, string version, bool isCurrent, string retentionRule = "configured-retention-rule", RetentionActionAfterExpiry action = RetentionActionAfterExpiry.Conceal) => new()
    {
        PolicyKey = policyKey,
        Version = version,
        DataCategoryOrPurpose = "Account profile data",
        RetentionRule = retentionRule,
        LegalOrBusinessBasis = "Configured legal or business basis",
        ActionAfterExpiry = action,
        IsEnabled = true,
        IsCurrent = isCurrent,
        EffectiveAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
    };

    private static async Task<DataSubjectRequest> RequestAsync(BetccoDbContext db)
    {
        var request = new DataSubjectRequest
        {
            OwnerUserId = "subject-user",
            RequestType = DataSubjectRequestType.ErasureOrConcealment,
            Status = DataSubjectRequestStatus.InReview,
            IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
            IdentityVerifiedByUserId = "privacy-admin"
        };
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();
        return request;
    }

    private static PrivacyRetentionController ControllerFor(BetccoDbContext db, string userId = "privacy-admin") => new(
        db,
        new PrivacyExecutionService(db),
        new EraseConcealmentExecutionService(db, new DataSubjectFulfillmentService(db)))
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"))
            }
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
