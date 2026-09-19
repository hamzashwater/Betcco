using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CoursePackageAdminControllerTests
{
    [Fact]
    public async Task Invalid_blog_slug_is_rejected_without_persistence()
    {
        await using var db = CreateDb(Guid.NewGuid().ToString());
        var controller = AdminContentController(db);

        var result = await controller.CreateBlog(new UpsertBlogPostRequest(
            "invalid-blog\n", "مقال", "Article", "ملخص", "Excerpt", "المحتوى", "Content", false),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False(await db.BlogPosts.AnyAsync());
        Assert.False(await db.AuditLogs.AnyAsync());
    }

    [Fact]
    public async Task Invalid_package_slug_is_rejected_without_persistence()
    {
        await using var db = CreateDb(Guid.NewGuid().ToString());
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = Course(track, "published-course", "دورة", "Course");
        db.AddRange(track, course);
        await db.SaveChangesAsync();
        var controller = AdminContentController(db);

        var result = await controller.CreatePackage(new UpsertPackageRequest(
            "invalid-package\n", "باقة", "Package", "وصف", "Description", 20m, false, [course.Id]),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False(await db.CoursePackages.AnyAsync());
        Assert.False(await db.AuditLogs.AnyAsync());
    }

    [Fact]
    public async Task Administrator_can_update_a_package_without_recreating_its_course_links()
    {
        var databaseName = Guid.NewGuid().ToString();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var originalCourse = Course(track, "original-course", "الأولى", "Original");
        var replacementCourse = Course(track, "replacement-course", "الثانية", "Replacement");
        var package = new CoursePackage { Slug = "starter-package", ArabicTitle = "باقة", EnglishTitle = "Package", ArabicDescription = "وصف", EnglishDescription = "Description", Price = 20m, IsPublished = true };
        package.Courses.Add(new PackageCourse { CourseId = originalCourse.Id });
        await using (var seedDb = CreateDb(databaseName))
        {
            seedDb.AddRange(track, originalCourse, replacementCourse, package);
            await seedDb.SaveChangesAsync();
        }

        await using var db = CreateDb(databaseName);

        var controller = new AdminContentController(db, null!, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "admin")], "test"))
                }
            }
        };

        var result = await controller.UpdatePackage(package.Id, new UpsertPackageRequest(
            "updated-package", "باقة محدثة", "Updated package", "وصف محدث", "Updated description", 35m, false,
            [replacementCourse.Id], DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow.AddDays(7)), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var updated = await db.CoursePackages.Include(item => item.Courses).SingleAsync();
        Assert.Equal("updated-package", updated.Slug);
        Assert.Equal(35m, updated.Price);
        Assert.False(updated.IsPublished);
        Assert.Equal([replacementCourse.Id], updated.Courses.Select(item => item.CourseId).ToArray());
        Assert.Equal("CoursePackageUpdated", Assert.Single(await db.AuditLogs.Select(item => item.Action).ToListAsync()));
    }

    private static BetccoDbContext CreateDb(string databaseName) => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(databaseName)
        .Options);

    private static AdminContentController AdminContentController(BetccoDbContext db) => new(db, null!, null!)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "admin")], "test"))
            }
        }
    };

    private static Course Course(LearningTrack track, string slug, string arabicTitle, string englishTitle) => new()
    {
        Slug = slug,
        ArabicTitle = arabicTitle,
        EnglishTitle = englishTitle,
        ArabicDescription = "وصف",
        EnglishDescription = "Description",
        LearningTrack = track,
        Status = CourseStatus.Published
    };
}
