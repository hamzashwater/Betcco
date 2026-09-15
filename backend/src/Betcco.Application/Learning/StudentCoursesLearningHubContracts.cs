namespace Betcco.Application.Learning;

public enum StudentCourseProgressState
{
    NotStarted,
    InProgress,
    Completed
}

public enum StudentCourseProgressFilter
{
    All,
    NotStarted,
    InProgress,
    Completed
}

public enum StudentCourseSort
{
    Recent,
    Progress,
    Title
}

public sealed record StudentCoursesLearningHubQuery(
    string Locale,
    int Page,
    int PageSize,
    string? Search,
    StudentCourseProgressFilter Progress,
    StudentCourseSort Sort);

public sealed record StudentCourseLearningHubItem(
    Guid CourseId,
    string ArabicTitle,
    string EnglishTitle,
    string LocalizedTitle,
    int CompletedLessons,
    int TotalLessons,
    int PublishedModuleCount,
    decimal ProgressPercent,
    StudentCourseProgressState ProgressState,
    bool HasCover,
    string? TeacherName,
    DateTimeOffset EnrolledAtUtc,
    DateTimeOffset? RecentProgressAtUtc,
    bool AccessAvailable,
    string? AccessReason,
    DateTimeOffset? AccessAvailableAtUtc);

public sealed record StudentCoursesLearningHubSummary(
    int TotalCourses,
    int NotStarted,
    int InProgress,
    int Completed);

public sealed record StudentCoursesLearningHubResult(
    IReadOnlyList<StudentCourseLearningHubItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    StudentCoursesLearningHubSummary Summary);

public interface IStudentCoursesLearningHubService
{
    Task<StudentCoursesLearningHubResult> GetAsync(
        string studentUserId,
        StudentCoursesLearningHubQuery query,
        CancellationToken cancellationToken = default);
}
