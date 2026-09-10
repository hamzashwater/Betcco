using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AdminDashboardControllerTests
{
    [Fact]
    public async Task Dashboard_returns_server_calculated_daily_paid_and_learning_trends()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var studentRole = new IdentityRole<Guid>("Student") { Id = Guid.NewGuid() };
        var teacherRole = new IdentityRole<Guid>("Teacher") { Id = Guid.NewGuid() };
        var student = new ApplicationUser { Id = Guid.NewGuid(), UserName = "student", Email = "student@betcco.test", DisplayName = "Student" };
        var teacher = new ApplicationUser { Id = Guid.NewGuid(), UserName = "teacher", Email = "teacher@betcco.test", DisplayName = "Teacher" };
        var course = new Course
        {
            Slug = "analytics-course",
            ArabicTitle = "دورة التحليلات",
            EnglishTitle = "Analytics course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = teacher.Id.ToString(),
            IsFree = false,
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
        var lesson = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "درس",
            EnglishTitle = "Lesson",
            Type = LessonType.Text,
            IsPublished = true
        };
        var date = DateTimeOffset.UtcNow.AddDays(-1);
        db.AddRange(
            studentRole,
            teacherRole,
            student,
            teacher,
            new IdentityUserRole<Guid> { UserId = student.Id, RoleId = studentRole.Id },
            new IdentityUserRole<Guid> { UserId = teacher.Id, RoleId = teacherRole.Id },
            course,
            unit,
            lesson,
            new Payment
            {
                UserId = student.Id.ToString(),
                Purpose = "course-checkout",
                ReferenceId = course.Id,
                Status = PaymentStatus.Paid,
                Subtotal = 24m,
                Total = 24m,
                CreatedAtUtc = date
            },
            new UserMembership
            {
                StudentUserId = student.Id.ToString(),
                MembershipPlanId = Guid.NewGuid(),
                PaymentId = Guid.NewGuid(),
                StartsAtUtc = date,
                EndsAtUtc = DateTimeOffset.UtcNow.AddDays(30),
                Status = SubscriptionStatus.Active
            },
            new UserCourseSubscription
            {
                StudentUserId = student.Id.ToString(),
                CourseSubscriptionPlanId = Guid.NewGuid(),
                PaymentId = Guid.NewGuid(),
                StartsAtUtc = date,
                EndsAtUtc = DateTimeOffset.UtcNow.AddDays(30),
                Status = SubscriptionStatus.Active
            },
            new LessonProgress
            {
                StudentUserId = student.Id.ToString(),
                LessonId = lesson.Id,
                UpdatedAtUtc = date
            });
        await db.SaveChangesAsync();

        var result = Assert.IsType<OkObjectResult>(await new AdminDashboardController(db, new Betcco.Infrastructure.Services.CourseGradebookService(db)).Dashboard("7d", null, null, CancellationToken.None));
        var json = JsonSerializer.Serialize(result.Value);

        Assert.Contains("\"paidOrders\":1", json);
        Assert.Contains("\"revenue\":24", json);
        Assert.Contains("\"lessonActivity\":1", json);
        Assert.Contains("\"activeSubscriptions\":2", json);
    }
}
