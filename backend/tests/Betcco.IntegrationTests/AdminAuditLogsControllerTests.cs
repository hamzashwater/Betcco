using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AdminAuditLogsControllerTests
{
    [Fact]
    public async Task List_applies_structured_filters_and_date_range_server_side()
    {
        await using var db = CreateDb();
        var matching = new AuditLog
        {
            Action = "StudentEmailChangeConfirmed",
            EntityType = "User",
            EntityId = "student-1",
            Outcome = "Success",
            CreatedAtUtc = new DateTimeOffset(2026, 9, 20, 10, 0, 0, TimeSpan.Zero)
        };
        var failed = new AuditLog
        {
            Action = "StudentEmailChangeRequested",
            EntityType = "User",
            EntityId = "student-1",
            Outcome = "Failure"
        };
        var course = new AuditLog
        {
            Action = "CoursePublished",
            EntityType = "Course",
            EntityId = "course-1",
            Outcome = "Success"
        };
        db.AuditLogs.AddRange(matching, failed, course);
        await db.SaveChangesAsync();

        matching.CreatedAtUtc = new DateTimeOffset(2026, 9, 20, 10, 0, 0, TimeSpan.Zero);
        failed.CreatedAtUtc = new DateTimeOffset(2026, 9, 20, 9, 0, 0, TimeSpan.Zero);
        course.CreatedAtUtc = new DateTimeOffset(2026, 9, 21, 10, 0, 0, TimeSpan.Zero);
        await db.SaveChangesAsync();

        var result = Assert.IsType<OkObjectResult>(await new AdminAuditLogsController(db).List(
            search: null,
            action: "EmailChangeConfirmed",
            entityType: "User",
            outcome: "Success",
            fromUtc: new DateTimeOffset(2026, 9, 20, 0, 0, 0, TimeSpan.Zero),
            toUtc: new DateTimeOffset(2026, 9, 20, 23, 59, 59, TimeSpan.Zero),
            page: 1,
            pageSize: 25,
            cancellationToken: CancellationToken.None));

        var json = JsonSerializer.Serialize(result.Value);
        Assert.Contains(matching.Id.ToString(), json);
        Assert.Contains("\"totalCount\":1", json);
        Assert.DoesNotContain("StudentEmailChangeRequested", json);
        Assert.DoesNotContain("CoursePublished", json);
    }

    [Fact]
    public async Task List_rejects_invalid_or_overlong_date_ranges()
    {
        await using var db = CreateDb();
        var controller = new AdminAuditLogsController(db);

        var reversed = await controller.List(
            null, null, null, null,
            new DateTimeOffset(2026, 9, 2, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero),
            1, 25, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(reversed);

        var tooLong = await controller.List(
            null, null, null, null,
            new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero),
            1, 25, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(tooLong);
    }

    [Fact]
    public async Task List_rejects_overlong_structured_filter_text()
    {
        await using var db = CreateDb();
        var result = await new AdminAuditLogsController(db).List(
            search: null,
            action: new string('a', 121),
            entityType: null,
            outcome: null,
            fromUtc: null,
            toUtc: null,
            page: 1,
            pageSize: 25,
            cancellationToken: CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Export_is_filtered_bounded_and_excludes_sensitive_audit_payload_fields()
    {
        await using var db = CreateDb();
        var actor = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "admin",
            Email = "admin@betcco.test",
            DisplayName = "=Injected actor"
        };
        db.Users.Add(actor);
        db.AuditLogs.AddRange(
            new AuditLog
            {
                ActorUserId = actor.Id.ToString(),
                Action = "StudentEmailChangeConfirmed",
                EntityType = "User",
                EntityId = "private-entity-id",
                CorrelationId = "private-correlation",
                IpAddress = "192.0.2.10",
                UserAgent = "private-agent",
                Outcome = "Success",
                MetadataJson = "{\"secret\":true}",
                OldValuesJson = "{\"old\":true}",
                NewValuesJson = "{\"new\":true}"
            },
            new AuditLog
            {
                Action = "CoursePublished",
                EntityType = "Course",
                Outcome = "Failure"
            });
        await db.SaveChangesAsync();

        var result = Assert.IsType<FileContentResult>(await new AdminAuditLogsController(db).Export(
            search: null,
            action: "EmailChange",
            entityType: "User",
            outcome: "Success",
            fromUtc: null,
            toUtc: null,
            cancellationToken: CancellationToken.None));

        var csv = System.Text.Encoding.UTF8.GetString(result.FileContents);
        Assert.StartsWith("\uFEFFCreatedAtUtc,Actor,Action,EntityType,Outcome", csv);
        Assert.Contains("'=Injected actor", csv);
        Assert.Contains("StudentEmailChangeConfirmed", csv);
        Assert.DoesNotContain("CoursePublished", csv);
        Assert.DoesNotContain("private-entity-id", csv);
        Assert.DoesNotContain("private-correlation", csv);
        Assert.DoesNotContain("192.0.2.10", csv);
        Assert.DoesNotContain("private-agent", csv);
        Assert.DoesNotContain("secret", csv);
        Assert.Equal("text/csv; charset=utf-8", result.ContentType);
        Assert.EndsWith(".csv", result.FileDownloadName);
    }

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}
