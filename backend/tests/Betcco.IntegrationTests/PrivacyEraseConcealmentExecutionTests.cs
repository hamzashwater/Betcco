using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PrivacyEraseConcealmentExecutionTests
{
    [Fact]
    public async Task Unverified_erase_request_cannot_execute()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        db.Users.Add(owner);
        var request = Request(owner, verified: false);
        var policy = Policy();
        var job = Job(request, policy);
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        db.PrivacyExecutionJobs.Add(job);
        await db.SaveChangesAsync();

        var result = await ControllerFor(db).ExecuteConcealment(job.Id, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal("JO", (await db.Users.SingleAsync()).CountryCode);
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Active_legal_hold_added_after_evaluation_blocks_concealment()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        db.Users.Add(owner);
        var request = Request(owner);
        var policy = Policy();
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var job = await EvaluateAsync(controller, db, request, policy);
        db.LegalHolds.Add(new LegalHold { SubjectUserId = owner.Id.ToString(), ScopePolicyKey = policy.PolicyKey, Reason = "Preserve for a current matter." });
        await db.SaveChangesAsync();

        Assert.IsType<ConflictObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));
        Assert.Equal(PrivacyExecutionJobStatus.BlockedByLegalHold, (await db.PrivacyExecutionJobs.SingleAsync()).Status);
        Assert.Equal("JO", (await db.Users.SingleAsync()).CountryCode);
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Configured_non_conceal_action_prevents_profile_mutation()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        db.Users.Add(owner);
        var request = Request(owner);
        var policy = Policy(action: RetentionActionAfterExpiry.Retain, retentionRule: "legally reviewed configured rule without an application-defined period");
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var job = await EvaluateAsync(controller, db, request, policy);

        Assert.IsType<ConflictObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));
        var persistedJob = await db.PrivacyExecutionJobs.SingleAsync();
        Assert.Equal(PrivacyExecutionJobStatus.NotEligible, persistedJob.Status);
        Assert.Equal("JO", (await db.Users.SingleAsync()).CountryCode);
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Active_processing_restriction_for_the_policy_scope_blocks_concealment()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        db.Users.Add(owner);
        var request = Request(owner);
        var policy = Policy();
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var job = await EvaluateAsync(controller, db, request, policy);
        var restrictionRequest = new DataSubjectRequest
        {
            OwnerUserId = owner.Id.ToString(),
            RequestType = DataSubjectRequestType.Restriction,
            Status = DataSubjectRequestStatus.InReview,
            IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
            IdentityVerifiedByUserId = PrivacyAdminId
        };
        db.DataSubjectRequests.Add(restrictionRequest);
        db.DataProcessingRestrictions.Add(new DataProcessingRestriction
        {
            DataSubjectRequestId = restrictionRequest.Id,
            SubjectUserId = owner.Id.ToString(),
            ProcessingScope = policy.PolicyKey,
            Reason = "Processing is restricted pending review."
        });
        await db.SaveChangesAsync();

        Assert.IsType<ConflictObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));
        Assert.Equal(PrivacyExecutionJobStatus.BlockedByProcessingRestriction, (await db.PrivacyExecutionJobs.SingleAsync()).Status);
        Assert.Equal("JO", (await db.Users.SingleAsync()).CountryCode);
    }

    [Fact]
    public async Task Configured_profile_demographics_concealment_preserves_protected_records_and_is_idempotent()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        owner.PasswordHash = "retained-password-hash";
        var other = User("Other");
        db.Users.AddRange(owner, other);
        var request = Request(owner);
        var policy = Policy(retentionRule: "configured legal review rule; no hard-coded retention duration");
        var legalDocument = new LegalDocument { Slug = "privacy-test", Version = "1.0", ArabicTitle = "وثيقة", EnglishTitle = "Document", ArabicContent = "نص", EnglishContent = "Text" };
        var enrollment = new Enrollment { StudentUserId = owner.Id.ToString(), CourseId = Guid.NewGuid() };
        var payment = new Payment { UserId = owner.Id.ToString(), Purpose = "Course", ReferenceId = Guid.NewGuid(), Subtotal = 10, Total = 10 };
        var wallet = new WalletTransaction { UserId = owner.Id.ToString(), Type = "Credit", Amount = 10, Description = "Preserved ledger entry" };
        var audit = new AuditLog { ActorUserId = owner.Id.ToString(), Action = "ExistingAudit", EntityType = "Existing", Outcome = "Success" };
        var incident = new SecurityIncident { Title = "Existing incident", Summary = "Security history remains unchanged.", ReasonCode = "TEST", Severity = SecurityIncidentSeverity.Low };
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        db.LegalDocuments.Add(legalDocument);
        db.LegalAcceptances.Add(new LegalAcceptance { UserId = owner.Id.ToString(), LegalDocumentId = legalDocument.Id, Version = legalDocument.Version });
        db.Enrollments.Add(enrollment);
        db.Payments.Add(payment);
        db.WalletTransactions.Add(wallet);
        db.AuditLogs.Add(audit);
        db.SecurityIncidents.Add(incident);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var job = await EvaluateAsync(controller, db, request, policy);

        var first = Assert.IsType<OkObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));
        var repeated = Assert.IsType<OkObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));

        var persistedOwner = await db.Users.SingleAsync(item => item.Id == owner.Id);
        var persistedOther = await db.Users.SingleAsync(item => item.Id == other.Id);
        Assert.Null(persistedOwner.CountryCode);
        Assert.Null(persistedOwner.Gender);
        Assert.Null(persistedOwner.DateOfBirth);
        Assert.Equal(owner.Id, persistedOwner.Id);
        Assert.Equal("Owner", persistedOwner.DisplayName);
        Assert.Equal("owner@betcco.test", persistedOwner.Email);
        Assert.Equal("+962700000000", persistedOwner.PhoneNumber);
        Assert.Equal("retained-password-hash", persistedOwner.PasswordHash);
        Assert.Equal("JO", persistedOther.CountryCode);
        Assert.Equal("PreferNotToSay", persistedOther.Gender);
        Assert.NotNull(persistedOther.DateOfBirth);
        Assert.NotNull(await db.Enrollments.SingleOrDefaultAsync(item => item.Id == enrollment.Id));
        Assert.NotNull(await db.Payments.SingleOrDefaultAsync(item => item.Id == payment.Id));
        Assert.NotNull(await db.WalletTransactions.SingleOrDefaultAsync(item => item.Id == wallet.Id));
        Assert.NotNull(await db.AuditLogs.SingleOrDefaultAsync(item => item.Id == audit.Id));
        Assert.NotNull(await db.SecurityIncidents.SingleOrDefaultAsync(item => item.Id == incident.Id));
        Assert.NotNull(await db.LegalAcceptances.SingleOrDefaultAsync(item => item.UserId == owner.Id.ToString()));
        Assert.Single(await db.DataSubjectFulfillments.ToListAsync());
        Assert.Equal(PrivacyExecutionJobStatus.Completed, (await db.PrivacyExecutionJobs.SingleAsync()).Status);
        Assert.NotNull(first.Value);
        Assert.NotNull(repeated.Value);
        Assert.Contains(db.AuditLogs, item => item.Action == "PrivacyProfileDemographicsConcealed" && item.ActorUserId == PrivacyAdminId);
    }

    [Fact]
    public async Task Request_cannot_complete_without_successful_concealment_evidence()
    {
        await using var db = CreateDb();
        var owner = User("Owner");
        db.Users.Add(owner);
        var request = Request(owner);
        var policy = Policy();
        db.DataSubjectRequests.Add(request);
        db.RetentionPolicies.Add(policy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var privacy = PrivacyControllerFor(db);

        Assert.IsType<ConflictObjectResult>(await privacy.Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Execution has not yet succeeded.", false), CancellationToken.None));
        var job = await EvaluateAsync(controller, db, request, policy);
        Assert.IsType<OkObjectResult>(await controller.ExecuteConcealment(job.Id, CancellationToken.None));
        var completed = await privacy.Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Configured demographic concealment completed.", false), CancellationToken.None);
        Assert.Equal(DataSubjectRequestStatus.Completed, Assert.IsType<PrivacyRequestView>(Assert.IsType<OkObjectResult>(completed).Value).Status);
    }

    [Fact]
    public async Task Concealment_execution_requires_privacy_administrator_authorization()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyRetentionController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("PrivacyAdmin", authorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private const string PrivacyAdminId = "privacy-admin";

    private static ApplicationUser User(string displayName) => new()
    {
        Id = Guid.NewGuid(),
        UserName = $"{displayName.ToLowerInvariant()}@betcco.test",
        NormalizedUserName = $"{displayName.ToUpperInvariant()}@BETCCO.TEST",
        Email = $"{displayName.ToLowerInvariant()}@betcco.test",
        NormalizedEmail = $"{displayName.ToUpperInvariant()}@BETCCO.TEST",
        DisplayName = displayName,
        PhoneNumber = "+962700000000",
        PhoneDisplay = "+962700000000",
        CountryCode = "JO",
        Gender = "PreferNotToSay",
        DateOfBirth = new DateOnly(2000, 1, 1),
        MarketingConsent = true,
        MarketingConsentAtUtc = DateTimeOffset.UtcNow.AddDays(-1)
    };

    private static DataSubjectRequest Request(ApplicationUser owner, bool verified = true) => new()
    {
        OwnerUserId = owner.Id.ToString(),
        RequestType = DataSubjectRequestType.ErasureOrConcealment,
        Status = DataSubjectRequestStatus.InReview,
        IdentityVerifiedAtUtc = verified ? DateTimeOffset.UtcNow : null,
        IdentityVerifiedByUserId = verified ? PrivacyAdminId : null
    };

    private static RetentionPolicy Policy(
        RetentionActionAfterExpiry action = RetentionActionAfterExpiry.Conceal,
        string retentionRule = "configured retention rule") => new()
        {
            PolicyKey = "profile-demographics",
            Version = "1.0",
            DataCategoryOrPurpose = "Configured profile demographics category",
            RetentionRule = retentionRule,
            LegalOrBusinessBasis = "Configured legal or business basis",
            ActionAfterExpiry = action,
            ExecutionCategory = PrivacyExecutionCategory.ProfileDemographics,
            IsEnabled = true,
            IsCurrent = true,
            EffectiveAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
        };

    private static PrivacyExecutionJob Job(DataSubjectRequest request, RetentionPolicy policy) => new()
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
        EvaluatedByUserId = PrivacyAdminId
    };

    private static async Task<PrivacyExecutionJob> EvaluateAsync(PrivacyRetentionController controller, BetccoDbContext db, DataSubjectRequest request, RetentionPolicy policy)
    {
        Assert.IsType<OkObjectResult>(await controller.EvaluateExecution(
            new(request.Id, policy.Id, true, "Reviewer recorded configured eligibility."), CancellationToken.None));
        return await db.PrivacyExecutionJobs.SingleAsync();
    }

    private static PrivacyRetentionController ControllerFor(BetccoDbContext db) => new(
        db,
        new PrivacyExecutionService(db),
        new EraseConcealmentExecutionService(db, new DataSubjectFulfillmentService(db)))
    {
        ControllerContext = ControllerContextFor(PrivacyAdminId, PlatformRoles.SystemAdmin)
    };

    private static PrivacyController PrivacyControllerFor(BetccoDbContext db) => new(db)
    {
        ControllerContext = ControllerContextFor(PrivacyAdminId, PlatformRoles.SystemAdmin)
    };

    private static ControllerContext ControllerContextFor(string userId, string role) => new()
    {
        HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)], "Test"))
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
