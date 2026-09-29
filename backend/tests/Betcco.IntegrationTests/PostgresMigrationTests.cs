using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Betcco.IntegrationTests;

public sealed class PostgresMigrationTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Complete_migration_chain_creates_the_current_model_and_idempotent_script()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("migrations");
        await using var db = database.CreateContext();

        var migrations = db.Database.GetMigrations().ToArray();
        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();

        Assert.NotEmpty(migrations);
        Assert.Equal(migrations, applied);
        Assert.Contains(migrations, migration => migration.EndsWith("_AddCouponCheckoutReservation", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddPaymentSessionRecovery", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddRegistrationEmailOutbox", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddDurablePrivateStorageFoundation", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddAcademicDeliveryPlanning", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddCanonicalLearnUnitLinks", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_RemoveLegacyQuizSystem", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddCourseAccessGrantProvenance", StringComparison.Ordinal));
        Assert.False(db.Database.HasPendingModelChanges());

        var script = db.GetService<IMigrator>().GenerateScript(
            options: MigrationsSqlGenerationOptions.Idempotent);
        Assert.Contains("__EFMigrationsHistory", script, StringComparison.Ordinal);
        Assert.Contains("AddCouponCheckoutReservation", script, StringComparison.Ordinal);
        Assert.Contains("AddPaymentSessionRecovery", script, StringComparison.Ordinal);
        Assert.Contains("AddRegistrationEmailOutbox", script, StringComparison.Ordinal);
        Assert.Contains("AddDurablePrivateStorageFoundation", script, StringComparison.Ordinal);
        Assert.Contains("AddAcademicDeliveryPlanning", script, StringComparison.Ordinal);
        Assert.Contains("AddCanonicalLearnUnitLinks", script, StringComparison.Ordinal);
        Assert.Contains("RemoveLegacyQuizSystem", script, StringComparison.Ordinal);
        Assert.Contains("UPDATE \"Lessons\"", script, StringComparison.Ordinal);
        Assert.Contains("DELETE FROM \"ContentPrerequisites\"", script, StringComparison.Ordinal);
        Assert.Contains("IX_CourseModules_CourseId_UnitDefinitionId", script, StringComparison.Ordinal);
        Assert.Contains("FK_CourseModules_UnitDefinitions_UnitDefinitionId", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"AcademicYears\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"AcademicTerms\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"DeliveryPlans\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"DeliveryPlanEntries\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"CourseAccessGrants\"", script, StringComparison.Ordinal);

        var connection = db.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var indexCheck = connection.CreateCommand();
        indexCheck.CommandText = "SELECT count(*) FROM pg_indexes WHERE tablename = 'CourseModules' AND indexname = 'IX_CourseModules_CourseId_UnitDefinitionId' AND indexdef LIKE '%UNIQUE%'";
        Assert.Equal(1L, Convert.ToInt64(await indexCheck.ExecuteScalarAsync()));
        await using var foreignKeyCheck = connection.CreateCommand();
        foreignKeyCheck.CommandText = "SELECT count(*) FROM information_schema.table_constraints WHERE table_name = 'CourseModules' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'FK_CourseModules_UnitDefinitions_UnitDefinitionId'";
        Assert.Equal(1L, Convert.ToInt64(await foreignKeyCheck.ExecuteScalarAsync()));
        await using var removedTablesCheck = connection.CreateCommand();
        removedTablesCheck.CommandText = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Quizzes', 'QuizQuestions', 'QuizAttempts', 'QuizAttemptQuestionGrades', 'QuestionBankQuestions')";
        Assert.Equal(0L, Convert.ToInt64(await removedTablesCheck.ExecuteScalarAsync()));
        await using var preservedTablesCheck = connection.CreateCommand();
        preservedTablesCheck.CommandText = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Courses', 'Lessons', 'LessonProgresses', 'Enrollments', 'CourseAssignments', 'CourseAssignmentSubmissions', 'EvaluationRequests', 'UnitDefinitions')";
        Assert.Equal(8L, Convert.ToInt64(await preservedTablesCheck.ExecuteScalarAsync()));
        await using var grantConstraintCheck = connection.CreateCommand();
        grantConstraintCheck.CommandText = "SELECT count(*) FROM pg_constraint WHERE conname IN ('CK_CourseAccessGrants_Validity', 'CK_CourseAccessGrants_Revocation', 'CK_CourseAccessGrants_SourcePayment')";
        Assert.Equal(3L, Convert.ToInt64(await grantConstraintCheck.ExecuteScalarAsync()));

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(database.ConnectionString));
        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>()
            .AddEntityFrameworkStores<BetccoDbContext>()
            .AddDefaultTokenProviders();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddScoped<DatabaseInitializer>();
        await using var provider = services.BuildServiceProvider();
        await using (var scope = provider.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();

        await using var seeded = database.CreateContext();
        Assert.True(await seeded.Courses.AnyAsync());
        Assert.True(await seeded.Lessons.AnyAsync(x => x.Type == LessonType.Text));
        Assert.True(await seeded.Lessons.AnyAsync(x => x.Type == LessonType.Assignment));
        Assert.False(await seeded.Lessons.AnyAsync(x => x.Type == LessonType.LegacyArchived));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Previous_schema_enrollment_becomes_unattributed_legacy_grant_without_rewriting_enrollment()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("legacy_grant", migrateToLatest: false);
        await using var db = database.CreateContext();
        var migrations = db.Database.GetMigrations().ToArray();
        Assert.EndsWith("_AddCourseAccessGrantProvenance", migrations[^1], StringComparison.Ordinal);
        await db.GetService<IMigrator>().MigrateAsync(migrations[^2]);

        var track = new LearningTrack { Slug = "legacy-grant-track", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = "legacy-grant-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var paymentId = Guid.NewGuid();
        var enrollment = new Enrollment { StudentUserId = "student", Course = course, PaymentId = paymentId, AccessEndsAtUtc = DateTimeOffset.UtcNow.AddDays(30) };
        db.AddRange(track, course, enrollment);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        await db.GetService<IMigrator>().MigrateAsync();
        var persisted = await db.Enrollments.AsNoTracking().SingleAsync(item => item.Id == enrollment.Id);
        var grant = await db.CourseAccessGrants.AsNoTracking().SingleAsync();
        Assert.Equal(paymentId, persisted.PaymentId);
        Assert.Equal(CourseAccessGrantSource.Legacy, grant.SourceType);
        Assert.Equal(enrollment.Id, grant.SourceId);
        Assert.Null(grant.PaymentId);
        Assert.Equal(persisted.AccessEndsAtUtc, grant.ValidUntilUtc);
        Assert.True(await db.ActiveEnrollments(DateTimeOffset.UtcNow).AnyAsync(item => item.Id == enrollment.Id));
        Assert.False(db.Database.HasPendingModelChanges());
    }
}
