namespace Betcco.Application.Learning;

public sealed record StudentCoursePlayerResult(
    Guid Id,
    string Title,
    Guid? ResumeLessonId,
    Guid? CurrentLessonId,
    Guid? PreviousLessonId,
    Guid? NextLessonId,
    bool RequestedLessonRejected,
    IReadOnlyList<StudentCoursePlayerModule> Modules);

public sealed record StudentCoursePlayerModule(
    Guid Id,
    string Title,
    bool IsLocked,
    string? LockReason,
    DateTimeOffset? AvailableAtUtc,
    IReadOnlyList<StudentCoursePlayerLesson> Lessons);

public sealed record StudentCoursePlayerLesson(
    Guid Id,
    string Title,
    string? Body,
    string Type,
    int DurationSeconds,
    bool IsPreview,
    bool IsLocked,
    string? LockReason,
    DateTimeOffset? AvailableAtUtc,
    StudentCoursePlayerVideo? Video,
    IReadOnlyList<StudentCoursePlayerResource> Resources,
    bool IsCompleted,
    int LastPositionSeconds,
    DateTimeOffset? LastVisitedAtUtc);

public sealed record StudentCoursePlayerVideo(
    Guid Id,
    string DisplayName,
    string ContentType);

public sealed record StudentCoursePlayerResource(
    Guid Id,
    string DisplayName,
    string ContentType,
    string? ExternalUrl);

public sealed record StudentLessonProgressResult(
    bool IsCompleted,
    int LastPositionSeconds,
    DateTimeOffset LastVisitedAtUtc);

public interface IStudentCoursePlayerService
{
    Task<StudentCoursePlayerResult?> GetAsync(
        string studentUserId,
        Guid courseId,
        string locale,
        Guid? requestedLessonId,
        CancellationToken cancellationToken = default);

    Task<StudentLessonProgressResult?> SaveProgressAsync(
        string studentUserId,
        Guid lessonId,
        int lastPositionSeconds,
        bool markCompleted,
        CancellationToken cancellationToken = default);
}
