using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class StudentCoursePlayerService(
    BetccoDbContext db,
    IContentAccessService contentAccess) : IStudentCoursePlayerService
{
    public async Task<StudentCoursePlayerResult?> GetAsync(
        string studentUserId,
        Guid courseId,
        string locale,
        Guid? requestedLessonId,
        CancellationToken cancellationToken = default)
    {
        var courseAccess = await contentAccess.CanAccessCourseAsync(studentUserId, courseId, cancellationToken);
        if (!courseAccess.IsAvailable) return null;

        var course = await db.Courses.AsNoTracking()
            .Include(item => item.Modules)
                .ThenInclude(item => item.Lessons)
                    .ThenInclude(item => item.Resources)
            .Include(item => item.Modules).ThenInclude(item => item.UnitDefinition)
            .SingleOrDefaultAsync(item => item.Id == courseId && item.Status == CourseStatus.Published, cancellationToken);
        if (course is null) return null;

        var publishedLessons = course.Modules
            .Where(module => module.IsPublished)
            .OrderBy(module => module.SortOrder)
            .ThenBy(module => module.Id)
            .SelectMany(module => module.Lessons
                .Where(lesson => lesson.IsPublished && lesson.Type != LessonType.LegacyArchived)
                .OrderBy(lesson => lesson.SortOrder)
                .ThenBy(lesson => lesson.Id))
            .ToArray();
        var lessonIds = publishedLessons.Select(lesson => lesson.Id).ToArray();
        var progress = lessonIds.Length == 0
            ? new Dictionary<Guid, LessonProgress>()
            : await db.LessonProgresses.AsNoTracking()
                .Where(item => item.StudentUserId == studentUserId && lessonIds.Contains(item.LessonId))
                .ToDictionaryAsync(item => item.LessonId, cancellationToken);

        var lessonAccess = new Dictionary<Guid, ContentAccessDecision>(lessonIds.Length);
        foreach (var lessonId in lessonIds)
        {
            lessonAccess[lessonId] = await contentAccess.CanAccessAsync(
                studentUserId,
                courseId,
                LearningContentType.Lesson,
                lessonId,
                cancellationToken);
        }

        var accessibleLessons = publishedLessons
            .Where(lesson => lessonAccess[lesson.Id].IsAvailable)
            .ToArray();
        var resumeLesson = accessibleLessons
            .Where(lesson => progress.TryGetValue(lesson.Id, out var item) && !item.IsCompleted)
            .OrderByDescending(lesson => progress[lesson.Id].LastVisitedAtUtc)
            .FirstOrDefault()
            ?? accessibleLessons.FirstOrDefault(lesson => !progress.GetValueOrDefault(lesson.Id)?.IsCompleted ?? true)
            ?? accessibleLessons
                .Where(lesson => progress.ContainsKey(lesson.Id))
                .OrderByDescending(lesson => progress[lesson.Id].LastVisitedAtUtc)
                .FirstOrDefault()
            ?? accessibleLessons.FirstOrDefault();
        var requestedLesson = requestedLessonId is { } requested
            ? accessibleLessons.SingleOrDefault(lesson => lesson.Id == requested)
            : null;
        var requestedLessonRejected = requestedLessonId.HasValue && requestedLesson is null;
        var currentLesson = requestedLesson ?? resumeLesson;
        var currentAccessibleIndex = currentLesson is null
            ? -1
            : Array.FindIndex(accessibleLessons, lesson => lesson.Id == currentLesson.Id);
        var previousLessonId = currentAccessibleIndex > 0
            ? accessibleLessons[currentAccessibleIndex - 1].Id
            : (Guid?)null;
        var nextLessonId = currentAccessibleIndex >= 0 && currentAccessibleIndex < accessibleLessons.Length - 1
            ? accessibleLessons[currentAccessibleIndex + 1].Id
            : (Guid?)null;

        var modules = new List<StudentCoursePlayerModule>();
        foreach (var module in course.Modules.Where(item => item.IsPublished).OrderBy(item => item.SortOrder).ThenBy(item => item.Id))
        {
            var moduleAccess = await contentAccess.CanAccessAsync(
                studentUserId,
                courseId,
                LearningContentType.Unit,
                module.Id,
                cancellationToken);
            var lessons = module.Lessons
                .Where(item => item.IsPublished && item.Type != LessonType.LegacyArchived)
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Id)
                .Select(lesson => LessonView(lesson, locale, lessonAccess[lesson.Id], progress.GetValueOrDefault(lesson.Id)))
                .ToArray();
            modules.Add(new StudentCoursePlayerModule(
                module.Id,
                Localize(locale, module.UnitDefinition?.ArabicTitle ?? module.ArabicTitle, module.UnitDefinition?.EnglishTitle ?? module.EnglishTitle),
                !moduleAccess.IsAvailable,
                moduleAccess.Reason,
                moduleAccess.AvailableAtUtc,
                lessons));
        }

        return new StudentCoursePlayerResult(
            course.Id,
            Localize(locale, course.ArabicTitle, course.EnglishTitle),
            resumeLesson?.Id,
            currentLesson?.Id,
            previousLessonId,
            nextLessonId,
            requestedLessonRejected,
            modules);
    }

    public async Task<StudentLessonProgressResult?> SaveProgressAsync(
        string studentUserId,
        Guid lessonId,
        int lastPositionSeconds,
        bool markCompleted,
        CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.AsNoTracking()
            .Include(item => item.CourseModule)
            .SingleOrDefaultAsync(item => item.Id == lessonId
                && item.IsPublished
                && item.Type != LessonType.LegacyArchived
                && item.CourseModule!.IsPublished
                && item.CourseModule.Course!.Status == CourseStatus.Published,
                cancellationToken);
        if (lesson is null) return null;
        var access = await contentAccess.CanAccessAsync(
            studentUserId,
            lesson.CourseModule!.CourseId,
            LearningContentType.Lesson,
            lessonId,
            cancellationToken);
        if (!access.IsAvailable) return null;

        var progress = await db.LessonProgresses
            .SingleOrDefaultAsync(item => item.StudentUserId == studentUserId && item.LessonId == lessonId, cancellationToken);
        if (progress is null)
        {
            progress = new LessonProgress { StudentUserId = studentUserId, LessonId = lessonId };
            db.LessonProgresses.Add(progress);
        }

        var maximumPosition = Math.Max(0, lesson.DurationSeconds);
        progress.LastPositionSeconds = Math.Clamp(lastPositionSeconds, 0, maximumPosition);
        var meetsCompletionRule = lesson.Type != LessonType.Video
            || maximumPosition == 0
            || progress.LastPositionSeconds >= (int)(maximumPosition * .8);
        progress.IsCompleted = progress.IsCompleted || (markCompleted && meetsCompletionRule);
        progress.LastVisitedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return new StudentLessonProgressResult(
            progress.IsCompleted,
            progress.LastPositionSeconds,
            progress.LastVisitedAtUtc);
    }

    private static StudentCoursePlayerLesson LessonView(
        Lesson lesson,
        string locale,
        ContentAccessDecision access,
        LessonProgress? progress)
    {
        var video = access.IsAvailable ? FindVideoResource(lesson) : null;
        return new StudentCoursePlayerLesson(
            lesson.Id,
            Localize(locale, lesson.ArabicTitle, lesson.EnglishTitle),
            access.IsAvailable ? Localize(locale, lesson.ArabicBody ?? "", lesson.EnglishBody ?? "") : null,
            lesson.Type.ToString(),
            lesson.DurationSeconds,
            lesson.IsPreview,
            !access.IsAvailable,
            access.Reason,
            access.AvailableAtUtc,
            video is null ? null : new StudentCoursePlayerVideo(video.Id, video.DisplayName, video.ContentType),
            access.IsAvailable
                ? lesson.Resources
                    .Where(resource => resource.IsDownloadable && resource.ScanStatus == UploadScanStatus.Clean)
                    .OrderBy(resource => resource.DisplayName)
                    .Select(resource => new StudentCoursePlayerResource(resource.Id, resource.DisplayName, resource.ContentType, resource.ExternalUrl))
                    .ToArray()
                : [],
            progress?.IsCompleted ?? false,
            progress?.LastPositionSeconds ?? 0,
            progress?.LastVisitedAtUtc);
    }

    private static LessonResource? FindVideoResource(Lesson lesson) =>
        Guid.TryParse(lesson.VideoReference, out var resourceId)
            ? lesson.Resources.SingleOrDefault(resource => resource.Id == resourceId
                && resource.ScanStatus == UploadScanStatus.Clean
                && resource.ContentType is "video/mp4" or "video/webm")
            : null;

    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;
}
