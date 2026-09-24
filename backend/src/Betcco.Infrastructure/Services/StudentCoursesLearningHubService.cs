using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class StudentCoursesLearningHubService(
    BetccoDbContext db,
    IContentAccessService contentAccess) : IStudentCoursesLearningHubService
{
    public async Task<StudentCoursesLearningHubResult> GetAsync(
        string studentUserId,
        StudentCoursesLearningHubQuery query,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var search = query.Search?.Trim();
        var arabic = query.Locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var enrollments = db.Enrollments.AsNoTracking()
            .Where(enrollment => enrollment.StudentUserId == studentUserId
                && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > now)
                && enrollment.Course!.Status == CourseStatus.Published);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = search.ToLowerInvariant();
            enrollments = enrollments.Where(enrollment =>
                enrollment.Course!.ArabicTitle.ToLower().Contains(normalizedSearch)
                || enrollment.Course.EnglishTitle.ToLower().Contains(normalizedSearch));
        }

        var rows = enrollments.Select(enrollment => new StudentCourseQueryRow
        {
            CourseId = enrollment.CourseId,
            ArabicTitle = enrollment.Course!.ArabicTitle,
            EnglishTitle = enrollment.Course.EnglishTitle,
            TeacherUserId = enrollment.Course.TeacherUserId,
            EnrolledAtUtc = enrollment.EnrolledAtUtc,
            HasCover = enrollment.Course.CoverImageKey != null,
            PublishedModuleCount = enrollment.Course.Modules.Count(module => module.IsPublished),
            HasCanonicalLearningAims = enrollment.Course.Modules.Any(module => module.IsPublished && module.UnitDefinitionId != null),
            TotalLessons = enrollment.Course.Modules
                .Where(module => module.IsPublished)
                .SelectMany(module => module.Lessons)
                .Count(lesson => lesson.IsPublished && lesson.Type != LessonType.LegacyArchived),
            CompletedLessons = db.LessonProgresses.Count(progress =>
                progress.StudentUserId == studentUserId
                && progress.IsCompleted
                && enrollment.Course.Modules.Any(module => module.IsPublished
                    && module.Lessons.Any(lesson => lesson.IsPublished && lesson.Type != LessonType.LegacyArchived && lesson.Id == progress.LessonId))),
            RecentProgressAtUtc = db.LessonProgresses
                .Where(progress => progress.StudentUserId == studentUserId
                    && enrollment.Course.Modules.Any(module => module.IsPublished
                        && module.Lessons.Any(lesson => lesson.IsPublished && lesson.Type != LessonType.LegacyArchived && lesson.Id == progress.LessonId)))
                .Max(progress => (DateTimeOffset?)progress.LastVisitedAtUtc)
        });

        var totalCourses = await rows.CountAsync(cancellationToken);
        var notStarted = await rows.CountAsync(row => row.CompletedLessons == 0, cancellationToken);
        var inProgress = await rows.CountAsync(row => row.CompletedLessons > 0
            && (row.HasCanonicalLearningAims || row.TotalLessons == 0 || row.CompletedLessons < row.TotalLessons), cancellationToken);
        var completed = await rows.CountAsync(row => !row.HasCanonicalLearningAims && row.TotalLessons > 0
            && row.CompletedLessons == row.TotalLessons, cancellationToken);
        var completedLessons = await rows.SumAsync(row => row.CompletedLessons, cancellationToken);
        var totalLessons = await rows.SumAsync(row => row.TotalLessons, cancellationToken);
        var summary = new StudentCoursesLearningHubSummary(
            totalCourses,
            notStarted,
            inProgress,
            completed,
            completedLessons,
            totalLessons,
            ProgressPercent(completedLessons, totalLessons));

        var filteredRows = query.Progress switch
        {
            StudentCourseProgressFilter.NotStarted => rows.Where(row => row.CompletedLessons == 0),
            StudentCourseProgressFilter.InProgress => rows.Where(row => row.CompletedLessons > 0
                && (row.HasCanonicalLearningAims || row.TotalLessons == 0 || row.CompletedLessons < row.TotalLessons)),
            StudentCourseProgressFilter.Completed => rows.Where(row => !row.HasCanonicalLearningAims && row.TotalLessons > 0
                && row.CompletedLessons == row.TotalLessons),
            _ => rows
        };
        var totalCount = await filteredRows.CountAsync(cancellationToken);
        var orderedRows = Order(filteredRows, query.Sort, arabic);
        var pageRows = await orderedRows
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        var teacherIds = pageRows
            .Select(row => Guid.TryParse(row.TeacherUserId, out var id) ? id : (Guid?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        var teacherNames = teacherIds.Length == 0
            ? new Dictionary<string, string>()
            : await db.Users.AsNoTracking()
                .Where(user => teacherIds.Contains(user.Id))
                .Select(user => new { Id = user.Id.ToString(), user.DisplayName })
                .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);

        var items = new List<StudentCourseLearningHubItem>(pageRows.Count);
        foreach (var row in pageRows)
        {
            var access = await contentAccess.CanAccessCourseAsync(studentUserId, row.CourseId, cancellationToken);
            var state = ProgressState(row.CompletedLessons, row.TotalLessons, row.HasCanonicalLearningAims);
            items.Add(new StudentCourseLearningHubItem(
                row.CourseId,
                row.ArabicTitle,
                row.EnglishTitle,
                arabic ? row.ArabicTitle : row.EnglishTitle,
                row.CompletedLessons,
                row.TotalLessons,
                row.PublishedModuleCount,
                ProgressPercent(row.CompletedLessons, row.TotalLessons),
                state,
                row.HasCover,
                row.TeacherUserId is null ? null : teacherNames.GetValueOrDefault(row.TeacherUserId),
                row.EnrolledAtUtc,
                row.RecentProgressAtUtc,
                access.IsAvailable,
                access.Reason,
                access.AvailableAtUtc));
        }

        return new StudentCoursesLearningHubResult(items, query.Page, query.PageSize, totalCount, summary);
    }

    private static IOrderedQueryable<StudentCourseQueryRow> Order(
        IQueryable<StudentCourseQueryRow> rows,
        StudentCourseSort sort,
        bool arabic)
    {
        var ordered = sort switch
        {
            StudentCourseSort.Progress => rows
                .OrderByDescending(row => row.TotalLessons == 0
                    ? 0m
                    : (decimal)row.CompletedLessons / row.TotalLessons)
                .ThenBy(row => arabic ? row.ArabicTitle : row.EnglishTitle),
            StudentCourseSort.Title => rows
                .OrderBy(row => arabic ? row.ArabicTitle : row.EnglishTitle),
            _ => rows
                .OrderByDescending(row => row.RecentProgressAtUtc ?? row.EnrolledAtUtc)
                .ThenBy(row => arabic ? row.ArabicTitle : row.EnglishTitle)
        };
        return ordered.ThenBy(row => row.CourseId);
    }

    private static decimal ProgressPercent(int completed, int total) => total == 0
        ? 0m
        : Math.Round(completed * 100m / total, 2, MidpointRounding.AwayFromZero);

    private static string ProgressState(int completed, int total, bool hasCanonicalLearningAims)
    {
        if (completed == 0) return "NotStarted";
        return !hasCanonicalLearningAims && total > 0 && completed == total ? "Completed" : "InProgress";
    }

    private sealed class StudentCourseQueryRow
    {
        public Guid CourseId { get; init; }
        public required string ArabicTitle { get; init; }
        public required string EnglishTitle { get; init; }
        public string? TeacherUserId { get; init; }
        public DateTimeOffset EnrolledAtUtc { get; init; }
        public bool HasCover { get; init; }
        public int PublishedModuleCount { get; init; }
        public bool HasCanonicalLearningAims { get; init; }
        public int TotalLessons { get; init; }
        public int CompletedLessons { get; init; }
        public DateTimeOffset? RecentProgressAtUtc { get; init; }
    }
}
