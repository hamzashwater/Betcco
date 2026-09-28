using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.IntegrationTests;

public sealed class AdminAuditLogsPostgresTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task List_uses_bounded_offsets_stable_order_and_postgres_filter_semantics()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_audit_query");
        await using var db = database.CreateContext();
        var createdAt = new DateTimeOffset(2026, 9, 20, 10, 0, 0, TimeSpan.Zero);
        db.AuditLogs.AddRange(
            Log(1, "StudentEmailChangeConfirmed", "User", "student-alpha", "Success", createdAt,
                "00000000-0000-0000-0000-000000000111"),
            Log(2, "StudentEmailChangeRequested", "User", "student-beta", "Failure", createdAt),
            Log(3, "CourseStudent%EmailArchived", "Course", "course-alpha", "Success", createdAt),
            Log(4, "studentEmailChangeConfirmed", "User", "student-gamma", "Success", createdAt));
        await db.SaveChangesAsync();
        foreach (var log in db.ChangeTracker.Entries<AuditLog>())
            log.Entity.CreatedAtUtc = createdAt;
        await db.SaveChangesAsync();

        var controller = new AdminAuditLogsController(db);
        var firstPage = await List(controller, page: 1, pageSize: 2);
        Assert.Equal(new[] { Id(4), Id(3) }, ItemIds(firstPage));
        Assert.Equal(4, TotalCount(firstPage));

        var secondPage = await List(controller, page: 2, pageSize: 2);
        Assert.Equal(new[] { Id(2), Id(1) }, ItemIds(secondPage));

        var afterLastPage = await List(controller, page: 3, pageSize: 2);
        Assert.Empty(ItemIds(afterLastPage));
        Assert.Equal(4, TotalCount(afterLastPage));

        var extremePage = await List(controller, page: int.MaxValue, pageSize: 100);
        Assert.Empty(ItemIds(extremePage));
        Assert.Equal(4, TotalCount(extremePage));

        var clampedPage = await List(controller, page: 0, pageSize: 0);
        Assert.Equal(1, Page(clampedPage));
        Assert.Equal(1, PageSize(clampedPage));
        Assert.Equal(new[] { Id(4) }, ItemIds(clampedPage));

        var negativePage = await List(controller, page: -1, pageSize: -1);
        Assert.Equal(1, Page(negativePage));
        Assert.Equal(1, PageSize(negativePage));
        Assert.Equal(new[] { Id(4) }, ItemIds(negativePage));

        var maximumPageSize = await List(controller, page: 1, pageSize: int.MaxValue);
        Assert.Equal(100, PageSize(maximumPageSize));
        Assert.Equal(4, ItemIds(maximumPageSize).Length);

        var filtered = await List(controller,
            search: " StudentEmail ",
            action: "EmailChange",
            entityType: "User",
            outcome: "Success",
            fromUtc: createdAt,
            toUtc: createdAt);
        Assert.Equal(new[] { Id(1) }, ItemIds(filtered));
        Assert.Equal(1, TotalCount(filtered));
        Assert.Contains("Deleted user", JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(filtered).Value));

        var caseSensitive = await List(controller, search: "studentemail");
        Assert.Empty(ItemIds(caseSensitive));
        var wildcardIsLiteral = await List(controller, search: "Student%Email");
        Assert.Equal(new[] { Id(3) }, ItemIds(wildcardIsLiteral));

        var export = Assert.IsType<FileContentResult>(await controller.Export(
            search: "StudentEmail",
            action: "EmailChange",
            entityType: "User",
            outcome: "Success",
            fromUtc: createdAt,
            toUtc: createdAt,
            cancellationToken: CancellationToken.None));
        var csv = System.Text.Encoding.UTF8.GetString(export.FileContents);
        Assert.Contains("StudentEmailChangeConfirmed", csv);
        Assert.DoesNotContain("StudentEmailChangeRequested", csv);
        Assert.DoesNotContain("CourseStudent%EmailArchived", csv);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Export_rejects_more_than_5000_postgres_rows()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_audit_export_limit");
        await using var db = database.CreateContext();
        db.AuditLogs.AddRange(Enumerable.Range(0, 5_001).Select(index => new AuditLog
        {
            Action = $"Action{index}",
            EntityType = "TestEntity",
            Outcome = "Success"
        }));
        await db.SaveChangesAsync();

        var result = await new AdminAuditLogsController(db).Export(
            search: null,
            action: null,
            entityType: null,
            outcome: null,
            fromUtc: null,
            toUtc: null,
            cancellationToken: CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    private static AuditLog Log(
        int id,
        string action,
        string entityType,
        string entityId,
        string outcome,
        DateTimeOffset createdAt,
        string? actorUserId = null) => new()
        {
            Id = Id(id),
            CreatedAtUtc = createdAt,
            UpdatedAtUtc = createdAt,
            ActorUserId = actorUserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Outcome = outcome
        };

    private static Guid Id(int suffix) => Guid.Parse($"00000000-0000-0000-0000-{suffix:000000000000}");

    private static Task<IActionResult> List(
        AdminAuditLogsController controller,
        string? search = null,
        string? action = null,
        string? entityType = null,
        string? outcome = null,
        DateTimeOffset? fromUtc = null,
        DateTimeOffset? toUtc = null,
        int page = 1,
        int pageSize = 25) => controller.List(
            search,
            action,
            entityType,
            outcome,
            fromUtc,
            toUtc,
            page,
            pageSize,
            CancellationToken.None);

    private static JsonElement Payload(IActionResult actionResult)
    {
        var result = Assert.IsType<OkObjectResult>(actionResult);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(result.Value));
        return document.RootElement.Clone();
    }

    private static Guid[] ItemIds(IActionResult result) => Payload(result)
        .GetProperty("items")
        .EnumerateArray()
        .Select(item => item.GetProperty("Id").GetGuid())
        .ToArray();

    private static int TotalCount(IActionResult result) => Payload(result).GetProperty("totalCount").GetInt32();
    private static int Page(IActionResult result) => Payload(result).GetProperty("page").GetInt32();
    private static int PageSize(IActionResult result) => Payload(result).GetProperty("pageSize").GetInt32();
}
