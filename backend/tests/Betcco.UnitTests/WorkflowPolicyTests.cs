using Betcco.Domain.Common;

namespace Betcco.UnitTests;

public sealed class WorkflowPolicyTests
{
    [Fact]
    public void Evaluation_cannot_skip_verified_payment_and_assignment()
    {
        Assert.False(EvaluationWorkflow.CanTransition(EvaluationStatus.Draft, EvaluationStatus.Assigned));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.Draft, EvaluationStatus.PendingPayment));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.PendingPayment, EvaluationStatus.PendingAssignment));
    }

    [Fact]
    public void Only_processing_payment_can_be_confirmed()
    {
        Assert.True(PaymentWorkflow.CanConfirm(PaymentStatus.Processing));
        Assert.False(PaymentWorkflow.CanConfirm(PaymentStatus.Pending));
        Assert.False(PaymentWorkflow.CanConfirm(PaymentStatus.Paid));
    }

    [Fact]
    public void Paid_payments_support_partial_and_full_refund_transitions()
    {
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.PartiallyRefunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.Refunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.PartiallyRefunded, PaymentStatus.PartiallyRefunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.PartiallyRefunded, PaymentStatus.Refunded));

        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.Chargeback));
        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Refunded, PaymentStatus.PartiallyRefunded));
        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Refunded, PaymentStatus.Paid));
    }

    [Fact]
    public void Betcco_review_can_finish_or_open_one_revision_directly_from_assigned()
    {
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.Assigned, EvaluationStatus.NeedsRevision));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.Assigned, EvaluationStatus.Completed));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.NeedsRevision, EvaluationStatus.Assigned));
        Assert.False(EvaluationWorkflow.CanTransition(EvaluationStatus.NeedsRevision, EvaluationStatus.Completed));
    }

    [Fact]
    public void Historical_internal_verification_transition_remains_supported()
    {
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.Assigned, EvaluationStatus.UnderReview));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.UnderReview, EvaluationStatus.NeedsRevision));
        Assert.True(EvaluationWorkflow.CanTransition(EvaluationStatus.UnderReview, EvaluationStatus.Completed));
    }
}
