using Betcco.Domain.Common;
using Betcco.Domain.Assessments;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

// Publishing uses the server clock. A browser callback or a scheduled URL can
// never make a course public on its own.
public sealed class ScheduledCoursePublisher(
    IServiceScopeFactory scopeFactory,
    ILogger<ScheduledCoursePublisher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PublishDueContentAsync(stoppingToken); }
            catch (Exception exception) { logger.LogError(exception, "Unable to publish scheduled BETCCO content."); }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task PublishDueContentAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        var now = DateTimeOffset.UtcNow;
        var courses = await db.Courses
            .Where(course => course.Status == CourseStatus.Scheduled && course.ScheduledPublishAtUtc <= now)
            .ToListAsync(cancellationToken);

        foreach (var course in courses)
        {
            course.Status = CourseStatus.Published;
            course.PublishedAtUtc = now;
            course.ScheduledPublishAtUtc = null;
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = "system",
                Action = "ScheduledCoursePublished",
                EntityType = nameof(Course),
                EntityId = course.Id.ToString(),
                Outcome = "Success"
            });
        }

        var units = await db.CourseModules
            .Include(unit => unit.Course)
            .Where(unit => unit.PublicationStatus == ContentPublicationStatus.Scheduled
                && unit.AvailableFromUtc <= now
                && (unit.Course!.Status == CourseStatus.Published
                    || unit.Course.Status == CourseStatus.Scheduled && unit.Course.ScheduledPublishAtUtc <= now))
            .ToListAsync(cancellationToken);
        foreach (var unit in units)
        {
            unit.PublicationStatus = ContentPublicationStatus.Published;
            unit.IsPublished = true;
            unit.AvailableFromUtc = null;
            db.AuditLogs.Add(ScheduledAudit(nameof(CourseModule), unit.Id, "ScheduledCourseUnitPublished"));
        }

        var lessons = await db.Lessons
            .Include(lesson => lesson.CourseModule).ThenInclude(unit => unit!.Course)
            .Where(lesson => lesson.PublicationStatus == ContentPublicationStatus.Scheduled
                && lesson.AvailableFromUtc <= now
                && (lesson.CourseModule!.IsPublished
                    || lesson.CourseModule.PublicationStatus == ContentPublicationStatus.Scheduled && lesson.CourseModule.AvailableFromUtc <= now)
                && (lesson.CourseModule.Course!.Status == CourseStatus.Published
                    || lesson.CourseModule.Course.Status == CourseStatus.Scheduled && lesson.CourseModule.Course.ScheduledPublishAtUtc <= now))
            .ToListAsync(cancellationToken);
        foreach (var lesson in lessons)
        {
            lesson.PublicationStatus = ContentPublicationStatus.Published;
            lesson.IsPublished = true;
            lesson.AvailableFromUtc = null;
            db.AuditLogs.Add(ScheduledAudit(nameof(Lesson), lesson.Id, "ScheduledCourseLessonPublished"));
        }

        var quizzes = await db.Quizzes
            .Where(quiz => quiz.PublicationStatus == ContentPublicationStatus.Scheduled
                && quiz.AvailableFromUtc <= now
                && db.Courses.Any(course => course.Id == quiz.CourseId
                    && (course.Status == CourseStatus.Published
                        || course.Status == CourseStatus.Scheduled && course.ScheduledPublishAtUtc <= now)))
            .ToListAsync(cancellationToken);
        foreach (var quiz in quizzes)
        {
            quiz.PublicationStatus = ContentPublicationStatus.Published;
            quiz.IsPublished = true;
            quiz.AvailableFromUtc = null;
            db.AuditLogs.Add(ScheduledAudit(nameof(Quiz), quiz.Id, "ScheduledQuizPublished"));
        }

        var assignments = await db.CourseAssignments
            .Include(assignment => assignment.Course)
            .Where(assignment => assignment.PublicationStatus == ContentPublicationStatus.Scheduled
                && assignment.AvailableFromUtc <= now
                && (assignment.Course!.Status == CourseStatus.Published
                    || assignment.Course.Status == CourseStatus.Scheduled && assignment.Course.ScheduledPublishAtUtc <= now))
            .ToListAsync(cancellationToken);
        foreach (var assignment in assignments)
        {
            assignment.PublicationStatus = ContentPublicationStatus.Published;
            assignment.IsPublished = true;
            assignment.AvailableFromUtc = null;
            db.AuditLogs.Add(ScheduledAudit(nameof(CourseAssignment), assignment.Id, "ScheduledCourseAssignmentPublished"));
        }

        if (courses.Count == 0 && units.Count == 0 && lessons.Count == 0 && quizzes.Count == 0 && assignments.Count == 0) return;
        await db.SaveChangesAsync(cancellationToken);
    }

    private static AuditLog ScheduledAudit(string entityType, Guid entityId, string action) => new()
    {
        ActorUserId = "system",
        Action = action,
        EntityType = entityType,
        EntityId = entityId.ToString(),
        Outcome = "Success"
    };
}
