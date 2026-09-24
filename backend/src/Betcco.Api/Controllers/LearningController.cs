using System.Security.Claims;
using Betcco.Domain.Common;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/learning")]
public sealed class LearningController(
    BetccoDbContext db,
    IFileStorage storage,
    IContentAccessService contentAccess,
    IStudentCoursesLearningHubService learningHub,
    IStudentCoursePlayerService coursePlayer) : ControllerBase
{
    [Authorize(Policy = "Student")]
    [HttpGet("my-courses")]
    public async Task<IActionResult> MyCourses(
        [FromQuery] string locale = "ar",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        [FromQuery] string? search = null,
        [FromQuery] string progress = "All",
        [FromQuery] string sort = "Recent",
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || page > 100_000 || pageSize is < 1 or > 50 || search?.Length > 200
            || !Enum.TryParse<StudentCourseProgressFilter>(progress, true, out var progressFilter)
            || !Enum.TryParse<StudentCourseSort>(sort, true, out var sortMode))
        {
            return BadRequest(new
            {
                message = "Use page between 1 and 100000, pageSize between 1 and 50, a search up to 200 characters, and supported progress/sort values."
            });
        }

        return Ok(await learningHub.GetAsync(
            UserId!,
            new StudentCoursesLearningHubQuery(locale, page, pageSize, search, progressFilter, sortMode),
            cancellationToken));
    }
    [HttpGet("courses/{courseId:guid}/player")]
    public async Task<IActionResult> Player(
        Guid courseId,
        [FromQuery] string locale = "ar",
        [FromQuery] Guid? lessonId = null,
        CancellationToken cancellationToken = default)
    {
        if (User.IsInRole("Student"))
        {
            var courseDecision = await contentAccess.CanAccessCourseAsync(UserId!, courseId, cancellationToken);
            if (!courseDecision.IsAvailable)
            {
                if (courseDecision.Reason is "EnrollmentRequired" or "ContentNotFound") return NotFound();
                return Conflict(new
                {
                    message = "Complete this course's prerequisite before opening its player.",
                    courseDecision.Reason,
                    courseDecision.AvailableAtUtc
                });
            }

            var player = await coursePlayer.GetAsync(UserId!, courseId, locale, lessonId, cancellationToken);
            return player is null ? NotFound() : Ok(player);
        }

        var course = await db.Courses.Include(x => x.Modules).ThenInclude(x => x.Lessons).ThenInclude(x => x.Resources)
            .Include(x => x.Modules).ThenInclude(x => x.UnitDefinition)
            .AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId && x.Status == CourseStatus.Published, cancellationToken);
        if (course is null || !await CanAccessCourseAsync(courseId, cancellationToken)) return NotFound();
        var modules = new List<object>();
        foreach (var module in course.Modules.Where(item => item.IsPublished).OrderBy(item => item.SortOrder))
        {
            var moduleAccess = await StudentAccessAsync(courseId, LearningContentType.Unit, module.Id, cancellationToken);
            var lessons = new List<object>();
            foreach (var lesson in module.Lessons.Where(item => item.IsPublished).OrderBy(item => item.SortOrder))
            {
                var lessonAccess = await StudentAccessAsync(courseId, LearningContentType.Lesson, lesson.Id, cancellationToken);
                lessons.Add(new
                {
                    lesson.Id,
                    title = Localize(locale, lesson.ArabicTitle, lesson.EnglishTitle),
                    body = lessonAccess.IsAvailable ? Localize(locale, lesson.ArabicBody ?? "", lesson.EnglishBody ?? "") : null,
                    type = lesson.Type.ToString(),
                    lesson.DurationSeconds,
                    lesson.IsPreview,
                    isLocked = !lessonAccess.IsAvailable,
                    lockReason = lessonAccess.Reason,
                    lessonAccess.AvailableAtUtc,
                    video = lessonAccess.IsAvailable ? VideoView(lesson) : null,
                    resources = lessonAccess.IsAvailable
                        ? lesson.Resources.Where(resource => resource.IsDownloadable && resource.ScanStatus == UploadScanStatus.Clean).OrderBy(resource => resource.DisplayName).Select(resource => new { resource.Id, resource.DisplayName, resource.ContentType, resource.ExternalUrl })
                        : []
                });
            }
            modules.Add(new
            {
                module.Id,
                title = Localize(locale, module.UnitDefinition?.ArabicTitle ?? module.ArabicTitle, module.UnitDefinition?.EnglishTitle ?? module.EnglishTitle),
                isLocked = !moduleAccess.IsAvailable,
                lockReason = moduleAccess.Reason,
                moduleAccess.AvailableAtUtc,
                lessons
            });
        }
        return Ok(new { course.Id, title = Localize(locale, course.ArabicTitle, course.EnglishTitle), modules });
    }

    [HttpGet("lessons/{lessonId:guid}/resources/{resourceId:guid}")]
    public async Task<IActionResult> DownloadResource(Guid lessonId, Guid resourceId, CancellationToken cancellationToken)
    {
        var resource = await db.LessonResources.AsNoTracking().Include(x => x.Lesson).ThenInclude(x => x!.CourseModule).SingleOrDefaultAsync(x => x.Id == resourceId && x.LessonId == lessonId && x.IsDownloadable && x.ScanStatus == UploadScanStatus.Clean, cancellationToken);
        if (resource is null || !await CanAccessCourseAsync(resource.Lesson!.CourseModule!.CourseId, cancellationToken)
            || !(await StudentAccessAsync(resource.Lesson.CourseModule.CourseId, LearningContentType.Lesson, lessonId, cancellationToken)).IsAvailable) return NotFound();
        if (resource.ExternalUrl is not null) return Redirect(resource.ExternalUrl);
        var content = await storage.OpenPrivateReadAsync(resource.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, resource.ContentType, resource.DisplayName, enableRangeProcessing: true);
    }

    /// <summary>Streams a teacher-uploaded lesson video after the same ownership,
    /// enrollment, and release checks used for the course player.</summary>
    [HttpGet("lessons/{lessonId:guid}/video")]
    public async Task<IActionResult> StreamLessonVideo(Guid lessonId, CancellationToken cancellationToken)
    {
        var lesson = await db.Lessons.AsNoTracking()
            .Include(item => item.CourseModule).ThenInclude(item => item!.Course)
            .Include(item => item.Resources)
            .SingleOrDefaultAsync(item => item.Id == lessonId && item.IsPublished && item.CourseModule!.IsPublished
                && item.CourseModule.Course!.Status == CourseStatus.Published, cancellationToken);
        if (lesson is null || !await CanAccessCourseAsync(lesson.CourseModule!.CourseId, cancellationToken)
            || !(await StudentAccessAsync(lesson.CourseModule.CourseId, LearningContentType.Lesson, lessonId, cancellationToken)).IsAvailable)
            return NotFound();

        var video = FindVideoResource(lesson);
        if (video is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(video.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, video.ContentType, enableRangeProcessing: true);
    }

    [Authorize(Policy = "Student")]
    [HttpGet("courses/{courseId:guid}/resources")]
    public async Task<IActionResult> ResourceCenter(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var courseAccess = await contentAccess.CanAccessCourseAsync(UserId!, courseId, cancellationToken);
        if (!courseAccess.IsAvailable) return NotFound();
        var resources = await db.LessonResources.AsNoTracking()
            .Include(resource => resource.Lesson).ThenInclude(lesson => lesson!.CourseModule)
            .Where(resource => resource.Lesson!.CourseModule!.CourseId == courseId
                && resource.Lesson.IsPublished
                && resource.Lesson.CourseModule.IsPublished
                && resource.IsDownloadable
                && resource.ScanStatus == UploadScanStatus.Clean)
            .OrderBy(resource => resource.DisplayName)
            .ToListAsync(cancellationToken);
        var visible = new List<object>();
        foreach (var resource in resources)
        {
            if (!(await contentAccess.CanAccessAsync(UserId!, courseId, LearningContentType.Lesson, resource.LessonId, cancellationToken)).IsAvailable) continue;
            visible.Add(new
            {
                resource.Id,
                resource.LessonId,
                lessonTitle = Localize(locale, resource.Lesson!.ArabicTitle, resource.Lesson.EnglishTitle),
                resource.DisplayName,
                resource.ContentType,
                resource.ExternalUrl,
                category = ResourceCategory(resource.DisplayName, resource.ContentType)
            });
        }
        return Ok(visible);
    }

    [Authorize(Policy = "Student")]
    [HttpPost("lessons/{lessonId:guid}/progress")]
    public async Task<IActionResult> SaveProgress(Guid lessonId, ProgressRequest request, CancellationToken cancellationToken)
    {
        var progress = await coursePlayer.SaveProgressAsync(
            UserId!,
            lessonId,
            request.LastPositionSeconds,
            request.MarkCompleted,
            cancellationToken);
        return progress is null ? NotFound() : Ok(progress);
    }

    private async Task<bool> CanAccessCourseAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var userId = UserId;
        if (userId is null) return false;
        if (User.IsInRole("Admin")) return true;
        if (User.IsInRole("Teacher")) return await db.Courses.AnyAsync(x => x.Id == courseId && x.TeacherUserId == userId, cancellationToken);
        return await db.Enrollments.AnyAsync(x => x.CourseId == courseId && x.StudentUserId == userId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
    }
    private Task<ContentAccessDecision> StudentAccessAsync(Guid courseId, LearningContentType contentType, Guid contentId, CancellationToken cancellationToken) => User.IsInRole("Student")
        ? contentAccess.CanAccessAsync(UserId!, courseId, contentType, contentId, cancellationToken)
        : Task.FromResult(new ContentAccessDecision(true));
    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);
    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;
    private static Betcco.Domain.Learning.LessonResource? FindVideoResource(Betcco.Domain.Learning.Lesson lesson) =>
        Guid.TryParse(lesson.VideoReference, out var resourceId)
            ? lesson.Resources.SingleOrDefault(resource => resource.Id == resourceId
                && resource.ScanStatus == UploadScanStatus.Clean
                && resource.ContentType is "video/mp4" or "video/webm")
            : null;
    private static object? VideoView(Betcco.Domain.Learning.Lesson lesson)
    {
        var video = FindVideoResource(lesson);
        return video is null ? null : new { video.Id, video.DisplayName, video.ContentType };
    }
    private static string ResourceCategory(string displayName, string contentType)
    {
        var extension = Path.GetExtension(displayName).ToLowerInvariant();
        return extension switch
        {
            ".pdf" => "PDF",
            ".ppt" or ".pptx" => "PowerPoint",
            ".doc" or ".docx" => "Word",
            ".xls" or ".xlsx" => "Excel",
            ".zip" => "ZIP",
            ".mp4" or ".mp3" or ".wav" => "Video",
            ".txt" or ".json" or ".cs" or ".js" or ".ts" or ".py" => "Code",
            _ when contentType.Equals("text/uri-list", StringComparison.OrdinalIgnoreCase) => "Link",
            _ when contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) => "Other",
            _ => "Other"
        };
    }
}

public sealed record ProgressRequest(int LastPositionSeconds, bool MarkCompleted);
