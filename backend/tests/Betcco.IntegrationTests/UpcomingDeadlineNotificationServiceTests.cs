using Betcco.Application.Common;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class UpcomingDeadlineNotificationServiceTests
{
    [Fact]
    public async Task Student_specific_reminders_use_effective_deadlines_without_cross_student_deduplication()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var now = DateTimeOffset.UtcNow;
        var studentA = new ApplicationUser { Id = Guid.NewGuid(), UserName = "a@betcco.test", Email = "a@betcco.test", EmailConfirmed = true, DisplayName = "A" };
        var studentB = new ApplicationUser { Id = Guid.NewGuid(), UserName = "b@betcco.test", Email = "b@betcco.test", EmailConfirmed = true, DisplayName = "B" };
        var course = new Course { Slug = "individual-deadlines", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", TeacherUserId = "teacher", IsFree = true, Status = CourseStatus.Published };
        var futureBase = new CourseAssignment { Course = course, ArabicTitle = "قريب", EnglishTitle = "Soon", ArabicInstructions = "تعليمات", EnglishInstructions = "Instructions", DueAtUtc = now.AddHours(6), IsPublished = true, PublicationStatus = ContentPublicationStatus.Published };
        var pastBase = new CourseAssignment { Course = course, ArabicTitle = "مضى", EnglishTitle = "Past", ArabicInstructions = "تعليمات", EnglishInstructions = "Instructions", DueAtUtc = now.AddHours(-1), IsPublished = true, PublicationStatus = ContentPublicationStatus.Published };
        db.AddRange(course, studentA, studentB, futureBase, pastBase,
            new Enrollment { StudentUserId = studentA.Id.ToString(), Course = course },
            new Enrollment { StudentUserId = studentB.Id.ToString(), Course = course },
            new CourseAssignmentDeadlineExtension { CourseAssignment = futureBase, StudentUserId = studentA.Id.ToString(), BaseDueAtUtcSnapshot = futureBase.DueAtUtc!.Value, ExtendedDueAtUtc = now.AddHours(36), GrantedByUserId = "teacher", GrantedAtUtc = now, Reason = "Operational" },
            new CourseAssignmentDeadlineExtension { CourseAssignment = pastBase, StudentUserId = studentA.Id.ToString(), BaseDueAtUtcSnapshot = pastBase.DueAtUtc!.Value, ExtendedDueAtUtc = now.AddHours(12), GrantedByUserId = "teacher", GrantedAtUtc = now, Reason = "Operational" });
        await db.SaveChangesAsync();

        var email = new RecordingEmailNotifications();
        var service = new UpcomingDeadlineNotificationService(db, email);
        Assert.Equal(2, await service.DispatchAsync());
        var notifications = await db.Notifications.ToListAsync();
        Assert.Contains(notifications, item => item.UserId == studentB.Id.ToString() && item.DeduplicationKey!.StartsWith($"deadline:{futureBase.Id:N}:"));
        Assert.Contains(notifications, item => item.UserId == studentA.Id.ToString() && item.DeduplicationKey!.StartsWith($"deadline:{pastBase.Id:N}:"));
        Assert.DoesNotContain(notifications, item => item.UserId == studentA.Id.ToString() && item.DeduplicationKey!.StartsWith($"deadline:{futureBase.Id:N}:"));
        Assert.Equal(0, await service.DispatchAsync());
        Assert.Equal(2, email.Events.Count);
    }

    [Fact]
    public async Task Published_coursework_due_within_twenty_four_hours_sends_one_in_app_and_email_reminder()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var student = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "student@betcco.test",
            Email = "student@betcco.test",
            DisplayName = "Student",
            EmailConfirmed = true
        };
        var course = new Course
        {
            Slug = "deadline-course",
            ArabicTitle = "دورة المواعيد",
            EnglishTitle = "Deadlines course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "teacher-1",
            IsFree = true,
            Status = CourseStatus.Published
        };
        var assignment = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            ArabicTitle = "تسليم قريب",
            EnglishTitle = "Coursework due soon",
            ArabicInstructions = "التعليمات",
            EnglishInstructions = "Instructions",
            DueAtUtc = DateTimeOffset.UtcNow.AddHours(12),
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        db.AddRange(
            student,
            course,
            assignment,
            new Enrollment { StudentUserId = student.Id.ToString(), CourseId = course.Id, Course = course });
        await db.SaveChangesAsync();

        var email = new RecordingEmailNotifications();
        var service = new UpcomingDeadlineNotificationService(db, email);

        Assert.Equal(1, await service.DispatchAsync());
        Assert.Single(await db.Notifications.ToListAsync());
        Assert.Single(email.Events);
        Assert.Equal("UpcomingDeadline", email.Events[0].EventName);
        Assert.Equal("student@betcco.test", email.Events[0].RecipientEmail);
        Assert.Equal(0, await service.DispatchAsync());
        Assert.Single(await db.Notifications.ToListAsync());
        Assert.Single(email.Events);
    }

    [Fact]
    public async Task Archived_or_expired_coursework_never_creates_a_deadline_reminder()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var course = new Course
        {
            Slug = "expired-deadline-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "teacher-1",
            IsFree = true,
            Status = CourseStatus.Archived
        };
        db.AddRange(
            course,
            new CourseAssignment
            {
                Course = course,
                CourseId = course.Id,
                ArabicTitle = "مهمة ضمن دورة مؤرشفة",
                EnglishTitle = "Assignment in archived course",
                ArabicInstructions = "التعليمات",
                EnglishInstructions = "Instructions",
                DueAtUtc = DateTimeOffset.UtcNow.AddHours(4),
                IsPublished = true,
                PublicationStatus = ContentPublicationStatus.Published
            },
            new Enrollment
            {
                StudentUserId = Guid.NewGuid().ToString(),
                CourseId = course.Id,
                AccessEndsAtUtc = DateTimeOffset.UtcNow.AddDays(1)
            });
        await db.SaveChangesAsync();

        Assert.Equal(0, await new UpcomingDeadlineNotificationService(db, new RecordingEmailNotifications()).DispatchAsync());
        Assert.Empty(await db.Notifications.ToListAsync());
    }

    private sealed class RecordingEmailNotifications : IEmailNotificationService
    {
        public List<PlatformEmailNotification> Events { get; } = [];

        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default)
        {
            Events.Add(notification);
            return Task.CompletedTask;
        }
    }
}
