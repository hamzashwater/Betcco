using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class SecurityIncidentsControllerTests
{
    [Fact]
    public async Task Potential_data_incident_has_no_notification_deadlines_before_legal_assessment()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db, "security-admin");
        var detectedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-2);

        var view = await CreatePotentialDataIncidentAsync(controller, detectedAtUtc);
        Assert.Equal(SecurityIncidentStatus.Open, view.Status);
        Assert.NotNull(view.BreachAssessment);
        Assert.Empty(view.BreachAssessment!.NotificationDeadlines);
        Assert.Null(view.BreachAssessment.LegalConfirmedAtUtc);
    }

    [Fact]
    public async Task Confirmed_article_20_trigger_tracks_deadlines_and_preserves_decision_audit()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db, "security-admin");
        var detectedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-2);
        var created = await CreatePotentialDataIncidentAsync(controller, detectedAtUtc);

        var reviewed = await controller.Review(created.Id, new ReviewSecurityIncidentRequest(
            SecurityIncidentStatus.Assessing,
            true,
            true,
            true,
            "The authorised reviewer recorded that the Article 20 trigger applies.",
            null,
            "ARTICLE20_REVIEW"), CancellationToken.None);

        var view = Assert.IsType<SecurityIncidentView>(Assert.IsType<OkObjectResult>(reviewed).Value);
        var assessment = Assert.IsType<BreachAssessmentView>(view.BreachAssessment);
        Assert.NotNull(assessment.LegalConfirmedAtUtc);
        Assert.Equal("security-admin", assessment.LegalConfirmedByUserId);
        Assert.True(assessment.LegalNotificationRequired);
        Assert.Equal("The authorised reviewer recorded that the Article 20 trigger applies.", assessment.LegalDecisionSummary);
        Assert.Contains(assessment.NotificationDeadlines, deadline => deadline.Audience == BreachNotificationAudience.AffectedIndividuals && deadline.DueAtUtc == detectedAtUtc.AddHours(24));
        Assert.Contains(assessment.NotificationDeadlines, deadline => deadline.Audience == BreachNotificationAudience.RegulatoryAuthority && deadline.DueAtUtc == detectedAtUtc.AddHours(72));

        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "SecurityIncidentArticle20NotificationDecisionRecorded"));
        Assert.Equal("security-admin", audit.ActorUserId);
        using var metadata = JsonDocument.Parse(audit.MetadataJson!);
        Assert.Equal("Article20TriggerApplies", metadata.RootElement.GetProperty("triggerDecision").GetString());
        Assert.True(metadata.RootElement.GetProperty("decisionReasonRecorded").GetBoolean());
        Assert.Equal(2, metadata.RootElement.GetProperty("notificationDeadlineCount").GetInt32());
    }

    [Fact]
    public async Task Rejected_article_20_trigger_requires_a_reason_and_does_not_create_deadlines()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db, "security-admin");
        var created = await CreatePotentialDataIncidentAsync(controller, DateTimeOffset.UtcNow.AddMinutes(-2));

        var missingReason = await controller.Review(created.Id, new ReviewSecurityIncidentRequest(
            SecurityIncidentStatus.Assessing,
            true,
            false,
            true,
            null,
            null,
            "ARTICLE20_REVIEW"), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(missingReason);

        var rejected = await controller.Review(created.Id, new ReviewSecurityIncidentRequest(
            SecurityIncidentStatus.Assessing,
            true,
            false,
            true,
            "The authorised reviewer recorded that the Article 20 trigger does not apply.",
            null,
            "ARTICLE20_REVIEW"), CancellationToken.None);

        var view = Assert.IsType<SecurityIncidentView>(Assert.IsType<OkObjectResult>(rejected).Value);
        var assessment = Assert.IsType<BreachAssessmentView>(view.BreachAssessment);
        Assert.NotNull(assessment.LegalConfirmedAtUtc);
        Assert.Equal("security-admin", assessment.LegalConfirmedByUserId);
        Assert.False(assessment.LegalNotificationRequired);
        Assert.NotNull(assessment.LegalDecisionSummary);
        Assert.Empty(assessment.NotificationDeadlines);
        Assert.Contains(db.AuditLogs, item => item.Action == "SecurityIncidentArticle20NotificationDecisionRecorded");
    }

    [Fact]
    public async Task Recorded_article_20_decision_cannot_be_changed_during_later_review()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db, "security-admin");
        var created = await CreatePotentialDataIncidentAsync(controller, DateTimeOffset.UtcNow.AddMinutes(-2));

        _ = await controller.Review(created.Id, new ReviewSecurityIncidentRequest(
            SecurityIncidentStatus.Assessing,
            true,
            false,
            true,
            "The authorised reviewer recorded that the Article 20 trigger does not apply.",
            null,
            "ARTICLE20_REVIEW"), CancellationToken.None);

        var changed = await controller.Review(created.Id, new ReviewSecurityIncidentRequest(
            SecurityIncidentStatus.Contained,
            true,
            true,
            false,
            "Changed decision.",
            null,
            "FOLLOW_UP"), CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(changed);
        var assessment = await db.BreachAssessments.SingleAsync();
        Assert.False(assessment.LegalNotificationRequired);
        Assert.Equal("The authorised reviewer recorded that the Article 20 trigger does not apply.", assessment.LegalDecisionSummary);
        Assert.Empty(await db.BreachNotificationDeadlines.ToListAsync());
    }

    private static async Task<SecurityIncidentView> CreatePotentialDataIncidentAsync(SecurityIncidentsController controller, DateTimeOffset detectedAtUtc)
    {
        var created = await controller.Create(new CreateSecurityIncidentRequest(
            "Unexpected access pattern",
            "A security signal requires internal assessment.",
            "ACCESS_ANOMALY",
            SecurityIncidentSeverity.High,
            true,
            detectedAtUtc), CancellationToken.None);

        return Assert.IsType<SecurityIncidentView>(Assert.IsType<CreatedAtActionResult>(created).Value);
    }

    private static SecurityIncidentsController ControllerFor(BetccoDbContext db, string userId) => new(db)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, "SystemAdmin")], "Test"))
            }
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
