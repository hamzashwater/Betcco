using Betcco.Application.Common;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Sends one reminder when a published coursework deadline enters the next
/// twenty-four hours. The database marker makes the operation safe across
/// retries; delivery failures never affect coursework or enrollment state.
/// </summary>
public sealed class UpcomingDeadlineNotificationService(
    BetccoDbContext db,
    IEmailNotificationService emailNotifications) : IUpcomingDeadlineNotificationService
{
    public async Task<int> DispatchAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now.AddHours(24);
        var candidates = await (
            from assignment in db.CourseAssignments.AsNoTracking()
            join course in db.Courses.AsNoTracking() on assignment.CourseId equals course.Id
            join enrollment in db.Enrollments.AsNoTracking() on assignment.CourseId equals enrollment.CourseId
            where course.Status == CourseStatus.Published
                && assignment.IsPublished
                && assignment.PublicationStatus == ContentPublicationStatus.Published
                && assignment.DueAtUtc != null
                && assignment.DueAtUtc > now
                && assignment.DueAtUtc <= cutoff
                && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > now)
            select new DeadlineCandidate(
                assignment.Id,
                assignment.CourseId,
                assignment.ArabicTitle,
                assignment.EnglishTitle,
                assignment.DueAtUtc!.Value,
                enrollment.StudentUserId))
            .ToListAsync(cancellationToken);

        candidates = candidates
            .Where(item => item.DueAtUtc > now && item.DueAtUtc <= cutoff)
            .GroupBy(item => new { item.StudentUserId, item.AssignmentId, item.DueAtUtc })
            .Select(group => group.First())
            .ToList();
        if (candidates.Count == 0) return 0;

        var keys = candidates.Select(item => item.DeduplicationKey).ToArray();
        var sent = await db.Notifications.AsNoTracking()
            .Where(item => item.DeduplicationKey != null && keys.Contains(item.DeduplicationKey))
            .Select(item => item.DeduplicationKey!)
            .ToListAsync(cancellationToken);
        var sentSet = sent.ToHashSet(StringComparer.Ordinal);
        var pending = candidates.Where(item => !sentSet.Contains(item.DeduplicationKey)).ToArray();
        if (pending.Length == 0) return 0;

        foreach (var item in pending)
        {
            db.Notifications.Add(new Notification
            {
                UserId = item.StudentUserId,
                Title = "موعد تسليم قريب / Upcoming deadline",
                Body = $"{item.ArabicTitle} / {item.EnglishTitle} — {item.DueAtUtc:yyyy-MM-dd HH:mm} UTC",
                Type = NotificationType.Course,
                DeepLink = $"/student/learn/{item.CourseId}",
                DeduplicationKey = item.DeduplicationKey
            });
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = "system",
                Action = "UpcomingDeadlineReminderQueued",
                EntityType = nameof(CourseAssignment),
                EntityId = item.AssignmentId.ToString(),
                Outcome = "Success"
            });
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another worker may have inserted one or more unique markers.
            // Do not risk duplicate email; its next pass will see the marker.
            return 0;
        }

        var userIds = pending
            .Select(item => Guid.TryParse(item.StudentUserId, out var userId) ? userId : Guid.Empty)
            .Where(userId => userId != Guid.Empty)
            .Distinct()
            .ToArray();
        var emails = userIds.Length == 0
            ? new Dictionary<string, string>()
            : await db.Users.AsNoTracking()
                .Where(user => userIds.Contains(user.Id) && user.Email != null && user.EmailConfirmed)
                .Select(user => new { UserId = user.Id.ToString(), user.Email })
                .ToDictionaryAsync(user => user.UserId, user => user.Email!, cancellationToken);

        await Task.WhenAll(pending
            .Where(item => emails.TryGetValue(item.StudentUserId, out _))
            .Select(item => emailNotifications.SendAsync(
                new PlatformEmailNotification(
                    "UpcomingDeadline",
                    emails[item.StudentUserId],
                    "BETCCO coursework deadline reminder",
                    "Your coursework deadline is approaching",
                    $"{item.EnglishTitle} is due on {item.DueAtUtc:yyyy-MM-dd HH:mm} UTC."),
                CancellationToken.None)));
        return pending.Length;
    }

    private sealed record DeadlineCandidate(
        Guid AssignmentId,
        Guid CourseId,
        string ArabicTitle,
        string EnglishTitle,
        DateTimeOffset DueAtUtc,
        string StudentUserId)
    {
        public string DeduplicationKey => $"deadline:{AssignmentId:N}:{DueAtUtc.UtcDateTime:yyyyMMddHH}";
    }
}

/// <summary>Clock-driven wrapper kept separate from the delivery use case for testability.</summary>
public sealed class UpcomingDeadlineNotificationPublisher(
    IServiceScopeFactory scopeFactory,
    ILogger<UpcomingDeadlineNotificationPublisher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IUpcomingDeadlineNotificationService>()
                    .DispatchAsync(stoppingToken);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Unable to queue upcoming BETCCO coursework deadline reminders.");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
