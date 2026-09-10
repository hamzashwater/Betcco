using Betcco.Application.Catalog;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Serves only public, published catalog data. Short-lived memory caching is
/// intentionally limited to this service: learner progress, ownership, files,
/// payments, and other private state must never share this cache.
/// </summary>
public sealed class CatalogService(BetccoDbContext db, IMemoryCache cache) : ICatalogService
{
    public async Task<PagedResult<CourseSummary>> SearchAsync(CatalogQuery query, CancellationToken cancellationToken = default)
    {
        // Search terms can be unbounded. Cache the browsed catalogue only; a
        // typed search remains a direct query so it cannot exhaust cache space.
        if (!string.IsNullOrWhiteSpace(query.Search)) return await SearchUncachedAsync(query, cancellationToken);
        var key = $"catalog:published:v1:{Normalize(query.Locale)}:{Normalize(query.Track)}:{Normalize(query.Grade)}:{Normalize(query.Specialization)}:{Normalize(query.Subject)}:{Math.Max(1, query.Page)}:{Math.Clamp(query.PageSize, 1, 48)}:{Normalize(query.Sort)}";
        return (await cache.GetOrCreateAsync(key, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return await SearchUncachedAsync(query, cancellationToken);
        }))!;
    }

    private async Task<PagedResult<CourseSummary>> SearchUncachedAsync(CatalogQuery query, CancellationToken cancellationToken)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 48);
        var courses = db.Courses.AsNoTracking()
            .Include(x => x.LearningTrack).Include(x => x.Grade).Include(x => x.Specialization).Include(x => x.Subject)
            .Include(x => x.Modules).ThenInclude(x => x.Lessons)
            .Where(x => x.Status == CourseStatus.Published);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            courses = courses.Where(x => x.ArabicTitle.ToLower().Contains(term) || x.EnglishTitle.ToLower().Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(query.Track)) courses = courses.Where(x => x.LearningTrack!.Slug == query.Track);
        if (!string.IsNullOrWhiteSpace(query.Grade)) courses = courses.Where(x => x.Grade != null && x.Grade.Slug == query.Grade);
        if (!string.IsNullOrWhiteSpace(query.Specialization)) courses = courses.Where(x => x.Specialization != null && x.Specialization.Slug == query.Specialization);
        if (!string.IsNullOrWhiteSpace(query.Subject)) courses = courses.Where(x => x.Subject != null && x.Subject.Slug == query.Subject);

        courses = query.Sort switch
        {
            "price-asc" => courses.OrderBy(x => x.Price),
            "price-desc" => courses.OrderByDescending(x => x.Price),
            _ => courses.OrderByDescending(x => x.PublishedAtUtc)
        };
        var total = await courses.CountAsync(cancellationToken);
        var entries = await courses.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        var teacherNames = await GetTeacherNamesAsync(entries.Select(course => course.TeacherUserId), cancellationToken);
        return new PagedResult<CourseSummary>(entries.Select(course => ToSummary(course, query.Locale,
            course.TeacherUserId is not null && teacherNames.TryGetValue(course.TeacherUserId, out var teacherName) ? teacherName : null)).ToArray(), page, pageSize, total);
    }

    public async Task<CourseDetail?> GetBySlugAsync(string slug, string locale, CancellationToken cancellationToken = default)
    {
        var key = $"catalog:course:v1:{Normalize(slug)}:{Normalize(locale)}";
        if (cache.TryGetValue<CourseDetail>(key, out var cached)) return cached;
        var detail = await GetBySlugUncachedAsync(slug, locale, cancellationToken);
        if (detail is not null) cache.Set(key, detail, TimeSpan.FromSeconds(30));
        return detail;
    }

    private async Task<CourseDetail?> GetBySlugUncachedAsync(string slug, string locale, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking()
            .Include(x => x.LearningTrack).Include(x => x.Grade).Include(x => x.Specialization).Include(x => x.Subject)
            .Include(x => x.LearningOutcomes).Include(x => x.Skills)
            .Include(x => x.Modules).ThenInclude(x => x.Lessons)
            .SingleOrDefaultAsync(x => x.Slug == slug && x.Status == CourseStatus.Published, cancellationToken);
        if (course is null) return null;
        var modules = course.Modules.Where(x => x.IsPublished).OrderBy(x => x.SortOrder).Select(module =>
            new ModuleDetail(module.Id, Localize(locale, module.ArabicTitle, module.EnglishTitle), module.Lessons.Where(x => x.IsPublished || x.IsPreview)
                .OrderBy(x => x.SortOrder).Select(lesson => new LessonDetail(lesson.Id, Localize(locale, lesson.ArabicTitle, lesson.EnglishTitle), lesson.DurationSeconds, lesson.IsPreview, lesson.Type.ToString())).ToArray())).ToArray();
        var teacherNames = await GetTeacherNamesAsync([course.TeacherUserId], cancellationToken);
        var teacherName = course.TeacherUserId is not null && teacherNames.TryGetValue(course.TeacherUserId, out var value) ? value : null;
        return new CourseDetail(ToSummary(course, locale, teacherName), course.LearningOutcomes.OrderBy(x => x.SortOrder).Select(x => new LocalizedText(x.ArabicText, x.EnglishText)).ToArray(), course.Skills.OrderBy(x => x.SortOrder).Select(x => new LocalizedText(x.ArabicText, x.EnglishText)).ToArray(), modules);
    }

    private async Task<IReadOnlyDictionary<string, string>> GetTeacherNamesAsync(IEnumerable<string?> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds
            .Select(id => Guid.TryParse(id, out var parsed) ? parsed : (Guid?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        if (ids.Length == 0) return new Dictionary<string, string>();
        return await db.Users.AsNoTracking().Where(user => ids.Contains(user.Id))
            .Select(user => new { Id = user.Id.ToString(), user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
    }

    private static CourseSummary ToSummary(Betcco.Domain.Learning.Course course, string locale, string? teacherName = null)
    {
        var lessons = course.Modules.SelectMany(x => x.Lessons).Where(x => x.IsPublished).ToArray();
        return new CourseSummary(course.Id, course.Slug, Localize(locale, course.ArabicTitle, course.EnglishTitle), Localize(locale, course.ArabicDescription, course.EnglishDescription),
            Localize(locale, course.LearningTrack!.ArabicName, course.LearningTrack.EnglishName), course.Grade is null ? null : Localize(locale, course.Grade.ArabicName, course.Grade.EnglishName),
            course.Specialization is null ? null : Localize(locale, course.Specialization.ArabicName, course.Specialization.EnglishName), course.Subject is null ? null : Localize(locale, course.Subject.ArabicName, course.Subject.EnglishName),
            course.Price, course.Currency, course.IsFree, lessons.Length, lessons.Sum(x => x.DurationSeconds) / 60, course.CoverImageKey, teacherName);
    }

    private static string Localize(string locale, string arabic, string english) => locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? arabic : english;
    private static string Normalize(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;
}
