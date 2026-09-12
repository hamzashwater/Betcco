using Betcco.Domain.Common;

namespace Betcco.Domain.Platform;

public sealed class SiteSetting : Entity
{
    public required string Key { get; set; }
    public required string ArabicValue { get; set; }
    public required string EnglishValue { get; set; }
    public bool IsPublic { get; set; } = true;
}

public sealed class LegalDocument : Entity
{
    public required string Slug { get; set; }
    public required string Version { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicContent { get; set; }
    public required string EnglishContent { get; set; }
    public DateTimeOffset EffectiveAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public bool IsPublished { get; set; } = true;
    /// <summary>The single published version currently shown for this document slug.</summary>
    public bool IsCurrent { get; set; } = true;
    /// <summary>Whether accepting this specific version is required again for existing users.</summary>
    public bool RequiresReacceptance { get; set; }
}

public sealed class LegalAcceptance : Entity
{
    public required string UserId { get; set; }
    public Guid LegalDocumentId { get; set; }
    public required string Version { get; set; }
    public DateTimeOffset AcceptedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Tracks a person's privacy request without storing a generated data export
/// or deleting data inline. The actual fulfilment must be performed through a
/// reviewed operational workflow and is deliberately auditable.
/// </summary>
public sealed class DataSubjectRequest : Entity
{
    public required string OwnerUserId { get; set; }
    public DataSubjectRequestType RequestType { get; set; }
    public DataSubjectRequestStatus Status { get; set; } = DataSubjectRequestStatus.Submitted;
    public string? Description { get; set; }
    public string? AssignedToUserId { get; set; }
    public string? ResolutionSummary { get; set; }
    public DateTimeOffset? IdentityVerifiedAtUtc { get; set; }
    public string? IdentityVerifiedByUserId { get; set; }
    public DateTimeOffset? ResolvedAtUtc { get; set; }
}

/// <summary>
/// Immutable evidence of an explicit optional-consent decision. The current
/// preference remains on the identity profile for fast enforcement; this
/// timeline explains how and under which policy version it changed.
/// </summary>
public sealed class ConsentRecord : Entity
{
    public required string UserId { get; set; }
    public ConsentPurpose Purpose { get; set; }
    public ConsentDecision Decision { get; set; }
    public required string PolicyVersion { get; set; }
    public required string CaptureMethod { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}

/// <summary>
/// A time-limited, opaque-token invitation sent by a student to a separate
/// guardian identity. Only a token hash is stored, so the database cannot be
/// used to replay the invitation.
/// </summary>
public sealed class GuardianInvitation : Entity
{
    public required string StudentUserId { get; set; }
    public required string RecipientEmail { get; set; }
    public required string TokenHash { get; set; }
    public GuardianInvitationStatus Status { get; set; } = GuardianInvitationStatus.Issued;
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? AcceptedAtUtc { get; set; }
    public string? AcceptedByUserId { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokedByUserId { get; set; }
    public string? RevocationReason { get; set; }
}

/// <summary>
/// The relationship between a student and a distinct guardian identity. It
/// deliberately has no navigation to educational, assessment, or teacher-note
/// data; all future guardian data access must use the authorization boundary.
/// </summary>
public sealed class GuardianRelationship : Entity
{
    public Guid GuardianInvitationId { get; set; }
    public required string StudentUserId { get; set; }
    public required string GuardianUserId { get; set; }
    public GuardianRelationshipStatus Status { get; set; } = GuardianRelationshipStatus.Pending;
    public DateTimeOffset? ActivatedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokedByUserId { get; set; }
    public string? RevocationReason { get; set; }
    public DateTimeOffset? ExpiresAtUtc { get; set; }
}

/// <summary>
/// Immutable evidence of one guardian-consent decision. A withdrawal is a new
/// record rather than a mutation of an earlier grant, preserving the history.
/// </summary>
public sealed class GuardianConsent : Entity
{
    public Guid GuardianRelationshipId { get; set; }
    public required string StudentUserId { get; set; }
    public required string GuardianUserId { get; set; }
    public required string Capability { get; set; }
    public GuardianConsentDecision Decision { get; set; }
    public DateTimeOffset DecidedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public required string ActorUserId { get; set; }
    public string? DecisionReason { get; set; }
    /// <summary>
    /// Optional immutable legal-document evidence when the applicable policy
    /// requires a versioned document. Requires legal review: BETCCO does not
    /// infer which guardian consent requires which legal document.
    /// </summary>
    public Guid? LegalDocumentId { get; set; }
    public string? LegalDocumentVersion { get; set; }
    public required string CaptureMethod { get; set; }
}

/// <summary>
/// Versioned administrator configuration for a data category or purpose.
/// Requires legal review: the rule and basis are stored configuration, not a
/// legal conclusion or a hard-coded retention period.
/// </summary>
public sealed class RetentionPolicy : Entity
{
    public required string PolicyKey { get; set; }
    public required string Version { get; set; }
    public required string DataCategoryOrPurpose { get; set; }
    public required string RetentionRule { get; set; }
    public required string LegalOrBusinessBasis { get; set; }
    public RetentionActionAfterExpiry ActionAfterExpiry { get; set; }
    /// <summary>
    /// Explicit technical category selected by the policy administrator.
    /// Requires legal review: this selection does not establish whether the
    /// category may be concealed, erased, anonymized, or retained.
    /// </summary>
    public PrivacyExecutionCategory? ExecutionCategory { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsCurrent { get; set; }
    public DateTimeOffset EffectiveAtUtc { get; set; }
}

/// <summary>
/// A scoped administrative or legal hold. It blocks a privacy execution job
/// for the subject until explicitly released; release never executes a job.
/// </summary>
public sealed class LegalHold : Entity
{
    public required string SubjectUserId { get; set; }
    /// <summary>Null means every configured data category for this subject.</summary>
    public string? ScopePolicyKey { get; set; }
    public required string Reason { get; set; }
    public LegalHoldStatus Status { get; set; } = LegalHoldStatus.Active;
    public DateTimeOffset? ReleasedAtUtc { get; set; }
    public string? ReleasedByUserId { get; set; }
    public string? ReleaseReason { get; set; }
}

/// <summary>
/// Idempotent, server-created evidence that a specific privacy request and
/// retention-policy version were evaluated. This is not a deletion worker and
/// never contains an implementation that removes educational or financial data.
/// </summary>
public sealed class PrivacyExecutionJob : Entity
{
    public Guid DataSubjectRequestId { get; set; }
    public required string SubjectUserId { get; set; }
    public Guid RetentionPolicyId { get; set; }
    public required string RetentionPolicyVersion { get; set; }
    public required string RetentionRuleSnapshot { get; set; }
    public RetentionActionAfterExpiry ActionAfterExpiry { get; set; }
    public PrivacyExecutionCategory? ExecutionCategory { get; set; }
    public PrivacyExecutionJobStatus Status { get; set; }
    public required string EligibilityReason { get; set; }
    public DateTimeOffset EvaluatedAtUtc { get; set; }
    public string? EvaluatedByUserId { get; set; }
    public Guid? BlockingLegalHoldId { get; set; }
    public string? FailureDetail { get; set; }
}

/// <summary>
/// Evidence for controlled fulfillment of a lower-risk data-subject request.
/// Evidence describes the fulfilled domain or action and never duplicates an
/// access response, credentials, tokens, security records, or request content.
/// A bounded reviewer rationale may be retained only when the controlled
/// fulfillment itself requires it.
/// </summary>
public sealed class DataSubjectFulfillment : Entity
{
    public Guid DataSubjectRequestId { get; set; }
    public DataSubjectRequestType RequestType { get; set; }
    public DataSubjectFulfillmentStatus Status { get; set; }
    public required string EvidenceJson { get; set; }
    public DateTimeOffset GeneratedAtUtc { get; set; }
    public required string GeneratedByUserId { get; set; }
    public DateTimeOffset? ReleasedAtUtc { get; set; }
    public string? ReleasedByUserId { get; set; }
}

/// <summary>
/// Private, machine-readable portability-export evidence. The artifact itself
/// is held through private file storage and never has a public URL. Requires
/// legal review: only the explicitly mapped portable domains are included.
/// </summary>
public sealed class DataPortabilityExport : Entity
{
    public Guid DataSubjectRequestId { get; set; }
    public Guid? DataSubjectFulfillmentId { get; set; }
    public required string SubjectUserId { get; set; }
    public DataPortabilityExportStatus Status { get; set; }
    public DateTimeOffset RequestedAtUtc { get; set; }
    public required string RequestedByUserId { get; set; }
    public DateTimeOffset? GeneratedAtUtc { get; set; }
    public string? GeneratedByUserId { get; set; }
    public required string ExportFormat { get; set; }
    public required string ExportVersion { get; set; }
    public string? StorageKey { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? ReleasedAtUtc { get; set; }
    public string? ReleasedByUserId { get; set; }
    public DateTimeOffset? DownloadedAtUtc { get; set; }
    public string? DownloadedByUserId { get; set; }
    public int DownloadCount { get; set; }
    public string? FailureReason { get; set; }
}

/// <summary>
/// A server-side marker that future processing workflows can query before
/// operating on a subject. Requires legal review: the configured scope does
/// not by itself declare which processing activities must cease.
/// </summary>
public sealed class DataProcessingRestriction : Entity
{
    public Guid DataSubjectRequestId { get; set; }
    public required string SubjectUserId { get; set; }
    public required string ProcessingScope { get; set; }
    public required string Reason { get; set; }
    public DataProcessingRestrictionStatus Status { get; set; } = DataProcessingRestrictionStatus.Active;
    public DateTimeOffset? ReleasedAtUtc { get; set; }
    public string? ReleasedByUserId { get; set; }
    public string? ReleaseReason { get; set; }
}

/// <summary>
/// A versioned governance record of a personal-data processing activity.
/// Requires legal review: this configuration records an authorised
/// classification; it neither establishes a legal basis nor changes runtime
/// processing behaviour.
/// </summary>
public sealed class ProcessingActivity : Entity
{
    public required string Code { get; set; }
    public required string Version { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required string ProcessingPurpose { get; set; }
    public required string DataSubjectCategoriesJson { get; set; }
    public required string PersonalDataCategoriesJson { get; set; }
    public bool HasSpecialCategoryData { get; set; }
    public string? SpecialCategoryClassification { get; set; }
    public required string LegalOrProcessingBasis { get; set; }
    public string? DataSourcesJson { get; set; }
    public string? RecipientCategoriesJson { get; set; }
    public string? RelatedSystemModule { get; set; }
    public Guid? RetentionPolicyId { get; set; }
    public ConsentPurpose? ApplicableConsentPurpose { get; set; }
    public bool HasInternationalOrThirdPartyTransfer { get; set; }
    public string? TransferConfiguration { get; set; }
    public string? SecurityControlReferences { get; set; }
    public required string OwnerRole { get; set; }
    public ProcessingActivityStatus Status { get; set; } = ProcessingActivityStatus.Draft;
    public bool IsCurrent { get; set; }
    public DateTimeOffset EffectiveAtUtc { get; set; }
    public DateTimeOffset? ReviewDueAtUtc { get; set; }
}

/// <summary>
/// A versioned governance record for an external provider processing personal
/// data on BETCCO's behalf. Requires legal review: recorded contract,
/// transfer, and provider classifications are administrative configuration,
/// not a compliance conclusion or runtime-provider control.
/// </summary>
public sealed class SubprocessorRecord : Entity
{
    public required string Code { get; set; }
    public required string Version { get; set; }
    public required string Name { get; set; }
    public required string ProviderLegalEntityName { get; set; }
    public required string ServiceDescription { get; set; }
    public required string ProcessingPurpose { get; set; }
    public required string PersonalDataCategoriesJson { get; set; }
    public required string DataSubjectCategoriesJson { get; set; }
    public string? HostingRegionOrCountry { get; set; }
    public bool HasInternationalOrThirdPartyTransfer { get; set; }
    public string? TransferConfiguration { get; set; }
    public string? RelatedSystemModule { get; set; }
    public string? ContractDpaStatusOrReference { get; set; }
    public string? SecurityControlReferences { get; set; }
    public string? RetentionDeletionCommitments { get; set; }
    public bool HasFurtherSubprocessor { get; set; }
    public string? FurtherSubprocessorConfiguration { get; set; }
    public required string OwnerRole { get; set; }
    public SubprocessorRecordStatus Status { get; set; } = SubprocessorRecordStatus.Draft;
    public bool IsCurrent { get; set; }
    public DateTimeOffset EffectiveAtUtc { get; set; }
    public DateTimeOffset? ReviewDueAtUtc { get; set; }
}

/// <summary>
/// Explicit administrative link between a subprocessor record version and a
/// processing-activity version. Links are not inferred from integrations.
/// </summary>
public sealed class SubprocessorProcessingActivity : Entity
{
    public Guid SubprocessorRecordId { get; set; }
    public Guid ProcessingActivityId { get; set; }
}

/// <summary>
/// Internal incident register. It intentionally stores a concise operational
/// summary only; credentials, raw payloads, student answers, and other secrets
/// must remain outside this record.
/// </summary>
public sealed class SecurityIncident : Entity
{
    public required string Title { get; set; }
    public required string Summary { get; set; }
    public required string ReasonCode { get; set; }
    public SecurityIncidentSeverity Severity { get; set; }
    public SecurityIncidentStatus Status { get; set; } = SecurityIncidentStatus.Open;
    public DateTimeOffset DetectedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ContainedAtUtc { get; set; }
    public string? AssignedToUserId { get; set; }
    public string? ClosureSummary { get; set; }
    public BreachAssessment? BreachAssessment { get; set; }
}

/// <summary>
/// Records the human legal review of a possible personal-data breach. It does
/// not decide notification obligations automatically and does not send notices.
/// </summary>
public sealed class BreachAssessment : Entity
{
    public Guid SecurityIncidentId { get; set; }
    public SecurityIncident? SecurityIncident { get; set; }
    public bool PotentialPersonalDataImpact { get; set; }
    public bool LegalConfirmationRequired { get; set; } = true;
    /// <summary>
    /// The authorised human decision on whether the Article 20 notification
    /// trigger applies. It is a draft until LegalConfirmedAtUtc is recorded.
    /// </summary>
    public bool LegalNotificationRequired { get; set; }
    public DateTimeOffset? LegalConfirmedAtUtc { get; set; }
    public string? LegalConfirmedByUserId { get; set; }
    /// <summary>Documented reason for the authorised Article 20 decision.</summary>
    public string? LegalDecisionSummary { get; set; }
    public ICollection<BreachNotificationDeadline> NotificationDeadlines { get; } = new List<BreachNotificationDeadline>();
}

/// <summary>
/// A deadline calculated from the recorded detection time only after an
/// authorised Article 20 trigger decision. Marking it as recorded is evidence
/// of an external action; it never sends a notification.
/// </summary>
public sealed class BreachNotificationDeadline : Entity
{
    public Guid BreachAssessmentId { get; set; }
    public BreachAssessment? BreachAssessment { get; set; }
    public BreachNotificationAudience Audience { get; set; }
    public DateTimeOffset DueAtUtc { get; set; }
    public DateTimeOffset? RecordedAtUtc { get; set; }
    public string? RecordedByUserId { get; set; }
    public string? RecordNote { get; set; }
}

public sealed class SupportTicket : Entity
{
    public required string OwnerUserId { get; set; }
    public required string Subject { get; set; }
    public required string Category { get; set; }
    public SupportTicketStatus Status { get; set; } = SupportTicketStatus.Open;
    public ICollection<TicketMessage> Messages { get; } = new List<TicketMessage>();
}

public sealed class Lead : Entity
{
    public required string Name { get; set; }
    public required string Contact { get; set; }
    public required string Message { get; set; }
    public required string Category { get; set; }
    public bool Consent { get; set; }
    public string Status { get; set; } = "Open";
}

public sealed class TicketMessage : Entity
{
    public Guid SupportTicketId { get; set; }
    public SupportTicket? SupportTicket { get; set; }
    public required string SenderUserId { get; set; }
    public required string Body { get; set; }
}

public sealed class Notification : Entity
{
    public required string UserId { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    public NotificationType Type { get; set; }
    public string? DeepLink { get; set; }
    /// <summary>
    /// Server-generated idempotency marker for notification events that may be
    /// retried by a background worker. It is never supplied by the browser.
    /// </summary>
    public string? DeduplicationKey { get; set; }
    public DateTimeOffset? ReadAtUtc { get; set; }
}

public sealed class BlogPost : Entity
{
    public required string Slug { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicExcerpt { get; set; }
    public required string EnglishExcerpt { get; set; }
    public required string ArabicBody { get; set; }
    public required string EnglishBody { get; set; }
    public string? AuthorUserId { get; set; }
    public bool IsPublished { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
}

public sealed class TeacherPublicProfile : Entity
{
    public required string TeacherUserId { get; set; }
    public string? ArabicBio { get; set; }
    public string? EnglishBio { get; set; }
    public string? ArabicSpecializations { get; set; }
    public string? EnglishSpecializations { get; set; }
    public bool IsPublic { get; set; }
}

/// <summary>
/// A student's voluntary platform-level review. It is deliberately separate
/// from course ratings: public visibility is opt-in and requires moderation.
/// </summary>
public sealed class PlatformRating : Entity
{
    public required string StudentUserId { get; set; }
    public byte CourseQualityScore { get; set; }
    public byte EaseOfUseScore { get; set; }
    public byte SupportScore { get; set; }
    public byte RecommendationScore { get; set; }
    public string? Comment { get; set; }
    public bool AllowPublicDisplay { get; set; }
    public bool IsPublished { get; set; }
    public string? ModeratedByAdminUserId { get; set; }
    public DateTimeOffset? ModeratedAtUtc { get; set; }
    public string? ModerationReason { get; set; }
}

public sealed class AuditLog : Entity
{
    public string? ActorUserId { get; set; }
    public required string Action { get; set; }
    public required string EntityType { get; set; }
    public string? EntityId { get; set; }
    public string? CorrelationId { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public required string Outcome { get; set; }
    public string? MetadataJson { get; set; }
    public string? OldValuesJson { get; set; }
    public string? NewValuesJson { get; set; }
}

/// <summary>
/// Durable intent for completing a private-object promotion or deletion after
/// the related database mutation commits. Keys are opaque server-generated
/// identifiers and failure details are deliberately bounded.
/// </summary>
public sealed class StorageLifecycleOperation : Entity
{
    public StorageLifecycleAction Action { get; set; }
    public StorageLifecycleStatus Status { get; set; } = StorageLifecycleStatus.Pending;
    public string? StagingKey { get; set; }
    public required string StorageKey { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAtUtc { get; set; }
    public string? LastErrorCategory { get; set; }
}

/// <summary>
/// A server-side record for an authenticated browser session. The cookie only
/// carries this entity's opaque id; no session secret is stored in the database.
/// </summary>
public sealed class UserSession : Entity
{
    public required string UserId { get; set; }
    public required string DeviceName { get; set; }
    public required string BrowserName { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset LoggedInAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastActiveAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokedByUserId { get; set; }
    public string? RevocationReason { get; set; }
}
