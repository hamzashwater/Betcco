using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class LegacyQuizMigrationGateTests
{
    private const string PreviousMigration = "20260923183826_AddAcademicProgrammeAuthority";
    private const string PrivateQuestion = "SHOULD_NOT_OUTPUT_QUESTION_12A";
    private const string PrivateAnswer = "PRIVATE_STUDENT_ANSWER_7E";
    private const string PrivateStudentId = "student-private-identifier-99";
    private const string PrivateFeedback = "CONFIDENTIAL_TEACHER_FEEDBACK_55";

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Applied_removal_migration_is_not_applicable_without_querying_removed_tables()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("legacyquizgate-applied");
        await using var db = database.CreateContext();

        var result = await new LegacyQuizMigrationGate(db).PreflightAsync();

        Assert.Equal(LegacyQuizPreflightState.AlreadyApplied, result.State);
        Assert.Equal("LEGACY_QUIZ_MIGRATION_ALREADY_APPLIED", result.Code);
        Assert.Null(result.Inventory);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Fresh_empty_database_is_clear_and_migrates_without_override()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("legacyquizgate-fresh", migrateToLatest: false);
        await using var db = database.CreateContext();
        var gate = new LegacyQuizMigrationGate(db);

        var preflight = await gate.PreflightAsync();
        Assert.True(preflight.State == LegacyQuizPreflightState.Clear, preflight.FormatSummary());
        Assert.Equal(new LegacyQuizInventory(0, 0, 0, 0, 0, 0, 0), preflight.Inventory);

        var migration = await gate.MigrateAsync(allowLegacyQuizDataRemoval: false);

        Assert.True(migration.MigrationCompleted);
        Assert.Equal("LEGACY_QUIZ_MIGRATION_CLEAR", migration.Preflight.Code);
        Assert.Contains(LegacyQuizMigrationGate.RemovalMigrationId, await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Pending_migration_with_historical_schema_and_no_legacy_rows_is_clear_and_proceeds()
    {
        await using var database = await CreateHistoricalDatabaseAsync("legacyquizgate-empty");
        await using var db = database.CreateContext();
        var gate = new LegacyQuizMigrationGate(db);

        var preflight = await gate.PreflightAsync();
        Assert.Equal(LegacyQuizPreflightState.Clear, preflight.State);
        Assert.Equal(new LegacyQuizInventory(0, 0, 0, 0, 0, 0, 0), preflight.Inventory);

        var migration = await gate.MigrateAsync(allowLegacyQuizDataRemoval: false);

        Assert.True(migration.MigrationCompleted);
        Assert.Contains(LegacyQuizMigrationGate.RemovalMigrationId, await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Pending_migration_with_legacy_data_is_read_only_and_blocks_default_migrate()
    {
        await using var database = await CreateHistoricalDatabaseAsync("legacyquizgate-blocked");
        SeededLegacyData seeded;
        await using (var seed = database.CreateContext()) seeded = await SeedLegacyDataAsync(seed);
        await using var db = database.CreateContext();
        var gate = new LegacyQuizMigrationGate(db);

        var preflight = await gate.PreflightAsync();
        var migration = await gate.MigrateAsync(allowLegacyQuizDataRemoval: false);

        var expected = new LegacyQuizInventory(1, 1, 1, 1, 1, 3, 3);
        Assert.Equal(LegacyQuizPreflightState.RequiresReview, preflight.State);
        Assert.Equal(expected, preflight.Inventory);
        Assert.False(migration.MigrationCompleted);
        Assert.Equal("LEGACY_QUIZ_DATA_REQUIRES_REVIEW", migration.Preflight.Code);
        Assert.Equal(expected, migration.Preflight.Inventory);
        Assert.Contains(LegacyQuizMigrationGate.RemovalMigrationId, await db.Database.GetPendingMigrationsAsync());
        Assert.DoesNotContain(LegacyQuizMigrationGate.RemovalMigrationId, await db.Database.GetAppliedMigrationsAsync());
        Assert.Equal(expected, (await gate.PreflightAsync()).Inventory);
        var unchangedLesson = await db.Lessons.AsNoTracking().SingleAsync(lesson => lesson.Id == seeded.LessonId);
        Assert.True(unchangedLesson.IsPublished);
        Assert.Equal(ContentPublicationStatus.Published, unchangedLesson.PublicationStatus);
        Assert.Equal(1L, await ScalarCountAsync(db, "SELECT count(*) FROM \"Quizzes\""));

        var output = migration.Preflight.FormatSummary();
        Assert.DoesNotContain(PrivateQuestion, output);
        Assert.DoesNotContain(PrivateAnswer, output);
        Assert.DoesNotContain(PrivateStudentId, output);
        Assert.DoesNotContain(PrivateFeedback, output);
        Assert.DoesNotContain(seeded.LessonId.ToString(), output);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Explicit_override_runs_the_existing_migration_and_preserves_archived_lesson()
    {
        await using var database = await CreateHistoricalDatabaseAsync("legacyquizgate-override");
        SeededLegacyData seeded;
        await using (var seed = database.CreateContext()) seeded = await SeedLegacyDataAsync(seed);
        await using var db = database.CreateContext();
        var reportedBeforeMigration = false;

        var migration = await new LegacyQuizMigrationGate(db).MigrateAsync(
            allowLegacyQuizDataRemoval: true,
            reportPreflight: preflight =>
            {
                Assert.Equal(LegacyQuizPreflightState.RequiresReview, preflight.State);
                Assert.Equal(new LegacyQuizInventory(1, 1, 1, 1, 1, 3, 3), preflight.Inventory);
                reportedBeforeMigration = true;
            });

        Assert.True(reportedBeforeMigration);
        Assert.True(migration.MigrationCompleted);
        Assert.Equal(LegacyQuizPreflightState.RequiresReview, migration.Preflight.State);
        Assert.Equal(new LegacyQuizInventory(1, 1, 1, 1, 1, 3, 3), migration.Preflight.Inventory);
        Assert.Contains(LegacyQuizMigrationGate.RemovalMigrationId, await db.Database.GetAppliedMigrationsAsync());

        var archivedLesson = await db.Lessons.AsNoTracking().SingleAsync(lesson => lesson.Id == seeded.LessonId);
        Assert.Equal(LessonType.LegacyArchived, archivedLesson.Type);
        Assert.False(archivedLesson.IsPublished);
        Assert.Equal(ContentPublicationStatus.Archived, archivedLesson.PublicationStatus);
        Assert.Equal(0L, await ScalarCountAsync(db, "SELECT count(*) FROM \"ContentPrerequisites\""));
        Assert.Equal(0L, await ScalarCountAsync(db, "SELECT count(*) FROM \"ContentAccessRules\""));
        Assert.Equal(0L, await ScalarCountAsync(db,
            "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Quizzes', 'QuizQuestions', 'QuizAttempts', 'QuizAttemptQuestionGrades', 'QuestionBankQuestions')"));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Missing_historical_table_fails_closed_without_recording_the_destructive_migration()
    {
        await using var database = await CreateHistoricalDatabaseAsync("legacyquizgate-drift");
        await using (var db = database.CreateContext())
            await db.Database.ExecuteSqlRawAsync("DROP TABLE \"QuizAttempts\" CASCADE");
        await using var check = database.CreateContext();

        var preflight = await new LegacyQuizMigrationGate(check).PreflightAsync();
        var migration = await new LegacyQuizMigrationGate(check).MigrateAsync(allowLegacyQuizDataRemoval: true);

        Assert.Equal(LegacyQuizPreflightState.Indeterminate, preflight.State);
        Assert.Contains("QuizAttempts", preflight.Diagnostics!);
        Assert.False(migration.MigrationCompleted);
        Assert.Equal("LEGACY_QUIZ_PREFLIGHT_INDETERMINATE", migration.Preflight.Code);
        Assert.DoesNotContain(LegacyQuizMigrationGate.RemovalMigrationId, await check.Database.GetAppliedMigrationsAsync());
        Assert.Equal(1L, await ScalarCountAsync(check,
            "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Quizzes'"));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_approved_migrations_are_serialized_across_preflight_and_execution()
    {
        await using var database = await CreateHistoricalDatabaseAsync("legacyquizgate-concurrent");
        await using (var seed = database.CreateContext()) await SeedLegacyDataAsync(seed);
        await using var first = database.CreateContext();
        await using var second = database.CreateContext();

        var results = await Task.WhenAll(
            new LegacyQuizMigrationGate(first).MigrateAsync(allowLegacyQuizDataRemoval: true),
            new LegacyQuizMigrationGate(second).MigrateAsync(allowLegacyQuizDataRemoval: true));

        Assert.All(results, result => Assert.True(result.MigrationCompleted));
        Assert.Single(results, result => result.Preflight.State == LegacyQuizPreflightState.RequiresReview);
        Assert.Single(results, result => result.Preflight.State == LegacyQuizPreflightState.AlreadyApplied);
        Assert.Contains(LegacyQuizMigrationGate.RemovalMigrationId, await first.Database.GetAppliedMigrationsAsync());
        Assert.Equal(0L, await ScalarCountAsync(first,
            "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Quizzes'"));
    }

    private static Task<PostgresTestDatabase> CreateHistoricalDatabaseAsync(string scope) =>
        PostgresTestDatabase.CreateAsync(scope, targetMigration: PreviousMigration);

    private static async Task<SeededLegacyData> SeedLegacyDataAsync(BetccoDbContext db)
    {
        var track = new LearningTrack { Slug = "legacy-quiz-gate", ArabicName = "مسار", EnglishName = "Track" };
        var course = new Course
        {
            Slug = "legacy-quiz-gate",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-private-identifier-88",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var module = new CourseModule { CourseId = course.Id, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var legacyLesson = new Lesson
        {
            CourseModuleId = module.Id,
            ArabicTitle = "اختبار قديم",
            EnglishTitle = "Old quiz",
            Type = LessonType.LegacyArchived,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var targetId = Guid.NewGuid();
        db.AddRange(track, course, module, legacyLesson,
            new ContentPrerequisite { CourseId = course.Id, TargetType = (LearningContentType)3, TargetId = targetId, RequiredContentType = LearningContentType.Unit, RequiredContentId = module.Id },
            new ContentPrerequisite { CourseId = course.Id, TargetType = LearningContentType.Assignment, TargetId = Guid.NewGuid(), RequiredContentType = (LearningContentType)3, RequiredContentId = Guid.NewGuid() },
            new ContentPrerequisite { CourseId = course.Id, TargetType = LearningContentType.Lesson, TargetId = legacyLesson.Id, RequiredContentType = LearningContentType.Unit, RequiredContentId = module.Id },
            new ContentAccessRule { CourseId = course.Id, TargetType = (LearningContentType)3, TargetId = Guid.NewGuid() },
            new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Course, TargetId = course.Id, PreviousContentType = (LearningContentType)3, PreviousContentId = Guid.NewGuid() },
            new ContentAccessRule { CourseId = course.Id, TargetType = LearningContentType.Lesson, TargetId = legacyLesson.Id });
        await db.SaveChangesAsync();

        var quizId = Guid.NewGuid();
        var questionId = Guid.NewGuid();
        var attemptId = Guid.NewGuid();
        var questionBankId = Guid.NewGuid();
        var gradeId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "Quizzes" ("Id", "AllowLateAttempts", "ArabicTitle", "CourseId", "CreatedAtUtc", "EnglishTitle", "IsDeleted", "IsPublished", "LessonId", "PassMark", "PublicationStatus", "RandomizeAnswers", "RandomizeQuestions", "ShowAnswers", "ShowScore", "UpdatedAtUtc")
            VALUES ({quizId}, FALSE, 'اختبار', {course.Id}, CURRENT_TIMESTAMP, 'Quiz', FALSE, TRUE, {legacyLesson.Id}, 50, 1, FALSE, FALSE, TRUE, TRUE, CURRENT_TIMESTAMP);
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "QuizQuestions" ("Id", "QuizId", "ArabicText", "CorrectAnswersJson", "CreatedAtUtc", "EnglishText", "IsDeleted", "OptionsJson", "SortOrder", "Type", "UpdatedAtUtc")
            VALUES ({questionId}, {quizId}, {PrivateQuestion}, '["{PrivateAnswer}"]', CURRENT_TIMESTAMP, 'Question', FALSE, '[]', 1, 0, CURRENT_TIMESTAMP);
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "QuizAttempts" ("Id", "AnswersJson", "CreatedAtUtc", "IsDeleted", "Passed", "QuizId", "RequiresManualReview", "ScorePercent", "StudentUserId", "UpdatedAtUtc", "WasLate")
            VALUES ({attemptId}, '["{PrivateAnswer}"]', CURRENT_TIMESTAMP, FALSE, TRUE, {quizId}, TRUE, 75, {PrivateStudentId}, CURRENT_TIMESTAMP, FALSE);
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "QuizAttemptQuestionGrades" ("Id", "QuizAttemptId", "QuizQuestionId", "TeacherUserId", "ScorePercent", "StudentFeedback", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
            VALUES ({gradeId}, {attemptId}, {questionId}, 'teacher-private-identifier-88', 75, {PrivateFeedback}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE);
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "QuestionBankQuestions" ("Id", "ArabicText", "CorrectAnswersJson", "CourseId", "CreatedAtUtc", "Difficulty", "EnglishText", "IsDeleted", "OptionsJson", "TeacherUserId", "Type", "UpdatedAtUtc")
            VALUES ({questionBankId}, {PrivateQuestion}, '["{PrivateAnswer}"]', {course.Id}, CURRENT_TIMESTAMP, 1, 'Question', FALSE, '[]', 'teacher-private-identifier-88', 0, CURRENT_TIMESTAMP);
            """);
        return new SeededLegacyData(legacyLesson.Id);
    }

    private static async Task<long> ScalarCountAsync(BetccoDbContext db, string sql)
    {
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    private sealed record SeededLegacyData(Guid LessonId);
}
