using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CourseAssignmentDeadlineExtensionTests
{
    [Fact]
    public async Task PostgreSql_grant_enforces_owner_enrollment_history_uniqueness_and_student_deadlines()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("coursework_deadlines");
        await using var db = database.CreateContext();
        var now = DateTimeOffset.UtcNow;
        var baseDue = now.AddHours(-2);
        var extendedDue = now.AddHours(12);
        var track = new LearningTrack { Slug = "extension-track", ArabicName = "مسار", EnglishName = "Track" };
        var course = new Course
        {
            Slug = "extension-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher-owner",
            IsFree = true,
            Status = CourseStatus.Published
        };
        var assignment = new CourseAssignment
        {
            Course = course,
            ArabicTitle = "مهمة",
            EnglishTitle = "Assignment",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            DueAtUtc = baseDue,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var studentA = new ApplicationUser { Id = Guid.NewGuid(), UserName = "a@betcco.test", Email = "a@betcco.test", DisplayName = "Student A" };
        var studentB = new ApplicationUser { Id = Guid.NewGuid(), UserName = "b@betcco.test", Email = "b@betcco.test", DisplayName = "Student B" };
        db.AddRange(track, course, assignment, studentA, studentB,
            new Enrollment { StudentUserId = studentA.Id.ToString(), Course = course },
            new Enrollment { StudentUserId = studentB.Id.ToString(), Course = course });
        await db.SaveChangesAsync();

        var extensions = new CourseAssignmentDeadlineExtensionService(db);
        var resolver = new CourseAssignmentDeadlineResolver(db);
        var command = new GrantCourseAssignmentDeadlineExtension(studentA.Id.ToString(), extendedDue, "  Administrative adjustment  ");
        Assert.Equal(DeadlineExtensionWriteStatus.NotFound, (await extensions.GrantAsync("other-teacher", assignment.Id, command)).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.NotFound, (await extensions.GrantAsync(studentA.Id.ToString(), assignment.Id, command)).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await extensions.GrantAsync("teacher-owner", assignment.Id, command with { StudentUserId = "teacher-owner" })).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await extensions.GrantAsync("teacher-owner", assignment.Id, command with { StudentUserId = Guid.NewGuid().ToString() })).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await extensions.GrantAsync("teacher-owner", assignment.Id, command with { ExtendedDueAtUtc = baseDue })).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await extensions.GrantAsync("teacher-owner", assignment.Id, command with { Reason = " " })).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await extensions.GrantAsync("teacher-owner", assignment.Id, command with { Reason = new string('x', 501) })).Status);
        Assert.Equal(baseDue, (await resolver.ResolveAsync(assignment.Id, studentA.Id.ToString(), baseDue)).EffectiveDueAtUtc);

        var granted = await extensions.GrantAsync("teacher-owner", assignment.Id, command);
        Assert.Equal(DeadlineExtensionWriteStatus.Success, granted.Status);
        Assert.Equal("Administrative adjustment", granted.Extension!.Reason);
        Assert.Equal(DeadlineExtensionWriteStatus.Conflict, (await extensions.GrantAsync("teacher-owner", assignment.Id, command)).Status);
        Assert.Equal(extendedDue.ToUnixTimeMilliseconds(), (await resolver.ResolveAsync(assignment.Id, studentA.Id.ToString(), baseDue)).EffectiveDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal(baseDue, (await resolver.ResolveAsync(assignment.Id, studentB.Id.ToString(), baseDue)).EffectiveDueAtUtc);
        Assert.Equal(baseDue.ToUnixTimeMilliseconds(), (await db.CourseAssignments.AsNoTracking().SingleAsync()).DueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Null(await extensions.HistoryAsync("other-teacher", assignment.Id));
        Assert.Single((await extensions.HistoryAsync("teacher-owner", assignment.Id))!);
        Assert.Contains(await db.AuditLogs.ToListAsync(), item => item.Action == "CourseAssignmentDeadlineExtensionGranted" && item.ActorUserId == "teacher-owner" && !item.MetadataJson!.Contains("Administrative adjustment"));
        var reminders = new UpcomingDeadlineNotificationService(db, new NullEmail(), resolver);
        Assert.Equal(1, await reminders.DispatchAsync());
        Assert.Equal(0, await reminders.DispatchAsync());
        Assert.Contains(await db.Notifications.ToListAsync(), item => item.UserId == studentA.Id.ToString()
            && item.DeduplicationKey!.StartsWith($"deadline:{assignment.Id:N}:"));
        Assert.DoesNotContain(await db.Notifications.ToListAsync(), item => item.UserId == studentB.Id.ToString());

        var coursework = new CourseAssignmentService(db, null!, null!, new NullEmail(), new AllowContent(), deadlineResolver: resolver);
        var deniedContent = new CourseAssignmentService(db, null!, null!, new NullEmail(), new AllowContent(false), deadlineResolver: resolver);
        Assert.Null(await deniedContent.StartSubmissionAsync(studentA.Id.ToString(), assignment.Id, null));
        Assert.Null(await coursework.StartSubmissionAsync(studentB.Id.ToString(), assignment.Id, null));
        var draft = await coursework.StartSubmissionAsync(studentA.Id.ToString(), assignment.Id, null);
        Assert.NotNull(draft);
        var version = await db.CourseAssignmentSubmissionVersions.SingleAsync(item => item.CourseAssignmentSubmissionId == draft!.SubmissionId);
        db.CourseAssignmentSubmissionFiles.Add(new CourseAssignmentSubmissionFile
        {
            CourseAssignmentSubmissionVersionId = version.Id,
            OriginalFileName = "work.pdf",
            StorageKey = "private/test/work",
            ContentType = "application/pdf",
            LengthBytes = 6,
            ScanStatus = UploadScanStatus.Clean
        });
        await db.SaveChangesAsync();
        Assert.Equal(DeadlineExtensionWriteStatus.NotFound, (await extensions.RevokeAsync("other-teacher", assignment.Id, granted.Extension.Id, new(null))).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.RevokeAsync("teacher-owner", assignment.Id, granted.Extension.Id, new("  No longer needed  "))).Status);
        Assert.Equal(baseDue, (await resolver.ResolveAsync(assignment.Id, studentA.Id.ToString(), baseDue)).EffectiveDueAtUtc);
        Assert.False(await coursework.SubmitAsync(studentA.Id.ToString(), draft!.SubmissionId));
        Assert.Null(await coursework.StartSubmissionAsync(studentA.Id.ToString(), assignment.Id, null));
        var history = (await extensions.HistoryAsync("teacher-owner", assignment.Id))!;
        Assert.Single(history);
        Assert.Equal("No longer needed", history[0].RevocationReason);
        Assert.Contains(await db.AuditLogs.ToListAsync(), item => item.Action == "CourseAssignmentDeadlineExtensionRevoked" && item.ActorUserId == "teacher-owner");
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.GrantAsync("teacher-owner", assignment.Id, command)).Status);
        var enrollment = await db.Enrollments.SingleAsync(item => item.StudentUserId == studentA.Id.ToString());
        enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        Assert.False(await coursework.SubmitAsync(studentA.Id.ToString(), draft.SubmissionId));
        enrollment.AccessEndsAtUtc = null;
        await db.SaveChangesAsync();
        Assert.True(await coursework.SubmitAsync(studentA.Id.ToString(), draft.SubmissionId));

        await using var separate = database.CreateContext();
        separate.CourseAssignmentDeadlineExtensions.Add(new CourseAssignmentDeadlineExtension
        {
            CourseAssignmentId = assignment.Id,
            StudentUserId = studentA.Id.ToString(),
            BaseDueAtUtcSnapshot = baseDue,
            ExtendedDueAtUtc = extendedDue.AddHours(1),
            GrantedByUserId = "teacher-owner",
            GrantedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Concurrent grant"
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => separate.SaveChangesAsync());
    }

    [Fact]
    public async Task Grant_rejects_assignment_without_base_deadline_and_expired_enrollment()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("coursework_no_due");
        await using var db = database.CreateContext();
        var track = new LearningTrack { Slug = "no-due-track", ArabicName = "مسار", EnglishName = "Track" };
        var course = new Course { Slug = "no-due-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher-owner", IsFree = true, Status = CourseStatus.Published };
        var assignment = new CourseAssignment { Course = course, ArabicTitle = "مهمة", EnglishTitle = "Assignment", ArabicInstructions = "تعليمات", EnglishInstructions = "Instructions" };
        db.AddRange(track, course, assignment, new Enrollment { StudentUserId = "student-1", Course = course, AccessEndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1) });
        await db.SaveChangesAsync();
        var service = new CourseAssignmentDeadlineExtensionService(db);
        var command = new GrantCourseAssignmentDeadlineExtension("student-1", DateTimeOffset.UtcNow.AddDays(1), "Operational reason");
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await service.GrantAsync("teacher-owner", assignment.Id, command)).Status);
        var enrollment = await db.Enrollments.SingleAsync();
        enrollment.AccessEndsAtUtc = null;
        assignment.IsPublished = true;
        assignment.PublicationStatus = ContentPublicationStatus.Published;
        await db.SaveChangesAsync();
        var coursework = new CourseAssignmentService(db, null!, null!, new NullEmail(), new AllowContent());
        Assert.NotNull(await coursework.StartSubmissionAsync("student-1", assignment.Id, null));
        assignment.DueAtUtc = DateTimeOffset.UtcNow.AddHours(1);
        await db.SaveChangesAsync();
        enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        Assert.Equal(DeadlineExtensionWriteStatus.Invalid, (await service.GrantAsync("teacher-owner", assignment.Id, command)).Status);
        Assert.Null((await new CourseAssignmentDeadlineResolver(db).ResolveAsync(assignment.Id, "student-1", null)).EffectiveDueAtUtc);
        enrollment.AccessEndsAtUtc = null;
        assignment.DueAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await db.SaveChangesAsync();
        var expired = await service.GrantAsync("teacher-owner", assignment.Id, command with { ExtendedDueAtUtc = DateTimeOffset.UtcNow.AddHours(-1) });
        Assert.Equal(DeadlineExtensionWriteStatus.Success, expired.Status);
        Assert.Null(await coursework.StartSubmissionAsync("student-1", assignment.Id, null));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await service.RevokeAsync("teacher-owner", assignment.Id, expired.Extension!.Id, new(null))).Status);
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await service.GrantAsync("teacher-owner", assignment.Id, command)).Status);
        var submission = await db.CourseAssignmentSubmissions.SingleAsync();
        submission.Status = CourseAssignmentSubmissionStatus.Submitted;
        await db.SaveChangesAsync();
        Assert.Null(await coursework.StartSubmissionAsync("student-1", assignment.Id, null));
    }

    private sealed class NullEmail : IEmailNotificationService
    {
        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class AllowContent(bool allowed = true) : IContentAccessService
    {
        public Task<ContentAccessDecision> CanAccessAsync(string studentUserId, Guid courseId, LearningContentType contentType, Guid contentId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(allowed));
        public Task<ContentAccessDecision> CanAccessCourseAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(allowed));
        public Task<IReadOnlyCollection<ContentReleaseConfiguration>> GetRulesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentReleaseConfiguration>>([]);
        public Task<IReadOnlyCollection<ContentPrerequisiteConfiguration>> GetPrerequisitesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentPrerequisiteConfiguration>>([]);
        public Task<bool> SetReleaseRuleAsync(string teacherUserId, ContentReleaseConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<Guid?> AddPrerequisiteAsync(string teacherUserId, ContentPrerequisiteConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(Guid.NewGuid());
        public Task<bool> RemovePrerequisiteAsync(string teacherUserId, Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
