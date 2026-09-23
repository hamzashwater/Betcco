using Betcco.Domain.Common;

namespace Betcco.Domain.Evaluations;

public sealed class TaskType : Entity
{
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class RubricTemplate : Entity
{
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public Guid? GradeId { get; set; }
    public Guid? SpecializationId { get; set; }
    public Guid? TaskTypeId { get; set; }
    public int Version { get; set; } = 1;
    // A rubric owns a declarative, versioned assessment rule. BETCCO ships a
    // conservative internal-BTEC default, but an approved specification can
    // replace it without changing the assessment engine.
    public string AssessmentRuleSetVersion { get; set; } = "btec-internal-v1";
    public string AssessmentRuleSetJson { get; set; } = "";
    /// <summary>
    /// Optional until the centre configures an approved specification. When
    /// present, the version is copied into each assessment snapshot so later
    /// registry changes cannot rewrite a historical outcome.
    /// </summary>
    public Guid? QualificationVersionId { get; set; }
    public QualificationVersion? QualificationVersion { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<RubricCriterion> Criteria { get; } = new List<RubricCriterion>();
}

public sealed class RubricCriterion : Entity
{
    public Guid RubricTemplateId { get; set; }
    public RubricTemplate? RubricTemplate { get; set; }
    public required string Code { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public int SortOrder { get; set; }
}

public sealed class EvaluationRequest : Entity
{
    public required string StudentUserId { get; set; }
    public Guid GradeId { get; set; }
    public Guid SpecializationId { get; set; }
    public Guid TaskTypeId { get; set; }
    public Guid RubricTemplateId { get; set; }
    public EvaluationStatus Status { get; set; } = EvaluationStatus.Draft;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "JOD";
    public string? StudentComment { get; set; }
    public string CriteriaSnapshotJson { get; set; } = "[]";
    public string EvaluatorCriteriaPlanJson { get; set; } = "[]";
    // Snapshot the active assessment rule at creation. Historic decisions must
    // remain reproducible even if the rubric is revised later.
    public string AssessmentRuleSetVersion { get; set; } = "btec-internal-v1";
    public string AssessmentRuleSetSnapshotJson { get; set; } = "";
    public Guid? QualificationVersionId { get; set; }
    public string? QualificationVersionSnapshotJson { get; set; }
    // Null denotes a legacy request whose academic scope is unknown.
    public Guid? AssessmentScopeId { get; set; }
    public AssessmentScope? AssessmentScope { get; set; }
    public string? AssessmentScopeSnapshotJson { get; set; }
    // These values are set only by the assessment service. They are intentionally
    // not accepted from the browser so a teacher cannot alter the final award.
    public EvaluationGrade? CalculatedGrade { get; set; }
    // Retained only for API/database compatibility with historic numeric
    // reporting. New BTEC decisions always set this to null.
    public decimal? CalculatedScore { get; set; }
    public string SectionResultsJson { get; set; } = "[]";
    // Starts at one for the first formal submission. A resubmission is a new
    // academic attempt and therefore needs its own authenticity declaration.
    public int SubmissionAttemptNumber { get; set; } = 1;
    public Guid? PaymentId { get; set; }
    // A Retake is a new aggregate with its own payment, evidence and result.
    // This nullable self-reference is the only link back to the immutable
    // original evaluation; a database unique index prevents Retake chains and
    // more than one Retake for the same original.
    public Guid? RetakeOfEvaluationRequestId { get; set; }
    public EvaluationRequest? RetakeOfEvaluationRequest { get; set; }
    public ICollection<EvaluationRequest> Retakes { get; } = new List<EvaluationRequest>();
    public ICollection<SubmissionFile> SubmissionFiles { get; } = new List<SubmissionFile>();
    public ICollection<CriterionResult> CriterionResults { get; } = new List<CriterionResult>();
    public ICollection<EvaluationEvidence> EvidenceItems { get; } = new List<EvaluationEvidence>();
    public ICollection<EvaluationFeedback> FeedbackItems { get; } = new List<EvaluationFeedback>();
    public ICollection<InternalVerification> InternalVerifications { get; } = new List<InternalVerification>();
    public ICollection<InternalVerificationSample> InternalVerificationSamples { get; } = new List<InternalVerificationSample>();
    public ICollection<EvaluationAppeal> Appeals { get; } = new List<EvaluationAppeal>();
    public ICollection<AuthenticityDeclaration> AuthenticityDeclarations { get; } = new List<AuthenticityDeclaration>();
    public ICollection<AssessmentAuditEvent> AssessmentAuditEvents { get; } = new List<AssessmentAuditEvent>();
    public ICollection<EvaluationExpectedCompletionRevision> ExpectedCompletionRevisions { get; } = new List<EvaluationExpectedCompletionRevision>();
    public ICollection<ResubmissionAuthorization> ResubmissionAuthorizations { get; } = new List<ResubmissionAuthorization>();
    public RetakeAuthorization? RetakeAuthorization { get; set; }
}

/// <summary>
/// Staff-only operational target history. Each revision is an independent,
/// immutable record; it is not a learner submission or resubmission deadline.
/// </summary>
public sealed class EvaluationExpectedCompletionRevision : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public int RevisionNumber { get; set; }
    public DateTimeOffset ExpectedCompletionAtUtc { get; set; }
    public required string Reason { get; set; }
    public Guid RecordedByUserId { get; set; }
    public DateTimeOffset RecordedAtUtc { get; set; }
}

/// <summary>
/// A Lead Internal Verifier's staff-only approval of one Retake. The created
/// request is separate from the original and this rationale is never included
/// in student evaluation projections.
/// </summary>
public sealed class RetakeAuthorization : Entity
{
    public Guid OriginalEvaluationRequestId { get; set; }
    public EvaluationRequest? OriginalEvaluationRequest { get; set; }
    public Guid RetakeAssessmentScopeId { get; set; }
    public AssessmentScope? RetakeAssessmentScope { get; set; }
    public Guid RetakeEvaluationRequestId { get; set; }
    public EvaluationRequest? RetakeEvaluationRequest { get; set; }
    public required string AuthorizedByUserId { get; set; }
    public DateTimeOffset AuthorizedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public required string Reason { get; set; }
}

/// <summary>
/// A centre-configured educational qualification. BETCCO does not seed or
/// claim any Pearson specification: authorised staff must register the exact
/// qualification and its evidence source before it is linked to an assessment
/// rule set.
/// </summary>
public sealed class Qualification : Entity
{
    public required string Code { get; set; }
    public required string ArabicName { get; set; }
    public required string EnglishName { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<QualificationVersion> Versions { get; } = new List<QualificationVersion>();
}

/// <summary>
/// A dated source version for a qualification. It is deliberately a registry
/// record rather than hard-coded business logic; the matching rule-set keeps
/// the criterion progression source of truth.
/// </summary>
public sealed class QualificationVersion : Entity
{
    public Guid QualificationId { get; set; }
    public Qualification? Qualification { get; set; }
    public required string VersionCode { get; set; }
    public required string SourceReference { get; set; }
    public DateTimeOffset EffectiveFromUtc { get; set; }
    public DateTimeOffset? EffectiveUntilUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<RubricTemplate> RubricTemplates { get; } = new List<RubricTemplate>();
    public ICollection<UnitDefinition> UnitDefinitions { get; } = new List<UnitDefinition>();
}

/// <summary>A course-independent academic unit in one qualification version.</summary>
public sealed class UnitDefinition : Entity
{
    public Guid QualificationVersionId { get; set; }
    public QualificationVersion? QualificationVersion { get; set; }
    public required string Code { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicTitle { get; set; }
    public string? SourceReference { get; set; }
    // A unit is frozen after its first assessment definition is published.
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public bool IsActive { get; set; }
    public ICollection<LearningAimDefinition> LearningAims { get; } = new List<LearningAimDefinition>();
    public ICollection<AssessmentDefinition> AssessmentDefinitions { get; } = new List<AssessmentDefinition>();
}

/// <summary>A versioned academic task definition; evaluation requests remain separate.</summary>
public sealed class AssessmentDefinition : Entity
{
    public Guid UnitDefinitionId { get; set; }
    public UnitDefinition? UnitDefinition { get; set; }
    public required string Code { get; set; }
    public int Version { get; set; } = 1;
    public required string EnglishTitle { get; set; }
    public required string ArabicTitle { get; set; }
    public string? SourceReference { get; set; }
    // Publication is permanent even if the offering is later retired.
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public bool IsActive { get; set; }
    public ICollection<AssessmentDefinitionAim> AimMappings { get; } = new List<AssessmentDefinitionAim>();
    public ICollection<AssessmentDefinitionCriterion> CriterionMappings { get; } = new List<AssessmentDefinitionCriterion>();
    public ICollection<AssessmentScope> Scopes { get; } = new List<AssessmentScope>();
}

/// <summary>An inactive-by-default ASSESS offering; no student selection is enabled yet.</summary>
public sealed class AssessmentScope : Entity
{
    public Guid AssessmentDefinitionId { get; set; }
    public AssessmentDefinition? AssessmentDefinition { get; set; }
    public Guid GradeId { get; set; }
    public Guid SpecializationId { get; set; }
    public Guid RubricTemplateId { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public bool IsActive { get; set; }
    public bool IsRetakeOnly { get; set; }
    public ICollection<EvaluationRequest> EvaluationRequests { get; } = new List<EvaluationRequest>();
}

public sealed class SubmissionFile : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StorageKey { get; set; }
    public required string ContentType { get; set; }
    public long LengthBytes { get; set; }
    public UploadScanStatus ScanStatus { get; set; } = UploadScanStatus.Pending;
}

public sealed class EvaluatorAssignment : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    // Null only for assignments created before Unit specialism routing.
    public Guid? EvaluatorUnitSpecialismId { get; set; }
    public EvaluatorUnitSpecialism? EvaluatorUnitSpecialism { get; set; }
    public required string EvaluatorUserId { get; set; }
    public required string AssignedByUserId { get; set; }
    public DateTimeOffset AssignedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A historical grant of eligibility to evaluate one canonical academic Unit.</summary>
public sealed class EvaluatorUnitSpecialism : Entity
{
    public Guid EvaluatorUserId { get; set; }
    public Guid UnitDefinitionId { get; set; }
    public UnitDefinition? UnitDefinition { get; set; }
    public Guid GrantedByUserId { get; set; }
    public DateTimeOffset GrantedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public Guid? RevokedByUserId { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokeReason { get; set; }
}

public sealed class CriterionResult : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string CriterionCode { get; set; }
    public CriterionAchievement Achievement { get; set; }
    public decimal? Score { get; set; }
    public string? Evidence { get; set; }
    public string? Comment { get; set; }
}

public sealed class EvaluationEvidence : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string CriterionCode { get; set; }
    public required string Narrative { get; set; }
}

public sealed class EvaluationFeedback : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string AuthorUserId { get; set; }
    public required string Body { get; set; }
    public bool RequestsResubmission { get; set; }
}

public sealed class InternalVerification : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string VerifierUserId { get; set; }
    public required string Decision { get; set; }
    public string? Comment { get; set; }
    public DateTimeOffset VerifiedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A Lead Internal Verifier-owned sampling plan for the current external
/// assessment workflow. It deliberately has no fixed percentage: staff set a
/// documented scope and rationale appropriate to the applicable programme.
/// The precise qualification specification remains the source of truth.
/// </summary>
public sealed class InternalVerificationPlan : Entity
{
    public string? AssessorUserId { get; set; }
    public Guid? GradeId { get; set; }
    public Guid? SpecializationId { get; set; }
    public Guid? TaskTypeId { get; set; }
    public EvaluationGrade? TargetOutcome { get; set; }
    public required string SelectionRationale { get; set; }
    public DateTimeOffset ActiveFromUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ActiveUntilUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<InternalVerificationSample> Samples { get; } = new List<InternalVerificationSample>();
}

/// <summary>
/// An explicitly selected assessment attempt that needs internal verification.
/// The sample is immutable in scope after selection; only the assigned,
/// independent verifier can record its terminal decision through the
/// evaluation workflow.
/// </summary>
public sealed class InternalVerificationSample : Entity
{
    public Guid InternalVerificationPlanId { get; set; }
    public InternalVerificationPlan? InternalVerificationPlan { get; set; }
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public int SubmissionAttemptNumber { get; set; }
    public required string SelectedByUserId { get; set; }
    public required string AssignedVerifierUserId { get; set; }
    public required string SelectionRationale { get; set; }
    public DateTimeOffset SelectedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public InternalVerificationSampleStatus Status { get; set; } = InternalVerificationSampleStatus.Pending;
    public string? DecisionComment { get; set; }
    public DateTimeOffset? DecidedAtUtc { get; set; }
}

/// <summary>
/// A learner's documented challenge to a released academic decision. An appeal
/// is not an automatic grade change; the independent reviewer records only the
/// appeal decision and any resulting reassessment is a separate auditable flow.
/// </summary>
public sealed class EvaluationAppeal : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string StudentUserId { get; set; }
    public required string Reason { get; set; }
    public EvaluationAppealStatus Status { get; set; } = EvaluationAppealStatus.Submitted;
    public string? ReviewedByUserId { get; set; }
    public string? DecisionRationale { get; set; }
    public DateTimeOffset? ReviewedAtUtc { get; set; }
    public DateTimeOffset? WithdrawnAtUtc { get; set; }
}

/// <summary>
/// A student's affirmative declaration for one formal assessment attempt.
/// The wording is stored as a snapshot so a later policy update does not alter
/// what the student agreed to at submission time.
/// </summary>
public sealed class AuthenticityDeclaration : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string StudentUserId { get; set; }
    public int AttemptNumber { get; set; }
    public required string PolicyVersion { get; set; }
    public required string StatementSnapshot { get; set; }
    public DateTimeOffset DeclaredAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}

/// <summary>
/// Append-only academic trace for important assessment actions and state
/// changes. This deliberately complements operational audit logs: it keeps an
/// assessment-specific record that can be exported with the decision.
/// </summary>
public sealed class AssessmentAuditEvent : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public string? ActorUserId { get; set; }
    public required string EventType { get; set; }
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public string? Reason { get; set; }
    public int? AttemptNumber { get; set; }
    public string? CorrelationId { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A human verifier's explicit authorisation for a single further submission.
/// It is separate from feedback so a learner cannot infer a right to resubmit
/// merely because an assessor asked for changes.
/// </summary>
public sealed class ResubmissionAuthorization : Entity
{
    public Guid EvaluationRequestId { get; set; }
    public EvaluationRequest? EvaluationRequest { get; set; }
    public required string AuthorizedByUserId { get; set; }
    public int AttemptNumber { get; set; }
    public required string RuleSetVersion { get; set; }
    public required string Reason { get; set; }
    public DateTimeOffset AuthorizedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset DueAtUtc { get; set; }
    public DateTimeOffset? SubmittedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
}
