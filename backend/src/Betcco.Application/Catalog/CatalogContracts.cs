namespace Betcco.Application.Catalog;

public sealed record CatalogQuery(
    string Locale,
    string? Search,
    string? Track,
    string? Grade,
    string? Specialization,
    string? Subject,
    int Page = 1,
    int PageSize = 12,
    string Sort = "newest");

public sealed record CourseSummary(
    Guid Id,
    string Slug,
    string Title,
    string Description,
    string Track,
    string? Grade,
    string? Specialization,
    string? Subject,
    decimal Price,
    string Currency,
    bool IsFree,
    int LessonCount,
    int DurationMinutes,
    string? CoverImageKey,
    string? TeacherName = null);

public sealed record CourseDetail(
    CourseSummary Course,
    IReadOnlyCollection<LocalizedText> Outcomes,
    IReadOnlyCollection<LocalizedText> Skills,
    IReadOnlyCollection<ModuleDetail> Modules);

public sealed record LocalizedText(string Arabic, string English);
public sealed record ModuleDetail(Guid Id, string Title, IReadOnlyCollection<LessonDetail> Lessons);
public sealed record LessonDetail(Guid Id, string Title, int DurationSeconds, bool IsPreview, string Type);
public sealed record PagedResult<T>(IReadOnlyCollection<T> Items, int Page, int PageSize, int TotalCount);

public interface ICatalogService
{
    Task<PagedResult<CourseSummary>> SearchAsync(CatalogQuery query, CancellationToken cancellationToken = default);
    Task<CourseDetail?> GetBySlugAsync(string slug, string locale, CancellationToken cancellationToken = default);
}
