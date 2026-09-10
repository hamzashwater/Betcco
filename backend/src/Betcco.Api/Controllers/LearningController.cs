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
public sealed class LearningController(BetccoDbContext db, IFileStorage storage, IContentAccessService contentAccess) : ControllerBase
{
    [Authorize(Policy = "Student")]
    [HttpGet("my-courses")]
    public async Task<IActionResult> MyCourses([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var userId = UserId!;
        var enrollments = await db.Enrollments.Include(x => x.Course!).ThenInclude(x => x.Modules).ThenInclude(x => x.Lessons).AsNoTracking().Where(x => x.StudentUserId == userId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow)).OrderByDescending(x => x.EnrolledAtUtc).ToListAsync(cancellationToken);
        var lessonIds = enrollments
            .SelectMany(enrollment => enrollment.Course!.Modules.Where(module => module.IsPublished))
            .SelectMany(module => module.Lessons.Where(lesson => lesson.IsPublished))
            .Select(lesson => lesson.Id)
            .ToArray();
        var completedLessonIds = (await db.LessonProgresses.AsNoTracking().Where(x => x.StudentUserId == userId && x.IsCompleted && lessonIds.Contains(x.LessonId)).Select(x => x.LessonId).ToListAsync(cancellationToken)).ToHashSet();
        return Ok(enrollments.Select(enrollment => new
        {
            enrollment.CourseId,
            title = Localize(locale, enrollment.Course!.ArabicTitle, enrollment.Course.EnglishTitle),
            completed = enrollment.Course.Modules.Where(module => module.IsPublished).SelectMany(module => module.Lessons).Count(lesson => lesson.IsPublished && completedLessonIds.Contains(lesson.Id)),
            total = enrollment.Course.Modules.Where(module => module.IsPublished).SelectMany(module => module.Lessons).Count(lesson => lesson.IsPublished)
        }));
    }
    [HttpGet("courses/{courseId:guid}/player")]
    public async Task<IActionResult> Player(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.Include(x => x.Modules).ThenInclude(x => x.Lessons).ThenInclude(x => x.Resources).AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId && x.Status == CourseStatus.Published, cancellationToken);
        if (course is null || !await CanAccessCourseAsync(courseId, cancellationToken)) return NotFound();
        if (User.IsInRole("Student"))
        {
            var courseDecision = await contentAccess.CanAccessCourseAsync(UserId!, courseId, cancellationToken);
            if (!courseDecision.IsAvailable) return Conflict(new { message = "Complete this course's prerequisite before opening its player.", courseDecision.Reason, courseDecision.AvailableAtUtc });
        }
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
                title = Localize(locale, module.ArabicTitle, module.EnglishTitle),
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
            .Include(item => item.CourseModule)
            .Include(item => item.Resources)
            .SingleOrDefaultAsync(item => item.Id == lessonId && item.IsPublished && item.CourseModule!.IsPublished, cancellationToken);
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
        var lesson = await db.Lessons.Include(x => x.CourseModule).SingleOrDefaultAsync(x => x.Id == lessonId && x.IsPublished && x.CourseModule!.IsPublished, cancellationToken);
        if (lesson is null || !await CanAccessCourseAsync(lesson.CourseModule!.CourseId, cancellationToken)
            || !(await StudentAccessAsync(lesson.CourseModule.CourseId, LearningContentType.Lesson, lessonId, cancellationToken)).IsAvailable) return NotFound();
        var userId = UserId!;
        var progress = await db.LessonProgresses.SingleOrDefaultAsync(x => x.StudentUserId == userId && x.LessonId == lessonId, cancellationToken);
        if (progress is null) { progress = new Betcco.Domain.Learning.LessonProgress { StudentUserId = userId, LessonId = lessonId }; db.LessonProgresses.Add(progress); }
        progress.LastPositionSeconds = Math.Clamp(request.LastPositionSeconds, 0, Math.Max(lesson.DurationSeconds, request.LastPositionSeconds));
        progress.IsCompleted = request.MarkCompleted && (lesson.Type != LessonType.Video || lesson.DurationSeconds == 0 || progress.LastPositionSeconds >= (int)(lesson.DurationSeconds * .8));
        progress.LastVisitedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { progress.IsCompleted, progress.LastPositionSeconds });
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
    private static string Localize(string locale, string arabic, string english) => locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? arabic : english;
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
