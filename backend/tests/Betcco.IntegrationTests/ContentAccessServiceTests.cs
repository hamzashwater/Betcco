using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class ContentAccessServiceTests
{
    [Fact]
    public async Task Release_and_prerequisite_rules_are_evaluated_on_the_server_and_reject_cycles()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var course = new Course
        {
            Slug = "access-course",
            ArabicTitle = "دورة الإتاحة",
            EnglishTitle = "Access course",
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
        var first = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "الأول",
            EnglishTitle = "First",
            Type = LessonType.Text,
            IsPublished = true,
            SortOrder = 1
        };
        var second = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "الثاني",
            EnglishTitle = "Second",
            Type = LessonType.Text,
            IsPublished = true,
            SortOrder = 2
        };
        db.AddRange(course, unit, first, second, new Enrollment { Course = course, CourseId = course.Id, StudentUserId = "student-1" });
        await db.SaveChangesAsync();

        var service = new ContentAccessService(db);
        Assert.True(await service.SetReleaseRuleAsync("teacher-1", new ContentReleaseConfiguration(
            course.Id, LearningContentType.Lesson, second.Id, ContentReleaseMode.AfterPreviousContentCompletion, null, null, LearningContentType.Lesson, first.Id)));

        var locked = await service.CanAccessAsync("student-1", course.Id, LearningContentType.Lesson, second.Id);
        Assert.False(locked.IsAvailable);
        Assert.Equal("CompletePreviousContent", locked.Reason);

        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student-1", LessonId = first.Id, IsCompleted = true });
        await db.SaveChangesAsync();
        Assert.True((await service.CanAccessAsync("student-1", course.Id, LearningContentType.Lesson, second.Id)).IsAvailable);

        Assert.True(await service.SetReleaseRuleAsync("teacher-1", new ContentReleaseConfiguration(
            course.Id, LearningContentType.Unit, unit.Id, ContentReleaseMode.SpecificDate, DateTimeOffset.UtcNow.AddDays(1), null, null, null)));
        var dateLocked = await service.CanAccessAsync("student-1", course.Id, LearningContentType.Unit, unit.Id);
        Assert.False(dateLocked.IsAvailable);
        Assert.Equal("AvailableOnDate", dateLocked.Reason);

        var cycle = await service.AddPrerequisiteAsync("teacher-1", new ContentPrerequisiteConfiguration(
            Guid.Empty, course.Id, LearningContentType.Lesson, first.Id, LearningContentType.Lesson, second.Id));
        Assert.Null(cycle);
    }
}
