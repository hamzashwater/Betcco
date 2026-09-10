using Betcco.Domain.Common;
using Betcco.Application.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/v1/admin")]
public sealed class AdminDashboardController(BetccoDbContext db, ICourseGradebookService gradebook) : ControllerBase
{
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(
        [FromQuery] string period = "30d",
        [FromQuery] DateTimeOffset? fromUtc = null,
        [FromQuery] DateTimeOffset? toUtc = null,
        CancellationToken cancellationToken = default)
    {
        var window = ResolveWindow(period, fromUtc, toUtc);
        if (window is null)
            return BadRequest(new { message = "Use a supported period or a custom range no longer than 366 days." });

        var studentRoleId = await db.Roles.AsNoTracking()
            .Where(role => role.Name == "Student")
            .Select(role => role.Id)
            .SingleOrDefaultAsync(cancellationToken);
        var teacherRoleId = await db.Roles.AsNoTracking()
            .Where(role => role.Name == "Teacher")
            .Select(role => role.Id)
            .SingleOrDefaultAsync(cancellationToken);
        var learningActivity = db.LessonProgresses.AsNoTracking()
            .Where(progress => progress.UpdatedAtUtc >= window.FromUtc && progress.UpdatedAtUtc <= window.ToUtc);
        var paymentsInWindow = db.Payments.AsNoTracking()
            .Where(payment => payment.CreatedAtUtc >= window.FromUtc && payment.CreatedAtUtc <= window.ToUtc);
        var enrolledTotal = await db.Enrollments.AsNoTracking().CountAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var activeMemberships = await db.UserMemberships.AsNoTracking()
            .CountAsync(membership => membership.Status == SubscriptionStatus.Active && membership.EndsAtUtc > now, cancellationToken);
        var activeCourseSubscriptions = await db.UserCourseSubscriptions.AsNoTracking()
            .CountAsync(subscription => subscription.Status == SubscriptionStatus.Active && subscription.EndsAtUtc > now, cancellationToken);
        var completedEnrollments = await db.Enrollments.AsNoTracking()
            .CountAsync(enrollment => enrollment.CompletedAtUtc != null, cancellationToken);
        var paymentTrend = await paymentsInWindow
            .Where(payment => payment.Status == PaymentStatus.Paid)
            .GroupBy(payment => payment.CreatedAtUtc.Date)
            .Select(group => new
            {
                DateUtc = group.Key,
                PaidOrders = group.Count(),
                Revenue = group.Sum(payment => payment.Total)
            })
            .ToListAsync(cancellationToken);
        var learningTrend = await learningActivity
            .GroupBy(progress => progress.UpdatedAtUtc.Date)
            .Select(group => new { DateUtc = group.Key, LessonActivity = group.Count() })
            .ToListAsync(cancellationToken);
        var paymentsByDate = paymentTrend.ToDictionary(item => item.DateUtc);
        var learningByDate = learningTrend.ToDictionary(item => item.DateUtc);
        var trend = paymentsByDate.Keys
            .Concat(learningByDate.Keys)
            .Distinct()
            .OrderBy(date => date)
            .Select(date => new
            {
                dateUtc = DateTime.SpecifyKind(date, DateTimeKind.Utc),
                paidOrders = paymentsByDate.GetValueOrDefault(date)?.PaidOrders ?? 0,
                revenue = paymentsByDate.GetValueOrDefault(date)?.Revenue ?? 0m,
                lessonActivity = learningByDate.GetValueOrDefault(date)?.LessonActivity ?? 0
            })
            .ToArray();

        return Ok(new
        {
            period = window.Period,
            fromUtc = window.FromUtc,
            toUtc = window.ToUtc,
            students = await db.UserRoles.AsNoTracking().CountAsync(role => role.RoleId == studentRoleId, cancellationToken),
            activeStudents = await learningActivity.Select(progress => progress.StudentUserId).Distinct().CountAsync(cancellationToken),
            teachers = await db.UserRoles.AsNoTracking().CountAsync(role => role.RoleId == teacherRoleId, cancellationToken),
            activeTeachers = await db.Users.AsNoTracking()
                .CountAsync(user => !user.IsFrozen && db.UserRoles.Any(role => role.UserId == user.Id && role.RoleId == teacherRoleId), cancellationToken),
            courses = await db.Courses.AsNoTracking().CountAsync(cancellationToken),
            publishedCourses = await db.Courses.AsNoTracking().CountAsync(course => course.Status == CourseStatus.Published, cancellationToken),
            units = await db.CourseModules.AsNoTracking().CountAsync(cancellationToken),
            enrollments = enrolledTotal,
            assignments = await db.CourseAssignments.AsNoTracking().CountAsync(cancellationToken),
            pendingReviews = await db.CourseAssignmentSubmissions.AsNoTracking()
                .CountAsync(submission => submission.Status == CourseAssignmentSubmissionStatus.Submitted, cancellationToken),
            pendingApprovals = await db.Courses.AsNoTracking().CountAsync(course => course.Status == CourseStatus.SubmittedForReview, cancellationToken),
            pendingEvaluations = await db.EvaluationRequests.AsNoTracking().CountAsync(evaluation => evaluation.Status == EvaluationStatus.PendingAssignment, cancellationToken),
            evaluationsAwaitingVerification = await db.EvaluationRequests.AsNoTracking().CountAsync(evaluation => evaluation.Status == EvaluationStatus.UnderReview, cancellationToken),
            completionRate = enrolledTotal == 0 ? 0m : Math.Round(completedEnrollments * 100m / enrolledTotal, 2),
            orders = await paymentsInWindow.CountAsync(cancellationToken),
            activeSubscriptions = activeMemberships + activeCourseSubscriptions,
            refunds = await paymentsInWindow.CountAsync(payment =>
                payment.Status == PaymentStatus.Refunded || payment.Status == PaymentStatus.PartiallyRefunded,
                cancellationToken),
            revenue = await paymentsInWindow.Where(payment => payment.Status == PaymentStatus.Paid).SumAsync(payment => (decimal?)payment.Total, cancellationToken) ?? 0m,
            trend
        });
    }

    [HttpGet("gradebook")]
    public async Task<IActionResult> Gradebook(
        [FromQuery] Guid? courseId,
        [FromQuery] Guid? unitId,
        [FromQuery] string? teacherUserId,
        [FromQuery] string? studentUserId,
        [FromQuery] string? status,
        [FromQuery] string? grade,
        [FromQuery] DateTimeOffset? fromUtc,
        [FromQuery] DateTimeOffset? toUtc,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string locale = "ar",
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 100 || fromUtc > toUtc)
            return BadRequest(new { message = "Use a valid date range, page, and pageSize between 1 and 100." });
        var result = await gradebook.GetAdminAsync(
            new AdminGradebookQuery(courseId, unitId, teacherUserId, studentUserId, status, grade, fromUtc, toUtc, search, page, pageSize),
            locale,
            cancellationToken);
        return Ok(result);
    }

    [HttpGet("gradebook/filters")]
    public async Task<IActionResult> GradebookFilters([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var teacherRoleId = await db.Roles.AsNoTracking().Where(role => role.Name == "Teacher").Select(role => role.Id).SingleOrDefaultAsync(cancellationToken);
        var studentRoleId = await db.Roles.AsNoTracking().Where(role => role.Name == "Student").Select(role => role.Id).SingleOrDefaultAsync(cancellationToken);
        return Ok(new
        {
            courses = await db.Courses.AsNoTracking().OrderBy(course => course.ArabicTitle).Take(200)
                .Select(course => new { course.Id, title = locale.StartsWith("ar") ? course.ArabicTitle : course.EnglishTitle }).ToListAsync(cancellationToken),
            units = await db.CourseModules.AsNoTracking().OrderBy(unit => unit.ArabicTitle).Take(300)
                .Select(unit => new { unit.Id, unit.CourseId, title = locale.StartsWith("ar") ? unit.ArabicTitle : unit.EnglishTitle }).ToListAsync(cancellationToken),
            teachers = await db.Users.AsNoTracking().Where(user => db.UserRoles.Any(role => role.UserId == user.Id && role.RoleId == teacherRoleId)).OrderBy(user => user.DisplayName).Take(300)
                .Select(user => new { id = user.Id.ToString(), user.DisplayName }).ToListAsync(cancellationToken),
            students = await db.Users.AsNoTracking().Where(user => db.UserRoles.Any(role => role.UserId == user.Id && role.RoleId == studentRoleId)).OrderBy(user => user.DisplayName).Take(500)
                .Select(user => new { id = user.Id.ToString(), user.DisplayName }).ToListAsync(cancellationToken)
        });
    }

    private static AnalyticsWindow? ResolveWindow(string period, DateTimeOffset? fromUtc, DateTimeOffset? toUtc)
    {
        var now = DateTimeOffset.UtcNow;
        if (string.Equals(period, "custom", StringComparison.OrdinalIgnoreCase))
        {
            if (!fromUtc.HasValue || !toUtc.HasValue || fromUtc > toUtc || toUtc > now.AddMinutes(5) || toUtc.Value - fromUtc.Value > TimeSpan.FromDays(366))
                return null;
            return new AnalyticsWindow("custom", fromUtc.Value, toUtc.Value);
        }

        var from = period.ToLowerInvariant() switch
        {
            "today" => now.Date,
            "7d" => now.AddDays(-7),
            "30d" => now.AddDays(-30),
            "3m" => now.AddMonths(-3),
            "year" => now.AddYears(-1),
            "all" => DateTimeOffset.UnixEpoch,
            _ => (DateTimeOffset?)null
        };
        return from is null ? null : new AnalyticsWindow(period.ToLowerInvariant(), from.Value, now);
    }

    private sealed record AnalyticsWindow(string Period, DateTimeOffset FromUtc, DateTimeOffset ToUtc);
}
