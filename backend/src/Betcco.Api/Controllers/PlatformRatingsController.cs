using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/platform-ratings")]
public sealed class PlatformRatingsController(BetccoDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<PlatformRatingSummary>> GetPublic(
        [FromQuery] string locale = "ar",
        CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var visible = db.PlatformRatings.AsNoTracking().Where(rating =>
            rating.IsPublished && rating.AllowPublicDisplay);

        var count = await visible.CountAsync(cancellationToken);
        var aggregate = count == 0
            ? null
            : await visible.GroupBy(_ => 1).Select(group => new PlatformRatingAggregate(
                group.Average(item => (decimal)item.CourseQualityScore),
                group.Average(item => (decimal)item.EaseOfUseScore),
                group.Average(item => (decimal)item.SupportScore),
                group.Average(item => (decimal)item.RecommendationScore)))
                .SingleAsync(cancellationToken);
        var reviews = await visible
            .OrderByDescending(rating => rating.UpdatedAtUtc)
            .Take(24)
            .Select(rating => new PublicPlatformReview(
                rating.Id,
                Math.Round(((decimal)rating.CourseQualityScore + rating.EaseOfUseScore + rating.SupportScore + rating.RecommendationScore) / 4m, 1),
                rating.Comment,
                rating.UpdatedAtUtc,
                arabic ? "طالب في BETCCO" : "BETCCO learner"))
            .ToListAsync(cancellationToken);

        return Ok(new PlatformRatingSummary(
            count,
            aggregate is null ? null : Math.Round((aggregate.CourseQuality + aggregate.EaseOfUse + aggregate.Support + aggregate.Recommendation) / 4m, 1),
            aggregate?.CourseQuality,
            aggregate?.EaseOfUse,
            aggregate?.Support,
            aggregate?.Recommendation,
            reviews));
    }

    [Authorize(Policy = "Student")]
    [HttpGet("mine")]
    public async Task<ActionResult<OwnPlatformRating>> GetMine(CancellationToken cancellationToken)
    {
        var rating = await db.PlatformRatings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.StudentUserId == UserId, cancellationToken);
        return rating is null ? NotFound() : Ok(ToOwn(rating));
    }

    [Authorize(Policy = "Student")]
    [EnableRateLimiting("write")]
    [HttpPut("mine")]
    public async Task<ActionResult<OwnPlatformRating>> Upsert(
        UpsertPlatformRatingRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var rating = await db.PlatformRatings
            .SingleOrDefaultAsync(item => item.StudentUserId == UserId, cancellationToken);
        var wasCreated = rating is null;
        if (rating is null)
        {
            rating = new PlatformRating { StudentUserId = UserId };
            db.PlatformRatings.Add(rating);
        }

        rating.CourseQualityScore = request.CourseQualityScore;
        rating.EaseOfUseScore = request.EaseOfUseScore;
        rating.SupportScore = request.SupportScore;
        rating.RecommendationScore = request.RecommendationScore;
        rating.Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim();
        rating.AllowPublicDisplay = request.AllowPublicDisplay;
        // Any student edit must be checked again before being public.
        rating.IsPublished = false;
        rating.ModeratedAtUtc = null;
        rating.ModeratedByAdminUserId = null;
        rating.ModerationReason = null;
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = wasCreated ? "PlatformRatingSubmitted" : "PlatformRatingUpdated",
            EntityType = nameof(PlatformRating),
            EntityId = rating.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToOwn(rating));
    }

    [Authorize(Policy = "Admin")]
    [HttpGet("/api/v1/admin/platform-ratings/summary")]
    public async Task<ActionResult<AdminPlatformRatingSummary>> GetModerationSummary(CancellationToken cancellationToken)
    {
        var ratings = db.PlatformRatings.AsNoTracking();
        var total = await ratings.CountAsync(cancellationToken);
        if (total == 0)
            return Ok(new AdminPlatformRatingSummary(0, 0, 0, 0, null, null, null, null, null));

        var aggregate = await ratings.GroupBy(_ => 1).Select(group => new PlatformRatingAggregate(
            group.Average(item => (decimal)item.CourseQualityScore),
            group.Average(item => (decimal)item.EaseOfUseScore),
            group.Average(item => (decimal)item.SupportScore),
            group.Average(item => (decimal)item.RecommendationScore)))
            .SingleAsync(cancellationToken);
        var published = await ratings.CountAsync(item => item.IsPublished, cancellationToken);
        var awaitingModeration = await ratings.CountAsync(item => item.AllowPublicDisplay && !item.IsPublished, cancellationToken);
        var privateWithoutConsent = await ratings.CountAsync(item => !item.AllowPublicDisplay, cancellationToken);
        return Ok(new AdminPlatformRatingSummary(
            total,
            published,
            awaitingModeration,
            privateWithoutConsent,
            Math.Round((aggregate.CourseQuality + aggregate.EaseOfUse + aggregate.Support + aggregate.Recommendation) / 4m, 1),
            Math.Round(aggregate.CourseQuality, 1),
            Math.Round(aggregate.EaseOfUse, 1),
            Math.Round(aggregate.Support, 1),
            Math.Round(aggregate.Recommendation, 1)));
    }

    [Authorize(Policy = "Admin")]
    [HttpGet("/api/v1/admin/platform-ratings")]
    public async Task<ActionResult<IReadOnlyCollection<AdminPlatformRating>>> GetForModeration(CancellationToken cancellationToken)
    {
        var ratings = await db.PlatformRatings.AsNoTracking()
            .OrderBy(rating => rating.IsPublished)
            .ThenByDescending(rating => rating.UpdatedAtUtc)
            .Take(200)
            .Select(rating => new AdminPlatformRating(
                rating.Id,
                rating.StudentUserId,
                rating.CourseQualityScore,
                rating.EaseOfUseScore,
                rating.SupportScore,
                rating.RecommendationScore,
                rating.Comment,
                rating.AllowPublicDisplay,
                rating.IsPublished,
                rating.ModeratedAtUtc,
                rating.ModerationReason,
                rating.UpdatedAtUtc))
            .ToListAsync(cancellationToken);
        return Ok(ratings);
    }

    [Authorize(Policy = "Admin")]
    [EnableRateLimiting("write")]
    [HttpPost("/api/v1/admin/platform-ratings/{id:guid}/moderation")]
    public async Task<ActionResult<AdminPlatformRating>> Moderate(
        Guid id,
        ModeratePlatformRatingRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var rating = await db.PlatformRatings.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (rating is null) return NotFound();
        if (request.Publish && !rating.AllowPublicDisplay)
            return BadRequest(new { message = "The student did not consent to public display of this review." });

        rating.IsPublished = request.Publish;
        rating.ModeratedAtUtc = DateTimeOffset.UtcNow;
        rating.ModeratedByAdminUserId = UserId;
        rating.ModerationReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = request.Publish ? "PlatformRatingPublished" : "PlatformRatingHidden",
            EntityType = nameof(PlatformRating),
            EntityId = rating.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToAdmin(rating));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static OwnPlatformRating ToOwn(PlatformRating rating) => new(
        rating.Id, rating.CourseQualityScore, rating.EaseOfUseScore, rating.SupportScore,
        rating.RecommendationScore, rating.Comment, rating.AllowPublicDisplay,
        rating.IsPublished, rating.ModeratedAtUtc, rating.ModerationReason);

    private static AdminPlatformRating ToAdmin(PlatformRating rating) => new(
        rating.Id, rating.StudentUserId, rating.CourseQualityScore, rating.EaseOfUseScore,
        rating.SupportScore, rating.RecommendationScore, rating.Comment,
        rating.AllowPublicDisplay, rating.IsPublished, rating.ModeratedAtUtc,
        rating.ModerationReason, rating.UpdatedAtUtc);
}

public sealed record UpsertPlatformRatingRequest(
    [property: Range(1, 5)] byte CourseQualityScore,
    [property: Range(1, 5)] byte EaseOfUseScore,
    [property: Range(1, 5)] byte SupportScore,
    [property: Range(1, 5)] byte RecommendationScore,
    [property: StringLength(1200)] string? Comment,
    bool AllowPublicDisplay);

public sealed record ModeratePlatformRatingRequest(bool Publish, [property: StringLength(500)] string? Reason);
public sealed record PlatformRatingAggregate(decimal CourseQuality, decimal EaseOfUse, decimal Support, decimal Recommendation);
public sealed record PublicPlatformReview(Guid Id, decimal Score, string? Comment, DateTimeOffset UpdatedAtUtc, string AuthorLabel);
public sealed record PlatformRatingSummary(int RatingsCount, decimal? AverageScore, decimal? CourseQualityScore, decimal? EaseOfUseScore, decimal? SupportScore, decimal? RecommendationScore, IReadOnlyCollection<PublicPlatformReview> Reviews);
public sealed record AdminPlatformRatingSummary(int TotalCount, int PublishedCount, int AwaitingModerationCount, int PrivateWithoutConsentCount, decimal? AverageScore, decimal? CourseQualityScore, decimal? EaseOfUseScore, decimal? SupportScore, decimal? RecommendationScore);
public sealed record OwnPlatformRating(Guid Id, byte CourseQualityScore, byte EaseOfUseScore, byte SupportScore, byte RecommendationScore, string? Comment, bool AllowPublicDisplay, bool IsPublished, DateTimeOffset? ModeratedAtUtc, string? ModerationReason);
public sealed record AdminPlatformRating(Guid Id, string StudentUserId, byte CourseQualityScore, byte EaseOfUseScore, byte SupportScore, byte RecommendationScore, string? Comment, bool AllowPublicDisplay, bool IsPublished, DateTimeOffset? ModeratedAtUtc, string? ModerationReason, DateTimeOffset UpdatedAtUtc);
