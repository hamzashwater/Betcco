using Betcco.Domain.Common;

namespace Betcco.Domain.Commerce;

public sealed class Cart : Entity
{
    public required string OwnerKey { get; set; }
    public string? UserId { get; set; }
    public string Currency { get; set; } = "JOD";
    /// <summary>Closed only by trusted server-side payment finalization.</summary>
    public CartStatus Status { get; set; } = CartStatus.Open;
    public DateTimeOffset? ClosedAtUtc { get; set; }
    public Guid? ClosedByPaymentId { get; set; }
    public ICollection<CartItem> Items { get; } = new List<CartItem>();
}

public sealed class CartItem : Entity
{
    public Guid CartId { get; set; }
    public Cart? Cart { get; set; }
    public CartItemType ItemType { get; set; }
    public Guid ReferenceId { get; set; }
}

public sealed class Coupon : Entity
{
    public required string Code { get; set; }
    public decimal PercentageOff { get; set; }
    public decimal? FixedAmountOff { get; set; }
    public DateTimeOffset? StartsAtUtc { get; set; }
    public DateTimeOffset? EndsAtUtc { get; set; }
    public int? MaxRedemptions { get; set; }
    public int? MaxRedemptionsPerUser { get; set; }
    public decimal? MinimumPurchaseAmount { get; set; }
    /// <summary>
    /// Capacity already allocated to confirmed redemptions or processing
    /// checkout snapshots. Cancelled and definitely failed payments release it.
    /// </summary>
    public int RedemptionCount { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<CouponCourse> ApplicableCourses { get; } = new List<CouponCourse>();
}

public sealed class CouponCourse : Entity
{
    public Guid CouponId { get; set; }
    public Coupon? Coupon { get; set; }
    public Guid CourseId { get; set; }
    public Betcco.Domain.Learning.Course? Course { get; set; }
}

/// <summary>A confirmed coupon use, persisted per payment and learner.</summary>
public sealed class CouponRedemption : Entity
{
    public Guid CouponId { get; set; }
    public Coupon? Coupon { get; set; }
    public required string UserId { get; set; }
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }
}

public sealed class CoursePackage : Entity
{
    public required string Slug { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "JOD";
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public DateTimeOffset? AvailableUntilUtc { get; set; }
    public bool IsPublished { get; set; }
    public ICollection<PackageCourse> Courses { get; } = new List<PackageCourse>();
}

public sealed class PackageCourse : Entity
{
    public Guid CoursePackageId { get; set; }
    public CoursePackage? CoursePackage { get; set; }
    public Guid CourseId { get; set; }
    public Betcco.Domain.Learning.Course? Course { get; set; }
}

public sealed class MembershipPlan : Entity
{
    public required string Slug { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public string? ArabicFeaturesJson { get; set; }
    public string? EnglishFeaturesJson { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "JOD";
    public BillingInterval Interval { get; set; } = BillingInterval.Monthly;
    public bool IsPublished { get; set; }
    public ICollection<MembershipPlanCourse> Courses { get; } = new List<MembershipPlanCourse>();
}

public sealed class MembershipPlanCourse : Entity
{
    public Guid MembershipPlanId { get; set; }
    public MembershipPlan? MembershipPlan { get; set; }
    public Guid CourseId { get; set; }
    public Betcco.Domain.Learning.Course? Course { get; set; }
}

public sealed class UserMembership : Entity
{
    public required string StudentUserId { get; set; }
    public Guid MembershipPlanId { get; set; }
    public MembershipPlan? MembershipPlan { get; set; }
    public Guid PaymentId { get; set; }
    public DateTimeOffset StartsAtUtc { get; set; }
    public DateTimeOffset EndsAtUtc { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Active;
}

public sealed class CourseSubscriptionPlan : Entity
{
    public Guid CourseId { get; set; }
    public Betcco.Domain.Learning.Course? Course { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "JOD";
    public BillingInterval Interval { get; set; } = BillingInterval.Monthly;
    public bool IsPublished { get; set; }
}

public sealed class UserCourseSubscription : Entity
{
    public required string StudentUserId { get; set; }
    public Guid CourseSubscriptionPlanId { get; set; }
    public CourseSubscriptionPlan? CourseSubscriptionPlan { get; set; }
    public Guid PaymentId { get; set; }
    public DateTimeOffset StartsAtUtc { get; set; }
    public DateTimeOffset EndsAtUtc { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Active;
}

public sealed class Payment : Entity
{
    public required string UserId { get; set; }
    public required string Purpose { get; set; }
    public Guid ReferenceId { get; set; }
    /// <summary>
    /// Set only for new course-cart attempts. It keeps the active-checkout
    /// uniqueness constraint additive without classifying historical payments.
    /// </summary>
    public Guid? ActiveCartId { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    /// <summary>
    /// Tax calculated and locked by the server when this payment is created.
    /// It is deliberately stored separately from revenue so tax is never paid
    /// out as a teacher commission.
    /// </summary>
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string Currency { get; set; } = "JOD";
    public PaymentMethod Method { get; set; } = PaymentMethod.Card;
    public string? Provider { get; set; }
    public string? ProviderPaymentId { get; set; }
    public string? ProviderCheckoutUrl { get; set; }
    /// <summary>
    /// Transport/session lifecycle kept separate from the economic payment status.
    /// Null identifies a legacy payment created before recoverable sessions existed.
    /// </summary>
    public ProviderSessionStatus? ProviderSessionStatus { get; set; }
    public DateTimeOffset? ProviderSessionAttemptedAtUtc { get; set; }
    public DateTimeOffset? ProviderSessionResolvedAtUtc { get; set; }
    public int ProviderSessionAttemptCount { get; set; }
    public string? ProviderSessionFailureCode { get; set; }
    public string? IdempotencyKey { get; set; }
    /// <summary>
    /// The coupon allocation accepted by the server when this payment snapshot
    /// was created. Later coupon edits must not reinterpret that agreement.
    /// </summary>
    public Guid? CouponId { get; set; }
    public Coupon? Coupon { get; set; }
    public string? CouponCode { get; set; }
    public string LineItemsJson { get; set; } = "[]";
    public DateTimeOffset? PaidAtUtc { get; set; }
}

/// <summary>Append-only evidence of a server-controlled financial payment state transition.</summary>
public sealed class PaymentStatusTransition : Entity
{
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public PaymentStatus PreviousStatus { get; set; }
    public PaymentStatus NewStatus { get; set; }
    public PaymentTransitionSource Source { get; set; }
    public string? ActorContext { get; set; }
    public string? Provider { get; set; }
    public string? ProviderEventReference { get; set; }
    public string? IdempotencyKey { get; set; }
    public string? ReasonCode { get; set; }
    public string? CorrelationId { get; set; }
}

public sealed class ProviderReconciliationCase : Entity
{
    public required string Provider { get; set; }
    public ProviderReconciliationCaseType CaseType { get; set; }
    public ProviderReconciliationCaseStatus Status { get; set; } = ProviderReconciliationCaseStatus.Open;
    public Guid? PaymentId { get; set; }
    public Guid? RefundId { get; set; }
    public required string BusinessIdentity { get; set; }
    public string? LocalStatus { get; set; }
    public string? ProviderTransactionReference { get; set; }
    public string? ProviderStatusCode { get; set; }
    public decimal? LocalAmount { get; set; }
    public decimal? ObservedProviderAmount { get; set; }
    public string? Currency { get; set; }
    public string? CorrelationReference { get; set; }
    public string? ResolutionCode { get; set; }
    public string? ResolutionNote { get; set; }
    public string? ResolvedByUserId { get; set; }
    public DateTimeOffset? ResolvedAtUtc { get; set; }
}

public sealed class PaymentDispute : Entity
{
    public Guid PaymentId { get; set; }
    public string? Provider { get; set; }
    public string? ProviderDisputeReference { get; set; }
    public required string Category { get; set; }
    public decimal Amount { get; set; }
    public required string Currency { get; set; }
    public string? ReasonCode { get; set; }
    public string? Note { get; set; }
    public PaymentDisputeSource Source { get; set; }
    public PaymentDisputeStatus Status { get; set; } = PaymentDisputeStatus.Open;
    public Guid? ProviderReconciliationCaseId { get; set; }
    public required string BusinessIdentity { get; set; }
    public string? ResolutionCode { get; set; }
    public string? ResolutionNote { get; set; }
    public string? ResolvedByUserId { get; set; }
    public DateTimeOffset? ResolvedAtUtc { get; set; }
}

/// <summary>
/// Immutable, server-owned refund evidence. InternallyRecorded establishes an
/// internal accounting reversal only; provider settlement is intentionally not
/// represented by this state.
/// </summary>
public sealed class Refund : Entity
{
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "JOD";
    public RefundStatus Status { get; set; } = RefundStatus.Requested;
    public required string ReasonCode { get; set; }
    public string? Note { get; set; }
    public required string RequestedByUserId { get; set; }
    public DateTimeOffset RequestedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? InternallyRecordedByUserId { get; set; }
    public DateTimeOffset? InternallyRecordedAtUtc { get; set; }
    public required string IdempotencyKey { get; set; }
    public string? ProviderRefundReference { get; set; }
    public string? ProviderName { get; set; }
    public string? ProviderStatusCode { get; set; }
    public string? ProviderFailureCode { get; set; }
    public DateTimeOffset? ProviderInitiatedAtUtc { get; set; }
    public DateTimeOffset? ProviderVerifiedAtUtc { get; set; }
    public DateTimeOffset? ProviderResultUnknownAtUtc { get; set; }
    public required string CorrelationReference { get; set; }
    public string? FailureCode { get; set; }
    public RefundEntitlementDisposition EntitlementDisposition { get; set; } = RefundEntitlementDisposition.NotChangedPendingBusinessPolicy;
}

/// <summary>Append-only server evidence for a refund provider or accounting state change.</summary>
public sealed class RefundStatusTransition : Entity
{
    public Guid RefundId { get; set; }
    public Refund? Refund { get; set; }
    public RefundStatus PreviousStatus { get; set; }
    public RefundStatus NewStatus { get; set; }
    public RefundTransitionSource Source { get; set; }
    public string? ActorContext { get; set; }
    public string? ProviderReference { get; set; }
    public string? ReasonCode { get; set; }
    public string? CorrelationId { get; set; }
}

/// <summary>
/// Immutable internal invoice evidence issued from a trusted paid-payment
/// snapshot. It is not a statutory or externally submitted invoice.
/// </summary>
public sealed class Invoice : Entity
{
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public required string Number { get; set; }
    public required string CustomerUserId { get; set; }
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public CommercialDocumentStatus Status { get; set; } = CommercialDocumentStatus.Issued;
    public CommercialDocumentSource Source { get; set; } = CommercialDocumentSource.TrustedPaidPayment;
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string Currency { get; set; } = "JOD";
    public required string CorrelationReference { get; set; }
    public string? ExternalFiscalReference { get; set; }
    public string? ExternalFiscalStatus { get; set; }
    public ICollection<InvoiceLine> Lines { get; } = new List<InvoiceLine>();
}

/// <summary>Immutable captured purchase-line evidence for an internal invoice.</summary>
public sealed class InvoiceLine : Entity
{
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public int Sequence { get; set; }
    public required string ItemType { get; set; }
    public Guid? ItemReferenceId { get; set; }
    public decimal Amount { get; set; }
    public required string SnapshotJson { get; set; }
}

/// <summary>
/// Immutable internal credit-note evidence issued from a trusted finalized
/// refund. It does not assert external refund settlement or tax reporting.
/// </summary>
public sealed class CreditNote : Entity
{
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public Guid RefundId { get; set; }
    public Refund? Refund { get; set; }
    public required string Number { get; set; }
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public CommercialDocumentStatus Status { get; set; } = CommercialDocumentStatus.Issued;
    public CommercialDocumentSource Source { get; set; } = CommercialDocumentSource.TrustedFinalizedRefund;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "JOD";
    public required string CorrelationReference { get; set; }
    public string? ExternalFiscalReference { get; set; }
    public string? ExternalFiscalStatus { get; set; }
}

/// <summary>Immutable, safe evidence of one JoFotara fiscal-submission attempt.</summary>
public sealed class FiscalDocumentSubmission : Entity
{
    public Guid? InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public Guid? CreditNoteId { get; set; }
    public CreditNote? CreditNote { get; set; }
    public required string Provider { get; set; }
    public FiscalDocumentType DocumentType { get; set; }
    public FiscalSubmissionStatus Status { get; set; } = FiscalSubmissionStatus.Pending;
    public required string BusinessIdentity { get; set; }
    public required string CorrelationReference { get; set; }
    public DateTimeOffset AttemptedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ConfirmedAtUtc { get; set; }
    public string? ProviderReference { get; set; }
    public string? ProviderStatusCode { get; set; }
    public string? FailureCode { get; set; }
}

/// <summary>Append-only evidence of a controlled fiscal-submission state change.</summary>
public sealed class FiscalDocumentSubmissionTransition : Entity
{
    public Guid FiscalDocumentSubmissionId { get; set; }
    public FiscalDocumentSubmission? FiscalDocumentSubmission { get; set; }
    public FiscalSubmissionStatus PreviousStatus { get; set; }
    public FiscalSubmissionStatus NewStatus { get; set; }
    public FiscalSubmissionTransitionSource Source { get; set; }
    public string? ActorContext { get; set; }
    public string? ProviderReference { get; set; }
    public string? ResultCode { get; set; }
    public string? CorrelationReference { get; set; }
}

public sealed class WebhookEvent : Entity
{
    public required string Provider { get; set; }
    public required string ProviderEventId { get; set; }
    public required string EventType { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WalletTransaction : Entity
{
    public required string UserId { get; set; }
    public required string Type { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "JOD";
    public Guid? PaymentId { get; set; }
    public Guid? RefundId { get; set; }
    public Refund? Refund { get; set; }
    public Guid? PayoutRequestId { get; set; }
    public required string Description { get; set; }
}

public sealed class LedgerAccount : Entity
{
    public LedgerAccountCode Code { get; set; }
    public string Currency { get; set; } = "JOD";
}

public sealed class LedgerTransaction : Entity
{
    public LedgerEventType EventType { get; set; }
    public string Currency { get; set; } = "JOD";
    public Guid? PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public Guid? RefundId { get; set; }
    public Refund? Refund { get; set; }
    public Guid? PayoutRequestId { get; set; }
    public PayoutRequest? PayoutRequest { get; set; }
    public string? ProviderReference { get; set; }
    public string? IdempotencyKey { get; set; }
    public required string BusinessEventReference { get; set; }
    public string? CorrelationId { get; set; }
    public ICollection<LedgerEntry> Entries { get; set; } = [];
}

public sealed class LedgerEntry : Entity
{
    public Guid LedgerTransactionId { get; set; }
    public LedgerTransaction? LedgerTransaction { get; set; }
    public Guid LedgerAccountId { get; set; }
    public LedgerAccount? LedgerAccount { get; set; }
    public Guid? CourseSaleAllocationId { get; set; }
    public CourseSaleAllocation? CourseSaleAllocation { get; set; }
    public LedgerEntrySide Side { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "JOD";
}

public sealed class CourseSaleAllocation : Entity
{
    public Guid PaymentId { get; set; }
    public Guid CourseId { get; set; }
    public string? TeacherUserId { get; set; }
    public decimal GrossAmount { get; set; }
    public decimal DiscountAllocated { get; set; }
    public decimal NetAmount { get; set; }
    public decimal PlatformCommission { get; set; }
    public decimal TeacherEarning { get; set; }
    public string Currency { get; set; } = "JOD";
}

public sealed class PayoutRequest : Entity
{
    public required string TeacherUserId { get; set; }
    public string? IdempotencyKey { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "JOD";
    public PayoutMethod Method { get; set; }
    public required string DestinationEncrypted { get; set; }
    public required string DestinationMasked { get; set; }
    public PayoutStatus Status { get; set; } = PayoutStatus.Requested;
    public string? ReviewedByAdminUserId { get; set; }
    public string? ReviewNote { get; set; }
    public string? ProviderPayoutReference { get; set; }
    public DateTimeOffset? ReviewedAtUtc { get; set; }
    public DateTimeOffset? ExecutionInitiatedAtUtc { get; set; }
    public DateTimeOffset? PaidAtUtc { get; set; }
    public DateTimeOffset? FailedAtUtc { get; set; }
    public DateTimeOffset? ProviderResultUnknownAtUtc { get; set; }
    public DateTimeOffset? SettledAtUtc { get; set; }
    public string? ProviderName { get; set; }
    public string? ProviderResultCode { get; set; }
    public string? ExecutionFailureCode { get; set; }
}

/// <summary>Append-only evidence for every server-controlled payout state change.</summary>
public sealed class PayoutStatusTransition : Entity
{
    public Guid PayoutRequestId { get; set; }
    public PayoutRequest? PayoutRequest { get; set; }
    public PayoutStatus PreviousStatus { get; set; }
    public PayoutStatus NewStatus { get; set; }
    public PayoutTransitionSource Source { get; set; }
    public string? ActorContext { get; set; }
    public string? Provider { get; set; }
    public string? ProviderTransferReference { get; set; }
    public string? ResultCode { get; set; }
    public string? CorrelationId { get; set; }
}
