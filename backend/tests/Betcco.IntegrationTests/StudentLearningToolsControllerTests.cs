using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class StudentLearningToolsControllerTests
{
    [Fact]
    public async Task Overview_derives_milestones_only_from_saved_learning_activity()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "real-progress",
            ArabicTitle = "تقدم فعلي",
            EnglishTitle = "Real progress",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            IsFree = true,
            Status = CourseStatus.Published
        };
        var module = new CourseModule
        {
            Course = course,
            ArabicTitle = "وحدة",
            EnglishTitle = "Module",
            IsPublished = true
        };
        var lesson = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "درس",
            EnglishTitle = "Lesson",
            IsPublished = true
        };
        db.AddRange(course, module, lesson);
        await db.SaveChangesAsync();
        db.Enrollments.Add(new Enrollment { StudentUserId = "student-1", CourseId = course.Id });
        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student-1", LessonId = lesson.Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var controller = new StudentLearningToolsController(db, null!, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "student-1")], "Test"))
                }
            }
        };

        var result = await controller.Overview("ar", CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var milestones = document.RootElement.GetProperty("achievements");
        Assert.True(milestones[0].GetProperty("isCompleted").GetBoolean());
        Assert.Equal(1, milestones[0].GetProperty("currentValue").GetInt32());
        Assert.False(milestones[1].GetProperty("isCompleted").GetBoolean());
        Assert.False(milestones[2].GetProperty("isCompleted").GetBoolean());
    }

    [Fact]
    public async Task Purchase_history_is_scoped_to_the_authenticated_student()
    {
        await using var db = CreateDb();
        var ownPayment = new Payment
        {
            UserId = "student-1",
            Purpose = "CoursePurchase",
            Status = PaymentStatus.Paid,
            Total = 25,
            Currency = "JOD"
        };
        db.Payments.AddRange(
            ownPayment,
            new Payment
            {
                UserId = "student-2",
                Purpose = "Evaluation",
                Status = PaymentStatus.Paid,
                Total = 50,
                Currency = "JOD"
            });
        await db.SaveChangesAsync();
        var controller = new StudentLearningToolsController(db, null!, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "student-1")], "Test"))
                }
            }
        };

        var result = await controller.Purchases(1, 20, CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(ownPayment.Id.ToString(), items[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Archived_legacy_lesson_history_is_hidden_from_student_tools_and_questions()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "archived-lesson",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            Status = CourseStatus.Published
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit", IsPublished = true };
        var archived = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "قديم",
            EnglishTitle = "Historical",
            Type = LessonType.LegacyArchived,
            IsPublished = true
        };
        var regular = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "نص",
            EnglishTitle = "Text",
            Type = LessonType.Text,
            IsPublished = true
        };
        db.AddRange(course, module, archived, regular,
            new Enrollment { StudentUserId = "student-1", CourseId = course.Id },
            new LessonNote { StudentUserId = "student-1", LessonId = archived.Id, Body = "Historical note" },
            new LessonBookmark { StudentUserId = "student-1", LessonId = archived.Id },
            new LessonProgress { StudentUserId = "student-1", LessonId = archived.Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var context = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, "student-1"), new Claim(ClaimTypes.Role, "Student")], "Test"))
            }
        };
        var tools = new StudentLearningToolsController(db, null!, null!) { ControllerContext = context };
        var overview = Assert.IsType<OkObjectResult>(await tools.Overview("en", CancellationToken.None));
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(overview.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        Assert.Empty(document.RootElement.GetProperty("notes").EnumerateArray());
        Assert.Empty(document.RootElement.GetProperty("bookmarks").EnumerateArray());

        var community = new CourseCommunityController(db, null!) { ControllerContext = context };
        Assert.IsType<BadRequestObjectResult>(await community.Ask(course.Id,
            new AskCourseQuestionRequest("Question", archived.Id), CancellationToken.None));
        Assert.IsType<CreatedResult>(await community.Ask(course.Id,
            new AskCourseQuestionRequest("Question", regular.Id), CancellationToken.None));
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
