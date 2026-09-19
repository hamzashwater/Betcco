using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/v1/admin/commerce-catalog")]
public sealed class AdminCommerceCatalogController(BetccoDbContext db) : ControllerBase
{
    [HttpGet("commission")]
    public async Task<IActionResult> Commission(CancellationToken cancellationToken)
    {
        var value = await db.SiteSettings.AsNoTracking()
            .Where(setting => setting.Key == "PlatformCommissionPercent")
            .Select(setting => setting.EnglishValue)
            .SingleOrDefaultAsync(cancellationToken);
        var platformCommissionPercent = decimal.TryParse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var parsed) && parsed is >= 0 and <= 100 ? parsed : 30m;
        return Ok(new { platformCommissionPercent, teacherSharePercent = 100m - platformCommissionPercent });
    }

    [HttpPut("commission")]
    public async Task<IActionResult> UpdateCommission(UpdateCommissionRequest request, CancellationToken cancellationToken)
    {
        if (request.PlatformCommissionPercent is < 0 or > 100) return BadRequest(new { message = "The platform commission must be between 0 and 100 percent." });
        var setting = await db.SiteSettings.SingleOrDefaultAsync(item => item.Key == "PlatformCommissionPercent", cancellationToken);
        var previous = setting?.EnglishValue ?? "30";
        var value = request.PlatformCommissionPercent.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
        if (setting is null) db.SiteSettings.Add(new SiteSetting { Key = "PlatformCommissionPercent", ArabicValue = value, EnglishValue = value, IsPublic = false });
        else { setting.ArabicValue = value; setting.EnglishValue = value; setting.IsPublic = false; }
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "PlatformCommissionUpdated", EntityType = nameof(SiteSetting), EntityId = "PlatformCommissionPercent", Outcome = "Success", OldValuesJson = JsonSerializer.Serialize(new { platformCommissionPercent = previous }), NewValuesJson = JsonSerializer.Serialize(new { platformCommissionPercent = value }) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("sales-tax")]
    public async Task<IActionResult> SalesTax(CancellationToken cancellationToken)
    {
        var value = await db.SiteSettings.AsNoTracking()
            .Where(setting => setting.Key == "SalesTaxPercent")
            .Select(setting => setting.EnglishValue)
            .SingleOrDefaultAsync(cancellationToken);
        var salesTaxPercent = decimal.TryParse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var parsed) && parsed is >= 0 and <= 100 ? parsed : 0m;
        return Ok(new { salesTaxPercent });
    }

    [HttpPut("sales-tax")]
    public async Task<IActionResult> UpdateSalesTax(UpdateSalesTaxRequest request, CancellationToken cancellationToken)
    {
        if (request.SalesTaxPercent is < 0 or > 100) return BadRequest(new { message = "The sales tax must be between 0 and 100 percent." });
        var setting = await db.SiteSettings.SingleOrDefaultAsync(item => item.Key == "SalesTaxPercent", cancellationToken);
        var previous = setting?.EnglishValue ?? "0";
        var value = request.SalesTaxPercent.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
        if (setting is null) db.SiteSettings.Add(new SiteSetting { Key = "SalesTaxPercent", ArabicValue = value, EnglishValue = value, IsPublic = false });
        else { setting.ArabicValue = value; setting.EnglishValue = value; setting.IsPublic = false; }
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "SalesTaxUpdated", EntityType = nameof(SiteSetting), EntityId = "SalesTaxPercent", Outcome = "Success", OldValuesJson = JsonSerializer.Serialize(new { salesTaxPercent = previous }), NewValuesJson = JsonSerializer.Serialize(new { salesTaxPercent = value }) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("coupons")]
    public async Task<IActionResult> Coupons(CancellationToken cancellationToken) => Ok(await db.Coupons.AsNoTracking().Include(item => item.ApplicableCourses).OrderByDescending(item => item.UpdatedAtUtc).Select(item => new { item.Id, item.Code, item.PercentageOff, item.FixedAmountOff, item.StartsAtUtc, item.EndsAtUtc, item.MaxRedemptions, item.MaxRedemptionsPerUser, item.MinimumPurchaseAmount, item.RedemptionCount, item.IsActive, courseIds = item.ApplicableCourses.Select(course => course.CourseId) }).ToListAsync(cancellationToken));

    [HttpPost("coupons")]
    public async Task<IActionResult> CreateCoupon(UpsertCouponRequest request, CancellationToken cancellationToken)
    {
        if (!Valid(request) || await db.Coupons.AnyAsync(item => item.Code == request.Code.Trim().ToUpperInvariant(), cancellationToken)) return BadRequest(new { message = "Provide a unique valid coupon with exactly one discount type." });
        var courseIds = await OptionalPublishedCourseIdsAsync(request.CourseIds, cancellationToken);
        if (courseIds is null) return BadRequest(new { message = "Applicable courses must be published." });
        var coupon = new Coupon { Code = request.Code.Trim().ToUpperInvariant(), PercentageOff = request.PercentageOff, FixedAmountOff = request.FixedAmountOff, StartsAtUtc = request.StartsAtUtc, EndsAtUtc = request.EndsAtUtc, MaxRedemptions = request.MaxRedemptions, MaxRedemptionsPerUser = request.MaxRedemptionsPerUser, MinimumPurchaseAmount = request.MinimumPurchaseAmount, IsActive = request.IsActive };
        foreach (var courseId in courseIds) coupon.ApplicableCourses.Add(new CouponCourse { CourseId = courseId });
        db.Coupons.Add(coupon); db.AuditLogs.Add(Audit("CouponCreated", nameof(Coupon), coupon.Id)); await db.SaveChangesAsync(cancellationToken); return Ok(new { coupon.Id });
    }

    [HttpPut("coupons/{couponId:guid}")]
    public async Task<IActionResult> UpdateCoupon(Guid couponId, UpsertCouponRequest request, CancellationToken cancellationToken)
    {
        var coupon = await db.Coupons.Include(item => item.ApplicableCourses).SingleOrDefaultAsync(item => item.Id == couponId, cancellationToken);
        if (coupon is null || !Valid(request) || await db.Coupons.AnyAsync(item => item.Id != couponId && item.Code == request.Code.Trim().ToUpperInvariant(), cancellationToken)) return BadRequest(new { message = "The coupon could not be updated." });
        var courseIds = await OptionalPublishedCourseIdsAsync(request.CourseIds, cancellationToken);
        if (courseIds is null) return BadRequest(new { message = "Applicable courses must be published." });
        coupon.Code = request.Code.Trim().ToUpperInvariant(); coupon.PercentageOff = request.PercentageOff; coupon.FixedAmountOff = request.FixedAmountOff; coupon.StartsAtUtc = request.StartsAtUtc; coupon.EndsAtUtc = request.EndsAtUtc; coupon.MaxRedemptions = request.MaxRedemptions; coupon.MaxRedemptionsPerUser = request.MaxRedemptionsPerUser; coupon.MinimumPurchaseAmount = request.MinimumPurchaseAmount; coupon.IsActive = request.IsActive;
        db.CouponCourses.RemoveRange(coupon.ApplicableCourses); coupon.ApplicableCourses.Clear(); foreach (var courseId in courseIds) coupon.ApplicableCourses.Add(new CouponCourse { CourseId = courseId });
        db.AuditLogs.Add(Audit("CouponUpdated", nameof(Coupon), coupon.Id)); await db.SaveChangesAsync(cancellationToken); return NoContent();
    }

    [HttpGet("memberships")]
    public async Task<IActionResult> Memberships(CancellationToken cancellationToken) => Ok(await db.MembershipPlans.AsNoTracking().Include(item => item.Courses).OrderByDescending(item => item.UpdatedAtUtc).Select(item => new { item.Id, item.Slug, item.ArabicTitle, item.EnglishTitle, item.ArabicDescription, item.EnglishDescription, item.ArabicFeaturesJson, item.EnglishFeaturesJson, item.Price, item.Interval, item.IsPublished, courseIds = item.Courses.Select(course => course.CourseId) }).ToListAsync(cancellationToken));

    [HttpPost("memberships")]
    public async Task<IActionResult> CreateMembership(UpsertMembershipPlanRequest request, CancellationToken cancellationToken)
    {
        if (!Valid(request) || await db.MembershipPlans.AnyAsync(item => item.Slug == request.Slug, cancellationToken)) return BadRequest(new { message = "Provide a unique slug, bilingual plan details, price, interval, and published courses." });
        var courseIds = await PublishedCourseIdsAsync(request.CourseIds, cancellationToken);
        if (courseIds is null) return BadRequest(new { message = "Membership plans can include only published courses." });
        var plan = new MembershipPlan { Slug = request.Slug.Trim(), ArabicTitle = request.ArabicTitle.Trim(), EnglishTitle = request.EnglishTitle.Trim(), ArabicDescription = request.ArabicDescription.Trim(), EnglishDescription = request.EnglishDescription.Trim(), ArabicFeaturesJson = JsonSerializer.Serialize(NormalizeFeatures(request.ArabicFeatures)), EnglishFeaturesJson = JsonSerializer.Serialize(NormalizeFeatures(request.EnglishFeatures)), Price = request.Price, Interval = request.Interval, IsPublished = request.IsPublished };
        foreach (var courseId in courseIds) plan.Courses.Add(new MembershipPlanCourse { CourseId = courseId });
        db.MembershipPlans.Add(plan);
        db.AuditLogs.Add(Audit("MembershipPlanCreated", nameof(MembershipPlan), plan.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/memberships", new { plan.Id });
    }

    [HttpPut("memberships/{planId:guid}")]
    public async Task<IActionResult> UpdateMembership(Guid planId, UpsertMembershipPlanRequest request, CancellationToken cancellationToken)
    {
        var plan = await db.MembershipPlans.Include(item => item.Courses).SingleOrDefaultAsync(item => item.Id == planId, cancellationToken);
        if (plan is null || !Valid(request) || await db.MembershipPlans.AnyAsync(item => item.Id != planId && item.Slug == request.Slug, cancellationToken)) return BadRequest(new { message = "The membership plan could not be updated." });
        var courseIds = await PublishedCourseIdsAsync(request.CourseIds, cancellationToken);
        if (courseIds is null) return BadRequest(new { message = "Membership plans can include only published courses." });
        plan.Slug = request.Slug.Trim(); plan.ArabicTitle = request.ArabicTitle.Trim(); plan.EnglishTitle = request.EnglishTitle.Trim(); plan.ArabicDescription = request.ArabicDescription.Trim(); plan.EnglishDescription = request.EnglishDescription.Trim(); plan.ArabicFeaturesJson = JsonSerializer.Serialize(NormalizeFeatures(request.ArabicFeatures)); plan.EnglishFeaturesJson = JsonSerializer.Serialize(NormalizeFeatures(request.EnglishFeatures)); plan.Price = request.Price; plan.Interval = request.Interval; plan.IsPublished = request.IsPublished;
        db.MembershipPlanCourses.RemoveRange(plan.Courses); plan.Courses.Clear(); foreach (var courseId in courseIds) plan.Courses.Add(new MembershipPlanCourse { CourseId = courseId });
        db.AuditLogs.Add(Audit("MembershipPlanUpdated", nameof(MembershipPlan), plan.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("course-subscriptions")]
    public async Task<IActionResult> CourseSubscriptions(CancellationToken cancellationToken) => Ok(await db.CourseSubscriptionPlans.AsNoTracking().OrderByDescending(item => item.UpdatedAtUtc).Select(item => new { item.Id, item.CourseId, item.ArabicTitle, item.EnglishTitle, item.Price, item.Interval, item.IsPublished }).ToListAsync(cancellationToken));

    [HttpPost("course-subscriptions")]
    public async Task<IActionResult> CreateCourseSubscription(UpsertCourseSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        if (!Valid(request) || await db.CourseSubscriptionPlans.AnyAsync(item => item.CourseId == request.CourseId && item.Interval == request.Interval, cancellationToken) || !await db.Courses.AnyAsync(course => course.Id == request.CourseId && course.Status == CourseStatus.Published, cancellationToken)) return BadRequest(new { message = "Provide one valid monthly, quarterly, or yearly plan for a published course." });
        var plan = new CourseSubscriptionPlan { CourseId = request.CourseId, ArabicTitle = request.ArabicTitle.Trim(), EnglishTitle = request.EnglishTitle.Trim(), Price = request.Price, Interval = request.Interval, IsPublished = request.IsPublished };
        db.CourseSubscriptionPlans.Add(plan); db.AuditLogs.Add(Audit("CourseSubscriptionPlanCreated", nameof(CourseSubscriptionPlan), plan.Id)); await db.SaveChangesAsync(cancellationToken); return Created($"/api/v1/course-subscriptions", new { plan.Id });
    }

    [HttpPut("course-subscriptions/{planId:guid}")]
    public async Task<IActionResult> UpdateCourseSubscription(Guid planId, UpsertCourseSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var plan = await db.CourseSubscriptionPlans.SingleOrDefaultAsync(item => item.Id == planId, cancellationToken);
        if (plan is null || !Valid(request)
            || await db.CourseSubscriptionPlans.AnyAsync(item => item.Id != planId && item.CourseId == request.CourseId && item.Interval == request.Interval, cancellationToken)
            || !await db.Courses.AnyAsync(course => course.Id == request.CourseId && course.Status == CourseStatus.Published, cancellationToken))
            return BadRequest(new { message = "Provide one valid monthly, quarterly, or yearly plan for a published course." });
        plan.CourseId = request.CourseId;
        plan.ArabicTitle = request.ArabicTitle.Trim();
        plan.EnglishTitle = request.EnglishTitle.Trim();
        plan.Price = request.Price;
        plan.Interval = request.Interval;
        plan.IsPublished = request.IsPublished;
        db.AuditLogs.Add(Audit("CourseSubscriptionPlanUpdated", nameof(CourseSubscriptionPlan), plan.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<IReadOnlyCollection<Guid>?> PublishedCourseIdsAsync(IReadOnlyCollection<Guid>? ids, CancellationToken cancellationToken)
    {
        var unique = (ids ?? []).Distinct().ToArray();
        if (unique.Length == 0 || unique.Length > 100) return null;
        var found = await db.Courses.Where(course => unique.Contains(course.Id) && course.Status == CourseStatus.Published).Select(course => course.Id).ToArrayAsync(cancellationToken);
        return found.Length == unique.Length ? found : null;
    }
    private async Task<IReadOnlyCollection<Guid>?> OptionalPublishedCourseIdsAsync(IReadOnlyCollection<Guid>? ids, CancellationToken cancellationToken)
    {
        var unique = (ids ?? []).Distinct().ToArray();
        if (unique.Length == 0) return unique;
        return unique.Length > 100 ? null : await PublishedCourseIdsAsync(unique, cancellationToken);
    }
    private static bool Valid(UpsertMembershipPlanRequest request) => SlugValidation.IsAsciiKebabCase(request.Slug) && Text(request.ArabicTitle, 180) && Text(request.EnglishTitle, 180) && Text(request.ArabicDescription, 2500) && Text(request.EnglishDescription, 2500) && request.Price >= 0 && Enum.IsDefined(request.Interval);
    private static bool Valid(UpsertCourseSubscriptionPlanRequest request) => Text(request.ArabicTitle, 180) && Text(request.EnglishTitle, 180) && request.Price >= 0 && Enum.IsDefined(request.Interval);
    private static bool Valid(UpsertCouponRequest request) => !string.IsNullOrWhiteSpace(request.Code) && request.Code.Trim().Length is <= 50 and > 0 && Regex.IsMatch(request.Code.Trim(), "^[A-Za-z0-9-]+$")
        && ((request.PercentageOff is > 0 and <= 100 && request.FixedAmountOff is null) || (request.FixedAmountOff is > 0 && request.PercentageOff == 0))
        && (request.StartsAtUtc is null || request.EndsAtUtc is null || request.StartsAtUtc < request.EndsAtUtc)
        && (request.MaxRedemptions is null || request.MaxRedemptions > 0) && (request.MaxRedemptionsPerUser is null || request.MaxRedemptionsPerUser > 0) && (request.MinimumPurchaseAmount is null || request.MinimumPurchaseAmount >= 0);
    private static bool Text(string? value, int max) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= max;
    private static string[] NormalizeFeatures(IReadOnlyCollection<string>? values) => (values ?? []).Select(value => value?.Trim() ?? string.Empty).Where(value => value.Length > 0).Distinct(StringComparer.Ordinal).Take(30).ToArray();
    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private AuditLog Audit(string action, string entityType, Guid id) => new() { ActorUserId = UserId, Action = action, EntityType = entityType, EntityId = id.ToString(), Outcome = "Success" };
}

public sealed record UpsertMembershipPlanRequest(string Slug, string ArabicTitle, string EnglishTitle, string ArabicDescription, string EnglishDescription, IReadOnlyCollection<string>? ArabicFeatures, IReadOnlyCollection<string>? EnglishFeatures, decimal Price, BillingInterval Interval, bool IsPublished, IReadOnlyCollection<Guid>? CourseIds);
public sealed record UpsertCourseSubscriptionPlanRequest(Guid CourseId, string ArabicTitle, string EnglishTitle, decimal Price, BillingInterval Interval, bool IsPublished);
public sealed record UpsertCouponRequest(string Code, decimal PercentageOff, decimal? FixedAmountOff, DateTimeOffset? StartsAtUtc, DateTimeOffset? EndsAtUtc, int? MaxRedemptions, int? MaxRedemptionsPerUser, decimal? MinimumPurchaseAmount, bool IsActive, IReadOnlyCollection<Guid>? CourseIds);
public sealed record UpdateCommissionRequest(decimal PlatformCommissionPercent);
public sealed record UpdateSalesTaxRequest(decimal SalesTaxPercent);
