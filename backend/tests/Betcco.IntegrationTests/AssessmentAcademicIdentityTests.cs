using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class AssessmentAcademicIdentityTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Empty_database_migrates_to_academic_identity_schema()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("academic_empty");
        await using var db = database.CreateContext();

        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Contains(db.Database.GetAppliedMigrations(), x => x.EndsWith("_AddAssessmentAcademicIdentity", StringComparison.Ordinal));
        Assert.Empty(await db.UnitDefinitions.ToListAsync());
        Assert.Empty(await db.AssessmentDefinitions.ToListAsync());
        Assert.Empty(await db.AssessmentScopes.ToListAsync());

        var migrations = db.Database.GetMigrations().ToArray();
        await db.GetService<IMigrator>().MigrateAsync(migrations[^2]);
        Assert.DoesNotContain(db.Database.GetAppliedMigrations(), x => x.EndsWith("_AddAssessmentAcademicIdentity", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Legacy_request_survives_migration_with_unknown_scope_and_original_snapshots()
    {
        const string migrationSuffix = "_AddAssessmentAcademicIdentity";
        var migrations = new Betcco.Infrastructure.Persistence.BetccoDbContext(
            new DbContextOptionsBuilder<Betcco.Infrastructure.Persistence.BetccoDbContext>()
                .UseNpgsql("Host=localhost;Database=design_only")
                .Options).Database.GetMigrations().ToArray();
        Assert.EndsWith(migrationSuffix, migrations[^1], StringComparison.Ordinal);

        await using var database = await PostgresTestDatabase.CreateAsync("academic_legacy", targetMigration: migrations[^2]);
        var requestId = Guid.NewGuid();
        await using (var before = database.CreateContext())
        {
            // The current EF model includes the new columns, so insert using the
            // legacy table shape to prove a real pre-migration row survives UP.
            await before.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "EvaluationRequests" (
                    "Id", "StudentUserId", "GradeId", "SpecializationId", "TaskTypeId", "RubricTemplateId",
                    "Status", "Price", "Currency", "CriteriaSnapshotJson", "EvaluatorCriteriaPlanJson",
                    "AssessmentRuleSetVersion", "AssessmentRuleSetSnapshotJson", "SectionResultsJson",
                    "SubmissionAttemptNumber", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
                VALUES ({requestId}, {"legacy-student"}, {Guid.NewGuid()}, {Guid.NewGuid()}, {Guid.NewGuid()}, {Guid.NewGuid()},
                    {0}, {0m}, {"JOD"}, {"[\"legacy-criterion\"]"}, {"[]"},
                    {"btec-internal-v1"}, {"{\"legacy\":true}"}, {"[]"},
                    {1}, {DateTimeOffset.UtcNow}, {DateTimeOffset.UtcNow}, {false})
                """);
            await before.GetService<IMigrator>().MigrateAsync();
        }

        await using var after = database.CreateContext();
        var persisted = await after.EvaluationRequests.SingleAsync(x => x.Id == requestId);
        Assert.Null(persisted.AssessmentScopeId);
        Assert.Null(persisted.AssessmentScopeSnapshotJson);
        Assert.Equal("[\"legacy-criterion\"]", persisted.CriteriaSnapshotJson);
        Assert.Equal("{\"legacy\":true}", persisted.AssessmentRuleSetSnapshotJson);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Academic_hierarchy_enforces_parentage_unique_identity_and_restrictive_deletes()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("academic_keys");
        await using var db = database.CreateContext();
        var track = new LearningTrack { Slug = "academic-test", ArabicName = "اختبار", EnglishName = "Test" };
        var grade = new Grade { Slug = "grade", ArabicName = "درجة", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization { Slug = "specialization", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrack = track };
        var qualification = new Qualification { Code = "Q-TEST", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "v1", SourceReference = "test" };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var definition = new AssessmentDefinition { UnitDefinition = unit, Code = "A1", ArabicTitle = "تقييم", EnglishTitle = "Assessment" };
        var rubric = new RubricTemplate { ArabicTitle = "معيار", EnglishTitle = "Rubric" };
        var scope = new AssessmentScope { AssessmentDefinition = definition, GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = rubric.Id };
        db.AddRange(track, grade, specialization, qualification, version, unit, definition, rubric, scope);
        await db.SaveChangesAsync();

        Assert.Equal(version.Id, (await db.UnitDefinitions.SingleAsync()).QualificationVersionId);
        Assert.Equal(unit.Id, (await db.AssessmentDefinitions.SingleAsync()).UnitDefinitionId);
        Assert.Equal(definition.Id, (await db.AssessmentScopes.SingleAsync()).AssessmentDefinitionId);
        Assert.False(unit.IsActive);
        Assert.False(definition.IsActive);
        Assert.False(scope.IsActive);

        await AssertRejectedAsync(db, new UnitDefinition { QualificationVersionId = Guid.NewGuid(), Code = "BAD", ArabicTitle = "س", EnglishTitle = "Bad" });
        await AssertRejectedAsync(db, new AssessmentDefinition { UnitDefinitionId = Guid.NewGuid(), Code = "BAD", ArabicTitle = "س", EnglishTitle = "Bad" });
        await AssertRejectedAsync(db, new AssessmentScope { AssessmentDefinitionId = Guid.NewGuid(), GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = rubric.Id });
        await AssertRejectedAsync(db, new AssessmentScope { AssessmentDefinitionId = definition.Id, GradeId = Guid.NewGuid(), SpecializationId = specialization.Id, RubricTemplateId = rubric.Id });
        await AssertRejectedAsync(db, new AssessmentScope { AssessmentDefinitionId = definition.Id, GradeId = grade.Id, SpecializationId = Guid.NewGuid(), RubricTemplateId = rubric.Id });
        await AssertRejectedAsync(db, new AssessmentScope { AssessmentDefinitionId = definition.Id, GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = Guid.NewGuid() });
        await AssertRejectedAsync(db, new UnitDefinition { QualificationVersionId = version.Id, Code = unit.Code, ArabicTitle = "س", EnglishTitle = "Duplicate" });
        await AssertRejectedAsync(db, new AssessmentDefinition { UnitDefinitionId = unit.Id, Code = definition.Code, Version = definition.Version, ArabicTitle = "س", EnglishTitle = "Duplicate" });
        await AssertRejectedAsync(db, new AssessmentScope { AssessmentDefinitionId = definition.Id, GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = rubric.Id, Version = scope.Version });

        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"QualificationVersions\" WHERE \"Id\" = {version.Id}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"UnitDefinitions\" WHERE \"Id\" = {unit.Id}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"AssessmentDefinitions\" WHERE \"Id\" = {definition.Id}"));

        var request = new EvaluationRequest { StudentUserId = "student", GradeId = grade.Id, SpecializationId = specialization.Id, TaskTypeId = Guid.NewGuid(), RubricTemplateId = rubric.Id, AssessmentScopeId = scope.Id };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"AssessmentScopes\" WHERE \"Id\" = {scope.Id}"));
    }

    private static async Task AssertRejectedAsync(Betcco.Infrastructure.Persistence.BetccoDbContext db, object entity)
    {
        db.Add(entity);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.Entry(entity).State = EntityState.Detached;
    }
}
