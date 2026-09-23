using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class DeliveryPlanningTests
{
    [Fact]
    public async Task Academic_year_and_term_invariants_are_enforced_and_order_is_deterministic()
    {
        await using var db = Context();
        var service = new DeliveryPlanningService(db);

        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateAcademicYearAsync(
            new("A", new(2026, 8, 1), new(2027, 7, 31)), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateAcademicYearAsync(
            new("AY-INVALID", new(2027, 1, 1), new(2027, 1, 1)), "admin"));

        var year = await service.CreateAcademicYearAsync(new(" ay-flex ", new(2026, 8, 10), new(2027, 7, 5)), "admin");
        Assert.Equal("AY-FLEX", year.Code);
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateAcademicYearAsync(
            new("AY-FLEX", new(2027, 8, 10), new(2028, 7, 5)), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateTermAsync(
            new(year.Id, "OUT", new(2026, 8, 1), new(2026, 9, 1), 1), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateTermAsync(
            new(year.Id, "BAD", new(2026, 9, 1), new(2026, 9, 1), 1), "admin"));

        var later = await service.CreateTermAsync(new(year.Id, "T2", new(2027, 1, 2), new(2027, 4, 30), 20), "admin");
        var earlier = await service.CreateTermAsync(new(year.Id, "T1", new(2026, 8, 10), new(2026, 12, 20), 10), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateTermAsync(
            new(year.Id, "OVERLAP", new(2026, 12, 20), new(2027, 1, 20), 30), "admin"));
        var inactiveOverlap = await service.CreateTermAsync(
            new(year.Id, "PAUSE", new(2026, 12, 20), new(2027, 1, 20), 30, false), "admin");

        var terms = await service.ListTermsAsync(year.Id, 1, 100);
        Assert.Equal([earlier.Id, later.Id, inactiveOverlap.Id], terms.Items.Select(x => x.Id));
        var updated = await service.UpdateAcademicYearAsync(year.Id,
            new("AY-FLEX", new(2026, 8, 1), new(2027, 7, 31), true), "admin");
        Assert.Equal(new DateOnly(2026, 8, 1), updated.StartDate);
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.UpdateAcademicYearAsync(year.Id,
            new("AY-FLEX", new(2026, 9, 1), new(2027, 7, 31), true), "admin"));

        Assert.All(await db.AuditLogs.Where(x => x.EntityType == nameof(AcademicYear) || x.EntityType == nameof(AcademicTerm)).ToArrayAsync(),
            audit => Assert.Equal("admin", audit.ActorUserId));
    }

    [Fact]
    public async Task Plan_uses_canonical_unit_and_same_year_term_and_supports_safe_entry_changes()
    {
        await using var db = Context();
        var (version, otherVersion, firstUnit, secondUnit, outsideUnit) = await SeedCatalogueAsync(db);
        var service = new DeliveryPlanningService(db);
        var year = await service.CreateAcademicYearAsync(new("AY-1", new(2026, 8, 1), new(2027, 7, 31)), "admin");
        var otherYear = await service.CreateAcademicYearAsync(new("AY-2", new(2027, 8, 1), new(2028, 7, 31)), "admin");
        var firstTerm = await service.CreateTermAsync(new(year.Id, "TERM-1", new(2026, 8, 1), new(2026, 12, 31), 10), "admin");
        var secondTerm = await service.CreateTermAsync(new(year.Id, "TERM-2", new(2027, 1, 1), new(2027, 7, 31), 20), "admin");
        var outsideTerm = await service.CreateTermAsync(new(otherYear.Id, "TERM-X", new(2027, 8, 1), new(2027, 12, 31), 10), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.UpdateTermAsync(firstTerm.Id,
            new(otherYear.Id, firstTerm.Code, outsideTerm.StartDate, outsideTerm.EndDate, firstTerm.SortOrder), "admin"));

        var plan = await service.CreatePlanAsync(new(version.Id, year.Id), "admin");
        Assert.Equal(version.Id, plan.Plan.QualificationVersionId);
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreatePlanAsync(new(version.Id, year.Id), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.AddEntryAsync(plan.Plan.Id, new(outsideUnit.Id, firstTerm.Id), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.AddEntryAsync(plan.Plan.Id, new(firstUnit.Id, outsideTerm.Id), "admin"));

        plan = await service.AddEntryAsync(plan.Plan.Id, new(firstUnit.Id, firstTerm.Id), "admin");
        plan = await service.AddEntryAsync(plan.Plan.Id, new(secondUnit.Id, secondTerm.Id), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.AddEntryAsync(plan.Plan.Id, new(firstUnit.Id, secondTerm.Id), "admin"));
        Assert.Equal([firstUnit.Id, secondUnit.Id], plan.Entries.Select(x => x.UnitDefinitionId));
        Assert.Equal([10, 20], plan.Entries.Select(x => x.SortOrder));

        plan = await service.ReorderEntriesAsync(plan.Plan.Id, new([plan.Entries[1].Id, plan.Entries[0].Id]), "admin");
        Assert.Equal([secondUnit.Id, firstUnit.Id], plan.Entries.Select(x => x.UnitDefinitionId));
        plan = await service.UpdateEntryAsync(plan.Entries[0].Id, new(firstTerm.Id), "admin");
        Assert.Equal(firstTerm.Id, plan.Entries[0].AcademicTermId);
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.UpdateTermAsync(firstTerm.Id,
            new(year.Id, firstTerm.Code, firstTerm.StartDate, firstTerm.EndDate, firstTerm.SortOrder, false), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.UpdateAcademicYearAsync(year.Id,
            new(year.Code, year.StartDate, year.EndDate, false), "admin"));
        plan = await service.RemoveEntryAsync(plan.Entries[1].Id, "admin");
        Assert.Single(plan.Entries);
        plan = await service.UpdatePlanAsync(plan.Plan.Id, new(false), "admin");
        Assert.False(plan.Plan.IsActive);
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.AddEntryAsync(plan.Plan.Id, new(firstUnit.Id, firstTerm.Id), "admin"));

        Assert.Equal(otherVersion.Id, outsideUnit.QualificationVersionId);
        Assert.Contains(await db.AuditLogs.ToArrayAsync(), x => x.Action == "DeliveryPlanEntriesReordered" && x.ActorUserId == "admin");
    }

    [Fact]
    public void Delivery_plan_DTOs_exclude_persistence_metadata()
    {
        var publicProperties = typeof(DeliveryPlanView).Assembly.GetTypes()
            .Where(x => x.Namespace == typeof(DeliveryPlanView).Namespace && x.Name.Contains("DeliveryPlan", StringComparison.Ordinal))
            .SelectMany(x => x.GetProperties()).Select(x => x.Name).ToHashSet(StringComparer.Ordinal);

        Assert.DoesNotContain("CreatedByUserId", publicProperties);
        Assert.DoesNotContain("UpdatedByUserId", publicProperties);
        Assert.DoesNotContain("RowVersion", publicProperties);
        Assert.DoesNotContain("IsDeleted", publicProperties);
    }

    [Theory]
    [InlineData(PlatformRoles.Student, false)]
    [InlineData(PlatformRoles.Teacher, false)]
    [InlineData(PlatformRoles.Admin, true)]
    public async Task Delivery_planning_is_authorized_only_by_existing_SystemAdmin_capability(string role, bool expected)
    {
        var policy = (AuthorizeAttribute)Attribute.GetCustomAttribute(typeof(AdminDeliveryPlanningController), typeof(AuthorizeAttribute))!;
        Assert.Equal("SystemAdmin", policy.Policy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "Test"));
        var context = new AuthorizationHandlerContext([new PlatformPermissionRequirement(PlatformPermissions.ManageUsers)], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
        Assert.Equal(expected, context.HasSucceeded);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSQL_constraints_and_pending_model_check_cover_delivery_planning()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("delivery_planning");
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
        var service = new DeliveryPlanningService(db);
        var year = await service.CreateAcademicYearAsync(new("AY-PG", new(2026, 1, 1), new(2026, 12, 31)), "admin");
        await service.CreateTermAsync(new(year.Id, "TERM-A", new(2026, 1, 1), new(2026, 6, 30), 10), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => service.CreateTermAsync(
            new(year.Id, "TERM-B", new(2026, 6, 30), new(2026, 12, 31), 20), "admin"));
        Assert.Single(await db.AcademicTerms.ToArrayAsync());

        var concurrentYear = await service.CreateAcademicYearAsync(new("AY-CONCURRENT", new(2027, 1, 1), new(2027, 12, 31)), "admin");
        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        var attempts = await Task.WhenAll(
            Record.ExceptionAsync(() => new DeliveryPlanningService(firstContext).CreateTermAsync(
                new(concurrentYear.Id, "TERM-A", new(2027, 1, 1), new(2027, 8, 31), 10), "admin")),
            Record.ExceptionAsync(() => new DeliveryPlanningService(secondContext).CreateTermAsync(
                new(concurrentYear.Id, "TERM-B", new(2027, 6, 1), new(2027, 12, 31), 20), "admin")));
        Assert.Single(attempts, x => x is not null);
        db.ChangeTracker.Clear();
        Assert.Single(await db.AcademicTerms.Where(x => x.AcademicYearId == concurrentYear.Id).ToArrayAsync());
    }

    private static BetccoDbContext Context() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<(QualificationVersion Version, QualificationVersion OtherVersion, UnitDefinition First,
        UnitDefinition Second, UnitDefinition Outside)> SeedCatalogueAsync(BetccoDbContext db)
    {
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "Approved source" };
        var otherVersion = new QualificationVersion { Qualification = qualification, VersionCode = "V2", SourceReference = "Approved source" };
        var first = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة 1", EnglishTitle = "Unit 1", IsActive = true };
        var second = new UnitDefinition { QualificationVersion = version, Code = "U2", ArabicTitle = "وحدة 2", EnglishTitle = "Unit 2", IsActive = true };
        var outside = new UnitDefinition { QualificationVersion = otherVersion, Code = "UX", ArabicTitle = "وحدة خارجية", EnglishTitle = "Outside unit", IsActive = true };
        db.AddRange(qualification, version, otherVersion, first, second, outside);
        await db.SaveChangesAsync();
        return (version, otherVersion, first, second, outside);
    }
}
