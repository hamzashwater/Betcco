namespace Betcco.Application.Courses;

public sealed record CreateCourseCommand(
    string ArabicTitle,
    string EnglishTitle,
    string ArabicDescription,
    string EnglishDescription,
    Guid LearningTrackId,
    Guid? GradeId,
    Guid? SpecializationId,
    Guid? SubjectId,
    decimal Price,
    bool IsFree,
    Guid? DeliveryPlanId = null);

public sealed record CreateModuleCommand(
    Guid CourseId,
    string ArabicTitle,
    string EnglishTitle,
    int SortOrder,
    string? UnitCode = null,
    string? ArabicDescription = null,
    string? EnglishDescription = null,
    int? GuidedLearningHours = null,
    int? Credits = null,
    string? QualificationLevel = null,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null,
    Guid? UnitDefinitionId = null,
    Guid? DeliveryPlanEntryId = null);

public sealed record LinkCourseUnitCommand(Guid UnitDefinitionId);

public sealed record CreateLearningAimCommand(
    Guid ModuleId,
    string Code,
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicDescription,
    string? EnglishDescription,
    int SortOrder,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record CreateTopicCommand(
    Guid LearningAimId,
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicDescription,
    string? EnglishDescription,
    int SortOrder,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record CreateBtecCriterionCommand(
    Guid ModuleId,
    Guid? LearningAimId,
    string Code,
    string Band,
    string ArabicDescription,
    string EnglishDescription,
    string? ArabicEvidenceGuidance,
    string? EnglishEvidenceGuidance,
    int SortOrder,
    string PublicationStatus = "Published");

public sealed record CreateLessonCommand(
    Guid ModuleId,
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicBody,
    string? EnglishBody,
    string Type,
    int DurationSeconds,
    bool IsPreview,
    int SortOrder,
    Guid? LearningAimId = null,
    Guid? TopicId = null,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record UpdateCourseCommand(string ArabicTitle, string EnglishTitle, string ArabicDescription, string EnglishDescription, decimal Price, bool IsFree);
public sealed record UpdateModuleCommand(
    string ArabicTitle,
    string EnglishTitle,
    int SortOrder,
    string? UnitCode = null,
    string? ArabicDescription = null,
    string? EnglishDescription = null,
    int? GuidedLearningHours = null,
    int? Credits = null,
    string? QualificationLevel = null,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record UpdateLearningAimCommand(
    string Code,
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicDescription,
    string? EnglishDescription,
    int SortOrder,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record UpdateTopicCommand(
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicDescription,
    string? EnglishDescription,
    int SortOrder,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record UpdateBtecCriterionCommand(
    string Code,
    string Band,
    string ArabicDescription,
    string EnglishDescription,
    string? ArabicEvidenceGuidance,
    string? EnglishEvidenceGuidance,
    int SortOrder,
    string PublicationStatus = "Published");

public sealed record UpdateLessonCommand(
    string ArabicTitle,
    string EnglishTitle,
    string? ArabicBody,
    string? EnglishBody,
    string Type,
    int DurationSeconds,
    bool IsPreview,
    int SortOrder,
    Guid? LearningAimId = null,
    Guid? TopicId = null,
    string PublicationStatus = "Published",
    DateTimeOffset? AvailableFromUtc = null);

public sealed record SetCoursePresentationCommand(Guid CourseId, string CoverImageKey, string CoverImageContentType, string? SeoTitle, string? SeoDescription);
public sealed record AddLessonResourceCommand(Guid LessonId, string DisplayName, string StorageKey, string ContentType, bool IsDownloadable);
/// <summary>
/// A private, stream-only video attached to a video lesson.  Its storage key is
/// never exposed to the browser; the API resolves it only after checking the
/// learner's enrollment and lesson-release access.
/// </summary>
public sealed record AddLessonVideoCommand(Guid LessonId, string DisplayName, string StorageKey, string ContentType);
public sealed record LessonVideoChangeResult(Guid? VideoId, IReadOnlyList<Guid> DeletionOperationIds);
public sealed record AddLessonResourceLinkCommand(Guid LessonId, string DisplayName, string ExternalUrl);
public sealed record AddOutcomeCommand(Guid CourseId, string ArabicText, string EnglishText, int SortOrder);
public sealed record QualityGateResult(bool Passed, IReadOnlyCollection<string> Reasons);

public interface ICourseAuthoringService
{
    Task<Guid> CreateDraftAsync(string teacherUserId, CreateCourseCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateCourseAsync(string teacherUserId, Guid courseId, UpdateCourseCommand command, CancellationToken cancellationToken = default);
    Task<Guid?> AddModuleAsync(string teacherUserId, CreateModuleCommand command, CancellationToken cancellationToken = default);
    Task<bool> LinkModuleToUnitAsync(string teacherUserId, Guid moduleId, Guid unitDefinitionId, CancellationToken cancellationToken = default);
    Task<bool> UpdateModuleAsync(string teacherUserId, Guid moduleId, UpdateModuleCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteModuleAsync(string teacherUserId, Guid moduleId, CancellationToken cancellationToken = default);
    Task<Guid?> DuplicateModuleAsync(string teacherUserId, Guid moduleId, CancellationToken cancellationToken = default);
    Task<Guid?> AddLearningAimAsync(string teacherUserId, CreateLearningAimCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateLearningAimAsync(string teacherUserId, Guid learningAimId, UpdateLearningAimCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteLearningAimAsync(string teacherUserId, Guid learningAimId, CancellationToken cancellationToken = default);
    Task<Guid?> AddTopicAsync(string teacherUserId, CreateTopicCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateTopicAsync(string teacherUserId, Guid topicId, UpdateTopicCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteTopicAsync(string teacherUserId, Guid topicId, CancellationToken cancellationToken = default);
    Task<Guid?> AddCriterionAsync(string teacherUserId, CreateBtecCriterionCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateCriterionAsync(string teacherUserId, Guid criterionId, UpdateBtecCriterionCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteCriterionAsync(string teacherUserId, Guid criterionId, CancellationToken cancellationToken = default);
    Task<Guid?> AddLessonAsync(string teacherUserId, CreateLessonCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateLessonAsync(string teacherUserId, Guid lessonId, UpdateLessonCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteLessonAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default);
    Task<Guid?> DuplicateLessonAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default);
    Task<bool> AddLessonResourceAsync(string teacherUserId, AddLessonResourceCommand command, CancellationToken cancellationToken = default);
    Task<LessonVideoChangeResult?> AddLessonVideoAsync(string teacherUserId, AddLessonVideoCommand command, CancellationToken cancellationToken = default);
    Task<LessonVideoChangeResult?> RemoveLessonVideoAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default);
    Task<bool> AddLessonResourceLinkAsync(string teacherUserId, AddLessonResourceLinkCommand command, CancellationToken cancellationToken = default);
    Task<bool> SetPresentationAsync(string teacherUserId, SetCoursePresentationCommand command, CancellationToken cancellationToken = default);
    Task<bool> AddOutcomeAsync(string teacherUserId, AddOutcomeCommand command, CancellationToken cancellationToken = default);
    Task<QualityGateResult?> SubmitForReviewAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default);
    Task<bool> ReviewAsync(string adminUserId, Guid courseId, bool approved, string? reason, CancellationToken cancellationToken = default);
    Task<bool> PublishAsync(string adminUserId, Guid courseId, CancellationToken cancellationToken = default);
    Task<bool> ScheduleAsync(string adminUserId, Guid courseId, DateTimeOffset publishAtUtc, CancellationToken cancellationToken = default);
    Task<bool> ArchiveAsync(string adminUserId, Guid courseId, CancellationToken cancellationToken = default);
}
