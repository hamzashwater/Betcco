using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class LegacyQuizMigrationTests
{
    [Fact]
    public void Persisted_content_type_values_remain_stable()
    {
        Assert.Equal(0, (int)LessonType.Text);
        Assert.Equal(1, (int)LessonType.Video);
        Assert.Equal(2, (int)LessonType.LegacyArchived);
        Assert.Equal(3, (int)LessonType.Assignment);
        Assert.Equal(4, (int)LessonType.LiveSession);
        Assert.Equal(5, (int)LessonType.Activity);
        Assert.Equal(0, (int)LearningContentType.Course);
        Assert.Equal(1, (int)LearningContentType.Unit);
        Assert.Equal(2, (int)LearningContentType.Lesson);
        Assert.Equal(4, (int)LearningContentType.Assignment);
        Assert.Equal(2, (int)ContentPublicationStatus.Archived);
        Assert.False(Enum.IsDefined(typeof(LearningContentType), 3));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Upgrade_archives_legacy_lesson_and_preserves_unrelated_history()
    {
        await using var database = await PostgresTestDatabase.CreateAsync(
            "legacyquiz", targetMigration: "20260923183826_AddAcademicProgrammeAuthority");

        var track = new LearningTrack { Slug = "legacy-migration", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "legacy-grade", ArabicName = "صف", EnglishName = "Grade", LearningTrackId = track.Id };
        var specialization = new Specialization { Slug = "legacy-specialization", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrackId = track.Id };
        var taskType = new TaskType { ArabicName = "مهمة", EnglishName = "Task" };
        var rubric = new RubricTemplate { ArabicTitle = "معايير", EnglishTitle = "Rubric" };
        var course = new Course
        {
            Slug = "legacy-quiz-migration",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = track.Id,
            TeacherUserId = "teacher",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var module = new CourseModule { CourseId = course.Id, ArabicTitle = "وحدة", EnglishTitle = "Unit", IsPublished = true };
        var legacy = new Lesson
        {
            CourseModuleId = module.Id,
            ArabicTitle = "اختبار قديم",
            EnglishTitle = "Old quiz",
            ArabicBody = "قديم",
            EnglishBody = "Historical",
            Type = LessonType.LegacyArchived,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published,
            SortOrder = 1
        };
        var regular = new Lesson
        {
            CourseModuleId = module.Id,
            ArabicTitle = "نص",
            EnglishTitle = "Text",
            Type = LessonType.Text,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published,
            SortOrder = 2
        };
        var enrollment = new Enrollment { CourseId = course.Id, StudentUserId = "student" };
        var progress = new LessonProgress { LessonId = legacy.Id, StudentUserId = "student", IsCompleted = true };
        var note = new LessonNote { LessonId = legacy.Id, StudentUserId = "student", Body = "Historical note" };
        var bookmark = new LessonBookmark { LessonId = legacy.Id, StudentUserId = "student" };
        var resource = new LessonResource
        {
            LessonId = legacy.Id,
            DisplayName = "Historical resource",
            StorageKey = "private/old-resource",
            ContentType = "application/pdf"
        };
        var assignment = new CourseAssignment
        {
            CourseId = course.Id,
            CourseModuleId = module.Id,
            ArabicTitle = "واجب",
            EnglishTitle = "Assignment",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            IsPublished = true
        };
        var submission = new CourseAssignmentSubmission { CourseAssignmentId = assignment.Id, StudentUserId = "student" };
        var evaluation = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = taskType.Id,
            RubricTemplateId = rubric.Id
        };
        var payment = new Payment { UserId = "student", Purpose = "Evaluation", ReferenceId = evaluation.Id, Total = 1 };
        var keepRule = new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Lesson, TargetId = regular.Id };
        var keepAssignmentRule = new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Assignment, TargetId = assignment.Id };
        var removeRule = new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Lesson, TargetId = legacy.Id };
        var removeQuizRule = new ContentAccessRule { CourseId = course.Id, TargetType = (LearningContentType)3, TargetId = Guid.NewGuid() };
        var removeQuizPreviousRule = new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Course, TargetId = course.Id, PreviousContentType = (LearningContentType)3, PreviousContentId = Guid.NewGuid() };
        var keepPrerequisite = new ContentPrerequisite { CourseId = course.Id, TargetType = LearningContentType.Lesson, TargetId = regular.Id, RequiredContentType = LearningContentType.Unit, RequiredContentId = module.Id };
        var removePrerequisite = new ContentPrerequisite { CourseId = course.Id, TargetType = LearningContentType.Assignment, TargetId = assignment.Id, RequiredContentType = LearningContentType.Lesson, RequiredContentId = legacy.Id };
        var removeQuizPrerequisite = new ContentPrerequisite { CourseId = course.Id, TargetType = (LearningContentType)3, TargetId = Guid.NewGuid(), RequiredContentType = LearningContentType.Unit, RequiredContentId = module.Id };
        var removeQuizRequiredPrerequisite = new ContentPrerequisite { CourseId = course.Id, TargetType = LearningContentType.Assignment, TargetId = assignment.Id, RequiredContentType = (LearningContentType)3, RequiredContentId = Guid.NewGuid() };

        await using (var before = database.CreateContext())
        {
            before.AddRange(track, grade, specialization, taskType, rubric, course, module, legacy, regular,
                enrollment, progress, note, bookmark, resource, evaluation, payment,
                keepRule, keepAssignmentRule, removeRule, removeQuizRule, removeQuizPreviousRule,
                keepPrerequisite, removePrerequisite, removeQuizPrerequisite, removeQuizRequiredPrerequisite);
            await before.SaveChangesAsync();

            // This test seeds a previous schema. The current EF model includes
            // additive practice columns that do not exist until the upgrade.
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "CourseAssignments" ("Id", "CourseId", "CourseModuleId", "ArabicTitle", "EnglishTitle", "ArabicInstructions", "EnglishInstructions", "MaxSubmissionAttempts", "IsPublished", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
                VALUES ({assignment.Id}, {course.Id}, {module.Id}, 'واجب', 'Assignment', 'تعليمات', 'Instructions', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE);
                """);
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "CourseAssignmentSubmissions" ("Id", "CourseAssignmentId", "StudentUserId", "Status", "CurrentVersionNumber", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
                VALUES ({submission.Id}, {assignment.Id}, 'student', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE);
                """);

            var quizId = Guid.NewGuid();
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "Quizzes" ("Id", "AllowLateAttempts", "ArabicTitle", "CourseId", "CreatedAtUtc", "EnglishTitle", "IsDeleted", "IsPublished", "LessonId", "PassMark", "PublicationStatus", "RandomizeAnswers", "RandomizeQuestions", "ShowAnswers", "ShowScore", "UpdatedAtUtc")
                VALUES ({quizId}, FALSE, 'اختبار', {course.Id}, CURRENT_TIMESTAMP, 'Quiz', FALSE, TRUE, {legacy.Id}, 50, 1, FALSE, FALSE, TRUE, TRUE, CURRENT_TIMESTAMP);
                """);
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "QuizQuestions" ("Id", "QuizId", "ArabicText", "CorrectAnswersJson", "CreatedAtUtc", "EnglishText", "IsDeleted", "OptionsJson", "SortOrder", "Type", "UpdatedAtUtc")
                VALUES ({Guid.NewGuid()}, {quizId}, 'سؤال', '[]', CURRENT_TIMESTAMP, 'Question', FALSE, '[]', 1, 0, CURRENT_TIMESTAMP);
                """);
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "QuizAttempts" ("Id", "AnswersJson", "CreatedAtUtc", "IsDeleted", "Passed", "QuizId", "RequiresManualReview", "ScorePercent", "StudentUserId", "UpdatedAtUtc", "WasLate")
                VALUES ({Guid.NewGuid()}, '[]', CURRENT_TIMESTAMP, FALSE, TRUE, {quizId}, FALSE, 100, 'student', CURRENT_TIMESTAMP, FALSE);
                """);
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "QuestionBankQuestions" ("Id", "ArabicText", "CorrectAnswersJson", "CourseId", "CreatedAtUtc", "Difficulty", "EnglishText", "IsDeleted", "OptionsJson", "TeacherUserId", "Type", "UpdatedAtUtc")
                VALUES ({Guid.NewGuid()}, 'سؤال', '[]', {course.Id}, CURRENT_TIMESTAMP, 1, 'Question', FALSE, '[]', 'teacher', 0, CURRENT_TIMESTAMP);
                """);
        }

        await using (var upgrade = database.CreateContext())
            await upgrade.GetService<IMigrator>().MigrateAsync();

        await using var after = database.CreateContext();
        var archived = await after.Lessons.AsNoTracking().SingleAsync(x => x.Id == legacy.Id);
        Assert.Equal(module.Id, archived.CourseModuleId);
        Assert.Equal(LessonType.LegacyArchived, archived.Type);
        Assert.False(archived.IsPublished);
        Assert.Equal(ContentPublicationStatus.Archived, archived.PublicationStatus);
        Assert.Equal("Historical", archived.EnglishBody);
        Assert.True(await after.LessonProgresses.AnyAsync(x => x.Id == progress.Id && x.IsCompleted));
        Assert.True(await after.LessonNotes.AnyAsync(x => x.Id == note.Id && x.LessonId == legacy.Id));
        Assert.True(await after.LessonBookmarks.AnyAsync(x => x.Id == bookmark.Id && x.LessonId == legacy.Id));
        Assert.True(await after.LessonResources.AnyAsync(x => x.Id == resource.Id && x.LessonId == legacy.Id));
        Assert.True(await after.Lessons.AnyAsync(x => x.Id == regular.Id && x.Type == LessonType.Text && x.IsPublished));
        Assert.True(await after.Courses.AnyAsync(x => x.Id == course.Id));
        Assert.True(await after.Enrollments.AnyAsync(x => x.Id == enrollment.Id));
        Assert.True(await after.CourseAssignments.AnyAsync(x => x.Id == assignment.Id));
        Assert.True(await after.CourseAssignmentSubmissions.AnyAsync(x => x.Id == submission.Id));
        Assert.True(await after.EvaluationRequests.AnyAsync(x => x.Id == evaluation.Id));
        Assert.True(await after.Payments.AnyAsync(x => x.Id == payment.Id));
        Assert.True(await after.ContentAccessRules.AnyAsync(x => x.Id == keepRule.Id));
        Assert.True(await after.ContentAccessRules.AnyAsync(x => x.Id == keepAssignmentRule.Id));
        Assert.False(await after.ContentAccessRules.AnyAsync(x => x.Id == removeRule.Id || x.Id == removeQuizRule.Id || x.Id == removeQuizPreviousRule.Id));
        Assert.True(await after.ContentPrerequisites.AnyAsync(x => x.Id == keepPrerequisite.Id));
        Assert.False(await after.ContentPrerequisites.AnyAsync(x => x.Id == removePrerequisite.Id || x.Id == removeQuizPrerequisite.Id || x.Id == removeQuizRequiredPrerequisite.Id));

        var connection = after.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var tables = connection.CreateCommand();
        tables.CommandText = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Quizzes', 'QuizQuestions', 'QuizAttempts', 'QuizAttemptQuestionGrades', 'QuestionBankQuestions')";
        Assert.Equal(0L, Convert.ToInt64(await tables.ExecuteScalarAsync()));
    }
}
