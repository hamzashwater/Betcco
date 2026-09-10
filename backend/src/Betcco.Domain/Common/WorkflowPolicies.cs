namespace Betcco.Domain.Common;

public static class EvaluationWorkflow
{
    public static bool CanTransition(EvaluationStatus from, EvaluationStatus to) => (from, to) switch
    {
        (EvaluationStatus.Draft, EvaluationStatus.PendingPayment) => true,
        (EvaluationStatus.PendingPayment, EvaluationStatus.PendingAssignment) => true,
        (EvaluationStatus.PendingAssignment, EvaluationStatus.Assigned) => true,
        (EvaluationStatus.Assigned, EvaluationStatus.UnderReview) => true,
        (EvaluationStatus.UnderReview, EvaluationStatus.NeedsRevision or EvaluationStatus.Completed) => true,
        (EvaluationStatus.NeedsRevision, EvaluationStatus.Assigned or EvaluationStatus.Closed) => true,
        (EvaluationStatus.Completed, EvaluationStatus.Closed) => true,
        _ => false
    };
}

public static class PaymentWorkflow
{
    public static bool CanConfirm(PaymentStatus status) => CanTransition(status, PaymentStatus.Paid);

    public static bool CanTransition(PaymentStatus from, PaymentStatus to) => (from, to) switch
    {
        (PaymentStatus.Processing, PaymentStatus.Paid or PaymentStatus.Failed or PaymentStatus.Cancelled) => true,
        (PaymentStatus.Paid, PaymentStatus.PartiallyRefunded or PaymentStatus.Refunded) => true,
        (PaymentStatus.PartiallyRefunded, PaymentStatus.PartiallyRefunded or PaymentStatus.Refunded) => true,
        _ => false
    };
}

public static class RefundWorkflow
{
    public static bool CanTransition(RefundStatus from, RefundStatus to) => (from, to) switch
    {
        (RefundStatus.Requested, RefundStatus.ProviderProcessing or RefundStatus.InternallyRecorded) => true,
        (RefundStatus.ProviderProcessing, RefundStatus.ProviderVerified or RefundStatus.ProviderFailed or RefundStatus.ProviderResultUnknown) => true,
        (RefundStatus.ProviderResultUnknown, RefundStatus.ProviderVerified or RefundStatus.ProviderFailed) => true,
        (RefundStatus.ProviderVerified, RefundStatus.InternallyRecorded) => true,
        _ => false
    };
}

public static class PayoutWorkflow
{
    public static bool CanTransition(PayoutStatus from, PayoutStatus to) => (from, to) switch
    {
        (PayoutStatus.Requested, PayoutStatus.Approved or PayoutStatus.Rejected) => true,
        (PayoutStatus.Approved, PayoutStatus.Processing or PayoutStatus.Rejected) => true,
        (PayoutStatus.Processing, PayoutStatus.Paid or PayoutStatus.Failed or PayoutStatus.ProviderResultUnknown) => true,
        (PayoutStatus.Paid, PayoutStatus.Settled) => true,
        _ => false
    };
}
