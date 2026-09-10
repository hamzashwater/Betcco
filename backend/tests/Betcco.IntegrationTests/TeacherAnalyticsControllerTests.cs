using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class TeacherAnalyticsControllerTests
{
    [Fact]
    public async Task Teacher_risk_signals_are_calculated_only_from_their_coursework()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var course = new Course
        {
            Slug = "teacher-risk-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "teacher-1",
            IsFree = true,
            Status = CourseStatus.Published
        };
        var unit = new CourseModule
        {
            Course = course,
            CourseId = course.Id,
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit",
            IsPublished = true
        };
        var lessons = Enumerable.Range(1, 3).Select(index => new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = $"درس {index}",
            EnglishTitle = $"Lesson {index}",
            Type = LessonType.Text,
            IsPublished = true
        }).ToArray();
        var assignment = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            ArabicTitle = "مهمة",
            EnglishTitle = "Assignment",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            IsPublished = true
        };
        var quiz = new Quiz { CourseId = course.Id, ArabicTitle = "اختبار", EnglishTitle = "Quiz", IsPublished = true };
        db.AddRange(
            course,
            unit,
            lessons[0],
            lessons[1],
            lessons[2],
            assignment,
            quiz,
            new Enrollment { Course = course, CourseId = course.Id, StudentUserId = "student-1" },
            new Enrollment { Course = course, CourseId = course.Id, StudentUserId = "student-2" },
            new LessonProgress { StudentUserId = "student-1", LessonId = lessons[0].Id, IsCompleted = true },
            new QuizAttempt { StudentUserId = "student-1", QuizId = quiz.Id, SubmittedAtUtc = DateTimeOffset.UtcNow, ScorePercent = 20m });
        await db.SaveChangesAsync();

        var controller = new TeacherAnalyticsController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "teacher-1")], "test"))
                }
            }
        };

        var result = Assert.IsType<OkObjectResult>(await controller.Get(CancellationToken.None));
        var json = JsonSerializer.Serialize(result.Value);
        Assert.Contains("\"studentsAtRiskCount\":2", json);
        Assert.Contains("LowProgress", json);
        Assert.Contains("MissedAssignments", json);
        Assert.Contains("LowQuizScore", json);
    }
}
