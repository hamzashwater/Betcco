using Betcco.Application.Courses;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class LessonResourceLinkTests
{
    [Fact]
    public async Task Teacher_can_add_only_https_links_to_an_editable_owned_lesson()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var course = new Course
        {
            Slug = "resource-link-course",
            ArabicTitle = "روابط",
            EnglishTitle = "Links",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Draft
        };
        var module = new CourseModule { Course = course, CourseId = course.Id, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var lesson = new Lesson { CourseModule = module, CourseModuleId = module.Id, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text };
        db.AddRange(course, module, lesson);
        await db.SaveChangesAsync();
        var service = new CourseAuthoringService(db);

        Assert.False(await service.AddLessonResourceLinkAsync("teacher-1", new AddLessonResourceLinkCommand(lesson.Id, "Unsafe", "http://example.test/resource")));
        Assert.True(await service.AddLessonResourceLinkAsync("teacher-1", new AddLessonResourceLinkCommand(lesson.Id, "Documentation", "https://example.test/resource")));

        var resource = Assert.Single(await db.LessonResources.ToListAsync());
        Assert.Equal("https://example.test/resource", resource.ExternalUrl);
        Assert.Empty(resource.StorageKey);
        Assert.Equal(UploadScanStatus.Clean, resource.ScanStatus);
    }
}
