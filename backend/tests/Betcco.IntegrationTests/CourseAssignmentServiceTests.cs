using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CourseAssignmentServiceTests
{
    [Fact]
    public async Task Enrolled_student_can_resubmit_private_coursework_and_receive_server_calculated_btec_grade()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec-coursework", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "btec-coursework",
            ArabicTitle = "دورة BTEC",
            EnglishTitle = "BTEC course",
            ArabicDescription = "وصف الدورة",
            EnglishDescription = "Course description",
            LearningTrack = track,
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var unit = new CourseModule { Course = course, CourseId = course.Id, ArabicTitle = "الوحدة أ", EnglishTitle = "Unit A", SortOrder = 1 };
        var assignmentLesson = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "المهمة",
            EnglishTitle = "Assignment",
            ArabicBody = "التعليمات",
            EnglishBody = "Instructions",
            Type = LessonType.Assignment,
            SortOrder = 1
        };
        db.AddRange(track, course, unit, assignmentLesson, new Enrollment { StudentUserId = "student-1", Course = course, CourseId = course.Id });
        await db.SaveChangesAsync();

        var storage = new MemoryFileStorage();
        var service = new CourseAssignmentService(db, storage, new CleanFileScanner(), new NullEmailNotifications(), new AllowAllContentAccess());
        var assignmentId = await service.CreateAsync("teacher-1", new CreateCourseAssignmentCommand(
            course.Id, unit.Id, assignmentLesson.Id, null,
            "مهمة القسم أ", "Section A coursework",
            "ارفع الحل الأصلي.", "Upload your original work.",
            null, DateTimeOffset.UtcNow.AddDays(3), 2, 100m));
        Assert.NotNull(assignmentId);
        Assert.Null(await service.StartSubmissionAsync("not-enrolled", assignmentId!.Value, null));

        var passId = await service.AddCriterionAsync("teacher-1", new AddCourseAssignmentCriterionCommand(assignmentId.Value, null, "A.P1", "Pass", "معيار نجاح", "Pass criterion", 1));
        var meritId = await service.AddCriterionAsync("teacher-1", new AddCourseAssignmentCriterionCommand(assignmentId.Value, null, "A.M1", "Merit", "معيار تفوق", "Merit criterion", 2));
        var distinctionId = await service.AddCriterionAsync("teacher-1", new AddCourseAssignmentCriterionCommand(assignmentId.Value, null, "A.D1", "Distinction", "معيار امتياز", "Distinction criterion", 3));
        Assert.NotNull(passId);
        Assert.NotNull(meritId);
        Assert.NotNull(distinctionId);
        Assert.True(await service.AddResourceAsync("teacher-1", assignmentId.Value, "brief.pdf", "private/test/brief", "application/pdf"));
        Assert.True(await service.PublishAsync("teacher-1", assignmentId.Value, true));

        var firstVersion = await service.StartSubmissionAsync("student-1", assignmentId.Value, "المحاولة الأولى");
        Assert.NotNull(firstVersion);
        await using var policyRejectedFile = new MemoryStream(new byte[] { 0, 1, 2 });
        Assert.Equal(CourseAssignmentFileAddStatus.RejectedByAssignmentPolicy, await service.AddFileAsync("student-1", firstVersion!.SubmissionId, "unsafe.exe", "application/octet-stream", policyRejectedFile.Length, policyRejectedFile));
        await using var rejectedFile = new MemoryStream(ValidPdfBytes());
        var rejectedService = new CourseAssignmentService(db, storage, new RejectedFileScanner(), new NullEmailNotifications(), new AllowAllContentAccess());
        Assert.Equal(CourseAssignmentFileAddStatus.Rejected, await rejectedService.AddFileAsync("student-1", firstVersion.SubmissionId, "unsafe.pdf", "application/pdf", rejectedFile.Length, rejectedFile));
        Assert.Equal(0, storage.WriteCount);

        await using var firstFile = new MemoryStream(ValidPdfBytes());
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student-1", firstVersion.SubmissionId, "work-v1.pdf", "application/pdf", firstFile.Length, firstFile));
        Assert.True(await service.SubmitAsync("student-1", firstVersion.SubmissionId));
        Assert.False(await service.RequestRevisionAsync("teacher-2", firstVersion.SubmissionId, "ليس لديك صلاحية."));
        Assert.True(await service.RequestRevisionAsync("teacher-1", firstVersion.SubmissionId, "أضف الأدلة للمحاولة التالية."));

        var secondVersion = await service.StartSubmissionAsync("student-1", assignmentId.Value, "المحاولة الثانية");
        Assert.NotNull(secondVersion);
        Assert.Equal(2, secondVersion!.VersionNumber);
        await using var secondFile = new MemoryStream(ValidPdfBytes());
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student-1", secondVersion.SubmissionId, "work-v2.pdf", "application/pdf", secondFile.Length, secondFile));
        Assert.True(await service.SubmitAsync("student-1", secondVersion.SubmissionId));
        Assert.False(await service.GradeAsync("teacher-2", secondVersion.SubmissionId, new AssignmentGradeCommand([], null)));
        Assert.False(await service.GradeAsync("teacher-1", secondVersion.SubmissionId, new AssignmentGradeCommand(
            [
                new AssignmentCriterionSubmission(passId!.Value, "999", null),
                new AssignmentCriterionSubmission(meritId!.Value, "Achieved", null),
                new AssignmentCriterionSubmission(distinctionId!.Value, "Achieved", null)
            ], null)));
        Assert.Empty(await db.CourseAssignmentCriterionResults.Where(item => item.CourseAssignmentSubmissionId == secondVersion.SubmissionId).ToListAsync());
        Assert.True(await service.GradeAsync("teacher-1", secondVersion.SubmissionId, new AssignmentGradeCommand(
            [
                new AssignmentCriterionSubmission(passId!.Value, "Achieved", "تم تحقيق P1."),
                new AssignmentCriterionSubmission(meritId!.Value, "Achieved", "تم تحقيق M1."),
                new AssignmentCriterionSubmission(distinctionId!.Value, "Achieved", "تم تحقيق D1.")
            ],
            "نتيجة ممتازة.",
            "ملاحظة داخلية للمعلم فقط.")));

        var stored = await db.CourseAssignmentSubmissions
            .Include(item => item.Versions).ThenInclude(item => item.Files)
            .Include(item => item.CriterionResults)
            .Include(item => item.FeedbackItems)
            .SingleAsync(item => item.Id == secondVersion.SubmissionId);
        Assert.Equal(CourseAssignmentSubmissionStatus.Graded, stored.Status);
        Assert.Equal(EvaluationGrade.Distinction, stored.CalculatedGrade);
        Assert.Null(stored.CalculatedScore);
        Assert.True(BtecAssessmentRuleSet.TryRead(stored.AssessmentRuleSetSnapshotJson, out var ruleSet));
        Assert.Equal("btec-internal-v1", ruleSet.Version);
        Assert.Equal(2, stored.Versions.Count);
        Assert.All(stored.CriterionResults, result => Assert.Equal(CriterionAchievement.Achieved, result.Achievement));
        Assert.Contains(stored.FeedbackItems, item => item.RequestsResubmission);
        Assert.Contains(stored.FeedbackItems, item => item.IsPrivate && item.Body == "ملاحظة داخلية للمعلم فقط.");
        Assert.Single(await db.CourseAssignmentResources.Where(item => item.CourseAssignmentId == assignmentId.Value).ToListAsync());
        Assert.Equal(2, storage.WriteCount);
    }

    private static byte[] ValidPdfBytes() => [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31];

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private sealed class CleanFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }

    private sealed class RejectedFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Rejected, "Test malware signature"));
    }

    private sealed class MemoryFileStorage : IFileStorage
    {
        public int WriteCount { get; private set; }

        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            WriteCount++;
            return Task.FromResult($"private/test/{WriteCount}");
        }

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(null);
    }

    private sealed class NullEmailNotifications : IEmailNotificationService
    {
        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class AllowAllContentAccess : IContentAccessService
    {
        public Task<ContentAccessDecision> CanAccessAsync(string studentUserId, Guid courseId, LearningContentType contentType, Guid contentId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(true));
        public Task<ContentAccessDecision> CanAccessCourseAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(true));
        public Task<IReadOnlyCollection<ContentReleaseConfiguration>> GetRulesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentReleaseConfiguration>>([]);
        public Task<IReadOnlyCollection<ContentPrerequisiteConfiguration>> GetPrerequisitesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentPrerequisiteConfiguration>>([]);
        public Task<bool> SetReleaseRuleAsync(string teacherUserId, ContentReleaseConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<Guid?> AddPrerequisiteAsync(string teacherUserId, ContentPrerequisiteConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(Guid.NewGuid());
        public Task<bool> RemovePrerequisiteAsync(string teacherUserId, Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
