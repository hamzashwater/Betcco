using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class ProcessingActivitiesControllerTests
{
    [Fact]
    public async Task Privacy_administrator_can_create_a_valid_draft()
    {
        await using var db = CreateDb();
        var result = await ControllerFor(db).CreateDraft(Request(), CancellationToken.None);

        var view = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(result).Value);
        Assert.Equal(ProcessingActivityStatus.Draft, view.Status);
        Assert.False(view.IsCurrent);
        Assert.Equal("student-account-support", view.Code);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "ProcessingActivityDraftCreated" && audit.ActorUserId == PrivacyAdminId);
    }

    [Fact]
    public async Task Required_processing_activity_fields_are_validated_server_side()
    {
        await using var db = CreateDb();
        var invalid = Request(name: "", dataSubjectCategories: [], personalDataCategories: []);

        var result = await ControllerFor(db).CreateDraft(invalid, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(await db.ProcessingActivities.ToListAsync());
    }

    [Fact]
    public async Task Privacy_administrator_can_edit_a_draft_without_changing_its_identity()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var created = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);

        var result = await controller.UpdateDraft(created.Id, Request(name: "Updated draft activity", description: "Configured draft detail."), CancellationToken.None);

        var updated = Assert.IsType<ProcessingActivityView>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal("Updated draft activity", updated.Name);
        Assert.Equal("Configured draft detail.", updated.Description);
        Assert.Equal(ProcessingActivityStatus.Draft, updated.Status);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "ProcessingActivityDraftUpdated" && audit.EntityId == created.Id.ToString());
    }

    [Fact]
    public async Task Draft_can_transition_to_active_and_invalid_transition_is_rejected()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var draft = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);

        var active = Assert.IsType<ProcessingActivityView>(Assert.IsType<OkObjectResult>(await controller.Activate(draft.Id, CancellationToken.None)).Value);
        var repeatedActivation = await controller.Activate(draft.Id, CancellationToken.None);

        Assert.Equal(ProcessingActivityStatus.Active, active.Status);
        Assert.True(active.IsCurrent);
        Assert.IsType<ConflictObjectResult>(repeatedActivation);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "ProcessingActivityActivated" && audit.EntityId == draft.Id.ToString());
    }

    [Fact]
    public async Task Active_version_cannot_be_silently_overwritten_and_new_version_preserves_history()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var versionOne = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(version: "1.0"), CancellationToken.None)).Value);
        _ = await controller.Activate(versionOne.Id, CancellationToken.None);

        var activeUpdate = await controller.UpdateDraft(versionOne.Id, Request(version: "1.0", name: "Changed active name"), CancellationToken.None);
        Assert.IsType<ConflictObjectResult>(activeUpdate);

        var versionTwo = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(version: "2.0", name: "Updated documented activity"), CancellationToken.None)).Value);
        _ = await controller.Activate(versionTwo.Id, CancellationToken.None);

        var historical = await db.ProcessingActivities.SingleAsync(item => item.Id == versionOne.Id);
        var current = await db.ProcessingActivities.SingleAsync(item => item.Id == versionTwo.Id);
        Assert.Equal("Student account support", historical.Name);
        Assert.Equal(ProcessingActivityStatus.Archived, historical.Status);
        Assert.False(historical.IsCurrent);
        Assert.Equal(ProcessingActivityStatus.Active, current.Status);
        Assert.True(current.IsCurrent);
        Assert.Equal(2, await db.ProcessingActivities.CountAsync());
    }

    [Fact]
    public async Task Persistence_guard_rejects_direct_rewrites_of_active_history()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var created = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);
        _ = await controller.Activate(created.Id, CancellationToken.None);

        var active = await db.ProcessingActivities.SingleAsync(item => item.Id == created.Id);
        active.Name = "Attempted direct rewrite";

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Archived_version_remains_retrievable_and_detail_read_is_audited_without_content()
    {
        var context = StaffContext();
        await using var db = CreateDb(context);
        var controller = ControllerFor(db, context);
        var created = Assert.IsType<ProcessingActivityView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(description: "Sensitive governance description must not be copied into read audit metadata."), CancellationToken.None)).Value);
        _ = await controller.Archive(created.Id, CancellationToken.None);

        var result = await controller.Get(created.Id, CancellationToken.None);

        var view = Assert.IsType<ProcessingActivityView>(Assert.IsType<OkObjectResult>(result).Value);
        var audit = Assert.Single(db.AuditLogs.Where(audit => audit.Action == "ProcessingActivityAdminDetailRead"));
        Assert.Equal(ProcessingActivityStatus.Archived, view.Status);
        Assert.Equal(created.Id.ToString(), audit.EntityId);
        Assert.Equal("processing-activity-read", audit.CorrelationId);
        Assert.NotNull(view.Description);
        Assert.DoesNotContain(view.Description!, audit.MetadataJson, StringComparison.Ordinal);
        Assert.DoesNotContain(view.ProcessingPurpose, audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_an_enabled_current_retention_policy_can_be_linked_to_a_new_draft()
    {
        await using var db = CreateDb();
        var validPolicy = Policy("account-profile", "1.0", enabled: true, current: true);
        var inactivePolicy = Policy("expired-policy", "1.0", enabled: false, current: true);
        db.RetentionPolicies.AddRange(validPolicy, inactivePolicy);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);

        var accepted = await controller.CreateDraft(Request(retentionPolicyId: validPolicy.Id), CancellationToken.None);
        var rejected = await controller.CreateDraft(Request(code: "student-account-support-2", retentionPolicyId: inactivePolicy.Id), CancellationToken.None);

        Assert.IsType<CreatedAtActionResult>(accepted);
        Assert.IsType<ConflictObjectResult>(rejected);
        Assert.Single(await db.ProcessingActivities.ToListAsync());
    }

    [Fact]
    public async Task Unrelated_roles_cannot_manage_the_processing_activity_register()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(ProcessingActivitiesController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("PrivacyAdmin", authorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy);
        foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher, PlatformRoles.SupportAdmin })
        {
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "Test"));
            var context = new AuthorizationHandlerContext([requirement], principal, null);
            await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
            Assert.False(context.HasSucceeded);
        }
    }

    private const string PrivacyAdminId = "privacy-admin";

    private static CreateProcessingActivityRequest Request(
        string code = "student-account-support",
        string version = "1.0",
        string name = "Student account support",
        string? description = null,
        IReadOnlyCollection<string>? dataSubjectCategories = null,
        IReadOnlyCollection<string>? personalDataCategories = null,
        Guid? retentionPolicyId = null) => new(
        code,
        version,
        name,
        description,
        "Configured account support and service delivery purpose.",
        dataSubjectCategories ?? ["Students"],
        personalDataCategories ?? ["Account contact details"],
        false,
        null,
        "Configured basis requiring legal review.",
        ["Directly from the data subject"],
        ["Authorized support staff"],
        "identity-support",
        retentionPolicyId,
        null,
        false,
        null,
        "Access is restricted to authorized staff.",
        PlatformRoles.SystemAdmin,
        DateTimeOffset.UtcNow.AddMinutes(-1),
        DateTimeOffset.UtcNow.AddMonths(6));

    private static RetentionPolicy Policy(string policyKey, string version, bool enabled, bool current) => new()
    {
        PolicyKey = policyKey,
        Version = version,
        DataCategoryOrPurpose = "Configured account profile data",
        RetentionRule = "Configured retention rule requiring legal review.",
        LegalOrBusinessBasis = "Configured basis requiring legal review.",
        ActionAfterExpiry = RetentionActionAfterExpiry.Retain,
        IsEnabled = enabled,
        IsCurrent = current,
        EffectiveAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
    };

    private static DefaultHttpContext StaffContext() => new()
    {
        TraceIdentifier = "processing-activity-read",
        User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, PrivacyAdminId), new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"))
    };

    private static ProcessingActivitiesController ControllerFor(BetccoDbContext db, HttpContext? context = null) => new(db)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = context ?? StaffContext()
        }
    };

    private static BetccoDbContext CreateDb(HttpContext? context = null) => new(
        new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options,
        context is null ? null : new HttpContextAccessor { HttpContext = context });
}
