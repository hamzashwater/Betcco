using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PrivacyFulfillmentControllerTests
{
    [Fact]
    public async Task Released_access_response_is_owner_scoped_excludes_security_fields_and_preserves_release_evidence()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        var other = User("Other", "other@betcco.test");
        owner.PasswordHash = "secret-password-hash";
        db.Users.AddRange(owner, other);
        var request = Request(owner, DataSubjectRequestType.Access);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var staff = FulfillmentControllerFor(db, PrivacyAdminId);
        Assert.IsType<OkObjectResult>(await staff.GenerateAccess(request.Id, CancellationToken.None));
        Assert.IsType<OkObjectResult>(await staff.ReleaseAccess(request.Id, CancellationToken.None));

        var response = Assert.IsType<AccessResponseView>(Assert.IsType<OkObjectResult>(await FulfillmentControllerFor(db, owner.Id.ToString())
            .GetMyAccessResponse(request.Id, CancellationToken.None)).Value);
        var serialized = JsonSerializer.Serialize(response);

        Assert.Equal("Owner", response.Profile.DisplayName);
        Assert.DoesNotContain("secret-password-hash", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("PasswordHash", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("SecurityStamp", serialized, StringComparison.Ordinal);
        Assert.IsType<NotFoundResult>(await FulfillmentControllerFor(db, other.Id.ToString()).GetMyAccessResponse(request.Id, CancellationToken.None));
        var fulfillment = await db.DataSubjectFulfillments.SingleAsync();
        Assert.Equal(DataSubjectFulfillmentStatus.Released, fulfillment.Status);
        Assert.Equal(PrivacyAdminId, fulfillment.GeneratedByUserId);
        Assert.Equal(PrivacyAdminId, fulfillment.ReleasedByUserId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectAccessGenerated");
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectAccessReleased");
    }

    [Fact]
    public async Task Correction_changes_only_supported_field_and_records_non_sensitive_audit_evidence()
    {
        await using var db = CreateDb();
        var owner = User("Original", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner, DataSubjectRequestType.Rectification);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FulfillmentControllerFor(db, PrivacyAdminId).ApplyCorrection(request.Id,
            new(CorrectablePersonalField.DisplayName, "Corrected name"), CancellationToken.None);

        Assert.Equal("Corrected name", (await db.Users.SingleAsync()).DisplayName);
        var fulfillment = Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(DataSubjectFulfillmentStatus.Applied, fulfillment.Status);
        Assert.DoesNotContain("Corrected name", fulfillment.EvidenceJson, StringComparison.Ordinal);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectCorrectionApplied" && audit.ActorUserId == PrivacyAdminId);
    }

    [Fact]
    public async Task Unsupported_correction_field_cannot_change_the_account()
    {
        await using var db = CreateDb();
        var owner = User("Original", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner, DataSubjectRequestType.Rectification);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FulfillmentControllerFor(db, PrivacyAdminId).ApplyCorrection(request.Id,
            new((CorrectablePersonalField)999, "attempted immutable change"), CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Original", (await db.Users.SingleAsync()).DisplayName);
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Verified_restriction_creates_queryable_state_and_its_release_is_audited()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner, DataSubjectRequestType.Restriction);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();
        var service = new DataSubjectFulfillmentService(db);
        var controller = FulfillmentControllerFor(db, PrivacyAdminId, service);

        var applied = await controller.ApplyRestriction(request.Id, new("marketing-campaigns", "Verified restriction request."), CancellationToken.None);
        Assert.Equal(DataSubjectFulfillmentStatus.Applied, Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(applied).Value).Status);
        Assert.True(await service.IsRestrictedAsync(owner.Id.ToString(), "marketing-campaigns"));
        var restriction = await db.DataProcessingRestrictions.SingleAsync();

        Assert.IsType<OkObjectResult>(await controller.ReleaseRestriction(restriction.Id, new("Reviewed restriction release."), CancellationToken.None));
        Assert.False(await service.IsRestrictedAsync(owner.Id.ToString(), "marketing-campaigns"));
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectRestrictionApplied");
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectRestrictionReleased");
    }

    [Fact]
    public async Task Optional_consent_withdrawal_is_append_only_and_idempotent()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        owner.MarketingConsent = true;
        owner.MarketingConsentAtUtc = DateTimeOffset.UtcNow.AddDays(-1);
        db.Users.Add(owner);
        db.ConsentRecords.Add(new ConsentRecord
        {
            UserId = owner.Id.ToString(),
            Purpose = ConsentPurpose.MarketingCommunications,
            Decision = ConsentDecision.Granted,
            PolicyVersion = "marketing-v1",
            CaptureMethod = "ProfilePreferences"
        });
        var request = Request(owner, DataSubjectRequestType.WithdrawMarketingConsent);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();
        var controller = FulfillmentControllerFor(db, PrivacyAdminId);

        var first = Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(await controller.WithdrawOptionalConsent(request.Id, CancellationToken.None)).Value);
        var repeated = Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(await controller.WithdrawOptionalConsent(request.Id, CancellationToken.None)).Value);

        Assert.Equal(first.Id, repeated.Id);
        Assert.False((await db.Users.SingleAsync()).MarketingConsent);
        var history = await db.ConsentRecords.OrderBy(item => item.CreatedAtUtc).ToListAsync();
        Assert.Equal(2, history.Count);
        Assert.Equal(ConsentDecision.Granted, history[0].Decision);
        Assert.Equal(ConsentDecision.Withdrawn, history[1].Decision);
        Assert.Single(await db.DataSubjectFulfillments.ToListAsync());
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataSubjectOptionalConsentWithdrawn");
    }

    [Fact]
    public async Task Optional_consent_without_existing_evidence_is_not_silently_withdrawn()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        owner.MarketingConsent = true;
        db.Users.Add(owner);
        var request = Request(owner, DataSubjectRequestType.WithdrawMarketingConsent);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FulfillmentControllerFor(db, PrivacyAdminId).WithdrawOptionalConsent(request.Id, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        Assert.True((await db.Users.SingleAsync()).MarketingConsent);
        Assert.Empty(await db.ConsentRecords.ToListAsync());
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Unverified_request_cannot_execute_and_completion_requires_recorded_fulfillment()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var unverified = new DataSubjectRequest { OwnerUserId = owner.Id.ToString(), RequestType = DataSubjectRequestType.Access, Status = DataSubjectRequestStatus.InReview };
        db.DataSubjectRequests.Add(unverified);
        await db.SaveChangesAsync();

        Assert.IsType<ConflictObjectResult>(await FulfillmentControllerFor(db, PrivacyAdminId).GenerateAccess(unverified.Id, CancellationToken.None));
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());

        unverified.IdentityVerifiedAtUtc = DateTimeOffset.UtcNow;
        unverified.IdentityVerifiedByUserId = PrivacyAdminId;
        await db.SaveChangesAsync();
        var requests = PrivacyControllerFor(db, PrivacyAdminId);
        Assert.IsType<ConflictObjectResult>(await requests.Review(unverified.Id,
            new(DataSubjectRequestStatus.Completed, "Attempted without fulfillment evidence.", false), CancellationToken.None));

        var staff = FulfillmentControllerFor(db, PrivacyAdminId);
        Assert.IsType<OkObjectResult>(await staff.GenerateAccess(unverified.Id, CancellationToken.None));
        Assert.IsType<OkObjectResult>(await staff.ReleaseAccess(unverified.Id, CancellationToken.None));
        var completed = await requests.Review(unverified.Id,
            new(DataSubjectRequestStatus.Completed, "Controlled access response released.", false), CancellationToken.None);
        Assert.Equal(DataSubjectRequestStatus.Completed, Assert.IsType<PrivacyRequestView>(Assert.IsType<OkObjectResult>(completed).Value).Status);
    }

    [Fact]
    public async Task Profiling_objection_requires_reviewed_evidence_and_records_a_minimized_audit_event()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = new DataSubjectRequest
        {
            OwnerUserId = owner.Id.ToString(),
            RequestType = DataSubjectRequestType.ObjectionToProfiling,
            Status = DataSubjectRequestStatus.InReview,
            Description = "Sensitive request content that must not enter the audit log."
        };
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var staff = FulfillmentControllerFor(db, PrivacyAdminId);
        var review = PrivacyControllerFor(db, PrivacyAdminId);
        var outcome = new RecordProfilingObjectionRequest("automated-recommendations", "human-review-recorded", "Sensitive reviewer reason that belongs only in fulfillment evidence.");

        Assert.IsType<ConflictObjectResult>(await staff.RecordProfilingObjection(request.Id, outcome, CancellationToken.None));
        Assert.IsType<ConflictObjectResult>(await review.Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Attempted without reviewed fulfillment evidence.", true), CancellationToken.None));

        request.IdentityVerifiedAtUtc = DateTimeOffset.UtcNow;
        request.IdentityVerifiedByUserId = PrivacyAdminId;
        await db.SaveChangesAsync();

        Assert.IsType<ConflictObjectResult>(await review.Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Attempted without reviewed fulfillment evidence.", false), CancellationToken.None));

        var first = Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(await staff.RecordProfilingObjection(request.Id, outcome, CancellationToken.None)).Value);
        var repeated = Assert.IsType<DataSubjectFulfillmentView>(Assert.IsType<OkObjectResult>(await staff.RecordProfilingObjection(request.Id, outcome, CancellationToken.None)).Value);

        Assert.Equal(first.Id, repeated.Id);
        Assert.Equal(DataSubjectFulfillmentStatus.Applied, first.Status);
        Assert.Contains("automated-recommendations", first.EvidenceJson, StringComparison.Ordinal);
        Assert.Contains("human-review-recorded", first.EvidenceJson, StringComparison.Ordinal);
        Assert.Contains("Sensitive reviewer reason", first.EvidenceJson, StringComparison.Ordinal);
        Assert.Contains("runtimeProfilingControlApplied", first.EvidenceJson, StringComparison.Ordinal);
        Assert.Single(await db.DataSubjectFulfillments.ToListAsync());

        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "DataSubjectProfilingObjectionReviewed"));
        Assert.DoesNotContain(request.Description!, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(outcome.Reason, audit.MetadataJson, StringComparison.Ordinal);

        var completed = await review.Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Reviewed profiling objection fulfillment recorded.", false), CancellationToken.None);
        Assert.Equal(DataSubjectRequestStatus.Completed, Assert.IsType<PrivacyRequestView>(Assert.IsType<OkObjectResult>(completed).Value).Status);
    }

    [Fact]
    public async Task Fulfillment_management_requires_privacy_administrator_authorization()
    {
        var protectedMethods = new[]
        {
            nameof(PrivacyFulfillmentController.GenerateAccess),
            nameof(PrivacyFulfillmentController.ReleaseAccess),
            nameof(PrivacyFulfillmentController.ApplyCorrection),
            nameof(PrivacyFulfillmentController.ApplyRestriction),
            nameof(PrivacyFulfillmentController.WithdrawOptionalConsent),
            nameof(PrivacyFulfillmentController.RecordProfilingObjection),
            nameof(PrivacyFulfillmentController.ReleaseRestriction)
        };
        foreach (var methodName in protectedMethods)
        {
            var attribute = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyFulfillmentController)
                .GetMethod(methodName)!.GetCustomAttributes(typeof(AuthorizeAttribute), true)));
            Assert.Equal("PrivacyAdmin", attribute.Policy);
        }

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private const string PrivacyAdminId = "privacy-admin";

    private static ApplicationUser User(string displayName, string email) => new()
    {
        Id = Guid.NewGuid(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        DisplayName = displayName,
        PhoneDisplay = "+962700000000",
        CountryCode = "JO",
        Gender = "PreferNotToSay",
        DateOfBirth = new DateOnly(2000, 1, 1)
    };

    private static DataSubjectRequest Request(ApplicationUser owner, DataSubjectRequestType type) => new()
    {
        OwnerUserId = owner.Id.ToString(),
        RequestType = type,
        Status = DataSubjectRequestStatus.InReview,
        IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
        IdentityVerifiedByUserId = PrivacyAdminId
    };

    private static PrivacyFulfillmentController FulfillmentControllerFor(BetccoDbContext db, string userId, DataSubjectFulfillmentService? service = null) => new(db, service ?? new DataSubjectFulfillmentService(db), new PrivacySubjectDataService(db))
    {
        ControllerContext = ControllerContextFor(userId)
    };

    private static PrivacyController PrivacyControllerFor(BetccoDbContext db, string userId) => new(db)
    {
        ControllerContext = ControllerContextFor(userId)
    };

    private static ControllerContext ControllerContextFor(string userId) => new()
    {
        HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"))
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
