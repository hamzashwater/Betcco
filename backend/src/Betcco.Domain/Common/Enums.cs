namespace Betcco.Domain.Common;

public enum CourseStatus { Draft, SubmittedForReview, Approved, Rejected, Published, Archived, Scheduled }
public enum ContentPublicationStatus { Draft, Published, Archived, Scheduled }
public enum BtecCriterionBand { Pass, Merit, Distinction }
public enum CourseAssignmentSubmissionStatus { Draft, Submitted, NeedsRevision, Graded, Finalized }
public enum CourseAssignmentPurpose { Coursework = 0, LearningAimPractice = 1, ComprehensivePractice = 2 }
// A formative course result. Never persisted as EvaluationGrade or CriterionResult.
public enum TrainingOutcome { NotYetAchieved, Pass, Merit, Distinction }
public enum LessonType { Text = 0, Video = 1, LegacyArchived = 2, Assignment = 3, LiveSession = 4, Activity = 5 }
public enum PaymentStatus { Pending, Processing, Paid, Failed, Cancelled, Refunded, PartiallyRefunded, Chargeback }
public enum ProviderSessionStatus { NotStarted, Creating, Unknown, Ready, Failed, RequiresReconciliation }
public enum CartStatus { Open, Closed }
public enum PaymentTransitionSource { DevelopmentFakeConfirmation, PayTabsVerifiedTransaction, PayTabsVerifiedFailure, CustomerCancellation, InternalRefundRecorded, ProviderSessionCreationRejected }
public enum ProviderReconciliationCaseType { LateProviderSuccess, ProviderRefundResultUnknown, PaymentAmountMismatch, PaymentCurrencyMismatch, ProviderReferenceMismatch, LocalPaidProviderDisagreement, CouponSnapshotIdentityMismatch, ProviderSessionCreationResultUnknown, DuplicateProviderSessions }
public enum ProviderReconciliationCaseStatus { Open, UnderReview, Resolved }
public enum PaymentDisputeStatus { Open, UnderReview, Resolved }
public enum PaymentDisputeSource { FinanceAdminManualEvidence, FutureProviderEvidence }
public enum LedgerAccountCode { CourseSaleClearing, PlatformCommission, TeacherEarningsPayable }
public enum LedgerEntrySide { Debit, Credit }
public enum LedgerEventType { PaidCourseSale, PaidCourseSaleRefund }
/// <summary>
/// InternallyRecorded means BETCCO recorded the accounting reversal. It does
/// not mean a payment provider has returned funds to the customer.
/// </summary>
public enum RefundStatus { Requested, ProviderProcessing, ProviderVerified, InternallyRecorded, ProviderFailed, ProviderResultUnknown }
public enum RefundTransitionSource { InternalAccounting, PayTabsProviderInitiation, PayTabsProviderVerification, PayTabsProviderFailure, PayTabsProviderAmbiguousResult }
public enum RefundEntitlementDisposition { NotChangedPendingBusinessPolicy }
/// <summary>Internal commercial-document state. These values do not represent a tax authority submission.</summary>
public enum CommercialDocumentStatus { Issued }
public enum CommercialDocumentSource { TrustedPaidPayment, TrustedFinalizedRefund }
public enum FiscalDocumentType { Invoice, CreditNote }
public enum FiscalSubmissionStatus { Pending, Submitting, Accepted, Rejected, ProviderResultUnknown, RequiresReview }
public enum FiscalSubmissionTransitionSource { FinanceAdminRequested, ProviderAccepted, ProviderRejected, ProviderResultUnknown, ConfigurationOrMappingBlocked }
public enum PaymentMethod { Card, BankTransfer, EWallet }
public enum PayoutMethod { BankTransfer, EWallet }
public enum PayoutStatus { Requested, Approved, Processing, Rejected, Paid, Failed, ProviderResultUnknown, Settled }
public enum PayoutTransitionSource { FinanceApproval, FinanceRejection, ExecutionInitiated, ProviderConfirmed, ProviderDefiniteFailure, ProviderResultUnknown, InternalSettlement }
public enum CartItemType { Course, Package, Evaluation, Membership, CourseSubscription }
public enum BillingInterval { Monthly, Quarterly, Yearly }
public enum SubscriptionStatus { Active, Cancelled, Expired }
public enum LiveAttendanceStatus { Present, Late, Absent, Excused }
public enum EvaluationStatus { Draft, PendingPayment, Paid, PendingAssignment, Assigned, UnderReview, NeedsRevision, Completed, Closed, PaymentFailed, Cancelled, Refunded }
public enum InternalVerificationSampleStatus { Pending, Accepted, ReturnedToAssessor }
public enum EvaluationAppealStatus { Submitted, UnderReview, Upheld, Rejected, Withdrawn }
public enum CriterionAchievement { Achieved, PartiallyAchieved, NotAchieved, NotApplicable }
// This is an academic outcome, not a numeric score.
// The sequential values intentionally preserve ordering only.
public enum EvaluationGrade { NotYetAchieved, Pass, Merit, Distinction }
public enum UploadScanStatus { Pending, Clean, Rejected, Quarantined }
public enum StorageLifecycleAction { Finalize, Delete }
public enum StorageLifecycleStatus { Pending, Completed }
public enum SupportTicketStatus { Open, InProgress, WaitingForStudent, Resolved, Closed }
public enum NotificationType { System, Enrollment, Payment, Evaluation, Support, Course, LiveSession }
/// <summary>
/// A data-subject request is a privacy workflow, not an automatic database
/// action. Fulfilment is completed by an authorised staff member only after
/// the required identity and legal checks have been recorded.
/// </summary>
public enum DataSubjectRequestType
{
    Access,
    Rectification,
    Restriction,
    ErasureOrConcealment,
    ObjectionToProfiling,
    Portability,
    WithdrawMarketingConsent
}

public enum DataSubjectRequestStatus
{
    Submitted,
    IdentityVerificationRequired,
    InReview,
    Completed,
    Rejected,
    Cancelled
}

/// <summary>Purposes that require an explicit, versioned user choice.</summary>
public enum ConsentPurpose
{
    MarketingCommunications
}

public enum ConsentDecision
{
    Granted,
    Withdrawn
}

/// <summary>
/// Lifecycle of a guardian invitation. An accepted invitation is single-use;
/// it creates a pending relationship that requires a separate consent event.
/// </summary>
public enum GuardianInvitationStatus
{
    Issued,
    Accepted,
    Expired,
    Revoked
}

/// <summary>
/// A guardian relationship does not itself grant access. Access additionally
/// requires a current, explicit guardian-consent decision for a capability.
/// </summary>
public enum GuardianRelationshipStatus
{
    Pending,
    Active,
    Revoked,
    Expired
}

public enum GuardianConsentDecision
{
    Granted,
    Withdrawn
}

/// <summary>Configured post-retention action. Selecting an action never executes it by itself.</summary>
public enum RetentionActionAfterExpiry
{
    Retain,
    Conceal,
    Anonymize,
    Pseudonymize,
    Delete
}

public enum LegalHoldStatus
{
    Active,
    Released
}

/// <summary>
/// A controlled privacy-execution record. AwaitingManualExecution deliberately
/// does not perform any destructive action; a future reviewed executor must
/// implement each approved data-category action separately.
/// </summary>
public enum PrivacyExecutionJobStatus
{
    NotEligible = 0,
    BlockedByLegalHold = 1,
    AwaitingManualExecution = 2,
    Failed = 3,
    Completed = 4,
    BlockedByProcessingRestriction = 5
}

/// <summary>
/// Technical categories with a deliberately implemented, low-risk privacy
/// action. A policy must select one explicitly; this enum is not a legal
/// determination that the category may be concealed.
/// </summary>
public enum PrivacyExecutionCategory
{
    ProfileDemographics
}

public enum DataSubjectFulfillmentStatus
{
    Generated,
    Released,
    Applied
}

/// <summary>
/// State of one private portability artifact. Expiry is enforced separately
/// from this state so an expired artifact retains its historical evidence.
/// </summary>
public enum DataPortabilityExportStatus
{
    GenerationFailed,
    Generated,
    Released
}

public enum DataProcessingRestrictionStatus
{
    Active,
    Released
}

/// <summary>
/// Lifecycle for a versioned governance-register entry. Activation and
/// archiving are administrative records only; they do not change runtime data
/// processing.
/// </summary>
public enum ProcessingActivityStatus
{
    Draft,
    Active,
    Archived
}

/// <summary>
/// Lifecycle for a versioned subprocessor governance record. These statuses
/// document the reviewed record and never enable, disable, or reconfigure a
/// runtime provider.
/// </summary>
public enum SubprocessorRecordStatus
{
    Draft,
    Active,
    Suspended,
    Archived
}

/// <summary>
/// The deliberately small correction surface supported by this fulfillment
/// slice. Financial, academic, audit, security, and credential fields are not
/// represented here and cannot be changed through this workflow.
/// </summary>
public enum CorrectablePersonalField
{
    DisplayName,
    PhoneDisplay,
    CountryCode,
    Gender
}

/// <summary>Impact classification for the internal security-incident register.</summary>
public enum SecurityIncidentSeverity { Low, Medium, High, Critical }

/// <summary>
/// Operational state only. A closed incident is not a legal determination and
/// requires a separately recorded staff review when personal data may be involved.
/// </summary>
public enum SecurityIncidentStatus { Open, Assessing, Contained, Closed }

public enum BreachNotificationAudience { AffectedIndividuals, RegulatoryAuthority }
/// <summary>Persisted content kinds used by access rules and prerequisites.</summary>
public enum LearningContentType { Course = 0, Unit = 1, Lesson = 2, Assignment = 4 }

/// <summary>
/// Controls when enrolled students can open a course item. Publishing remains a
/// separate authoring concern; a published item may still be intentionally
/// locked for a learner until this rule allows it.
/// </summary>
public enum ContentReleaseMode
{
    Immediately,
    SpecificDate,
    DaysAfterEnrollment,
    AfterPreviousContentCompletion
}

/// <summary>Defines the enrolled learners who can read a course announcement.</summary>
public enum AnnouncementAudience { Course, Unit, SelectedStudents }
