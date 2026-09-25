using System.Security.Claims;
using System.Data.Common;
using System.Text.Json;
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
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class LearningAimPracticeFlowTests
{
    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_practice_requires_every_reviewed_canonical_aim_and_stays_formative(int count)
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_unlock");
        await using var db = database.CreateContext();
        var (course, module, aims, lessons) = await SeedAsync(db, count);
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب الوحدة", "Unit Practice", "ارفع عملك", "Upload your work", null));
        Assert.Equal(PracticeCreateStatus.Created, created.Status);
        var finalId = created.Id!.Value;
        Assert.Equal(PracticeCreateStatus.Conflict, (await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب الوحدة", "Unit Practice", "ارفع عملك", "Upload your work", null))).Status);
        Assert.Equal(PracticeCreateStatus.Invalid, (await service.CreateComprehensivePracticeAsync("other-teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب الوحدة", "Unit Practice", "ارفع عملك", "Upload your work", null))).Status);
        Assert.True(await service.PublishAsync("teacher", finalId, true));
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, finalId)).IsAvailable);
        Assert.Null(await service.StartSubmissionAsync("student", finalId, null));
        Assert.Null(await service.StartSubmissionAsync("outsider", finalId, null));
        for (var i = 0; i < count; i++)
        {
            var aimId = (await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
                aims[i].Id, "نشاط", "Practice", "ارفع", "Upload", null)))!.Value;
            db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student", LessonId = lessons[i].Id, IsCompleted = true });
            await db.SaveChangesAsync();
            var draft = (await service.StartSubmissionAsync("student", aimId, null))!;
            await using var evidence = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
            Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", draft.SubmissionId,
                "aim.pdf", "application/pdf", evidence.Length, evidence));
            Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
            Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, finalId)).IsAvailable);
            Assert.Equal(PracticeReviewResult.Finalized, await service.ReviewPracticeAsync("teacher", draft.SubmissionId,
                new ReviewLearningAimPracticeCommand("Pass", "Strong", "Gap", "Improve")));
            Assert.Equal(i == count - 1, (await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, finalId)).IsAvailable);
        }
        var finalDraft = (await service.StartSubmissionAsync("student", finalId, "Full Unit"))!;
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", finalDraft.SubmissionId,
            "unit.pdf", "application/pdf", file.Length, file));
        Assert.True(await service.SubmitAsync("student", finalDraft.SubmissionId));
        var review = new ReviewLearningAimPracticeCommand("Merit", "Strong evidence", "Missing detail", "Explain the method");
        Assert.Equal(PracticeReviewResult.Invalid, await service.ReviewComprehensivePracticeAsync("other-teacher", finalDraft.SubmissionId, review));
        Assert.Equal(PracticeReviewResult.Invalid, await service.ReviewPracticeAsync("teacher", finalDraft.SubmissionId, review));
        Assert.Equal(PracticeReviewResult.Finalized, await service.ReviewComprehensivePracticeAsync("teacher", finalDraft.SubmissionId, review));
        var stored = await db.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == finalDraft.SubmissionId);
        Assert.Equal(TrainingOutcome.Merit, stored.TrainingOutcome);
        Assert.Equal("Strong evidence", stored.TrainingStrengths);
        Assert.Equal("Missing detail", stored.TrainingGaps);
        Assert.Equal("Explain the method", stored.TrainingImprovementGuidance);
        Assert.Null(stored.CalculatedGrade);
        Assert.Empty(await db.EvaluationRequests.AsNoTracking().ToArrayAsync());
        Assert.Empty(await db.CourseAssignmentCriterionResults.AsNoTracking().ToArrayAsync());
        Assert.Equal(PracticeReviewResult.Conflict, await service.ReviewComprehensivePracticeAsync("teacher", finalDraft.SubmissionId, review));
    }

    [Fact]
    public async Task Empty_or_broken_canonical_aim_mapping_never_releases_comprehensive_practice()
    {
        await using var db = CreateDb();
        var (course, module, _, _) = await SeedAsync(db, 0);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(db));
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب", "Practice", "تعليمات", "Instructions", null));
        Assert.Equal(PracticeCreateStatus.Created, created.Status);
        Assert.True(await service.PublishAsync("teacher", created.Id!.Value, true));
        Assert.False((await new ContentAccessService(db).CanAccessAsync("student", course.Id, LearningContentType.Assignment, created.Id!.Value)).IsAvailable);
        Assert.Null(await service.StartSubmissionAsync("student", created.Id.Value, null));
        var definition = new LearningAimDefinition { UnitDefinitionId = module.UnitDefinitionId!.Value, Code = "A", ArabicTitle = "هدف", EnglishTitle = "Aim", ArabicDescription = "وصف", EnglishDescription = "Description", SourceReference = "test" };
        db.Add(definition);
        await db.SaveChangesAsync();
        Assert.False((await new ContentAccessService(db).CanAccessAsync("student", course.Id, LearningContentType.Assignment, created.Id.Value)).IsAvailable);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_deadline_uses_only_the_students_active_extension()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_deadline");
        await using var db = database.CreateContext();
        var (course, module) = await SeedReadyComprehensiveAsync(db, 3);
        db.Enrollments.Add(new Enrollment { StudentUserId = "student-b", CourseId = course.Id });
        await db.SaveChangesAsync();
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(db));
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب", "Practice", "تعليمات", "Instructions", DateTimeOffset.UtcNow.AddHours(2)));
        var assignmentId = created.Id!.Value;
        Assert.True(await service.PublishAsync("teacher", assignmentId, true));
        Assert.True((await new ContentAccessService(db).CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        var assignment = await db.CourseAssignments.SingleAsync(x => x.Id == assignmentId);
        assignment.DueAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await db.SaveChangesAsync();
        Assert.Null(await service.StartSubmissionAsync("student", assignmentId, null));
        var extensions = new CourseAssignmentDeadlineExtensionService(db);
        var expired = await extensions.GrantAsync("teacher", assignmentId,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(-1), "Expired extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, expired.Status);
        Assert.Null(await service.StartSubmissionAsync("student", assignmentId, null));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.RevokeAsync("teacher", assignmentId, expired.Extension!.Id, new(null))).Status);
        var active = await extensions.GrantAsync("teacher", assignmentId,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(2), "Practice extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, active.Status);
        Assert.True((await new ContentAccessService(db).CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.False((await new ContentAccessService(db).CanAccessAsync("student-b", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        var draft = (await service.StartSubmissionAsync("student", assignmentId, null))!;
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", draft.SubmissionId,
            "unit.pdf", "application/pdf", file.Length, file));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.RevokeAsync("teacher", assignmentId, active.Extension!.Id, new(null))).Status);
        Assert.False(await service.SubmitAsync("student", draft.SubmissionId));
        Assert.Equal(CourseAssignmentFileAddStatus.SubmissionNotFound, await service.AddFileAsync("student", draft.SubmissionId,
            "unit.pdf", "application/pdf", file.Length, file));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.GrantAsync("teacher", assignmentId,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(2), "Restored extension"))).Status);
        Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_create_and_review_races_have_one_winner_and_one_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_races");
        Guid moduleId;
        Guid courseId;
        await using (var setup = database.CreateContext())
        {
            var seeded = await SeedReadyComprehensiveAsync(setup, 3);
            moduleId = seeded.Module.Id;
            courseId = seeded.Course.Id;
        }
        await using var dbA = database.CreateContext();
        await using var dbB = database.CreateContext();
        var createCommand = new CreateComprehensivePracticeCommand(moduleId, "تدريب", "Practice", "تعليمات", "Instructions", null);
        var serviceA = new CourseAssignmentService(dbA, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(dbA));
        var serviceB = new CourseAssignmentService(dbB, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(dbB));
        var creations = await Task.WhenAll(serviceA.CreateComprehensivePracticeAsync("teacher", createCommand),
            serviceB.CreateComprehensivePracticeAsync("teacher", createCommand));
        Assert.Equal(1, creations.Count(x => x.Status == PracticeCreateStatus.Created));
        Assert.Equal(1, creations.Count(x => x.Status == PracticeCreateStatus.Conflict));
        var assignmentId = creations.Single(x => x.Status == PracticeCreateStatus.Created).Id!.Value;
        await using var verify = database.CreateContext();
        Assert.Single(await verify.CourseAssignments.AsNoTracking().Where(x => x.CourseModuleId == moduleId
            && x.Purpose == CourseAssignmentPurpose.ComprehensivePractice).ToArrayAsync());
        Assert.Single(await verify.AuditLogs.AsNoTracking().Where(x => x.Action == "ComprehensivePracticeCreated"
            && x.EntityId == assignmentId.ToString()).ToArrayAsync());
        var service = new CourseAssignmentService(verify, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(verify));
        Assert.True(await service.PublishAsync("teacher", assignmentId, true));
        var draft = (await service.StartSubmissionAsync("student", assignmentId, null))!;
        await using var file = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", draft.SubmissionId,
            "unit.pdf", "application/pdf", file.Length, file));
        Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
        var enrollment = await verify.Enrollments.SingleAsync(x => x.CourseId == courseId && x.StudentUserId == "student");
        enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
        await verify.SaveChangesAsync();
        Assert.Null(await service.StartSubmissionAsync("student", assignmentId, null));
        await using var reviewA = database.CreateContext();
        await using var reviewB = database.CreateContext();
        var reviewerA = new CourseAssignmentService(reviewA, null!, null!, new NullEmailNotifications(), new ContentAccessService(reviewA));
        var reviewerB = new CourseAssignmentService(reviewB, null!, null!, new NullEmailNotifications(), new ContentAccessService(reviewB));
        var merit = new ReviewLearningAimPracticeCommand("Merit", "Merit strengths", "Merit gaps", "Merit guidance");
        var distinction = new ReviewLearningAimPracticeCommand("Distinction", "Distinction strengths", "Distinction gaps", "Distinction guidance");
        var reviews = await Task.WhenAll(reviewerA.ReviewComprehensivePracticeAsync("teacher", draft.SubmissionId, merit),
            reviewerB.ReviewComprehensivePracticeAsync("teacher", draft.SubmissionId, distinction));
        Assert.Equal(1, reviews.Count(x => x == PracticeReviewResult.Finalized));
        Assert.Equal(1, reviews.Count(x => x == PracticeReviewResult.Conflict));
        await using var final = database.CreateContext();
        var winning = reviews[0] == PracticeReviewResult.Finalized ? merit : distinction;
        var stored = await final.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == draft.SubmissionId);
        Assert.Equal(Enum.Parse<TrainingOutcome>(winning.TrainingOutcome), stored.TrainingOutcome);
        Assert.Equal(winning.Strengths, stored.TrainingStrengths);
        Assert.Equal(winning.Gaps, stored.TrainingGaps);
        Assert.Equal(winning.ImprovementGuidance, stored.TrainingImprovementGuidance);
        Assert.Single(await final.AuditLogs.AsNoTracking().Where(x => x.Action == "ComprehensivePracticeReviewed"
            && x.EntityId == draft.SubmissionId.ToString()).ToArrayAsync());
    }

    [Fact]
    public async Task Comprehensive_criteria_accept_only_existing_canonical_criteria_from_the_same_unit()
    {
        await using var db = CreateDb();
        var (_, module, aims, _) = await SeedAsync(db, 3);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(db));
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب", "Practice", "تعليمات", "Instructions", null));
        var foreignUnit = new UnitDefinition { QualificationVersionId = module.UnitDefinition!.QualificationVersionId, Code = "U2", ArabicTitle = "أخرى", EnglishTitle = "Other" };
        var foreignModule = new CourseModule { CourseId = module.CourseId, UnitDefinition = foreignUnit, ArabicTitle = "أخرى", EnglishTitle = "Other" };
        db.AddRange(foreignUnit, foreignModule);
        var criteria = aims.Take(2).Select((aim, index) =>
        {
            var definition = new AssessmentCriterionDefinition
            {
                LearningAimDefinitionId = aim.LearningAimDefinitionId!.Value,
                Code = $"{aim.Code}.P1",
                Band = BtecCriterionBand.Pass,
                ArabicDescription = "معيار",
                EnglishDescription = "Criterion",
                SourceReference = "test"
            };
            var delivery = new BtecCriterion
            {
                CourseModuleId = module.Id,
                BtecLearningAimId = aim.Id,
                AssessmentCriterionDefinition = definition,
                Code = definition.Code,
                Band = definition.Band,
                ArabicDescription = "معيار",
                EnglishDescription = "Criterion"
            };
            db.AddRange(definition, delivery);
            return delivery;
        }).ToArray();
        var foreignDefinition = new LearningAimDefinition { UnitDefinition = foreignUnit, Code = "A", ArabicTitle = "هدف", EnglishTitle = "Aim", ArabicDescription = "وصف", EnglishDescription = "Description", SourceReference = "test" };
        var foreignCriterionDefinition = new AssessmentCriterionDefinition
        {
            LearningAimDefinition = foreignDefinition,
            Code = "A.P2",
            Band = BtecCriterionBand.Pass,
            ArabicDescription = "معيار",
            EnglishDescription = "Criterion",
            SourceReference = "test"
        };
        var foreignCriterion = new BtecCriterion
        {
            CourseModule = foreignModule,
            AssessmentCriterionDefinition = foreignCriterionDefinition,
            Code = "A.P2",
            Band = BtecCriterionBand.Pass,
            ArabicDescription = "معيار",
            EnglishDescription = "Criterion"
        };
        db.AddRange(foreignDefinition, foreignCriterionDefinition, foreignCriterion);
        await db.SaveChangesAsync();
        foreach (var criterion in criteria)
            Assert.NotNull(await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
                created.Id!.Value, criterion.Id, "FABRICATED", "Distinction", "fake", "fake", 0)));
        Assert.Null(await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
            created.Id!.Value, criteria[0].Id, null, null, null, null, 0)));
        Assert.Null(await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
            created.Id!.Value, foreignCriterion.Id, null, null, null, null, 0)));
        Assert.Null(await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
            created.Id!.Value, null, "C.D9", "Distinction", "fabricated", "fabricated", 0)));
        Assert.Equal(new[] { "A.P1", "B.P1" }, (await db.CourseAssignmentCriteria.AsNoTracking()
            .Where(x => x.CourseAssignmentId == created.Id).OrderBy(x => x.Code).Select(x => x.Code).ToArrayAsync()));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_authoring_stays_private_until_teacher_publishes_after_configuring_it()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_authoring_race");
        await using var db = database.CreateContext();
        var (course, module) = await SeedReadyComprehensiveAsync(db, 3);
        var aims = await db.BtecLearningAims.AsNoTracking().Where(x => x.CourseModuleId == module.Id)
            .OrderBy(x => x.Code).Take(2).ToArrayAsync();
        var sources = aims.Select((aim, index) =>
        {
            var definition = new AssessmentCriterionDefinition
            {
                LearningAimDefinitionId = aim.LearningAimDefinitionId!.Value,
                Code = $"{aim.Code}.P1",
                Band = BtecCriterionBand.Pass,
                ArabicDescription = "معيار",
                EnglishDescription = "Criterion",
                SourceReference = "test"
            };
            var source = new BtecCriterion
            {
                CourseModuleId = module.Id,
                BtecLearningAimId = aim.Id,
                AssessmentCriterionDefinition = definition,
                Code = definition.Code,
                Band = definition.Band,
                ArabicDescription = "معيار",
                EnglishDescription = "Criterion"
            };
            db.AddRange(definition, source);
            return source;
        }).ToArray();
        await db.SaveChangesAsync();
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "مسودة", "Draft", "تعليمات", "Instructions", null));
        var assignmentId = created.Id!.Value;
        var stored = await db.CourseAssignments.AsNoTracking().SingleAsync(x => x.Id == assignmentId);
        Assert.False(stored.IsPublished);
        Assert.Equal(ContentPublicationStatus.Draft, stored.PublicationStatus);
        Assert.False((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        Assert.Null(await service.StartSubmissionAsync("student", assignmentId, null));
        var controller = new CourseAssignmentsController(service, null!, null!, null!, db, access,
            new CourseAssignmentDeadlineResolver(db), null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "student")], "Test"))
                }
            }
        };
        Assert.IsType<NotFoundResult>(await controller.StartSubmission(assignmentId, new StartAssignmentSubmissionRequest(null), CancellationToken.None));
        Assert.False(await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == assignmentId));

        Assert.True(await service.UpdateComprehensivePracticeAsync("teacher", assignmentId,
            new UpdateComprehensivePracticeCommand("مهمة الوحدة", "Unit Practice", "تعليمات جديدة", "New instructions", DateTimeOffset.UtcNow.AddDays(1))));
        Assert.False(await service.UpdateComprehensivePracticeAsync("other-teacher", assignmentId,
            new UpdateComprehensivePracticeCommand("غير مصرح", "Unauthorized", "تعليمات", "Instructions", null)));
        var firstLink = await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
            assignmentId, sources[0].Id, null, null, null, null, 0));
        Assert.NotNull(firstLink);
        Assert.Null(await service.AddCriterionAsync("other-teacher", new AddCourseAssignmentCriterionCommand(
            assignmentId, sources[1].Id, null, null, null, null, 1)));
        Assert.True(await service.AddResourceAsync("teacher", assignmentId, "brief.pdf", "private/brief", "application/pdf"));
        Assert.False(await service.AddResourceAsync("other-teacher", assignmentId, "foreign.pdf", "private/foreign", "application/pdf"));
        Assert.False(await service.PublishAsync("other-teacher", assignmentId, true));
        Assert.True(await service.PublishAsync("teacher", assignmentId, true));
        Assert.True((await access.CanAccessAsync("student", course.Id, LearningContentType.Assignment, assignmentId)).IsAvailable);
        var draft = (await service.StartSubmissionAsync("student", assignmentId, null))!;
        await using var evidence = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", draft.SubmissionId,
            "unit.pdf", "application/pdf", evidence.Length, evidence));
        Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
        Assert.Null(await service.AddCriterionAsync("teacher", new AddCourseAssignmentCriterionCommand(
            assignmentId, sources[1].Id, null, null, null, null, 1)));
        Assert.False(await service.DeleteCriterionAsync("teacher", firstLink!.Value));
        Assert.False(await service.UpdateComprehensivePracticeAsync("teacher", assignmentId,
            new UpdateComprehensivePracticeCommand("تعديل", "Changed", "تعليمات", "Instructions", null)));
        Assert.False(await service.PublishAsync("teacher", assignmentId, false));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Unpublished_comprehensive_with_a_preexisting_draft_cannot_be_submitted()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_unpublished_submit");
        await using var db = database.CreateContext();
        var (_, module) = await SeedReadyComprehensiveAsync(db, 3);
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "مسودة", "Draft", "تعليمات", "Instructions", null));
        var submission = new Betcco.Domain.Assessments.CourseAssignmentSubmission
        {
            CourseAssignmentId = created.Id!.Value,
            StudentUserId = "student"
        };
        var version = new Betcco.Domain.Assessments.CourseAssignmentSubmissionVersion { VersionNumber = 1 };
        version.Files.Add(new Betcco.Domain.Assessments.CourseAssignmentSubmissionFile
        {
            OriginalFileName = "unit.pdf",
            StorageKey = "private/seeded",
            ContentType = "application/pdf",
            LengthBytes = 6,
            ScanStatus = UploadScanStatus.Clean
        });
        submission.Versions.Add(version);
        db.CourseAssignmentSubmissions.Add(submission);
        await db.SaveChangesAsync();
        Assert.False(await service.SubmitAsync("student", submission.Id));
        Assert.Equal(CourseAssignmentSubmissionStatus.Draft,
            (await db.CourseAssignmentSubmissions.AsNoTracking().SingleAsync(x => x.Id == submission.Id)).Status);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_migration_upgrades_main_without_changing_existing_practice()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_upgrade",
            targetMigration: "20260924104739_AddLearningAimPracticeFlow");
        Guid moduleId;
        Guid aimAssignmentId;
        await using (var before = database.CreateContext())
        {
            var (_, module, aims, _) = await SeedAsync(before, 3);
            moduleId = module.Id;
            var service = new CourseAssignmentService(before, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(before));
            aimAssignmentId = (await service.CreatePracticeAsync("teacher", new CreateLearningAimPracticeCommand(
                aims[0].Id, "نشاط", "Practice", "ارفع", "Upload", null)))!.Value;
        }
        await using var upgrade = database.CreateContext();
        await upgrade.GetService<IMigrator>().MigrateAsync();
        Assert.False(upgrade.Database.HasPendingModelChanges());
        Assert.True(await upgrade.CourseAssignments.AsNoTracking().AnyAsync(x => x.Id == aimAssignmentId
            && x.Purpose == CourseAssignmentPurpose.LearningAimPractice));
        var serviceAfter = new CourseAssignmentService(upgrade, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(upgrade));
        var created = await serviceAfter.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            moduleId, "تدريب", "Practice", "تعليمات", "Instructions", null));
        Assert.Equal(PracticeCreateStatus.Created, created.Status);
        Assert.True(await serviceAfter.PublishAsync("teacher", created.Id!.Value, true));
        Assert.Equal(2, await upgrade.CourseAssignments.AsNoTracking().CountAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_evidence_download_is_private_and_teacher_review_survives_access_expiry()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_evidence_privacy");
        await using var db = database.CreateContext();
        var (course, module) = await SeedReadyComprehensiveAsync(db, 3);
        var access = new ContentAccessService(db);
        var storage = new ReadableFileStorage();
        var service = new CourseAssignmentService(db, storage, new CleanFileScanner(), new NullEmailNotifications(), access);
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "تدريب", "Practice", "تعليمات", "Instructions", null));
        Assert.True(await service.PublishAsync("teacher", created.Id!.Value, true));
        var draft = (await service.StartSubmissionAsync("student", created.Id!.Value, null))!;
        await using var evidence = new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
        Assert.Equal(CourseAssignmentFileAddStatus.Added, await service.AddFileAsync("student", draft.SubmissionId,
            "unit.pdf", "application/pdf", evidence.Length, evidence));
        var fileId = await db.CourseAssignmentSubmissionFiles.AsNoTracking()
            .Where(x => x.CourseAssignmentSubmissionVersion!.CourseAssignmentSubmissionId == draft.SubmissionId)
            .Select(x => x.Id).SingleAsync();

        CourseAssignmentsController Controller(string userId) => new(service, storage, null!, null!, db, access,
            new CourseAssignmentDeadlineResolver(db), null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId)], "Test"))
                }
            }
        };

        Assert.Empty(JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(
            await Controller("teacher").TeacherComprehensiveSubmissions(course.Id, CancellationToken.None)).Value).EnumerateArray());
        Assert.IsType<NotFoundResult>(await Controller("teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("another-student").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("unrelated-teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<FileStreamResult>(await Controller("student").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.True(await service.SubmitAsync("student", draft.SubmissionId));
        var submittedQueue = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(
            await Controller("teacher").TeacherComprehensiveSubmissions(course.Id, CancellationToken.None)).Value);
        Assert.Single(submittedQueue.EnumerateArray());
        Assert.DoesNotContain("StorageKey", submittedQueue.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.IsType<NotFoundResult>(await Controller("unrelated-teacher").TeacherComprehensiveSubmissions(course.Id, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("teacher").DownloadFile(Guid.NewGuid(), fileId, CancellationToken.None));
        Assert.IsType<FileStreamResult>(await Controller("teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("another-student").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        var enrollment = await db.Enrollments.SingleAsync(x => x.CourseId == course.Id && x.StudentUserId == "student");
        enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
        await db.SaveChangesAsync();
        Assert.IsType<NotFoundResult>(await Controller("student").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<FileStreamResult>(await Controller("teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.Equal(PracticeReviewResult.Finalized, await service.ReviewComprehensivePracticeAsync("teacher", draft.SubmissionId,
            new ReviewLearningAimPracticeCommand("Merit", "Strong", "Gap", "Improve")));
        Assert.Single(JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(
            await Controller("teacher").TeacherComprehensiveSubmissions(course.Id, CancellationToken.None)).Value).EnumerateArray());
        Assert.IsType<FileStreamResult>(await Controller("teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("unrelated-teacher").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
        Assert.IsType<NotFoundResult>(await Controller("another-student").DownloadFile(draft.SubmissionId, fileId, CancellationToken.None));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_display_uses_effective_deadline_and_precise_unavailable_reason()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_display_deadline");
        await using var db = database.CreateContext();
        var (course, module) = await SeedReadyComprehensiveAsync(db, 3);
        db.Enrollments.Add(new Enrollment { StudentUserId = "student-b", CourseId = course.Id });
        await db.SaveChangesAsync();
        var access = new ContentAccessService(db);
        var service = new CourseAssignmentService(db, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), access);
        var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
            module.Id, "مهمة", "Practice", "تعليمات", "Instructions", DateTimeOffset.UtcNow.AddHours(2)));
        Assert.True(await service.PublishAsync("teacher", created.Id!.Value, true));
        var controller = StudentController(db, "student");
        async Task<JsonElement> PracticeAsync() => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(
            await controller.StudentPractice(course.Id, CancellationToken.None)).Value).EnumerateArray().Single().GetProperty("FinalPractice");

        Assert.Equal("Available", (await PracticeAsync()).GetProperty("Status").GetString());
        var aimSubmission = await db.CourseAssignmentSubmissions.FirstAsync(x => x.StudentUserId == "student"
            && x.CourseAssignment!.Purpose == CourseAssignmentPurpose.LearningAimPractice);
        aimSubmission.Status = CourseAssignmentSubmissionStatus.Draft;
        await db.SaveChangesAsync();
        Assert.Equal("LearningAimsIncomplete", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
        aimSubmission.Status = CourseAssignmentSubmissionStatus.Finalized;
        var assignment = await db.CourseAssignments.SingleAsync(x => x.Id == created.Id.Value);
        assignment.DueAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await db.SaveChangesAsync();
        Assert.Equal("DeadlineExpired", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
        var extensions = new CourseAssignmentDeadlineExtensionService(db);
        var expired = await extensions.GrantAsync("teacher", assignment.Id,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(-1), "Expired extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, expired.Status);
        Assert.Equal("DeadlineExpired", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.RevokeAsync("teacher", assignment.Id, expired.Extension!.Id, new(null))).Status);
        var active = await extensions.GrantAsync("teacher", assignment.Id,
            new GrantCourseAssignmentDeadlineExtension("student", DateTimeOffset.UtcNow.AddHours(2), "Active extension"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, active.Status);
        Assert.Equal("Available", (await PracticeAsync()).GetProperty("Status").GetString());
        Assert.Equal(DeadlineExtensionWriteStatus.Success, (await extensions.RevokeAsync("teacher", assignment.Id, active.Extension!.Id, new(null))).Status);
        Assert.Equal("DeadlineExpired", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
        var other = await extensions.GrantAsync("teacher", assignment.Id,
            new GrantCourseAssignmentDeadlineExtension("student-b", DateTimeOffset.UtcNow.AddHours(2), "Other student"));
        Assert.Equal(DeadlineExtensionWriteStatus.Success, other.Status);
        Assert.Equal("DeadlineExpired", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
        aimSubmission.Status = CourseAssignmentSubmissionStatus.Draft;
        await db.SaveChangesAsync();
        Assert.Equal("LearningAimsIncomplete", (await PracticeAsync()).GetProperty("UnavailableReason").GetString());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Comprehensive_display_calculates_canonical_aim_progress_once_per_unit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("comprehensive_single_progress");
        Guid courseId;
        await using (var setup = database.CreateContext())
        {
            var (course, module) = await SeedReadyComprehensiveAsync(setup, 3);
            courseId = course.Id;
            var service = new CourseAssignmentService(setup, new MemoryFileStorage(), new CleanFileScanner(), new NullEmailNotifications(), new ContentAccessService(setup));
            var created = await service.CreateComprehensivePracticeAsync("teacher", new CreateComprehensivePracticeCommand(
                module.Id, "مهمة", "Practice", "تعليمات", "Instructions", null));
            Assert.True(await service.PublishAsync("teacher", created.Id!.Value, true));
        }
        var counter = new CanonicalAimQueryCounter();
        await using var db = database.CreateContext(counter);
        var controller = StudentController(db, "student");
        Assert.IsType<OkObjectResult>(await controller.StudentPractice(courseId, CancellationToken.None));
        Assert.Equal(1, counter.Count);
    }

    private static CourseAssignmentsController StudentController(BetccoDbContext db, string userId) => new(
        null!, null!, null!, null!, db, new ContentAccessService(db), new CourseAssignmentDeadlineResolver(db), null!)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId)], "Test"))
            }
        }
    };

    private sealed class CanonicalAimQueryCounter : DbCommandInterceptor
    {
        public int Count { get; private set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("\"LearningAimDefinitions\"", StringComparison.Ordinal)) Count++;
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }

    private static async Task<(Course Course, CourseModule Module)> SeedReadyComprehensiveAsync(BetccoDbContext db, int count)
    {
        var (course, module, aims, lessons) = await SeedAsync(db, count);
        foreach (var (aim, lesson) in aims.Zip(lessons))
        {
            var assignment = new Betcco.Domain.Assessments.CourseAssignment
            {
                CourseId = course.Id,
                CourseModuleId = module.Id,
                BtecLearningAimId = aim.Id,
                Purpose = CourseAssignmentPurpose.LearningAimPractice,
                ArabicTitle = "نشاط",
                EnglishTitle = "Practice",
                ArabicInstructions = "ارفع",
                EnglishInstructions = "Upload",
                IsPublished = true,
                PublicationStatus = ContentPublicationStatus.Published
            };
            db.CourseAssignments.Add(assignment);
            db.CourseAssignmentSubmissions.Add(new Betcco.Domain.Assessments.CourseAssignmentSubmission
            {
                CourseAssignment = assignment,
                StudentUserId = "student",
                Status = CourseAssignmentSubmissionStatus.Finalized,
                TrainingOutcome = TrainingOutcome.Pass
            });
            db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student", LessonId = lesson.Id, IsCompleted = true });
        }
        await db.SaveChangesAsync();
        return (course, module);
    }

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
    private sealed class ReadableFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult($"private/{Guid.NewGuid()}");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(new MemoryStream([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]));
    }
    private sealed class NullEmailNotifications : IEmailNotificationService
    {
        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
