using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Application.Courses;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AcademicProgrammeAuthorityTests
{
    [Theory]
    [InlineData("simple")]
    [InlineData("hyphenated-slug")]
    [InlineData("abc")]
    [InlineData("grade-11")]
    [InlineData("123")]
    [InlineData("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public async Task Academic_taxonomy_accepts_valid_slugs_on_specialization_and_grade_create_and_update(string slug)
    {
        await using var db = Context();
        var track = BtecTrack();
        db.LearningTracks.Add(track);
        await db.SaveChangesAsync();
        var controller = new AdminAcademicTaxonomyController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        var request = new SaveAcademicTaxonomyRequest(track.Id, slug, "اسم عربي", "English name", 1);

        Assert.IsType<CreatedResult>(await controller.CreateSpecialization(request, default));
        Assert.IsType<CreatedResult>(await controller.CreateGrade(request, default));
        var specialization = await db.Specializations.SingleAsync();
        var grade = await db.Grades.SingleAsync();
        Assert.Equal(slug, specialization.Slug);
        Assert.Equal(slug, grade.Slug);
        Assert.IsType<NoContentResult>(await controller.UpdateSpecialization(specialization.Id,
            request with { EnglishName = "Updated specialization" }, default));
        Assert.IsType<NoContentResult>(await controller.UpdateGrade(grade.Id,
            request with { EnglishName = "Updated grade" }, default));
        Assert.Equal("Updated specialization", specialization.EnglishName);
        Assert.Equal("Updated grade", grade.EnglishName);
    }

    [Fact]
    public async Task Academic_taxonomy_trims_surrounding_whitespace_after_checking_raw_slug_length()
    {
        await using var db = Context();
        var track = BtecTrack();
        db.LearningTracks.Add(track);
        await db.SaveChangesAsync();
        var controller = new AdminAcademicTaxonomyController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        var request = new SaveAcademicTaxonomyRequest(track.Id, "  grade-11  ", "اسم عربي", "English name", 1);

        Assert.IsType<CreatedResult>(await controller.CreateSpecialization(request, default));
        Assert.IsType<CreatedResult>(await controller.CreateGrade(request, default));
        var specialization = await db.Specializations.SingleAsync();
        var grade = await db.Grades.SingleAsync();
        Assert.Equal("grade-11", specialization.Slug);
        Assert.Equal("grade-11", grade.Slug);
        Assert.IsType<NoContentResult>(await controller.UpdateSpecialization(specialization.Id, request, default));
        Assert.IsType<NoContentResult>(await controller.UpdateGrade(grade.Id, request, default));
    }

    [Fact]
    public async Task Academic_taxonomy_rejects_invalid_and_oversized_slugs_on_all_write_paths()
    {
        await using var db = Context();
        var track = BtecTrack();
        var specialization = new Specialization { LearningTrackId = track.Id, Slug = "existing-specialization", ArabicName = "تخصص", EnglishName = "Specialization" };
        var grade = new Grade { LearningTrackId = track.Id, Slug = "existing-grade", ArabicName = "صف", EnglishName = "Grade" };
        db.AddRange(track, specialization, grade);
        await db.SaveChangesAsync();
        var controller = new AdminAcademicTaxonomyController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        string[] invalidSlugs = [" ", "-leading", "trailing-", "repeated--hyphen", "Uppercase", "invalid_slug", "inside space",
            new string('a', 100) + " ", new string('a', 100) + "a", new string('a', 100_000) + "! "];

        foreach (var slug in invalidSlugs)
        {
            var request = new SaveAcademicTaxonomyRequest(track.Id, slug, "اسم عربي", "Changed", 1);
            Assert.IsType<BadRequestObjectResult>(await controller.CreateSpecialization(request, default));
            Assert.IsType<BadRequestObjectResult>(await controller.CreateGrade(request, default));
            Assert.IsType<BadRequestObjectResult>(await controller.UpdateSpecialization(specialization.Id, request, default));
            Assert.IsType<BadRequestObjectResult>(await controller.UpdateGrade(grade.Id, request, default));
        }

        Assert.Equal(1, await db.Specializations.CountAsync());
        Assert.Equal(1, await db.Grades.CountAsync());
        Assert.Equal("Specialization", specialization.EnglishName);
        Assert.Equal("Grade", grade.EnglishName);
    }

    [Fact]
    public async Task Clean_seed_adds_only_it_and_business_and_admin_can_create_future_specializations()
    {
        await using var db = Context();
        var track = BtecTrack();
        db.LearningTracks.Add(track);
        await db.SaveChangesAsync();
        await DatabaseInitializer.EnsureSchoolTaxonomyAsync(db);
        Assert.Equal(["business", "information-technology"],
            await db.Specializations.OrderBy(x => x.Slug).Select(x => x.Slug).ToArrayAsync());
        Assert.False(await db.Specializations.AnyAsync(x => x.Slug == "engineering"));
        var controller = new AdminAcademicTaxonomyController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        var engineering = new SaveAcademicTaxonomyRequest(track.Id, "engineering", "الهندسة", "Engineering", 3);
        Assert.IsType<CreatedResult>(await controller.CreateSpecialization(engineering, default));
        var request = new SaveAcademicTaxonomyRequest(track.Id, "hospitality", "الضيافة", "Hospitality", 10);
        Assert.IsType<CreatedResult>(await controller.CreateSpecialization(request, default));
        var item = await db.Specializations.SingleAsync(x => x.Slug == "hospitality");
        Assert.Equal("hospitality", item.Slug);
        Assert.IsType<BadRequestObjectResult>(await controller.CreateSpecialization(request, default));
        Assert.IsType<NoContentResult>(await controller.UpdateSpecialization(item.Id,
            request with { IsVisible = false }, default));
        await DatabaseInitializer.EnsureSchoolTaxonomyAsync(db);
        Assert.False((await db.Specializations.SingleAsync(x => x.Slug == "hospitality")).IsVisible);
        Assert.True(await db.Specializations.AnyAsync(x => x.Slug == "engineering"));
        Assert.Equal(4, await db.Specializations.CountAsync());
    }

    [Fact]
    public async Task Pearson_seed_is_idempotent_and_official_identity_is_immutable_to_admin_authoring()
    {
        await using var db = Context();
        var track = BtecTrack();
        db.AddRange(track,
            new Specialization { LearningTrackId = track.Id, Slug = "information-technology", ArabicName = "تقنية المعلومات", EnglishName = "IT" },
            new Specialization { LearningTrackId = track.Id, Slug = "business", ArabicName = "الأعمال", EnglishName = "Business" });
        await db.SaveChangesAsync();

        await PearsonAcademicCatalogueSeed.ApplyAsync(db);
        await PearsonAcademicCatalogueSeed.ApplyAsync(db);
        Assert.Equal(4, await db.Qualifications.CountAsync());
        Assert.Equal(4, await db.QualificationVersions.CountAsync());
        Assert.Equal(101, await db.UnitDefinitions.CountAsync());
        Assert.All(await db.Qualifications.ToArrayAsync(), x =>
        {
            Assert.False(string.IsNullOrWhiteSpace(x.ArabicName));
            Assert.NotEqual(x.EnglishName, x.ArabicName);
        });
        Assert.All(await db.UnitDefinitions.ToArrayAsync(), x =>
        {
            Assert.Equal(AcademicSource.PearsonOfficial, x.Source);
            Assert.False(string.IsNullOrWhiteSpace(x.EnglishTitle));
            Assert.False(string.IsNullOrWhiteSpace(x.ArabicTitle));
            Assert.NotEqual(x.EnglishTitle, x.ArabicTitle);
            Assert.Contains(x.ArabicTitle, ch => ch is >= '\u0621' and <= '\u064A');
        });
        var unit = await db.UnitDefinitions.SingleAsync(x => x.Code == "6" && x.QualificationVersion!.Qualification!.Code == "BTEC-INT-L3-IT");
        Assert.Equal("Website Development", unit.EnglishTitle);
        Assert.Equal("تطوير المواقع الإلكترونية", unit.ArabicTitle);
        var originalSource = unit.SourceReference;
        var untouchedUnit = await db.UnitDefinitions.SingleAsync(x => x.Code == "7" && x.QualificationVersionId == unit.QualificationVersionId);
        untouchedUnit.ArabicTitle = "صياغة عربية راجعها المسؤول";
        unit.ArabicTitle = unit.EnglishTitle; // Previous Slice's English fallback.
        await db.SaveChangesAsync();
        await PearsonAcademicCatalogueSeed.ApplyAsync(db);
        Assert.Equal("تطوير المواقع الإلكترونية", unit.ArabicTitle);
        Assert.Equal("صياغة عربية راجعها المسؤول", untouchedUnit.ArabicTitle);
        Assert.Equal(101, await db.UnitDefinitions.CountAsync());
        var controller = new AdminAcademicStatusController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        Assert.IsType<BadRequestObjectResult>(await controller.UnitArabicLocalization(unit.Id,
            new AcademicArabicLocalizationRequest(unit.EnglishTitle), default));
        Assert.IsType<NoContentResult>(await controller.UnitArabicLocalization(unit.Id,
            new AcademicArabicLocalizationRequest("تطوير مواقع الإنترنت"), default));
        await PearsonAcademicCatalogueSeed.ApplyAsync(db);
        Assert.Equal("تطوير مواقع الإنترنت", unit.ArabicTitle);
        Assert.Equal("Website Development", unit.EnglishTitle);
        Assert.Equal("6", unit.Code);
        Assert.Equal(originalSource, unit.SourceReference);
        Assert.Equal(101, await db.UnitDefinitions.CountAsync());
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => new AcademicCatalogueService(db).SaveUnitAsync(unit.Id,
            new(unit.QualificationVersionId, unit.Code, "اسم آخر", "Arbitrary name", "Unverified"), "admin", default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => new AcademicCatalogueService(db).SaveUnitAsync(null,
            new(unit.QualificationVersionId, "999", "وحدة", "Invented official unit", "Unverified"), "admin", default));
        Assert.Equal(101, await db.UnitDefinitions.CountAsync());
        Assert.DoesNotContain(await db.UnitDefinitions.Where(x => x.QualificationVersion!.Qualification!.Code == "BTEC-INT-L3-BUS")
            .Select(x => x.Code).ToArrayAsync(), x => x is "33" or "34" or "35" or "36" or "37" or "38" or "39");
    }

    [Fact]
    public async Task Admin_custom_records_are_distinct_and_planning_rejects_invalid_bindings()
    {
        await using var db = Context();
        var track = BtecTrack();
        var specialization = new Specialization { LearningTrackId = track.Id, Slug = "future-sector", ArabicName = "قطاع جديد", EnglishName = "Future sector" };
        var grade = new Grade { LearningTrackId = track.Id, Slug = "grade-11", ArabicName = "الحادي عشر", EnglishName = "Grade 11" };
        var otherTrack = new LearningTrack { Slug = "academic", ArabicName = "أكاديمي", EnglishName = "Academic" };
        var wrongGrade = new Grade { LearningTrackId = otherTrack.Id, Slug = "grade-11", ArabicName = "الحادي عشر", EnglishName = "Grade 11" };
        db.AddRange(track, specialization, grade, otherTrack, wrongGrade);
        await db.SaveChangesAsync();
        var registry = new QualificationRegistryService(db);
        Assert.Null(await registry.CreateQualificationAsync("admin", new("CUSTOM", "مؤهل", "Qualification")));
        var qualification = await registry.CreateQualificationAsync("admin", new("CUSTOM", "مؤهل", "Qualification", specialization.Id));
        Assert.NotNull(qualification);
        Assert.Equal("AdminCustom", qualification.Source);
        var version = await registry.CreateVersionAsync("admin", new(qualification.Id, "V1", "Centre source reference", DateTimeOffset.UtcNow, null));
        Assert.NotNull(version);
        Assert.Equal("AdminCustom", version.Source);
        var unitId = await new AcademicCatalogueService(db).SaveUnitAsync(null,
            new(version.Id, "1", "وحدة مخصصة", "Custom unit", "Centre source reference"), "admin", default);
        Assert.Equal(AcademicSource.AdminCustom, (await db.UnitDefinitions.SingleAsync(x => x.Id == unitId)).Source);
        var status = new AdminAcademicStatusController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        status.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "admin")], "test"));
        Assert.IsType<NoContentResult>(await status.Unit(unitId, new AcademicRecordStatusRequest(true), default));
        var unit = await db.UnitDefinitions.SingleAsync(x => x.Id == unitId);
        Assert.True(unit.IsActive);
        Assert.NotNull(unit.PublishedAtUtc);

        var planning = new DeliveryPlanningService(db);
        var year = await planning.CreateAcademicYearAsync(new("AY-26", new(2026, 1, 1), new(2026, 12, 31)), "admin");
        var otherYear = await planning.CreateAcademicYearAsync(new("AY-27", new(2027, 1, 1), new(2027, 12, 31)), "admin");
        var term = await planning.CreateTermAsync(new(year.Id, "T1", new(2026, 1, 1), new(2026, 6, 30), 10), "admin");
        var outsideTerm = await planning.CreateTermAsync(new(otherYear.Id, "T2", new(2027, 1, 1), new(2027, 6, 30), 10), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.CreatePlanAsync(new(version.Id, year.Id, wrongGrade.Id), "admin"));
        var plan = await planning.CreatePlanAsync(new(version.Id, year.Id, grade.Id), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.CreatePlanAsync(new(version.Id, year.Id, grade.Id), "admin"));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.AddEntryAsync(plan.Plan.Id, new(unitId, outsideTerm.Id), "admin"));
        plan = await planning.AddEntryAsync(plan.Plan.Id, new(unitId, term.Id), "admin");
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.AddEntryAsync(plan.Plan.Id, new(unitId, term.Id), "admin"));
        Assert.Equal(10, Assert.Single(plan.Entries).SortOrder);
        await planning.UpdatePlanAsync(plan.Plan.Id, new(false), "admin");
        grade.IsVisible = false;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.UpdatePlanAsync(plan.Plan.Id, new(true), "admin"));
    }

    [Fact]
    public async Task Btec_teacher_uses_only_plan_entries_and_non_btec_module_remains_free_form()
    {
        await using var db = Context();
        var track = BtecTrack();
        var specialization = new Specialization { LearningTrackId = track.Id, Slug = "it", ArabicName = "تقنية المعلومات", EnglishName = "IT" };
        var grade = new Grade { LearningTrackId = track.Id, Slug = "grade-11", ArabicName = "الحادي عشر", EnglishName = "Grade 11" };
        var qualification = new Qualification { Code = "TEST-Q", ArabicName = "مؤهل", EnglishName = "Qualification", SpecializationId = specialization.Id };
        var version = new QualificationVersion { QualificationId = qualification.Id, VersionCode = "V1", SourceReference = "Approved specification" };
        var unit = new UnitDefinition { QualificationVersionId = version.Id, Code = "1", ArabicTitle = "عنوان رسمي", EnglishTitle = "Official title", IsActive = true, PublishedAtUtc = DateTimeOffset.UtcNow };
        var outside = new UnitDefinition { QualificationVersionId = version.Id, Code = "2", ArabicTitle = "خارج الخطة", EnglishTitle = "Outside plan", IsActive = true, PublishedAtUtc = DateTimeOffset.UtcNow };
        var academic = new LearningTrack { Slug = "academic", ArabicName = "أكاديمي", EnglishName = "Academic" };
        db.AddRange(track, specialization, grade, qualification, version, unit, outside, academic);
        await db.SaveChangesAsync();
        var planning = new DeliveryPlanningService(db);
        var year = await planning.CreateAcademicYearAsync(new("AY-26", new(2026, 1, 1), new(2026, 12, 31)), "admin");
        var term = await planning.CreateTermAsync(new(year.Id, "T1", new(2026, 1, 1), new(2026, 6, 30), 10), "admin");
        var plan = await planning.CreatePlanAsync(new(version.Id, year.Id, grade.Id), "admin");
        plan = await planning.AddEntryAsync(plan.Plan.Id, new(unit.Id, term.Id), "admin");
        var entryId = Assert.Single(plan.Entries).Id;
        var authoring = new CourseAuthoringService(db);
        await Assert.ThrowsAsync<InvalidOperationException>(() => authoring.CreateDraftAsync("teacher", new(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true)));
        await Assert.ThrowsAsync<InvalidOperationException>(() => authoring.CreateDraftAsync("teacher", new(
            "دورة", "Course", "وصف", "Description", track.Id, Guid.NewGuid(), specialization.Id, null, 0, true, plan.Plan.Id)));
        await Assert.ThrowsAsync<InvalidOperationException>(() => authoring.CreateDraftAsync("teacher", new(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, Guid.NewGuid(), null, 0, true, plan.Plan.Id)));
        var otherSpecialization = new Specialization { LearningTrackId = track.Id, Slug = "business", ArabicName = "أعمال", EnglishName = "Business" };
        var wrongSubject = new Subject { SpecializationId = otherSpecialization.Id, Slug = "business-subject", ArabicName = "مادة", EnglishName = "Business subject" };
        db.AddRange(otherSpecialization, wrongSubject);
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => authoring.CreateDraftAsync("teacher", new(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, specialization.Id, wrongSubject.Id, 0, true, plan.Plan.Id)));
        var courseId = await authoring.CreateDraftAsync("teacher", new(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true, plan.Plan.Id));
        Assert.Null(await authoring.AddModuleAsync("teacher", new(courseId, "مزور", "Forged", 1, UnitDefinitionId: outside.Id)));
        Assert.Null(await authoring.AddModuleAsync("teacher", new(courseId, "مزور", "Forged", 1, UnitDefinitionId: outside.Id, DeliveryPlanEntryId: entryId)));
        var moduleId = await authoring.AddModuleAsync("teacher", new(courseId, "مزور", "Forged", 1, UnitCode: "FAKE", DeliveryPlanEntryId: entryId));
        Assert.NotNull(moduleId);
        var module = await db.CourseModules.SingleAsync(x => x.Id == moduleId);
        Assert.Equal(entryId, module.DeliveryPlanEntryId);
        Assert.Equal(unit.Id, module.UnitDefinitionId);
        Assert.Equal(unit.Code, module.UnitCode);
        Assert.Equal(unit.EnglishTitle, module.EnglishTitle);
        var unmatchedModule = new CourseModule { CourseId = courseId, ArabicTitle = "غير مرتبطة", EnglishTitle = "Unmapped", SortOrder = 2 };
        db.CourseModules.Add(unmatchedModule);
        await db.SaveChangesAsync();
        Assert.False(await authoring.LinkModuleToUnitAsync("teacher", unmatchedModule.Id, outside.Id));
        await Assert.ThrowsAsync<DeliveryPlanningException>(() => planning.UpdateEntryAsync(entryId, new(term.Id), "admin"));

        var freeCourseId = await authoring.CreateDraftAsync("teacher", new("عام", "General", "وصف", "Description", academic.Id, null, null, null, 0, true));
        Assert.NotNull(await authoring.AddModuleAsync("teacher", new(freeCourseId, "وحدة", "Free module", 1)));
        var legacy = new Course { Slug = "legacy", ArabicTitle = "قديمة", EnglishTitle = "Legacy", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrackId = track.Id, TeacherUserId = "teacher" };
        legacy.Modules.Add(new CourseModule { ArabicTitle = "قديم", EnglishTitle = "Existing unit", SortOrder = 1 });
        db.Courses.Add(legacy);
        await db.SaveChangesAsync();
        Assert.Single(await db.CourseModules.Where(x => x.CourseId == legacy.Id).ToArrayAsync());
        Assert.Null(await authoring.AddModuleAsync("teacher", new(legacy.Id, "جديد", "New unit", 2, UnitDefinitionId: unit.Id)));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Additive_migration_chain_has_no_pending_model_changes()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("academic_programme");
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
    }

    private static BetccoDbContext Context() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static LearningTrack BtecTrack() => new() { Slug = "btec", ArabicName = "بيتك", EnglishName = "BTEC", IsBtecFocused = true };
}
