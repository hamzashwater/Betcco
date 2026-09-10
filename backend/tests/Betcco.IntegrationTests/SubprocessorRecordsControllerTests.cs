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

public sealed class SubprocessorRecordsControllerTests
{
    [Fact]
    public async Task Privacy_administrator_can_create_a_valid_draft_subprocessor_record()
    {
        await using var db = CreateDb();
        var result = await ControllerFor(db).CreateDraft(Request(), CancellationToken.None);

        var view = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(result).Value);
        Assert.Equal(SubprocessorRecordStatus.Draft, view.Status);
        Assert.False(view.IsCurrent);
        Assert.Equal("managed-notifications", view.Code);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "SubprocessorRecordDraftCreated" && audit.ActorUserId == PrivacyAdminId);
    }

    [Fact]
    public async Task Required_subprocessor_fields_are_validated_server_side()
    {
        await using var db = CreateDb();
        var result = await ControllerFor(db).CreateDraft(Request(providerLegalEntityName: "", personalDataCategories: []), CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(await db.SubprocessorRecords.ToListAsync());
    }

    [Fact]
    public async Task Draft_can_transition_to_active_and_invalid_transition_is_rejected()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var draft = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);

        var active = Assert.IsType<SubprocessorRecordView>(Assert.IsType<OkObjectResult>(await controller.Activate(draft.Id, CancellationToken.None)).Value);
        var repeatedActivation = await controller.Activate(draft.Id, CancellationToken.None);

        Assert.Equal(SubprocessorRecordStatus.Active, active.Status);
        Assert.True(active.IsCurrent);
        Assert.IsType<ConflictObjectResult>(repeatedActivation);
    }

    [Fact]
    public async Task Active_record_can_be_suspended_and_reactivated_without_runtime_side_effects()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var draft = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);
        _ = await controller.Activate(draft.Id, CancellationToken.None);

        var suspended = Assert.IsType<SubprocessorRecordView>(Assert.IsType<OkObjectResult>(await controller.Suspend(draft.Id, CancellationToken.None)).Value);
        var reactivated = Assert.IsType<SubprocessorRecordView>(Assert.IsType<OkObjectResult>(await controller.Activate(draft.Id, CancellationToken.None)).Value);

        Assert.Equal(SubprocessorRecordStatus.Suspended, suspended.Status);
        Assert.Equal(SubprocessorRecordStatus.Active, reactivated.Status);
        Assert.True(reactivated.IsCurrent);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "SubprocessorRecordSuspended");
        Assert.Contains(db.AuditLogs, audit => audit.Action == "SubprocessorRecordReactivated");
    }

    [Fact]
    public async Task Active_history_cannot_be_overwritten_and_new_version_preserves_prior_record()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var versionOne = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(version: "1.0"), CancellationToken.None)).Value);
        _ = await controller.Activate(versionOne.Id, CancellationToken.None);

        var activeUpdate = await controller.UpdateDraft(versionOne.Id, Request(version: "1.0", name: "Changed active record"), CancellationToken.None);
        Assert.IsType<ConflictObjectResult>(activeUpdate);

        var versionTwo = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(version: "2.0", name: "Managed notifications updated"), CancellationToken.None)).Value);
        _ = await controller.Activate(versionTwo.Id, CancellationToken.None);

        var historical = await db.SubprocessorRecords.SingleAsync(item => item.Id == versionOne.Id);
        var current = await db.SubprocessorRecords.SingleAsync(item => item.Id == versionTwo.Id);
        Assert.Equal("Managed notifications", historical.Name);
        Assert.Equal(SubprocessorRecordStatus.Archived, historical.Status);
        Assert.False(historical.IsCurrent);
        Assert.Equal(SubprocessorRecordStatus.Active, current.Status);
        Assert.True(current.IsCurrent);
    }

    [Fact]
    public async Task Persistence_guard_rejects_direct_rewrites_of_active_history()
    {
        await using var db = CreateDb();
        var controller = ControllerFor(db);
        var created = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(), CancellationToken.None)).Value);
        _ = await controller.Activate(created.Id, CancellationToken.None);

        var active = await db.SubprocessorRecords.SingleAsync(item => item.Id == created.Id);
        active.ServiceDescription = "Attempted direct governance rewrite";

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Archived_history_remains_retrievable_and_detail_read_is_audited_without_sensitive_content()
    {
        var context = StaffContext();
        await using var db = CreateDb(context);
        var controller = ControllerFor(db, context);
        var created = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(Request(
            serviceDescription: "Sensitive provider service description must not be copied to audit metadata.",
            contractDpaStatusOrReference: "Sensitive contract reference must not be copied to audit metadata."), CancellationToken.None)).Value);
        _ = await controller.Archive(created.Id, CancellationToken.None);

        var result = await controller.Get(created.Id, CancellationToken.None);

        var view = Assert.IsType<SubprocessorRecordView>(Assert.IsType<OkObjectResult>(result).Value);
        var audit = Assert.Single(db.AuditLogs.Where(audit => audit.Action == "SubprocessorRecordAdminDetailRead"));
        Assert.Equal(SubprocessorRecordStatus.Archived, view.Status);
        Assert.Equal(created.Id.ToString(), audit.EntityId);
        Assert.Equal("subprocessor-read", audit.CorrelationId);
        Assert.DoesNotContain(view.ServiceDescription, audit.MetadataJson, StringComparison.Ordinal);
        Assert.NotNull(view.ContractDpaStatusOrReference);
        Assert.DoesNotContain(view.ContractDpaStatusOrReference!, audit.MetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Linked_processing_activities_must_be_active_current_records()
    {
        await using var db = CreateDb();
        var activeActivity = ActiveProcessingActivity();
        db.ProcessingActivities.Add(activeActivity);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);

        var valid = await controller.CreateDraft(Request(processingActivityIds: [activeActivity.Id]), CancellationToken.None);
        var invalid = await controller.CreateDraft(Request(code: "managed-notifications-2", processingActivityIds: [Guid.NewGuid()]), CancellationToken.None);

        var view = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(valid).Value);
        Assert.Equal([activeActivity.Id], view.ProcessingActivityIds);
        Assert.IsType<ConflictObjectResult>(invalid);
        Assert.Single(await db.SubprocessorProcessingActivities.ToListAsync());
    }

    [Fact]
    public async Task Processing_activity_links_are_immutable_after_activation()
    {
        await using var db = CreateDb();
        var firstActivity = ActiveProcessingActivity();
        var secondActivity = ActiveProcessingActivity();
        secondActivity.Code = "notification-processing-secondary";
        db.ProcessingActivities.AddRange(firstActivity, secondActivity);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db);
        var created = Assert.IsType<SubprocessorRecordView>(Assert.IsType<CreatedAtActionResult>(await controller.CreateDraft(
            Request(processingActivityIds: [firstActivity.Id]), CancellationToken.None)).Value);
        _ = await controller.Activate(created.Id, CancellationToken.None);

        db.SubprocessorProcessingActivities.Add(new SubprocessorProcessingActivity
        {
            SubprocessorRecordId = created.Id,
            ProcessingActivityId = secondActivity.Id
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Only_privacy_administrators_can_manage_the_subprocessor_register()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(SubprocessorRecordsController)
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

    private static CreateSubprocessorRecordRequest Request(
        string code = "managed-notifications",
        string version = "1.0",
        string name = "Managed notifications",
        string providerLegalEntityName = "Configured Provider Legal Entity",
        string serviceDescription = "Configured service description.",
        string? contractDpaStatusOrReference = null,
        IReadOnlyCollection<string>? personalDataCategories = null,
        IReadOnlyCollection<Guid>? processingActivityIds = null) => new(
        code,
        version,
        name,
        providerLegalEntityName,
        serviceDescription,
        "Configured notification delivery purpose.",
        personalDataCategories ?? ["Account contact details"],
        ["Students"],
        "Configured hosting region",
        false,
        null,
        processingActivityIds,
        "notifications",
        contractDpaStatusOrReference,
        "Configured security controls reference.",
        "Configured retention and deletion commitment.",
        false,
        null,
        PlatformRoles.SystemAdmin,
        DateTimeOffset.UtcNow.AddMinutes(-1),
        DateTimeOffset.UtcNow.AddMonths(6));

    private static ProcessingActivity ActiveProcessingActivity() => new()
    {
        Code = "notification-processing",
        Version = "1.0",
        Name = "Notification processing",
        ProcessingPurpose = "Configured processing purpose.",
        DataSubjectCategoriesJson = "[\"Students\"]",
        PersonalDataCategoriesJson = "[\"Account contact details\"]",
        LegalOrProcessingBasis = "Configured basis requiring legal review.",
        OwnerRole = PlatformRoles.SystemAdmin,
        Status = ProcessingActivityStatus.Active,
        IsCurrent = true,
        EffectiveAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
    };

    private static DefaultHttpContext StaffContext() => new()
    {
        TraceIdentifier = "subprocessor-read",
        User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, PrivacyAdminId), new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"))
    };

    private static SubprocessorRecordsController ControllerFor(BetccoDbContext db, HttpContext? context = null) => new(db)
    {
        ControllerContext = new ControllerContext { HttpContext = context ?? StaffContext() }
    };

    private static BetccoDbContext CreateDb(HttpContext? context = null) => new(
        new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options,
        context is null ? null : new HttpContextAccessor { HttpContext = context });
}
