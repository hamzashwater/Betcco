namespace Betcco.Application.Commerce;

public sealed record CartLine(Guid ReferenceId, string ItemType);
public sealed record CartView(Guid Id, IReadOnlyCollection<CartLineView> Items, decimal Subtotal, decimal Discount, decimal Total, string Currency);
public sealed record CartLineView(Guid Id, Guid ReferenceId, string ItemType, string Title, decimal Price);
public sealed record CheckoutResult(Guid PaymentId, string Status, string Provider, string CheckoutReference, string? RedirectUrl, string ProviderSessionStatus, decimal Subtotal, decimal Discount, decimal Tax, decimal Total, string Currency, string PaymentMethod);
public sealed record PaymentCheckoutRequest(Guid PaymentId, string Currency, decimal Amount, string Description, string CallbackUrl, string ReturnUrl, string PaymentMethod);
public sealed record PaymentSession(string Provider, string ProviderPaymentId, string? RedirectUrl, bool IsDevelopmentTest);
public sealed record PaymentCheckoutRecovery(string Provider, string ProfileId, string ProviderPaymentId, string CartId, string Currency, decimal Amount, string? RedirectUrl, bool IsSuccessful, bool IsDefiniteFailure, string? ProviderStatus, string? ProviderResultCode);
public sealed record PaymentTransactionVerification(string Provider, string ProfileId, string ProviderPaymentId, string CartId, string Currency, decimal Amount, bool IsSuccessful, string? ProviderStatus, string? ProviderResultCode, bool IsDefiniteFailure);
public sealed class PaymentSessionCreationRejectedException(string failureCode, string message) : InvalidOperationException(message)
{
    public string FailureCode { get; } = failureCode;
}
public sealed class PaymentSessionResultUnknownException(string message) : Exception(message);
public sealed record PayoutTransferResult(string Provider, string? Reference, string? ResultCode, bool IsConfirmed, bool IsDefiniteFailure);
public sealed class PayoutProviderUnavailableException(string message) : InvalidOperationException(message);
public sealed class PayoutProviderResultUnknownException(string message) : Exception(message);
public sealed record MembershipCheckoutView(Guid PaymentId, string Status, decimal Total, string Currency, string PaymentMethod);
public sealed record PaymentCancellationResult(bool IsCancelled, bool IsIdempotentReplay = false, string? FailureCode = null, string? FailureMessage = null);
public sealed record RecordInternalRefund(Guid PaymentId, decimal Amount, string Currency, string ReasonCode, string? Note, string IdempotencyKey);
public sealed record RefundView(Guid Id, Guid PaymentId, decimal Amount, string Currency, string Status, string ReasonCode, DateTimeOffset RequestedAtUtc, DateTimeOffset? InternallyRecordedAtUtc, string? ProviderRefundReference, string? ProviderStatusCode, string? ProviderFailureCode, string CorrelationReference, string? FailureCode, string EntitlementDisposition);
public sealed record RefundRecordingResult(RefundView? Refund, bool IsIdempotentReplay = false, string? FailureCode = null, string? FailureMessage = null);
public sealed record InitiatePayTabsRefund(Guid PaymentId, string ReasonCode, string? Note, string IdempotencyKey);
public sealed record RefundProviderWorkflowResult(RefundView? Refund, bool IsIdempotentReplay = false, string? FailureCode = null, string? FailureMessage = null);
public sealed record PaymentProviderRefundRequest(Guid RefundId, string RefundReference, string Currency, decimal Amount, string Description, string OriginalProviderPaymentReference);
public sealed record PaymentProviderRefundTransaction(string Provider, string? ProfileId, string? ProviderRefundReference, string? TransactionType, string? CartId, string? Currency, decimal? Amount, string? Status, string? Code, bool IsSuccessful, bool IsDefiniteFailure, bool ProfileMatchesConfigured);
public sealed record InvoiceLineView(int Sequence, string ItemType, Guid? ItemReferenceId, decimal Amount, string SnapshotJson);
public sealed record InvoiceView(Guid Id, Guid PaymentId, string Number, string CustomerUserId, DateTimeOffset IssuedAtUtc, string Status, decimal Subtotal, decimal Discount, decimal Tax, decimal Total, string Currency, string CorrelationReference, IReadOnlyCollection<InvoiceLineView> Lines);
public sealed record CreditNoteView(Guid Id, Guid InvoiceId, Guid RefundId, string Number, DateTimeOffset IssuedAtUtc, string Status, decimal Amount, string Currency, string CorrelationReference);
public sealed record CommercialDocumentResult<T>(T? Document, bool IsIdempotentReplay = false, string? FailureCode = null, string? FailureMessage = null);
public sealed record FiscalSubmissionView(Guid Id, Guid? InvoiceId, Guid? CreditNoteId, string Provider, string DocumentType, string Status, DateTimeOffset AttemptedAtUtc, DateTimeOffset? ConfirmedAtUtc, string? ProviderReference, string? ProviderStatusCode, string? FailureCode, string CorrelationReference);
public sealed record FiscalSubmissionResult(FiscalSubmissionView? Submission, bool IsIdempotentReplay = false, string? FailureCode = null, string? FailureMessage = null);
public sealed record FiscalInvoiceSubmissionRequest(Guid SubmissionId, Guid InvoiceId, string InternalNumber, string Currency, decimal Subtotal, decimal Discount, decimal Tax, decimal Total, IReadOnlyCollection<InvoiceLineView> Lines, string? EncodedUblInvoice = null);
public sealed record FiscalProviderSubmissionResult(string Provider, string? ProviderReference, string? StatusCode, bool IsAccepted, bool IsDefiniteRejected, bool RequiresReview, string? FailureCode = null);

public interface IPaymentProvider
{
    string ProviderName { get; }
    TimeSpan? CheckoutSessionUncertaintyWindow => null;
    Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PaymentCheckoutRecovery>> QueryCheckoutSessionsAsync(Guid paymentId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyCollection<PaymentCheckoutRecovery>>([]);
    Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default);
    Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default);
    Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default);
}

public interface IPayoutProvider
{
    string ProviderName { get; }
    bool IsAvailable { get; }
    Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default);
}

public interface ICommerceService
{
    Task<CartView> GetCartAsync(string ownerKey, string? userId, string locale, CancellationToken cancellationToken = default);
    Task<CartView> AddCourseAsync(string ownerKey, string? userId, Guid courseId, string locale, CancellationToken cancellationToken = default);
    Task<CartView> AddPackageAsync(string ownerKey, string? userId, Guid packageId, string locale, CancellationToken cancellationToken = default);
    Task<bool> RemoveItemAsync(string ownerKey, string? userId, Guid itemId, CancellationToken cancellationToken = default);
    Task<CheckoutResult?> CreateCourseCheckoutAsync(string userId, string ownerKey, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<CheckoutResult?> CreateMembershipCheckoutAsync(string userId, Guid membershipPlanId, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<CheckoutResult?> CreateCourseSubscriptionCheckoutAsync(string userId, Guid courseSubscriptionPlanId, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<CheckoutResult?> CreateEvaluationCheckoutAsync(string userId, Guid evaluationRequestId, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<bool> ConfirmFakeWebhookAsync(Guid paymentId, string providerEventId, string? expectedOwnerUserId = null, CancellationToken cancellationToken = default);
    Task<bool> ConfirmPayTabsCallbackAsync(string cartId, string providerPaymentId, CancellationToken cancellationToken = default);
    Task<PaymentCancellationResult> CancelProcessingPaymentAsync(string userId, Guid paymentId, CancellationToken cancellationToken = default);
}

public interface IRefundService
{
    Task<RefundRecordingResult> RecordInternalRefundAsync(string financeAdminUserId, RecordInternalRefund request, CancellationToken cancellationToken = default);
    Task<RefundProviderWorkflowResult> InitiatePayTabsRefundAsync(string financeAdminUserId, InitiatePayTabsRefund request, CancellationToken cancellationToken = default);
    Task<RefundProviderWorkflowResult> VerifyPayTabsRefundAsync(string financeAdminUserId, Guid refundId, CancellationToken cancellationToken = default);
}

public interface ICommercialDocumentService
{
    Task<CommercialDocumentResult<InvoiceView>> IssueInvoiceAsync(string financeAdminUserId, Guid paymentId, CancellationToken cancellationToken = default);
    Task<CommercialDocumentResult<CreditNoteView>> IssueCreditNoteAsync(string financeAdminUserId, Guid refundId, CancellationToken cancellationToken = default);
}

public interface IFiscalInvoiceProvider
{
    string ProviderName { get; }
    Task<FiscalProviderSubmissionResult> SubmitInvoiceAsync(FiscalInvoiceSubmissionRequest request, CancellationToken cancellationToken = default);
}

public interface IFiscalSubmissionService
{
    Task<FiscalSubmissionResult> SubmitInvoiceAsync(string financeAdminUserId, Guid invoiceId, CancellationToken cancellationToken = default);
}
