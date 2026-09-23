using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CourseGradebookServiceTests
{
    [Fact]
    public async Task Calculates_btec_progress_from_persisted_results_and_never_exposes_another_teachers_course()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var track = new LearningTrack { Slug = "gradebook-track", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "gradebook-course",
            ArabicTitle = "دفتر درجات BTEC",
            EnglishTitle = "BTEC gradebook",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var unit = new CourseModule
        {
            Course = course,
            CourseId = course.Id,
            UnitCode = "U1",
            ArabicTitle = "الوحدة الأولى",
            EnglishTitle = "Unit one",
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published,
            SortOrder = 1
        };
        var aim = new BtecLearningAim
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            Code = "A",
            ArabicTitle = "هدف التعلم أ",
            EnglishTitle = "Learning aim A",
            PublicationStatus = ContentPublicationStatus.Published,
            SortOrder = 1
        };
        var lesson = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "درس",
            EnglishTitle = "Lesson",
            ArabicBody = "محتوى",
            EnglishBody = "Content",
            Type = LessonType.Text,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published,
            BtecLearningAim = aim,
            BtecLearningAimId = aim.Id,
            SortOrder = 1
        };
        var assignment = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            CourseModule = unit,
            CourseModuleId = unit.Id,
            BtecLearningAim = aim,
            BtecLearningAimId = aim.Id,
            ArabicTitle = "مهمة الوحدة",
            EnglishTitle = "Unit coursework",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            IsPublished = true,
            MaxScore = 100m
        };
        var pass = new CourseAssignmentCriterion
        {
            CourseAssignment = assignment,
            CourseAssignmentId = assignment.Id,
            Code = "A.P1",
            Band = BtecCriterionBand.Pass,
            ArabicDescription = "نجاح",
            EnglishDescription = "Pass",
            SortOrder = 1
        };
        var merit = new CourseAssignmentCriterion
        {
            CourseAssignment = assignment,
            CourseAssignmentId = assignment.Id,
            Code = "A.M1",
            Band = BtecCriterionBand.Merit,
            ArabicDescription = "تفوق",
            EnglishDescription = "Merit",
            SortOrder = 2
        };
        var distinction = new CourseAssignmentCriterion
        {
            CourseAssignment = assignment,
            CourseAssignmentId = assignment.Id,
            Code = "A.D1",
            Band = BtecCriterionBand.Distinction,
            ArabicDescription = "امتياز",
            EnglishDescription = "Distinction",
            SortOrder = 3
        };
        var submission = new CourseAssignmentSubmission
        {
            CourseAssignment = assignment,
            CourseAssignmentId = assignment.Id,
            StudentUserId = "student-1",
            Status = CourseAssignmentSubmissionStatus.Graded,
            CalculatedGrade = EvaluationGrade.Merit,
            CalculatedScore = null
        };
        db.AddRange(
            track, course, unit, aim, lesson, assignment, pass, merit, distinction, submission,
            new Enrollment { Course = course, CourseId = course.Id, StudentUserId = "student-1" },
            new LessonProgress { StudentUserId = "student-1", LessonId = lesson.Id, IsCompleted = true },
            new CourseAssignmentCriterionResult { CourseAssignmentSubmission = submission, CourseAssignmentSubmissionId = submission.Id, CourseAssignmentCriterion = pass, CourseAssignmentCriterionId = pass.Id, Achievement = CriterionAchievement.Achieved, Score = null },
            new CourseAssignmentCriterionResult { CourseAssignmentSubmission = submission, CourseAssignmentSubmissionId = submission.Id, CourseAssignmentCriterion = merit, CourseAssignmentCriterionId = merit.Id, Achievement = CriterionAchievement.Achieved, Score = null },
            new CourseAssignmentCriterionResult { CourseAssignmentSubmission = submission, CourseAssignmentSubmissionId = submission.Id, CourseAssignmentCriterion = distinction, CourseAssignmentCriterionId = distinction.Id, Achievement = CriterionAchievement.NotAchieved, Score = null });
        await db.SaveChangesAsync();

        var service = new CourseGradebookService(db);
        var student = await service.GetStudentAsync("student-1", course.Id, "en");

        Assert.NotNull(student);
        Assert.Equal(100m, student!.LessonProgressPercent);
        Assert.Equal("Merit", student.PredictedGrade.PredictedGrade);
        Assert.Equal(1, student.PredictedGrade.PassAchieved);
        Assert.Equal(1, student.PredictedGrade.MeritAchieved);
        Assert.Equal("NotAchieved", student.Criteria.Single(item => item.Code == "A.D1").Status);
        Assert.Single(student.Units);
        Assert.Equal("U1 · Unit one", student.Units[0].UnitTitle);
        Assert.Single(student.Units[0].LearningAims);
        Assert.Equal("A", student.Units[0].LearningAims[0].Code);
        Assert.Equal(100m, student.Units[0].LearningAims[0].LessonProgressPercent);

        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "2026", SourceReference = "Approved specification", EffectiveFromUtc = DateTimeOffset.UtcNow };
        var canonicalUnit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U2",
            ArabicTitle = "وحدة معتمدة",
            EnglishTitle = "Canonical unit",
            SourceReference = "Approved specification",
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var canonicalAim = new LearningAimDefinition
        {
            UnitDefinition = canonicalUnit,
            Code = "B",
            ArabicTitle = "هدف معتمد",
            EnglishTitle = "Canonical aim",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            SourceReference = "Approved specification"
        };
        course.QualificationVersion = version;
        unit.UnitDefinition = canonicalUnit;
        aim.LearningAimDefinition = canonicalAim;
        db.AddRange(qualification, version, canonicalUnit, canonicalAim);
        await db.SaveChangesAsync();
        var mappedStudent = await service.GetStudentAsync("student-1", course.Id, "en");
        Assert.NotNull(mappedStudent);
        Assert.Equal("U2 · Canonical unit", mappedStudent!.Units[0].UnitTitle);
        Assert.Equal("B", mappedStudent.Units[0].LearningAims[0].Code);
        Assert.Equal("Canonical aim", mappedStudent.Units[0].LearningAims[0].Title);
        Assert.Equal("A.P1", mappedStudent.Criteria.Single(item => item.Code == "A.P1").Code);

        Assert.Null(await service.GetStudentAsync("not-enrolled", course.Id, "en"));
        Assert.Null(await service.GetTeacherAsync("teacher-2", course.Id, "en", 1, 25));
        var teacher = await service.GetTeacherAsync("teacher-1", course.Id, "en", 1, 25);
        Assert.NotNull(teacher);
        Assert.Single(teacher!.Students);
        Assert.Equal("Merit", teacher.Students[0].PredictedGrade.PredictedGrade);
        var admin = await service.GetAdminAsync(new AdminGradebookQuery(null, unit.Id, "teacher-1", "student-1", "Graded", "Merit", null, null, null, 1, 25), "en");
        Assert.Single(admin.Rows);
        Assert.Equal("Unit coursework", admin.Rows[0].AssignmentTitle);
    }
}
