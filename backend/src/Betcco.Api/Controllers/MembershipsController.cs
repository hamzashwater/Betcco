using System.Security.Claims;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/memberships")]
public sealed class MembershipsController(BetccoDbContext db, ICommerceService commerce) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Plans([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var plans = await db.MembershipPlans.AsNoTracking().Include(item => item.Courses).ThenInclude(item => item.Course)
            .Where(item => item.IsPublished).OrderBy(item => item.Price).ToListAsync(cancellationToken);
        return Ok(plans.Select(plan => new
        {
            plan.Id,
            plan.Slug,
            title = arabic ? plan.ArabicTitle : plan.EnglishTitle,
            description = arabic ? plan.ArabicDescription : plan.EnglishDescription,
            features = System.Text.Json.JsonSerializer.Deserialize<string[]>(arabic ? plan.ArabicFeaturesJson ?? "[]" : plan.EnglishFeaturesJson ?? "[]") ?? [],
            plan.Price,
            plan.Currency,
            interval = plan.Interval.ToString(),
            courses = plan.Courses.Where(item => item.Course?.Status == CourseStatus.Published).Select(item => new { item.CourseId, title = arabic ? item.Course!.ArabicTitle : item.Course!.EnglishTitle })
        }));
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{planId:guid}/checkout")]
    [EnableRateLimiting("checkout")]
    public async Task<IActionResult> Checkout(Guid planId, MembershipCheckoutRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await commerce.CreateMembershipCheckoutAsync(UserId, planId, request.CouponCode, request.PaymentMethod, Request.Headers["Idempotency-Key"].ToString(), cancellationToken);
            return result is null ? BadRequest(new { message = "This membership is unavailable." }) : Ok(result);
        }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    [Authorize(Policy = "Student")]
    [HttpGet("me")]
    public async Task<IActionResult> Mine(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var memberships = await db.UserMemberships.AsNoTracking().Include(item => item.MembershipPlan).Where(item => item.StudentUserId == UserId).OrderByDescending(item => item.EndsAtUtc).ToListAsync(cancellationToken);
        var subscriptions = await db.UserCourseSubscriptions.AsNoTracking().Include(item => item.CourseSubscriptionPlan).ThenInclude(item => item!.Course).Where(item => item.StudentUserId == UserId).OrderByDescending(item => item.EndsAtUtc).ToListAsync(cancellationToken);
        return Ok(new
        {
            memberships = memberships.Select(item => new { item.Id, title = item.MembershipPlan!.ArabicTitle, item.StartsAtUtc, item.EndsAtUtc, status = item.EndsAtUtc > now && item.Status == SubscriptionStatus.Active ? "Active" : "Expired" }),
            subscriptions = subscriptions.Select(item => new { item.Id, title = item.CourseSubscriptionPlan!.ArabicTitle, courseId = item.CourseSubscriptionPlan.CourseId, item.StartsAtUtc, item.EndsAtUtc, status = item.EndsAtUtc > now && item.Status == SubscriptionStatus.Active ? "Active" : "Expired" })
        });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

[ApiController]
[Route("api/v1/course-subscriptions")]
public sealed class CourseSubscriptionsController(BetccoDbContext db, ICommerceService commerce) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Plans([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var plans = await db.CourseSubscriptionPlans.AsNoTracking().Include(item => item.Course)
            .Where(item => item.IsPublished && item.Course!.Status == CourseStatus.Published).OrderBy(item => item.Price).ToListAsync(cancellationToken);
        return Ok(plans.Select(plan => new { plan.Id, plan.CourseId, title = arabic ? plan.ArabicTitle : plan.EnglishTitle, courseTitle = arabic ? plan.Course!.ArabicTitle : plan.Course!.EnglishTitle, plan.Price, plan.Currency, interval = plan.Interval.ToString() }));
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{planId:guid}/checkout")]
    [EnableRateLimiting("checkout")]
    public async Task<IActionResult> Checkout(Guid planId, MembershipCheckoutRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await commerce.CreateCourseSubscriptionCheckoutAsync(UserId, planId, request.CouponCode, request.PaymentMethod, Request.Headers["Idempotency-Key"].ToString(), cancellationToken);
            return result is null ? BadRequest(new { message = "This course subscription is unavailable." }) : Ok(result);
        }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

public sealed record MembershipCheckoutRequest(string? CouponCode, string? PaymentMethod);
