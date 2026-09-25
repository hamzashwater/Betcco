using Betcco.Domain.Common;

namespace Betcco.Application.Learning;

public sealed record ContentAccessDecision(
    bool IsAvailable,
    string? Reason = null,
    DateTimeOffset? AvailableAtUtc = null,
    LearningContentType? RequiredContentType = null,
    Guid? RequiredContentId = null);

public sealed record ComprehensivePracticeProgressSnapshot(Guid ModuleId, bool AllAimsComplete);

public sealed record ContentReleaseConfiguration(
    Guid CourseId,
    LearningContentType TargetType,
    Guid TargetId,
    ContentReleaseMode ReleaseMode,
    DateTimeOffset? SpecificDateUtc,
    int? DaysAfterEnrollment,
    LearningContentType? PreviousContentType,
    Guid? PreviousContentId);

public sealed record ContentPrerequisiteConfiguration(
    Guid Id,
    Guid CourseId,
    LearningContentType TargetType,
    Guid TargetId,
    LearningContentType RequiredContentType,
    Guid RequiredContentId);

public interface IContentAccessService
{
    Task<ContentAccessDecision> CanAccessAsync(
        string studentUserId,
        Guid courseId,
        LearningContentType contentType,
        Guid contentId,
        CancellationToken cancellationToken = default);

    Task<ContentAccessDecision> CanAccessComprehensiveForDisplayAsync(
        string studentUserId, Guid courseId, Guid assignmentId,
        ComprehensivePracticeProgressSnapshot progress, CancellationToken cancellationToken = default) =>
        CanAccessAsync(studentUserId, courseId, LearningContentType.Assignment, assignmentId, cancellationToken);

    Task<ContentAccessDecision> CanAccessCourseAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<ContentReleaseConfiguration>> GetRulesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ContentPrerequisiteConfiguration>> GetPrerequisitesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default);
    Task<bool> SetReleaseRuleAsync(string teacherUserId, ContentReleaseConfiguration configuration, CancellationToken cancellationToken = default);
    Task<Guid?> AddPrerequisiteAsync(string teacherUserId, ContentPrerequisiteConfiguration configuration, CancellationToken cancellationToken = default);
    Task<bool> RemovePrerequisiteAsync(string teacherUserId, Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken = default);
}
