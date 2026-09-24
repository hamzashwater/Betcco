using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class LearningAimPracticeFlowTests
{
    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Canonical_aim_count_order_and_server_progression_are_enforced(int count)
    {
        await using var database = await PostgresTestDatabase.CreateAsync("practice_progression");
        await using var db = database.CreateContext();
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
        Assert.Equal(PracticeReviewResult.Invalid, await service.ReviewPracticeAsync("other-teacher", submission.SubmissionId, review));
        Assert.Equal(PracticeReviewResult.Finalized, await service.ReviewPracticeAsync("teacher", submission.SubmissionId, review));
        Assert.Equal(PracticeReviewResult.Conflict, await service.ReviewPracticeAsync("teacher", submission.SubmissionId, review));
        var stored = await db.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submission.SubmissionId);
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

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSql_teacher_can_finalize_valid_submission_after_learner_access_expires()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("practice_review_expiry");
        await using var db = database.CreateContext();
        var (course, module, assignmentId, submissionId, firstLessonId) = await SeedSubmittedPracticeAsync(db);
        var otherCourse = new Course
        {
            LearningTrackId = course.LearningTrackId,
            Slug = "other-teacher-course",
            ArabicTitle = "دورة ثانية",
            EnglishTitle = "Other course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            TeacherUserId = "other-course-teacher",
            Status = CourseStatus.Published
        };
        db.Courses.Add(otherCourse);
        db.Enrollments.Add(new Enrollment
        {
            StudentUserId = "expired-student",
            CourseId = course.Id,
            AccessEndsAtUtc = DateTimeOffset.UtcNow.AddHours(1)
        });
        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "expired-student", LessonId = firstLessonId, IsCompleted = true });
        await db.SaveChangesAsync();

        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var pendingDraft = await service.StartSubmissionAsync("expired-student", assignmentId, "Before expiry");
        Assert.NotNull(pendingDraft);
        await using var pendingFile = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added,
            await service.AddFileAsync("expired-student", pendingDraft!.SubmissionId, "pending.pdf", "application/pdf", pendingFile.Length, pendingFile));
        var enrollment = await db.Enrollments.SingleAsync(x => x.CourseId == course.Id && x.StudentUserId == "student");
        var pendingEnrollment = await db.Enrollments.SingleAsync(x => x.CourseId == course.Id && x.StudentUserId == "expired-student");
        enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
        pendingEnrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
        await db.SaveChangesAsync();

        var review = new ReviewLearningAimPracticeCommand("Merit", "Strong evidence", "Needs detail", "Add detail next time");
        Assert.Null(await service.StartSubmissionAsync("expired-student", assignmentId, null));
        Assert.False(await service.SubmitAsync("expired-student", pendingDraft.SubmissionId));
        Assert.False((await access.CanAccessAsync("expired-student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Equal(PracticeReviewResult.Invalid, await service.ReviewPracticeAsync("other-teacher", submissionId, review));
        Assert.Equal(PracticeReviewResult.Invalid, await service.ReviewPracticeAsync("other-course-teacher", submissionId, review));
        Assert.Equal(PracticeReviewResult.Finalized, await service.ReviewPracticeAsync("teacher", submissionId, review));

        var stored = await db.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submissionId);
        Assert.Equal(CourseAssignmentSubmissionStatus.Finalized, stored.Status);
        Assert.Equal(TrainingOutcome.Merit, stored.TrainingOutcome);
        Assert.Equal("Strong evidence", stored.TrainingStrengths);
        var progress = await new LearningAimPracticeProgressService(db).GetAsync("student", module.Id);
        Assert.True(progress[0].IsComplete);
        Assert.True(progress[1].IsUnlocked);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Lesson,
            (await db.Lessons.AsNoTracking().SingleAsync(x => x.BtecLearningAimId == progress[1].Id)).Id)).IsAvailable);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task PostgreSql_competing_practice_reviews_finalize_once_without_overwriting_or_duplicate_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("practice_review_race");
        Guid moduleId;
        Guid submissionId;
        await using (var setup = database.CreateContext())
        {
            var seeded = await SeedSubmittedPracticeAsync(setup);
            moduleId = seeded.Module.Id;
            submissionId = seeded.SubmissionId;
        }

        await using var dbA = database.CreateContext();
        await using var dbB = database.CreateContext();
        Assert.Equal(CourseAssignmentSubmissionStatus.Submitted,
            (await dbA.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submissionId)).Status);
        Assert.Equal(CourseAssignmentSubmissionStatus.Submitted,
            (await dbB.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submissionId)).Status);
        var merit = new ReviewLearningAimPracticeCommand("Merit", "Merit strengths", "Merit gaps", "Merit guidance");
        var distinction = new ReviewLearningAimPracticeCommand("Distinction", "Distinction strengths", "Distinction gaps", "Distinction guidance");
        var serviceA = new CourseAssignmentService(dbA, null!, null!, new NullEmailNotifications(), new ContentAccessService(dbA));
        var serviceB = new CourseAssignmentService(dbB, null!, null!, new NullEmailNotifications(), new ContentAccessService(dbB));
        var results = await Task.WhenAll(
            serviceA.ReviewPracticeAsync("teacher", submissionId, merit),
            serviceB.ReviewPracticeAsync("teacher", submissionId, distinction));
        Assert.Equal(1, results.Count(x => x == PracticeReviewResult.Finalized));
        Assert.Equal(1, results.Count(x => x == PracticeReviewResult.Conflict));

        await using var verify = database.CreateContext();
        var stored = await verify.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submissionId);
        var winning = results[0] == PracticeReviewResult.Finalized ? merit : distinction;
        Assert.Equal(CourseAssignmentSubmissionStatus.Finalized, stored.Status);
        Assert.Equal(Enum.Parse<TrainingOutcome>(winning.TrainingOutcome), stored.TrainingOutcome);
        Assert.Equal(winning.Strengths, stored.TrainingStrengths);
        Assert.Equal(winning.Gaps, stored.TrainingGaps);
        Assert.Equal(winning.ImprovementGuidance, stored.TrainingImprovementGuidance);
        var audits = await verify.AuditLogs.AsNoTracking()
            .Where(x => x.Action == "LearningAimPracticeReviewed" && x.EntityId == submissionId.ToString())
            .ToArrayAsync();
        Assert.Single(audits);
        Assert.Equal(winning.TrainingOutcome, audits[0].MetadataJson);
        var progress = await new LearningAimPracticeProgressService(verify).GetAsync("student", moduleId);
        Assert.Equal(winning.TrainingOutcome, progress[0].TrainingOutcome);
        Assert.True(progress[1].IsUnlocked);

        var controller = new CourseAssignmentsController(
            new CourseAssignmentService(verify, null!, null!, new NullEmailNotifications(), new ContentAccessService(verify)),
            null!, null!, null!, verify, new ContentAccessService(verify), new CourseAssignmentDeadlineResolver(verify), null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "teacher")], "Test"))
                }
            }
        };
        var conflict = Assert.IsType<ConflictObjectResult>(await controller.ReviewPractice(submissionId, winning, CancellationToken.None));
        Assert.Equal(409, conflict.StatusCode);
        Assert.Single(await verify.AuditLogs.AsNoTracking()
            .Where(x => x.Action == "LearningAimPracticeReviewed" && x.EntityId == submissionId.ToString())
            .ToArrayAsync());
    }

    private static async Task<(Course Course, CourseModule Module, Guid AssignmentId, Guid SubmissionId, Guid FirstLessonId)> SeedSubmittedPracticeAsync(BetccoDbContext db)
    {
        var (course, module, aims, lessons) = await SeedAsync(db, 3);
        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student", LessonId = lessons[0].Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var assignmentId = (await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
            aims[0].Id, "نشاط", "Practice", "ارفع عملك", "Upload your work", null)))!.Value;
        var draft = (await service.StartSubmissionAsync("student", assignmentId, "My practice"))!;
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added,
            await service.AddFileAsync("student", draft.SubmissionId, "work.pdf", "application/pdf", file.Length, file));
        Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
        return (course, module, assignmentId, draft.SubmissionId, lessons[0].Id);
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
