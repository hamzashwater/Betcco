using Betcco.Application.Catalog;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/catalog")]
public sealed class CatalogController(ICatalogService catalog, IFileStorage storage, BetccoDbContext db) : ControllerBase
{
    [HttpGet("courses")]
    [EnableRateLimiting("search")]
    public async Task<IActionResult> Search([FromQuery] string locale = "ar", [FromQuery] string? search = null, [FromQuery] string? track = null, [FromQuery] string? grade = null, [FromQuery] string? specialization = null, [FromQuery] string? subject = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 12, [FromQuery] string sort = "newest", CancellationToken cancellationToken = default) => Ok(await catalog.SearchAsync(new CatalogQuery(locale, search, track, grade, specialization, subject, page, pageSize, sort), cancellationToken));

    [HttpGet("courses/{slug}")]
    public async Task<IActionResult> GetCourse(string slug, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var course = await catalog.GetBySlugAsync(slug, locale, cancellationToken);
        return course is null ? NotFound() : Ok(course);
    }

    // Preview content is deliberately opt-in at lesson level. Files are kept
    // in private storage and are streamed only when their published lesson is
    // explicitly marked as a course preview.
    [HttpGet("courses/{slug}/preview/{lessonId:guid}")]
    public async Task<IActionResult> PreviewLesson(string slug, Guid lessonId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.AsNoTracking()
            .Include(item => item.CourseModule).ThenInclude(module => module!.Course)
            .Include(item => item.Resources)
            .SingleOrDefaultAsync(item => item.Id == lessonId && item.IsPreview && item.IsPublished
                && item.CourseModule!.IsPublished && item.CourseModule.Course!.Status == CourseStatus.Published
                && item.CourseModule.Course.Slug == slug, cancellationToken);
        if (lesson is null) return NotFound();
        return Ok(new
        {
            lesson.Id,
            title = Localize(locale, lesson.ArabicTitle, lesson.EnglishTitle),
            body = Localize(locale, lesson.ArabicBody ?? string.Empty, lesson.EnglishBody ?? string.Empty),
            type = lesson.Type.ToString(),
            lesson.DurationSeconds,
            resources = lesson.Resources.Where(resource => resource.IsDownloadable && resource.ScanStatus == UploadScanStatus.Clean)
                .OrderBy(resource => resource.DisplayName)
                .Select(resource => new { resource.Id, resource.DisplayName, resource.ContentType, resource.ExternalUrl })
        });
    }

    [HttpGet("courses/{slug}/preview/{lessonId:guid}/resources/{resourceId:guid}")]
    public async Task<IActionResult> DownloadPreviewResource(string slug, Guid lessonId, Guid resourceId, CancellationToken cancellationToken)
    {
        var resource = await db.LessonResources.AsNoTracking()
            .Include(item => item.Lesson).ThenInclude(lesson => lesson!.CourseModule).ThenInclude(module => module!.Course)
            .SingleOrDefaultAsync(item => item.Id == resourceId && item.LessonId == lessonId
                && item.IsDownloadable && item.ScanStatus == UploadScanStatus.Clean
                && item.Lesson!.IsPreview && item.Lesson.IsPublished && item.Lesson.CourseModule!.IsPublished
                && item.Lesson.CourseModule.Course!.Status == CourseStatus.Published && item.Lesson.CourseModule.Course.Slug == slug, cancellationToken);
        if (resource is null) return NotFound();
        if (resource.ExternalUrl is not null) return Redirect(resource.ExternalUrl);
        var content = await storage.OpenPrivateReadAsync(resource.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, resource.ContentType, resource.DisplayName, enableRangeProcessing: true);
    }

    [HttpGet("courses/{courseId:guid}/cover")]
    public async Task<IActionResult> GetCover(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId && x.Status == CourseStatus.Published, cancellationToken);
        if (course?.CoverImageKey is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(course.CoverImageKey, cancellationToken);
        return content is null ? NotFound() : File(content, course.CoverImageContentType ?? "image/jpeg", enableRangeProcessing: true);
    }

    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;
}
