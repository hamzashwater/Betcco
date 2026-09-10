using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PrivacySensitiveReadAuditTests
{
    [Fact]
    public async Task Privacy_administrator_list_read_is_audited_once_without_request_contents()
    {
        var context = StaffContext("privacy-admin", PlatformRoles.SystemAdmin, "privacy-list-correlation");
        await using var db = CreateDb(context);
        db.DataSubjectRequests.Add(new DataSubjectRequest
        {
            OwnerUserId = "student-1",
            RequestType = DataSubjectRequestType.Access,
            Description = "Sensitive request content must not be copied to a list-read audit event."
        });
        await db.SaveChangesAsync();

        var response = await PrivacyControllerFor(db, context).ListForReview(null, 1, 25, CancellationToken.None);

        Assert.IsType<PrivacyRequestPage>(Assert.IsType<OkObjectResult>(response).Value);
        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "PrivacyRequestAdminListRead"));
        Assert.Equal("privacy-admin", audit.ActorUserId);
        Assert.Null(audit.EntityId);
        Assert.Equal("privacy-list-correlation", audit.CorrelationId);
        Assert.DoesNotContain("Sensitive request content", audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Privacy_administrator_detail_read_is_audited_without_request_contents()
    {
        var context = StaffContext("privacy-admin", PlatformRoles.SystemAdmin, "privacy-read-correlation");
        await using var db = CreateDb(context);
        var request = new DataSubjectRequest
        {
            OwnerUserId = "student-1",
            RequestType = DataSubjectRequestType.Access,
            Description = "Sensitive access request details must not be copied to an audit event.",
            ResolutionSummary = "Sensitive staff resolution must not be copied either."
        };
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var response = await PrivacyControllerFor(db, context).GetForReview(request.Id, CancellationToken.None);

        Assert.IsType<PrivacyRequestView>(Assert.IsType<OkObjectResult>(response).Value);
        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "PrivacyRequestAdminDetailRead"));
        Assert.Equal("privacy-admin", audit.ActorUserId);
        Assert.Equal(nameof(DataSubjectRequest), audit.EntityType);
        Assert.Equal(request.Id.ToString(), audit.EntityId);
        Assert.Equal("privacy-read-correlation", audit.CorrelationId);
        Assert.Equal("Success", audit.Outcome);
        Assert.DoesNotContain(request.Description, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(request.ResolutionSummary, audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Security_incident_detail_read_is_audited_once_without_incident_contents()
    {
        var context = StaffContext("security-admin", PlatformRoles.SystemAdmin, "incident-read-correlation");
        await using var db = CreateDb(context);
        var incident = new SecurityIncident
        {
            Title = "Sensitive incident title",
            Summary = "Sensitive incident summary must not be copied to an audit event.",
            ReasonCode = "SENSITIVE_REASON_CODE",
            Severity = SecurityIncidentSeverity.High,
            CreatedByUserId = "security-admin",
            BreachAssessment = new BreachAssessment { PotentialPersonalDataImpact = true }
        };
        db.SecurityIncidents.Add(incident);
        await db.SaveChangesAsync();

        var response = await SecurityIncidentsControllerFor(db, context).Get(incident.Id, CancellationToken.None);

        Assert.IsType<SecurityIncidentView>(Assert.IsType<OkObjectResult>(response).Value);
        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "SecurityIncidentAdminDetailRead"));
        Assert.Equal("security-admin", audit.ActorUserId);
        Assert.Equal(nameof(SecurityIncident), audit.EntityType);
        Assert.Equal(incident.Id.ToString(), audit.EntityId);
        Assert.Equal("incident-read-correlation", audit.CorrelationId);
        Assert.DoesNotContain(incident.Title, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(incident.Summary, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(incident.ReasonCode, audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Legal_hold_detail_read_is_audited_without_subject_or_reason()
    {
        var context = StaffContext("privacy-admin", PlatformRoles.SystemAdmin, "hold-read-correlation");
        await using var db = CreateDb(context);
        var hold = new LegalHold
        {
            SubjectUserId = "sensitive-subject-id",
            ScopePolicyKey = "account-profile",
            Reason = "Sensitive preservation matter details.",
            CreatedByUserId = "privacy-admin"
        };
        db.LegalHolds.Add(hold);
        await db.SaveChangesAsync();

        var response = await PrivacyRetentionControllerFor(db, context).GetLegalHold(hold.Id, CancellationToken.None);

        Assert.IsType<LegalHoldView>(Assert.IsType<OkObjectResult>(response).Value);
        var audit = Assert.Single(db.AuditLogs.Where(item => item.Action == "LegalHoldAdminDetailRead"));
        Assert.Equal(nameof(LegalHold), audit.EntityType);
        Assert.Equal(hold.Id.ToString(), audit.EntityId);
        Assert.Equal("hold-read-correlation", audit.CorrelationId);
        Assert.DoesNotContain(hold.SubjectUserId, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(hold.Reason, audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Sensitive_read_routes_require_their_privacy_or_security_policy_and_audit_records_remain_admin_only()
    {
        var privacyRead = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyController)
            .GetMethod(nameof(PrivacyController.GetForReview))!.GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("PrivacyAdmin", privacyRead.Policy);

        var securityRead = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(SecurityIncidentsController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("SecurityIncidentAdmin", securityRead.Policy);

        var retentionRead = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyRetentionController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("PrivacyAdmin", retentionRead.Policy);

        var auditLogRead = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(AdminAuditLogsController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("Admin", auditLogRead.Policy);

        foreach (var permission in new[] { PlatformPermissions.ManagePrivacy, PlatformPermissions.ManageSecurityIncidents })
        {
            var requirement = new PlatformPermissionRequirement(permission);
            var supportUser = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
            var authorization = new AuthorizationHandlerContext([requirement], supportUser, null);
            await new PlatformPermissionAuthorizationHandler().HandleAsync(authorization);
            Assert.False(authorization.HasSucceeded);
        }

        var privacyAdministrator = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"));
        Assert.False(privacyAdministrator.IsInRole(PlatformRoles.Admin));
    }

    private static DefaultHttpContext StaffContext(string userId, string role, string correlationId) => new()
    {
        TraceIdentifier = correlationId,
        User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)], "Test"))
    };

    private static PrivacyController PrivacyControllerFor(BetccoDbContext db, HttpContext context) => new(db)
    {
        ControllerContext = new ControllerContext { HttpContext = context }
    };

    private static SecurityIncidentsController SecurityIncidentsControllerFor(BetccoDbContext db, HttpContext context) => new(db)
    {
        ControllerContext = new ControllerContext { HttpContext = context }
    };

    private static PrivacyRetentionController PrivacyRetentionControllerFor(BetccoDbContext db, HttpContext context) => new(
        db,
        new PrivacyExecutionService(db),
        new EraseConcealmentExecutionService(db, new DataSubjectFulfillmentService(db)))
    {
        ControllerContext = new ControllerContext { HttpContext = context }
    };

    private static BetccoDbContext CreateDb(HttpContext context) => new(
        new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options,
        new HttpContextAccessor { HttpContext = context });
}
