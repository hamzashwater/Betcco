using Betcco.Domain.Common;
using Betcco.Domain.Learning;

namespace Betcco.Domain.Assessments;

// Course assignments are coursework inside an enrolled course. They are not
// interchangeable with the paid, externally assigned EvaluationRequest flow.
public sealed class CourseAssignment : Entity
{
    public CourseAssignmentPurpose Purpose { get; set; } = CourseAssignmentPurpose.Coursework;
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public Guid? CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public Guid? LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public Guid? BtecLearningAimId { get; set; }
    public BtecLearningAim? BtecLearningAim { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicInstructions { get; set; }
    public required string EnglishInstructions { get; set; }
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public DateTimeOffset? DueAtUtc { get; set; }
    public int MaxSubmissionAttempts { get; set; } = 1;
    public bool AllowResubmission { get; set; } = true;
    // The platform's hard ceiling is 100 MB; a teacher can choose a stricter
    // assignment-specific limit but never expand it beyond this safe limit.
    public int MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024;
    // JSON array of normalized extensions from the platform-safe allow-list.
    public string AllowedFileExtensionsJson { get; set; } = "[\".pdf\",\".docx\",\".xlsx\",\".pptx\",\".png\",\".jpg\",\".jpeg\",\".zip\",\".txt\"]";
    public bool IsPublished { get; set; }
    // Retains the legacy IsPublished flag for existing learner queries while
    // making the full authoring lifecycle explicit and auditable.
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    // Coursework uses the same versioned outcome engine as external BTEC
    // evaluations. The assignment is the editable source; each submission
    // receives an immutable copy before it can be assessed.
    public string AssessmentRuleSetVersion { get; set; } = "btec-internal-v1";
    public string AssessmentRuleSetJson { get; set; } = "";
    public decimal? MaxScore { get; set; }
    public ICollection<CourseAssignmentCriterion> Criteria { get; } = new List<CourseAssignmentCriterion>();
    public ICollection<CourseAssignmentResource> Resources { get; } = new List<CourseAssignmentResource>();
    public ICollection<CourseAssignmentSubmission> Submissions { get; } = new List<CourseAssignmentSubmission>();
    public ICollection<CourseAssignmentDeadlineExtension> DeadlineExtensions { get; } = new List<CourseAssignmentDeadlineExtension>();
}

/// <summary>A historical, student-specific coursework deadline grant. Revocation retains the original grant.</summary>
public sealed class CourseAssignmentDeadlineExtension : Entity
{
    public Guid CourseAssignmentId { get; set; }
    public CourseAssignment? CourseAssignment { get; set; }
    public required string StudentUserId { get; set; }
    public DateTimeOffset BaseDueAtUtcSnapshot { get; set; }
    public DateTimeOffset ExtendedDueAtUtc { get; set; }
    public required string GrantedByUserId { get; set; }
    public DateTimeOffset GrantedAtUtc { get; set; }
    public required string Reason { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokedByUserId { get; set; }
    public string? RevocationReason { get; set; }
}

/// <summary>
/// A teacher-owned resource that belongs to coursework rather than a lesson.
/// Storage keys are private; they are never exposed as public URLs.
/// </summary>
public sealed class CourseAssignmentResource : Entity
{
    public Guid CourseAssignmentId { get; set; }
    public CourseAssignment? CourseAssignment { get; set; }
    public required string DisplayName { get; set; }
    public required string StorageKey { get; set; }
    public required string ContentType { get; set; }
    public UploadScanStatus ScanStatus { get; set; } = UploadScanStatus.Pending;
}

public sealed class CourseAssignmentCriterion : Entity
{
    public Guid CourseAssignmentId { get; set; }
    public CourseAssignment? CourseAssignment { get; set; }
    // A snapshot protects historical submissions if the source BTEC criterion
    // later changes. It is optional because academic assignments can define a
    // criterion directly.
    public Guid? BtecCriterionId { get; set; }
    public BtecCriterion? BtecCriterion { get; set; }
    public required string Code { get; set; }
    public BtecCriterionBand Band { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public int SortOrder { get; set; }
}

public sealed class CourseAssignmentSubmission : Entity
{
    public Guid CourseAssignmentId { get; set; }
    public CourseAssignment? CourseAssignment { get; set; }
    public required string StudentUserId { get; set; }
    public CourseAssignmentSubmissionStatus Status { get; set; } = CourseAssignmentSubmissionStatus.Draft;
    public int CurrentVersionNumber { get; set; } = 1;
    public string AssessmentRuleSetVersion { get; set; } = "btec-internal-v1";
    public string AssessmentRuleSetSnapshotJson { get; set; } = "";
    public EvaluationGrade? CalculatedGrade { get; set; }
    public TrainingOutcome? TrainingOutcome { get; set; }
    public string? TrainingStrengths { get; set; }
    public string? TrainingGaps { get; set; }
    public string? TrainingImprovementGuidance { get; set; }
    public decimal? CalculatedScore { get; set; }
    public DateTimeOffset? SubmittedAtUtc { get; set; }
    public DateTimeOffset? GradedAtUtc { get; set; }
    public ICollection<CourseAssignmentSubmissionVersion> Versions { get; } = new List<CourseAssignmentSubmissionVersion>();
    public ICollection<CourseAssignmentCriterionResult> CriterionResults { get; } = new List<CourseAssignmentCriterionResult>();
    public ICollection<CourseAssignmentFeedback> FeedbackItems { get; } = new List<CourseAssignmentFeedback>();
}

public sealed class CourseAssignmentSubmissionVersion : Entity
{
    public Guid CourseAssignmentSubmissionId { get; set; }
    public CourseAssignmentSubmission? CourseAssignmentSubmission { get; set; }
    public int VersionNumber { get; set; }
    public string? StudentComment { get; set; }
    public DateTimeOffset? SubmittedAtUtc { get; set; }
    public ICollection<CourseAssignmentSubmissionFile> Files { get; } = new List<CourseAssignmentSubmissionFile>();
}

public sealed class CourseAssignmentSubmissionFile : Entity
{
    public Guid CourseAssignmentSubmissionVersionId { get; set; }
    public CourseAssignmentSubmissionVersion? CourseAssignmentSubmissionVersion { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StorageKey { get; set; }
    public required string ContentType { get; set; }
    public long LengthBytes { get; set; }
    public UploadScanStatus ScanStatus { get; set; } = UploadScanStatus.Pending;
}

public sealed class CourseAssignmentCriterionResult : Entity
{
    public Guid CourseAssignmentSubmissionId { get; set; }
    public CourseAssignmentSubmission? CourseAssignmentSubmission { get; set; }
    public Guid CourseAssignmentCriterionId { get; set; }
    public CourseAssignmentCriterion? CourseAssignmentCriterion { get; set; }
    public CriterionAchievement Achievement { get; set; }
    // Coursework criteria are decisions, not percentage bands. This remains
    // nullable so historic values can be retained during the compatibility
    // migration without producing new percentage-derived outcomes.
    public decimal? Score { get; set; }
    public string? Feedback { get; set; }
}

public sealed class CourseAssignmentFeedback : Entity
{
    public Guid CourseAssignmentSubmissionId { get; set; }
    public CourseAssignmentSubmission? CourseAssignmentSubmission { get; set; }
    public required string AuthorUserId { get; set; }
    public required string Body { get; set; }
    public bool RequestsResubmission { get; set; }
    // Internal observations are available only to the teacher and platform
    // administrators. Student responses intentionally filter them out.
    public bool IsPrivate { get; set; }
}
