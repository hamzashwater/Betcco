using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;

namespace Betcco.Domain.Learning;

public sealed class LearningTrack : Entity
{
    public required string Slug { get; set; }
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public string? ArabicDescription { get; set; }
    public string? EnglishDescription { get; set; }
    public bool IsBtecFocused { get; set; }
    public bool IsVisible { get; set; } = true;
    public int SortOrder { get; set; }
    public ICollection<Grade> Grades { get; } = new List<Grade>();
}

public sealed class Grade : Entity
{
    public required string Slug { get; set; }
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public Guid LearningTrackId { get; set; }
    public LearningTrack? LearningTrack { get; set; }
    public bool IsVisible { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class Specialization : Entity
{
    public required string Slug { get; set; }
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public string? AccentColor { get; set; }
    public Guid LearningTrackId { get; set; }
    public LearningTrack? LearningTrack { get; set; }
    public bool IsVisible { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class Subject : Entity
{
    public required string Slug { get; set; }
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public Guid? SpecializationId { get; set; }
    public Specialization? Specialization { get; set; }
    public bool IsVisible { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class Course : Entity
{
    public Guid? DeliveryPlanId { get; set; }
    public DeliveryPlan? DeliveryPlan { get; set; }
    public required string Slug { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public Guid LearningTrackId { get; set; }
    public Guid? GradeId { get; set; }
    public Guid? SpecializationId { get; set; }
    public Guid? SubjectId { get; set; }
    // Established by the first canonical BTEC unit; legacy courses remain unbound.
    public Guid? QualificationVersionId { get; set; }
    public QualificationVersion? QualificationVersion { get; set; }
    public string? TeacherUserId { get; set; }
    public CourseStatus Status { get; set; } = CourseStatus.Draft;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "JOD";
    public bool IsFree { get; set; }
    public string? CoverImageKey { get; set; }
    public string? CoverImageContentType { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
    // A course may only be scheduled after it passes the same quality gate as a
    // published course. The API, not the browser clock, decides when it is live.
    public DateTimeOffset? ScheduledPublishAtUtc { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public LearningTrack? LearningTrack { get; set; }
    public Grade? Grade { get; set; }
    public Specialization? Specialization { get; set; }
    public Subject? Subject { get; set; }
    public ICollection<CourseModule> Modules { get; } = new List<CourseModule>();
    public ICollection<CourseLearningOutcome> LearningOutcomes { get; } = new List<CourseLearningOutcome>();
    public ICollection<CourseSkill> Skills { get; } = new List<CourseSkill>();
}

public sealed class CourseModule : Entity
{
    public Guid? DeliveryPlanEntryId { get; set; }
    public DeliveryPlanEntry? DeliveryPlanEntry { get; set; }
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public Guid? UnitDefinitionId { get; set; }
    public UnitDefinition? UnitDefinition { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    // CourseModule is retained as the storage name for backwards compatibility;
    // it is presented as a BTEC Unit in authoring and learner experiences.
    public string? UnitCode { get; set; }
    public string? ArabicDescription { get; set; }
    public string? EnglishDescription { get; set; }
    public int? GuidedLearningHours { get; set; }
    public int? Credits { get; set; }
    public string? QualificationLevel { get; set; }
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; }
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public ICollection<Lesson> Lessons { get; } = new List<Lesson>();
    public ICollection<BtecLearningAim> LearningAims { get; } = new List<BtecLearningAim>();
    public ICollection<BtecCriterion> Criteria { get; } = new List<BtecCriterion>();
}

public sealed class BtecLearningAim : Entity
{
    public Guid CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public Guid? LearningAimDefinitionId { get; set; }
    public LearningAimDefinition? LearningAimDefinition { get; set; }
    public required string Code { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public string? ArabicDescription { get; set; }
    public string? EnglishDescription { get; set; }
    public int SortOrder { get; set; }
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public ICollection<BtecTopic> Topics { get; } = new List<BtecTopic>();
    public ICollection<Lesson> Lessons { get; } = new List<Lesson>();
    public ICollection<BtecCriterion> Criteria { get; } = new List<BtecCriterion>();
}

public sealed class BtecTopic : Entity
{
    public Guid BtecLearningAimId { get; set; }
    public BtecLearningAim? BtecLearningAim { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public string? ArabicDescription { get; set; }
    public string? EnglishDescription { get; set; }
    public int SortOrder { get; set; }
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public ICollection<Lesson> Lessons { get; } = new List<Lesson>();
}

public sealed class BtecCriterion : Entity
{
    public Guid CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public Guid? AssessmentCriterionDefinitionId { get; set; }
    public AssessmentCriterionDefinition? AssessmentCriterionDefinition { get; set; }
    public Guid? BtecLearningAimId { get; set; }
    public BtecLearningAim? BtecLearningAim { get; set; }
    // Examples: A.P1, A.M2, B.D1. The code is immutable once submissions use it.
    public required string Code { get; set; }
    public BtecCriterionBand Band { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public string? ArabicEvidenceGuidance { get; set; }
    public string? EnglishEvidenceGuidance { get; set; }
    public int SortOrder { get; set; }
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
}

public sealed class Lesson : Entity
{
    public Guid CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public Guid? BtecLearningAimId { get; set; }
    public BtecLearningAim? BtecLearningAim { get; set; }
    public Guid? BtecTopicId { get; set; }
    public BtecTopic? BtecTopic { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public string? ArabicBody { get; set; }
    public string? EnglishBody { get; set; }
    public LessonType Type { get; set; }
    public int DurationSeconds { get; set; }
    public bool IsPreview { get; set; }
    public bool IsPublished { get; set; }
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public int SortOrder { get; set; }
    public string? VideoReference { get; set; }
    public ICollection<LessonResource> Resources { get; } = new List<LessonResource>();
}

public sealed class LessonResource : Entity
{
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public required string DisplayName { get; set; }
    public required string StorageKey { get; set; }
    public required string ContentType { get; set; }
    /// <summary>
    /// Optional HTTPS resource reference. Uploaded files retain a private
    /// storage key; links are rendered only after the learner passes the same
    /// course and content-access checks as files.
    /// </summary>
    public string? ExternalUrl { get; set; }
    public UploadScanStatus ScanStatus { get; set; } = UploadScanStatus.Pending;
    public bool IsDownloadable { get; set; } = true;
}

public sealed class CourseLearningOutcome : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public required string ArabicText { get; set; }
    public required string EnglishText { get; set; }
    public int SortOrder { get; set; }
}

public sealed class CourseSkill : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public required string ArabicText { get; set; }
    public required string EnglishText { get; set; }
    public int SortOrder { get; set; }
}

public sealed class Enrollment : Entity
{
    public required string StudentUserId { get; set; }
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public Guid? PaymentId { get; set; }
    public DateTimeOffset EnrolledAtUtc { get; set; } = DateTimeOffset.UtcNow;
    // A null expiry is a permanent one-time purchase. Membership and course
    // subscription entitlements are represented by time-bounded enrollments.
    public DateTimeOffset? AccessEndsAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
}

/// <summary>
/// One optional release rule per learner-facing course item. The generic
/// content identity deliberately avoids duplicate Unit/Lesson/Assignment
/// rule tables while ownership is always checked through <see cref="CourseId"/>.
/// </summary>
public sealed class ContentAccessRule : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public LearningContentType TargetType { get; set; }
    public Guid TargetId { get; set; }
    public ContentReleaseMode ReleaseMode { get; set; } = ContentReleaseMode.Immediately;
    public DateTimeOffset? SpecificDateUtc { get; set; }
    public int? DaysAfterEnrollment { get; set; }
    public LearningContentType? PreviousContentType { get; set; }
    public Guid? PreviousContentId { get; set; }
}

/// <summary>
/// An explicit completion requirement for a course item. Multiple rows are
/// conjunctive: every listed prerequisite must be completed by the learner.
/// </summary>
public sealed class ContentPrerequisite : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public LearningContentType TargetType { get; set; }
    public Guid TargetId { get; set; }
    public LearningContentType RequiredContentType { get; set; }
    public Guid RequiredContentId { get; set; }
}

public sealed class LessonProgress : Entity
{
    public required string StudentUserId { get; set; }
    public Guid LessonId { get; set; }
    public bool IsCompleted { get; set; }
    public int LastPositionSeconds { get; set; }
    public DateTimeOffset LastVisitedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class LessonNote : Entity
{
    public required string StudentUserId { get; set; }
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public required string Body { get; set; }
}

public sealed class LessonBookmark : Entity
{
    public required string StudentUserId { get; set; }
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }
}

public sealed class PersonalCalendarEntry : Entity
{
    public required string StudentUserId { get; set; }
    public required string Title { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset StartsAtUtc { get; set; }
    public DateTimeOffset? EndsAtUtc { get; set; }
}

public sealed class CourseQuestion : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public Guid? LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public required string StudentUserId { get; set; }
    public required string Body { get; set; }
    public bool IsResolved { get; set; }
    public ICollection<CourseQuestionReply> Replies { get; } = new List<CourseQuestionReply>();
}

public sealed class CourseQuestionReply : Entity
{
    public Guid CourseQuestionId { get; set; }
    public CourseQuestion? CourseQuestion { get; set; }
    public required string AuthorUserId { get; set; }
    public required string Body { get; set; }
}

/// <summary>
/// A teacher-authored course announcement. Announcements are never public: the
/// server resolves the target audience from current enrollments.
/// </summary>
public sealed class CourseAnnouncement : Entity
{
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public Guid? CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public required string TeacherUserId { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicBody { get; set; }
    public required string EnglishBody { get; set; }
    public AnnouncementAudience Audience { get; set; } = AnnouncementAudience.Course;
    public bool IsPublished { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public ICollection<CourseAnnouncementRecipient> Recipients { get; } = new List<CourseAnnouncementRecipient>();
}

/// <summary>Explicit recipients are used only for the SelectedStudents audience.</summary>
public sealed class CourseAnnouncementRecipient : Entity
{
    public Guid CourseAnnouncementId { get; set; }
    public CourseAnnouncement? CourseAnnouncement { get; set; }
    public required string StudentUserId { get; set; }
}

public sealed class CourseCertificate : Entity
{
    public required string StudentUserId { get; set; }
    public Guid CourseId { get; set; }
    public Course? Course { get; set; }
    public required string VerificationCode { get; set; }
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class LiveSession : Entity
{
    public Guid? CourseId { get; set; }
    public Course? Course { get; set; }
    public required string HostUserId { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public string? ArabicDescription { get; set; }
    public string? EnglishDescription { get; set; }
    public required string Provider { get; set; }
    public string? JoinUrl { get; set; }
    public string? RecordingUrl { get; set; }
    public DateTimeOffset StartsAtUtc { get; set; }
    public DateTimeOffset EndsAtUtc { get; set; }
    public int? Capacity { get; set; }
    public bool IsPublished { get; set; }
}

public sealed class LiveSessionAttendance : Entity
{
    public Guid LiveSessionId { get; set; }
    public LiveSession? LiveSession { get; set; }
    public required string StudentUserId { get; set; }
    public LiveAttendanceStatus Status { get; set; } = LiveAttendanceStatus.Present;
    public DateTimeOffset JoinedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LeftAtUtc { get; set; }
    public DateTimeOffset? MarkedAtUtc { get; set; }
    public string? MarkedByUserId { get; set; }
}
