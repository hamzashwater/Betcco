using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PrivacyControllerTests
{
    [Fact]
    public async Task Owner_can_create_track_and_cancel_only_their_own_privacy_request()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db, "student-1");

        var created = await controller.Create(new CreateDataSubjectRequest(DataSubjectRequestType.Access, "Please provide my account data."), CancellationToken.None);

        var response = Assert.IsType<CreatedAtActionResult>(created);
        var view = Assert.IsType<PrivacyRequestView>(response.Value);
        Assert.Equal(DataSubjectRequestStatus.Submitted, view.Status);
        Assert.Equal("student-1", (await db.DataSubjectRequests.SingleAsync()).OwnerUserId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "PrivacyRequestCreated" && audit.ActorUserId == "student-1");

        Assert.IsType<ConflictObjectResult>(await controller.Create(new CreateDataSubjectRequest(DataSubjectRequestType.Access, null), CancellationToken.None));
        Assert.IsType<NotFoundResult>(await ControllerFor(db, "student-2").GetMine(view.Id, CancellationToken.None));

        var cancelled = await controller.Cancel(view.Id, new CancelDataSubjectRequest("No longer needed"), CancellationToken.None);

        Assert.IsType<NoContentResult>(cancelled);
        var persisted = await db.DataSubjectRequests.SingleAsync();
        Assert.Equal(DataSubjectRequestStatus.Cancelled, persisted.Status);
        Assert.Equal("No longer needed", persisted.ResolutionSummary);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "PrivacyRequestCancelledByOwner");
    }

    [Fact]
    public async Task Staff_review_requires_identity_verification_and_fulfillment_evidence_before_completion()
    {
        await using var db = CreateDb();
        var access = new DataSubjectRequest { OwnerUserId = "student-1", RequestType = DataSubjectRequestType.Access };
        var marketing = new DataSubjectRequest { OwnerUserId = "student-1", RequestType = DataSubjectRequestType.WithdrawMarketingConsent };
        db.DataSubjectRequests.AddRange(access, marketing);
        await db.SaveChangesAsync();
        var admin = ControllerFor(db, "privacy-admin", "SystemAdmin");

        var blocked = await admin.Review(access.Id, new ReviewDataSubjectRequest(DataSubjectRequestStatus.Completed, "Prepared securely", false), CancellationToken.None);
        var movedToReview = await admin.Review(access.Id, new ReviewDataSubjectRequest(DataSubjectRequestStatus.InReview, "Identity verified", true), CancellationToken.None);
        var completedWithoutEvidence = await admin.Review(access.Id, new ReviewDataSubjectRequest(DataSubjectRequestStatus.Completed, "Prepared securely", false), CancellationToken.None);
        var marketingCompletedWithoutVerification = await admin.Review(marketing.Id, new ReviewDataSubjectRequest(DataSubjectRequestStatus.Completed, "Marketing messages disabled", false), CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(blocked);
        Assert.Equal(DataSubjectRequestStatus.InReview, Assert.IsType<OkObjectResult>(movedToReview).Value.As<PrivacyRequestView>().Status);
        Assert.IsType<ConflictObjectResult>(completedWithoutEvidence);
        Assert.IsType<ConflictObjectResult>(marketingCompletedWithoutVerification);
        Assert.NotNull((await db.DataSubjectRequests.SingleAsync(item => item.Id == access.Id)).IdentityVerifiedAtUtc);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "PrivacyRequestReviewed" && audit.ActorUserId == "privacy-admin");
    }

    [Fact]
    public async Task Consent_history_is_private_to_the_current_account()
    {
        await using var db = CreateDb();
        db.ConsentRecords.AddRange(
            new ConsentRecord { UserId = "student-1", Purpose = ConsentPurpose.MarketingCommunications, Decision = ConsentDecision.Granted, PolicyVersion = "marketing-consent-v1", CaptureMethod = "Registration" },
            new ConsentRecord { UserId = "student-2", Purpose = ConsentPurpose.MarketingCommunications, Decision = ConsentDecision.Withdrawn, PolicyVersion = "marketing-consent-v1", CaptureMethod = "ProfilePreferences" });
        await db.SaveChangesAsync();

        var response = Assert.IsType<OkObjectResult>(await ControllerFor(db, "student-1").ListMyConsentHistory(CancellationToken.None));
        var items = Assert.IsAssignableFrom<IEnumerable<ConsentRecordView>>(response.Value).ToArray();

        Assert.Single(items);
        Assert.Equal(ConsentDecision.Granted, items[0].Decision);
    }

    [Fact]
    public async Task Consent_record_is_append_only_after_it_is_saved()
    {
        await using var db = CreateDb();
        var consent = new ConsentRecord
        {
            UserId = "student-1",
            Purpose = ConsentPurpose.MarketingCommunications,
            Decision = ConsentDecision.Granted,
            PolicyVersion = "marketing-consent-v1",
            CaptureMethod = "Registration"
        };
        db.ConsentRecords.Add(consent);
        await db.SaveChangesAsync();

        consent.CaptureMethod = "Changed";

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    private static PrivacyController ControllerFor(BetccoDbContext db, string userId, string? role = null) => new(db)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    role is null
                        ? [new Claim(ClaimTypes.NameIdentifier, userId)]
                        : [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)], "Test"))
            }
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}

internal static class PrivacyControllerTestExtensions
{
    public static T As<T>(this object? value) where T : class => Assert.IsType<T>(value);
}
