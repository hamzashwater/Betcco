using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class LearningAimPracticeFlowTests
{
    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    public async Task Canonical_aim_count_order_and_server_progression_are_enforced(int count)
    {
        await using var db = CreateDb();
        var (course, module, aims, lessons) = await SeedAsync(db, count);
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var progress = new LearningAimPracticeProgressService(db);
        var assignmentIds = new List<Guid>();
        foreach (var aim in aims)
        {
            var id = await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
                aim.Id, "نشاط", "Practice", "ارفع عملك", "Upload your work", null));
            Assert.NotNull(id);
            assignmentIds.Add(id!.Value);
        }
        Assert.Null(await service.CreatePracticeAsync("other-teacher", new CreateLearningAimPracticeCommand(
            aims[0].Id, "نشاط", "Practice", "ارفع", "Upload", null)));
        Assert.Null(await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
            aims[0].Id, "نشاط", "Practice", "ارفع", "Upload", null)));

        var initial = await progress.GetAsync("student", module.Id);
        Assert.Equal(count, initial.Count);
        Assert.Equal(Enumerable.Range(0, count).Select(i => ((char)('A' + i)).ToString()), initial.Select(x => x.Code));
        Assert.True(initial[0].IsUnlocked);
        Assert.All(initial.Skip(1), x => Assert.False(x.IsUnlocked));
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Lesson, lessons[1].Id)).IsAvailable);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentIds[0])).IsAvailable);
        Assert.Null(await service.StartSubmissionAsync("student", assignmentIds[0], null));
        Assert.Null(await service.StartSubmissionAsync("outsider", assignmentIds[0], null));

        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student", LessonId = lessons[0].Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var ready = await progress.GetAsync("student", module.Id);
        Assert.True(ready[0].ContentComplete);
        Assert.True(ready[0].PracticeAvailable);
        Assert.False(ready[1].IsUnlocked);
        Assert.True((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentIds[0])).IsAvailable);

        var submission = await service.StartSubmissionAsync("student", assignmentIds[0], "my work");
        Assert.NotNull(submission);
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added,
            await service.AddFileAsync("student", submission!.SubmissionId, "work.pdf", "application/pdf", file.Length, file));
        Assert.True(await service.SubmitAsync("student", submission.SubmissionId));
        Assert.False((await progress.GetAsync("student", module.Id))[1].IsUnlocked);
        Assert.False(await service.GradeAsync("teacher", submission.SubmissionId, new AssignmentGradeCommand([], null)));
        var review = new ReviewLearningAimPracticeCommand("Merit", "Strong evidence", "Missing explanation", "Explain the method");
        Assert.False(await service.ReviewPracticeAsync("other-teacher", submission.SubmissionId, review));
        Assert.True(await service.ReviewPracticeAsync("teacher", submission.SubmissionId, review));
        Assert.False(await service.ReviewPracticeAsync("teacher", submission.SubmissionId, review));
        var stored = await db.CourseAssignmentSubmissions.SingleAsync(x => x.Id == submission.SubmissionId);
        Assert.Null(stored.CalculatedGrade);
        Assert.Equal(TrainingOutcome.Merit, stored.TrainingOutcome);
        Assert.Equal(CourseAssignmentSubmissionStatus.Finalized, stored.Status);
        var after = await progress.GetAsync("student", module.Id);
        Assert.True(after[0].IsComplete);
        Assert.Equal("Merit", after[0].TrainingOutcome);
        Assert.True(after[1].IsUnlocked);
        Assert.False(after[2].IsUnlocked);
        Assert.True((await access.CanAccessAsync("student", course.Id, LearningContentType.Lesson, lessons[1].Id)).IsAvailable);
        Assert.False((await access.CanAccessAsync("outsider", course.Id, LearningContentType.Lesson, lessons[1].Id)).IsAvailable);
        Assert.Null((await progress.GetAsync("outsider", module.Id))[0].TrainingOutcome);
    }

    [Fact]
    public async Task Foreign_canonical_aim_is_rejected_and_archived_content_does_not_block_practice()
    {
        await using var db = CreateDb();
        var (_, module, aims, lessons) = await SeedAsync(db, 3);
        var foreignUnit = new UnitDefinition { QualificationVersionId = Guid.NewGuid(), Code = "X", ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var foreignDefinition = new LearningAimDefinition { UnitDefinition = foreignUnit, Code = "X", ArabicTitle = "هدف", EnglishTitle = "Aim", ArabicDescription = "Description", EnglishDescription = "Description", SourceReference = "test" };
        var foreignAim = new BtecLearningAim { CourseModuleId = module.Id, LearningAimDefinition = foreignDefinition, Code = "X", ArabicTitle = "هدف", EnglishTitle = "Aim" };
        db.AddRange(foreignUnit, foreignDefinition, foreignAim);
        db.Lessons.Add(new Lesson
        {
            CourseModuleId = module.Id,
            BtecLearningAimId = aims[0].Id,
            ArabicTitle = "قديم",
            EnglishTitle = "Archived",
            Type = LessonType.LegacyArchived,
            IsPublished = true
        });
        await db.SaveChangesAsync();
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(db));
        Assert.Null(await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
            foreignAim.Id, "نشاط", "Practice", "ارفع", "Upload", null)));
        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student", LessonId = lessons[0].Id, IsCompleted = true });
        await db.SaveChangesAsync();
        Assert.True((await new LearningAimPracticeProgressService(db).GetAsync("student", module.Id))[0].ContentComplete);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSql_practice_access_and_submission_honor_student_specific_effective_deadline()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("practice_deadline");
        await using var db = database.CreateContext();
        var (course, module, aims, lessons) = await SeedAsync(db, 3);
        db.Enrollments.Add(new Enrollment { StudentUserId = "student-b", CourseId = course.Id });
        db.LessonProgresses.AddRange(
            new LessonProgress { StudentUserId = "student", LessonId = lessons[0].Id, IsCompleted = true },
            new LessonProgress { StudentUserId = "student-b", LessonId = lessons[0].Id, IsCompleted = true });
        await db.SaveChangesAsync();

        var access = new ContentAccessService(db);
        var submissions = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var progress = new LearningAimPracticeProgressService(db);
        var assignmentId = (await submissions.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
            aims[0].Id, "نشاط", "Practice", "ارفع عملك", "Upload your work", DateTimeOffset.UtcNow.AddHours(2))))!.Value;
        Assert.True((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.True((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);

        var assignment = await db.CourseAssignments.SingleAsync(x => x.Id == assignmentId);
        assignment.DueAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await db.SaveChangesAsync();
        Assert.False((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await submissions.StartSubmissionAsync("student", assignmentId, null));

        var extensions = new CourseAssignmentDeadlineExtensionService(db);
        var expired = await extensions.GrantAsync("teacher", assignmentId,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(-1), "Expired extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, expired.Status);
        Assert.False((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await submissions.StartSubmissionAsync("student", assignmentId, null));
        Assert.Equal(DeadlineExtensionWriteStatus.Success,
            (await extensions.RevokeAsync("teacher", assignmentId, expired.Extension!.Id, new(null))).Status);

        var command = new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(2), "Practice extension");
        var granted = await extensions.GrantAsync("teacher", assignmentId, command);
        Assert.Equal(DeadlineExtensionWriteStatus.Success, granted.Status);
        Assert.True((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.True((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.False((await progress.GetAsync("student-b", module.Id))[0].PracticeAvailable);
        Assert.False((await access.CanAccessAsync("student-b", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await submissions.StartSubmissionAsync("student-b", assignmentId, null));
        Assert.False((await progress.GetAsync("student", module.Id))[1].IsUnlocked);

        var draft = await submissions.StartSubmissionAsync("student", assignmentId, "My practice");
        Assert.NotNull(draft);
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added,
            await submissions.AddFileAsync("student", draft!.SubmissionId, "work.pdf", "application/pdf", file.Length, file));
        Assert.Equal(DeadlineExtensionWriteStatus.Success,
            (await extensions.RevokeAsync("teacher", assignmentId, granted.Extension!.Id, new(null))).Status);
        var expiredAgain = await extensions.GrantAsync("teacher", assignmentId,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(-1), "Expired extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, expiredAgain.Status);
        Assert.False((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await submissions.StartSubmissionAsync("student", assignmentId, null));
        Assert.False(await submissions.SubmitAsync("student", draft.SubmissionId));
        Assert.Equal(DeadlineExtensionWriteStatus.Success,
            (await extensions.RevokeAsync("teacher", assignmentId, expiredAgain.Extension!.Id, new(null))).Status);
        Assert.False((await progress.GetAsync("student", module.Id))[0].PracticeAvailable);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await submissions.StartSubmissionAsync("student", assignmentId, null));
        Assert.False(await submissions.SubmitAsync("student", draft.SubmissionId));

        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.GrantAsync("teacher", assignmentId, command)).Status);
        Assert.True(await submissions.SubmitAsync("student", draft.SubmissionId));
        Assert.False((await progress.GetAsync("student", module.Id))[1].IsUnlocked);
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<(Course Course, CourseModule Module, BtecLearningAim[] Aims, Lesson[] Lessons)> SeedAsync(BetccoDbContext db, int count)
    {
        var track = new LearningTrack { Slug = "practice", ArabicName = "بيتك", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            LearningTrack = track,
            Slug = "practice",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            TeacherUserId = "teacher",
            Status = CourseStatus.Published
        };
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "Approved source" };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var module = new CourseModule { Course = course, UnitDefinition = unit, ArabicTitle = "وحدة", EnglishTitle = "Unit", IsPublished = true };
        var definitions = Enumerable.Range(0, count).Select(i => new LearningAimDefinition
        {
            UnitDefinition = unit,
            Code = ((char)('A' + i)).ToString(),
            ArabicTitle = $"هدف {i}",
            EnglishTitle = $"Aim {i}",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            SourceReference = "approved",
            SortOrder = i
        }).ToArray();
        var aims = definitions.Select((definition, i) => new BtecLearningAim
        {
            CourseModule = module,
            LearningAimDefinition = definition,
            Code = definition.Code,
            ArabicTitle = definition.ArabicTitle,
            EnglishTitle = definition.EnglishTitle,
            SortOrder = count - i,
            PublicationStatus = ContentPublicationStatus.Published
        }).ToArray();
        var lessons = aims.Select((aim, i) => new Lesson
        {
            CourseModule = module,
            BtecLearningAim = aim,
            ArabicTitle = $"درس {i}",
            EnglishTitle = $"Lesson {i}",
            Type = LessonType.Text,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        }).ToArray();
        db.AddRange(track, course, qualification, version, unit, module);
        db.AddRange(definitions); db.AddRange(aims); db.AddRange(lessons);
        db.Enrollments.Add(new Enrollment { StudentUserId = "student", Course = course });
        await db.SaveChangesAsync();
        return (course, module, aims, lessons);
    }

    private sealed class CleanFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
    private sealed class MemoryFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult($"private/{Guid.NewGuid()}");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }
    private sealed class NullEmailNotifications : IEmailNotificationService
    {
        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
