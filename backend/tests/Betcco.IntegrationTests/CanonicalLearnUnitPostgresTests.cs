using Betcco.Application.Courses;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CanonicalLearnUnitPostgresTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Published_canonical_unit_creates_delivery_aims_and_criteria_under_postgres_constraints()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("canonical_learn");
        await using var db = database.CreateContext();
        var track = new LearningTrack { Slug = "canonical-learn", ArabicName = "بيتك", EnglishName = "BTEC", IsBtecFocused = true };
        var specialization = new Specialization { Slug = "it", ArabicName = "تقنية المعلومات", EnglishName = "IT", LearningTrackId = track.Id };
        var grade = new Grade { Slug = "g11", ArabicName = "الحادي عشر", EnglishName = "Grade 11", LearningTrackId = track.Id };
        var qualification = new Qualification { Code = "TEST-Q", ArabicName = "مؤهل", EnglishName = "Qualification", SpecializationId = specialization.Id };
        var version = new QualificationVersion
        {
            Qualification = qualification,
            VersionCode = "2026",
            SourceReference = "Approved test specification",
            EffectiveFromUtc = DateTimeOffset.UtcNow
        };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit",
            SourceReference = "Approved test specification",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var aim = new LearningAimDefinition
        {
            UnitDefinition = unit,
            Code = "A",
            ArabicTitle = "هدف",
            EnglishTitle = "Aim",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            SourceReference = "Approved test specification"
        };
        var criterion = new AssessmentCriterionDefinition
        {
            LearningAimDefinition = aim,
            Code = "A.P1",
            Band = BtecCriterionBand.Pass,
            ArabicDescription = "معيار",
            EnglishDescription = "Criterion",
            SourceReference = "Approved test specification"
        };
        db.AddRange(track, specialization, grade, qualification, version, unit, aim, criterion);
        await db.SaveChangesAsync();

        var planning = new DeliveryPlanningService(db);
        var year = await planning.CreateAcademicYearAsync(new("AY-2026", new(2026, 1, 1), new(2026, 12, 31)), "admin");
        var term = await planning.CreateTermAsync(new(year.Id, "T1", new(2026, 1, 1), new(2026, 6, 30), 10), "admin");
        var plan = await planning.CreatePlanAsync(new(version.Id, year.Id, grade.Id), "admin");
        plan = await planning.AddEntryAsync(plan.Plan.Id, new(unit.Id, term.Id), "admin");
        var entryId = Assert.Single(plan.Entries).Id;

        var authoring = new CourseAuthoringService(db);
        var courseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true, plan.Plan.Id));
        var moduleId = await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(
            courseId, "ignored", "ignored", 1, DeliveryPlanEntryId: entryId));

        Assert.NotNull(moduleId);
        var stored = await db.CourseModules.AsNoTracking()
            .Include(x => x.LearningAims).Include(x => x.Criteria)
            .SingleAsync(x => x.Id == moduleId);
        Assert.Equal(unit.Id, stored.UnitDefinitionId);
        Assert.Equal(aim.Id, Assert.Single(stored.LearningAims).LearningAimDefinitionId);
        Assert.Equal(criterion.Id, Assert.Single(stored.Criteria).AssessmentCriterionDefinitionId);
        Assert.Equal(version.Id, (await db.Courses.AsNoTracking().SingleAsync(x => x.Id == courseId)).QualificationVersionId);

        var nextVersion = new QualificationVersion
        {
            QualificationId = qualification.Id,
            VersionCode = "2027",
            SourceReference = "Approved test specification",
            EffectiveFromUtc = DateTimeOffset.UtcNow
        };
        var nextUnit = new UnitDefinition
        {
            QualificationVersion = nextVersion,
            Code = "U2",
            ArabicTitle = "وحدة ثانية",
            EnglishTitle = "Second unit",
            SourceReference = "Approved test specification",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        db.AddRange(nextVersion, nextUnit);
        await db.SaveChangesAsync();
        var concurrentCourseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة متزامنة", "Concurrent course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true, plan.Plan.Id));

        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        var firstWrite = new CourseAuthoringService(firstContext).AddModuleAsync("teacher-1", new CreateModuleCommand(
            concurrentCourseId, "", "", 1, DeliveryPlanEntryId: entryId));
        var secondWrite = new CourseAuthoringService(secondContext).AddModuleAsync("teacher-1", new CreateModuleCommand(
            concurrentCourseId, "", "", 2, UnitDefinitionId: nextUnit.Id));
        var results = await Task.WhenAll(firstWrite, secondWrite);
        Assert.Single(results, x => x.HasValue);
        var persistedCourse = await db.Courses.AsNoTracking().SingleAsync(x => x.Id == concurrentCourseId);
        var persistedModule = await db.CourseModules.AsNoTracking().SingleAsync(x => x.CourseId == concurrentCourseId);
        Assert.Equal(version.Id, persistedCourse.QualificationVersionId);
        Assert.Equal(unit.Id, persistedModule.UnitDefinitionId);
    }
}
