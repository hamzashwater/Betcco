using Betcco.Domain.Common;

namespace Betcco.Application.Assignments;

public sealed record CreateCourseAssignmentCommand(
    Guid CourseId,
    Guid? ModuleId,
    Guid? LessonId,
    Guid? LearningAimId,
    string ArabicTitle,
    string EnglishTitle,
    string ArabicInstructions,
    string EnglishInstructions,
    DateTimeOffset? AvailableFromUtc,
    DateTimeOffset? DueAtUtc,
    int MaxSubmissionAttempts,
    decimal? MaxScore,
    bool AllowResubmission = true,
    int MaxFileSizeBytes = 100 * 1024 * 1024,
    IReadOnlyCollection<string>? AllowedFileExtensions = null);

public sealed record UpdateCourseAssignmentCommand(
    Guid? ModuleId,
    Guid? LessonId,
    Guid? LearningAimId,
    string ArabicTitle,
    string EnglishTitle,
    string ArabicInstructions,
    string EnglishInstructions,
    DateTimeOffset? AvailableFromUtc,
    DateTimeOffset? DueAtUtc,
    int MaxSubmissionAttempts,
    decimal? MaxScore,
    bool AllowResubmission = true,
    int MaxFileSizeBytes = 100 * 1024 * 1024,
    IReadOnlyCollection<string>? AllowedFileExtensions = null);

public sealed record AddCourseAssignmentCriterionCommand(
    Guid AssignmentId,
    Guid? BtecCriterionId,
    string? Code,
    string? Band,
    string? ArabicDescription,
    string? EnglishDescription,
    int SortOrder);

public sealed record AssignmentCriterionSubmission(
    Guid CriterionId,
    string Achievement,
    string? Feedback);

public sealed record AssignmentGradeCommand(
    IReadOnlyCollection<AssignmentCriterionSubmission> Results,
    string? OverallFeedback,
    string? PrivateTeacherNotes = null);

public sealed record CreateLearningAimPracticeCommand(
    Guid LearningAimId, string ArabicTitle, string EnglishTitle,
    string ArabicInstructions, string EnglishInstructions, DateTimeOffset? DueAtUtc);

public sealed record ReviewLearningAimPracticeCommand(
    string TrainingOutcome, string Strengths, string Gaps, string ImprovementGuidance);
public enum PracticeReviewResult { Finalized, Invalid, Conflict }

public sealed record CourseAssignmentSubmissionView(Guid SubmissionId, int VersionNumber, string Status);
public enum CourseAssignmentFileAddStatus { Added, SubmissionNotFound, Rejected, ScannerUnavailable, RejectedByAssignmentPolicy }

public interface ICourseAssignmentService
{
    Task<Guid?> CreatePracticeAsync(string teacherUserId, CreateLearningAimPracticeCommand command, CancellationToken cancellationToken = default);
    Task<PracticeReviewResult> ReviewPracticeAsync(string teacherUserId, Guid submissionId, ReviewLearningAimPracticeCommand command, CancellationToken cancellationToken = default);
    Task<Guid?> CreateAsync(string teacherUserId, CreateCourseAssignmentCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(string teacherUserId, Guid assignmentId, UpdateCourseAssignmentCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default);
    Task<Guid?> AddCriterionAsync(string teacherUserId, AddCourseAssignmentCriterionCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteCriterionAsync(string teacherUserId, Guid criterionId, CancellationToken cancellationToken = default);
    Task<bool> PublishAsync(string teacherUserId, Guid assignmentId, bool publish, CancellationToken cancellationToken = default);
    Task<bool> SetPublicationStatusAsync(string teacherUserId, Guid assignmentId, string publicationStatus, DateTimeOffset? availableFromUtc, CancellationToken cancellationToken = default);
    Task<bool> AddResourceAsync(string teacherUserId, Guid assignmentId, string displayName, string storageKey, string contentType, CancellationToken cancellationToken = default);
    Task<bool> DeleteResourceAsync(string teacherUserId, Guid resourceId, CancellationToken cancellationToken = default);
    Task<CourseAssignmentSubmissionView?> StartSubmissionAsync(string studentUserId, Guid assignmentId, string? comment, CancellationToken cancellationToken = default);
    Task<CourseAssignmentFileAddStatus> AddFileAsync(string studentUserId, Guid submissionId, string originalName, string contentType, long length, Stream content, CancellationToken cancellationToken = default);
    Task<bool> SubmitAsync(string studentUserId, Guid submissionId, CancellationToken cancellationToken = default);
    Task<bool> GradeAsync(string teacherUserId, Guid submissionId, AssignmentGradeCommand command, CancellationToken cancellationToken = default);
    Task<bool> RequestRevisionAsync(string teacherUserId, Guid submissionId, string feedback, CancellationToken cancellationToken = default);
}
