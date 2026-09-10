using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class PlatformRatingsControllerTests
{
    [Fact]
    public async Task Public_summary_only_includes_opted_in_moderated_reviews()
    {
        await using var db = CreateDb();
        db.PlatformRatings.AddRange(
            Rating("student-1", 5, true, true, "ممتاز"),
            Rating("student-2", 1, true, false, "مخفي"),
            Rating("student-3", 1, false, true, "دون موافقة"));
        await db.SaveChangesAsync();

        var result = await new PlatformRatingsController(db).GetPublic("ar");

        var response = Assert.IsType<OkObjectResult>(result.Result);
        var summary = Assert.IsType<PlatformRatingSummary>(response.Value);
        Assert.Equal(1, summary.RatingsCount);
        Assert.Equal(5m, summary.AverageScore);
        Assert.Single(summary.Reviews);
        Assert.Equal("طالب في BETCCO", summary.Reviews.Single().AuthorLabel);
    }

    [Fact]
    public async Task Student_edit_resets_publication_and_records_an_audit_event()
    {
        await using var db = CreateDb();
        db.PlatformRatings.Add(Rating("student-1", 4, true, true, "قبل التعديل"));
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "student-1");

        var result = await controller.Upsert(
            new UpsertPlatformRatingRequest(4, 5, 3, 4, "بعد التعديل", true),
            CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result.Result);
        var rating = Assert.IsType<OwnPlatformRating>(response.Value);
        Assert.False(rating.IsPublished);
        Assert.Equal("بعد التعديل", rating.Comment);
        Assert.Contains(db.AuditLogs, item => item.Action == "PlatformRatingUpdated" && item.ActorUserId == "student-1");
    }

    [Fact]
    public async Task Admin_cannot_publish_a_review_without_student_consent()
    {
        await using var db = CreateDb();
        var pending = Rating("student-1", 4, false, false, "خاص");
        db.PlatformRatings.Add(pending);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "admin-1");

        var result = await controller.Moderate(
            pending.Id,
            new ModeratePlatformRatingRequest(true, null),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.False((await db.PlatformRatings.SingleAsync()).IsPublished);
    }

    [Fact]
    public async Task Admin_summary_returns_only_aggregated_rating_signals()
    {
        await using var db = CreateDb();
        db.PlatformRatings.AddRange(
            Rating("student-1", 5, true, true, "ممتاز"),
            Rating("student-2", 3, true, false, "قيد المراجعة"),
            Rating("student-3", 1, false, false, "خاص"));
        await db.SaveChangesAsync();

        var result = await new PlatformRatingsController(db).GetModerationSummary(CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result.Result);
        var summary = Assert.IsType<AdminPlatformRatingSummary>(response.Value);
        Assert.Equal(3, summary.TotalCount);
        Assert.Equal(1, summary.PublishedCount);
        Assert.Equal(1, summary.AwaitingModerationCount);
        Assert.Equal(1, summary.PrivateWithoutConsentCount);
        Assert.Equal(3m, summary.AverageScore);
    }

    private static PlatformRatingsController ControllerFor(BetccoDbContext db, string userId)
    {
        var controller = new PlatformRatingsController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"))
            }
        };
        return controller;
    }

    private static PlatformRating Rating(string studentUserId, byte score, bool consent, bool published, string comment) => new()
    {
        StudentUserId = studentUserId,
        CourseQualityScore = score,
        EaseOfUseScore = score,
        SupportScore = score,
        RecommendationScore = score,
        Comment = comment,
        AllowPublicDisplay = consent,
        IsPublished = published
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
