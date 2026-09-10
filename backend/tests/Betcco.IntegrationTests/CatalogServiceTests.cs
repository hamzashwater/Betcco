using Betcco.Application.Catalog;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CatalogServiceTests
{
    [Fact]
    public async Task Published_catalog_returns_only_published_courses_with_computed_duration()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var teacher = new ApplicationUser { Id = Guid.NewGuid(), UserName = "teacher@betcco.test", Email = "teacher@betcco.test", DisplayName = "Teacher BETCCO" };
        var course = new Course { Slug = "foundations", ArabicTitle = "أساسيات", EnglishTitle = "Foundations", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, Status = CourseStatus.Published, IsFree = true, TeacherUserId = teacher.Id.ToString() };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Module", IsPublished = true };
        module.Lessons.Add(new Lesson { ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text, DurationSeconds = 600, IsPublished = true });
        db.AddRange(track, teacher, course, module);
        db.Courses.Add(new Course { Slug = "draft", ArabicTitle = "مسودة", EnglishTitle = "Draft", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, Status = CourseStatus.Draft, IsFree = true, TeacherUserId = "teacher" });
        await db.SaveChangesAsync();

        var result = await new CatalogService(db, new MemoryCache(new MemoryCacheOptions())).SearchAsync(new CatalogQuery("en", null, null, null, null, null));

        var item = Assert.Single(result.Items);
        Assert.Equal("Foundations", item.Title);
        Assert.Equal(10, item.DurationMinutes);
        Assert.Equal("Teacher BETCCO", item.TeacherName);
    }

    [Fact]
    public async Task Browsed_public_catalog_is_short_lived_cached_but_typed_search_is_not()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "cached-track", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "cached-course", ArabicTitle = "دورة", EnglishTitle = "Original title", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, Status = CourseStatus.Published, IsFree = true, TeacherUserId = "teacher" };
        db.AddRange(track, course);
        await db.SaveChangesAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var catalog = new CatalogService(db, cache);

        var firstBrowse = await catalog.SearchAsync(new CatalogQuery("en", null, null, null, null, null));
        course.EnglishTitle = "Updated title";
        await db.SaveChangesAsync();

        var cachedBrowse = await catalog.SearchAsync(new CatalogQuery("en", null, null, null, null, null));
        var searched = await catalog.SearchAsync(new CatalogQuery("en", "updated", null, null, null, null));

        Assert.Equal("Original title", Assert.Single(firstBrowse.Items).Title);
        Assert.Equal("Original title", Assert.Single(cachedBrowse.Items).Title);
        Assert.Equal("Updated title", Assert.Single(searched.Items).Title);
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
}
