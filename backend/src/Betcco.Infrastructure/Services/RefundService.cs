using System.Data;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Records internal refund evidence and accounting. PayTabs accounting is
/// finalized only after a separate server-side provider query verifies it.
/// </summary>
public sealed class RefundService(BetccoDbContext db, IPaymentProvider? paymentProvider = null) : IRefundService
{
    public async Task<RefundRecordingResult> RecordInternalRefundAsync(string financeAdminUserId, RecordInternalRefund request, CancellationToken cancellationToken = default)
    {
        if (!IsValidRequest(request, out var invalidCode, out var invalidMessage))
            return await RejectAsync(financeAdminUserId, request.PaymentId, invalidCode!, invalidMessage!, cancellationToken);

        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var existing = await db.Refunds.SingleOrDefaultAsync(item => item.PaymentId == request.PaymentId && item.IdempotencyKey == request.IdempotencyKey.Trim(), cancellationToken);
                if (existing is not null)
                {
                    Audit(financeAdminUserId, "RefundDuplicateReplay", existing.Id, new { existing.PaymentId, existing.Status });
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    return new(ToView(existing), true);
                }

                var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == request.PaymentId, cancellationToken);
                if (payment is null)
                    return await RejectAndCommitAsync(financeAdminUserId, request.PaymentId, "REFUND_PAYMENT_NOT_FOUND", "The payment was not found.", transaction, cancellationToken);
                if (payment.Status is not (PaymentStatus.Paid or PaymentStatus.PartiallyRefunded))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_PAYMENT_NOT_PAID", "Only paid payments can be refunded.", transaction, cancellationToken);
                if (string.Equals(payment.Provider, "PayTabs", StringComparison.OrdinalIgnoreCase))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "PAYTABS_PROVIDER_VERIFICATION_REQUIRED", "PayTabs refunds require verified provider evidence before internal accounting is finalized.", transaction, cancellationToken);
                if (!string.Equals(payment.Currency, request.Currency.Trim(), StringComparison.OrdinalIgnoreCase))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_CURRENCY_INVALID", "Refund currency must match the payment currency.", transaction, cancellationToken);

                var alreadyRefunded = await db.Refunds.AsNoTracking()
                    .Where(item => item.PaymentId == payment.Id && item.Status == RefundStatus.InternallyRecorded)
                    .SumAsync(item => (decimal?)item.Amount, cancellationToken) ?? 0m;
                var refundableBalance = payment.Total - alreadyRefunded;
                if (request.Amount > refundableBalance)
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_AMOUNT_EXCEEDS_BALANCE", "Refund amount exceeds the trusted refundable balance.", transaction, cancellationToken);

                var refund = NewRefund(financeAdminUserId, request, payment.Currency);
                db.Refunds.Add(refund);
                Audit(financeAdminUserId, "RefundRequested", refund.Id, new { refund.PaymentId, refund.Amount, refund.Currency, refund.ReasonCode });

                // No existing business rule defines how a partial refund is split
                // across platform commission and teacher earnings. Preserve an
                // auditable request without creating financial effects.
                if (request.Amount < refundableBalance || alreadyRefunded > 0m)
                {
                    refund.FailureCode = "PARTIAL_REFUND_ALLOCATION_POLICY_REQUIRED";
                    Audit(financeAdminUserId, "RefundAllocationPolicyRequired", refund.Id, new { refund.PaymentId, refund.Amount, refundableBalance });
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    return new(ToView(refund));
                }

                if (!await FinalizeInternalAccountingAsync(financeAdminUserId, payment, refund, RefundStatus.Requested, cancellationToken))
                {
                    refund.FailureCode = "REFUND_ALLOCATION_POLICY_REQUIRED";
                    Audit(financeAdminUserId, "RefundAllocationPolicyRequired", refund.Id, new { refund.PaymentId, payment.Purpose });
                }
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(ToView(refund));
            }
            catch (Exception exception) when (attempt == 0 && IsPostgresConcurrencyConflict(exception))
            {
                db.ChangeTracker.Clear();
            }
        }

        return await RejectAsync(financeAdminUserId, request.PaymentId, "REFUND_CONCURRENCY_CONFLICT", "Refund processing conflicted with another request. Retry with a new idempotency key.", cancellationToken);
    }

    public async Task<RefundProviderWorkflowResult> InitiatePayTabsRefundAsync(string financeAdminUserId, InitiatePayTabsRefund request, CancellationToken cancellationToken = default)
    {
        if (!IsValidProviderRequest(request, out var code, out var message))
            return await RejectProviderAsync(financeAdminUserId, request.PaymentId, code!, message!, cancellationToken);

        Refund? refund;
        Payment? payment;
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken))
        {
            var existing = await db.Refunds.SingleOrDefaultAsync(item => item.PaymentId == request.PaymentId && item.IdempotencyKey == request.IdempotencyKey.Trim(), cancellationToken);
            if (existing is not null)
            {
                Audit(financeAdminUserId, "PayTabsRefundDuplicateReplay", existing.Id, new { existing.PaymentId, existing.Status });
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(ToView(existing), true);
            }

            payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == request.PaymentId, cancellationToken);
            if (payment is null)
                return await RejectProviderAndCommitAsync(financeAdminUserId, request.PaymentId, "REFUND_PAYMENT_NOT_FOUND", "The payment was not found.", transaction, cancellationToken);
            if (payment.Status != PaymentStatus.Paid)
                return await RejectProviderAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_PAYMENT_NOT_PAID", "Only fully paid payments can receive a PayTabs full refund.", transaction, cancellationToken);
            if (!string.Equals(payment.Provider, "PayTabs", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(payment.ProviderPaymentId))
                return await RejectProviderAndCommitAsync(financeAdminUserId, payment.Id, "PAYTABS_ORIGINAL_TRANSACTION_REQUIRED", "A trusted PayTabs sale transaction is required.", transaction, cancellationToken);
            if (paymentProvider is null || !string.Equals(paymentProvider.ProviderName, "PayTabs", StringComparison.OrdinalIgnoreCase))
                return await RejectProviderAndCommitAsync(financeAdminUserId, payment.Id, "PAYTABS_REFUND_PROVIDER_UNAVAILABLE", "The PayTabs Test refund provider is unavailable.", transaction, cancellationToken);
            var existingRefunds = await db.Refunds.AsNoTracking().Where(item => item.PaymentId == payment.Id).ToListAsync(cancellationToken);
            if (existingRefunds.Any(item => item.Amount != payment.Total))
                return await RejectProviderAndCommitAsync(financeAdminUserId, payment.Id, "PARTIAL_REFUND_PROVIDER_EXECUTION_DISABLED", "PayTabs provider execution supports full refunds only.", transaction, cancellationToken);
            if (existingRefunds.Count != 0)
                return await RejectProviderAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_EXISTING_REQUEST_REQUIRES_REVIEW", "An existing refund record requires review before another provider refund is initiated.", transaction, cancellationToken);

            refund = new Refund
            {
                PaymentId = payment.Id,
                Amount = payment.Total,
                Currency = payment.Currency,
                Status = RefundStatus.ProviderProcessing,
                ReasonCode = request.ReasonCode.Trim(),
                Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
                RequestedByUserId = financeAdminUserId,
                IdempotencyKey = request.IdempotencyKey.Trim(),
                ProviderName = "PayTabs",
                ProviderInitiatedAtUtc = DateTimeOffset.UtcNow,
                CorrelationReference = $"refund:{Guid.NewGuid():N}",
                CreatedByUserId = financeAdminUserId
            };
            db.Refunds.Add(refund);
            AddRefundTransition(refund, RefundStatus.Requested, RefundStatus.ProviderProcessing, RefundTransitionSource.PayTabsProviderInitiation, financeAdminUserId, null, refund.ReasonCode);
            Audit(financeAdminUserId, "PayTabsRefundProviderInitiated", refund.Id, new { refund.PaymentId, refund.Amount, refund.Currency, refund.CorrelationReference });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        PaymentProviderRefundTransaction response;
        try
        {
            response = await paymentProvider!.CreateRefundAsync(new(refund!.Id, PayTabsPaymentProvider.RefundCartId(refund.Id), refund.Currency, refund.Amount, "BETCCO refund", payment!.ProviderPaymentId!), cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return await RecordProviderResultUnknownAsync(financeAdminUserId, refund!.Id, "PAYTABS_REFUND_PROVIDER_RESULT_UNKNOWN", cancellationToken);
        }
        catch (HttpRequestException)
        {
            return await RecordProviderResultUnknownAsync(financeAdminUserId, refund!.Id, "PAYTABS_REFUND_PROVIDER_RESULT_UNKNOWN", cancellationToken);
        }
        catch (InvalidOperationException)
        {
            return await RecordProviderFailureAsync(financeAdminUserId, refund!.Id, null, null, "PAYTABS_REFUND_PROVIDER_UNAVAILABLE", cancellationToken);
        }

        if (response.IsDefiniteFailure)
            return await RecordProviderFailureAsync(financeAdminUserId, refund!.Id, response.ProviderRefundReference, response.Code, "PAYTABS_REFUND_DECLINED", cancellationToken);
        if (!IsExpectedProviderTransaction(response, refund!, payment!, response.ProviderRefundReference))
            return await RecordProviderResultUnknownAsync(financeAdminUserId, refund!.Id, "PAYTABS_REFUND_RESPONSE_UNVERIFIED", cancellationToken, response.ProviderRefundReference, response.Code);

        refund!.ProviderRefundReference = response.ProviderRefundReference;
        refund.ProviderStatusCode = response.Code;
        Audit(financeAdminUserId, "PayTabsRefundProviderResponseAccepted", refund.Id, new { refund.PaymentId, refund.ProviderRefundReference, refund.ProviderStatusCode });
        await db.SaveChangesAsync(cancellationToken);
        return await VerifyPayTabsRefundAsync(financeAdminUserId, refund.Id, cancellationToken);
    }

    public async Task<RefundProviderWorkflowResult> VerifyPayTabsRefundAsync(string financeAdminUserId, Guid refundId, CancellationToken cancellationToken = default)
    {
        var snapshot = await db.Refunds.AsNoTracking().SingleOrDefaultAsync(item => item.Id == refundId, cancellationToken);
        if (snapshot is null) return await RejectProviderAsync(financeAdminUserId, refundId, "REFUND_NOT_FOUND", "The refund was not found.", cancellationToken);
        if (snapshot.Status == RefundStatus.InternallyRecorded) return new(ToView(snapshot), true);
        if (snapshot.Status is not (RefundStatus.ProviderProcessing or RefundStatus.ProviderResultUnknown) || string.IsNullOrWhiteSpace(snapshot.ProviderRefundReference))
            return new(ToView(snapshot), FailureCode: "PAYTABS_REFUND_REQUIRES_REVIEW", FailureMessage: "A provider refund reference and eligible provider state are required.");
        if (paymentProvider is null || !string.Equals(paymentProvider.ProviderName, "PayTabs", StringComparison.OrdinalIgnoreCase))
            return new(ToView(snapshot), FailureCode: "PAYTABS_REFUND_PROVIDER_UNAVAILABLE", FailureMessage: "The PayTabs Test refund provider is unavailable.");

        PaymentProviderRefundTransaction query;
        try
        {
            query = await paymentProvider.VerifyRefundAsync(snapshot.ProviderRefundReference, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return await RecordProviderResultUnknownAsync(financeAdminUserId, snapshot.Id, "PAYTABS_REFUND_QUERY_RESULT_UNKNOWN", cancellationToken);
        }
        catch (HttpRequestException)
        {
            return await RecordProviderResultUnknownAsync(financeAdminUserId, snapshot.Id, "PAYTABS_REFUND_QUERY_RESULT_UNKNOWN", cancellationToken);
        }

        if (query.IsDefiniteFailure)
            return await RecordProviderFailureAsync(financeAdminUserId, snapshot.Id, query.ProviderRefundReference, query.Code, "PAYTABS_REFUND_DECLINED", cancellationToken);
        var paymentSnapshot = await db.Payments.AsNoTracking().SingleAsync(item => item.Id == snapshot.PaymentId, cancellationToken);
        if (!IsExpectedProviderTransaction(query, snapshot, paymentSnapshot, snapshot.ProviderRefundReference))
            return await RecordProviderResultUnknownAsync(financeAdminUserId, snapshot.Id, "PAYTABS_REFUND_QUERY_UNVERIFIED", cancellationToken, query.ProviderRefundReference, query.Code);

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var refund = await db.Refunds.SingleAsync(item => item.Id == refundId, cancellationToken);
        var payment = await db.Payments.SingleAsync(item => item.Id == refund.PaymentId, cancellationToken);
        if (refund.Status == RefundStatus.InternallyRecorded)
        {
            await transaction.CommitAsync(cancellationToken);
            return new(ToView(refund), true);
        }
        if (refund.Status is not (RefundStatus.ProviderProcessing or RefundStatus.ProviderResultUnknown) || refund.ProviderRefundReference != snapshot.ProviderRefundReference)
            return new(ToView(refund), FailureCode: "PAYTABS_REFUND_REQUIRES_REVIEW", FailureMessage: "The refund state changed and requires review.");

        var prior = refund.Status;
        refund.Status = RefundStatus.ProviderVerified;
        refund.ProviderStatusCode = query.Code;
        refund.ProviderVerifiedAtUtc = DateTimeOffset.UtcNow;
        AddRefundTransition(refund, prior, RefundStatus.ProviderVerified, RefundTransitionSource.PayTabsProviderVerification, financeAdminUserId, refund.ProviderRefundReference, null);
        Audit(financeAdminUserId, "PayTabsRefundProviderVerified", refund.Id, new { refund.PaymentId, refund.ProviderRefundReference, refund.ProviderStatusCode });
        await db.SaveChangesAsync(cancellationToken);

        if (!await FinalizeInternalAccountingAsync(financeAdminUserId, payment, refund, RefundStatus.ProviderVerified, cancellationToken))
        {
            await transaction.CommitAsync(cancellationToken);
            return new(ToView(refund), FailureCode: "REFUND_ALLOCATION_POLICY_REQUIRED", FailureMessage: "Provider refund is verified, but internal allocation policy requires review.");
        }
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(ToView(refund));
    }

    private async Task<bool> FinalizeInternalAccountingAsync(string financeAdminUserId, Payment payment, Refund refund, RefundStatus previousStatus, CancellationToken cancellationToken)
    {
        var allocations = await db.CourseSaleAllocations.Where(item => item.PaymentId == payment.Id).ToListAsync(cancellationToken);
        if (allocations.Count == 0 || allocations.Any(item => !string.Equals(item.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)) || allocations.Sum(item => item.NetAmount) != refund.Amount)
            return false;

        refund.Status = RefundStatus.InternallyRecorded;
        refund.InternallyRecordedAtUtc = DateTimeOffset.UtcNow;
        refund.InternallyRecordedByUserId = financeAdminUserId;
        AddRefundTransition(refund, previousStatus, RefundStatus.InternallyRecorded, RefundTransitionSource.InternalAccounting, financeAdminUserId, refund.ProviderRefundReference, refund.ReasonCode);
        payment.Status = PaymentStatus.Refunded;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = PaymentStatus.Paid,
            NewStatus = PaymentStatus.Refunded,
            Source = PaymentTransitionSource.InternalRefundRecorded,
            ActorContext = financeAdminUserId,
            Provider = payment.Provider,
            ProviderEventReference = refund.ProviderRefundReference,
            IdempotencyKey = refund.IdempotencyKey,
            ReasonCode = refund.ReasonCode,
            CorrelationId = refund.CorrelationReference
        });
        await BookFullCourseSaleRefundAsync(payment, refund, allocations, cancellationToken);
        AddWalletReversals(payment, refund, allocations);
        Audit(financeAdminUserId, "RefundInternallyRecorded", refund.Id, new { refund.PaymentId, refund.Amount, refund.Currency, providerRefundVerified = !string.IsNullOrWhiteSpace(refund.ProviderRefundReference) });
        Audit(financeAdminUserId, "RefundEntitlementPolicyNotApplied", refund.Id, new { refund.PaymentId, disposition = refund.EntitlementDisposition.ToString(), policy = "REQUIRES BUSINESS POLICY" });
        return true;
    }

    private async Task<RefundProviderWorkflowResult> RecordProviderFailureAsync(string actor, Guid refundId, string? providerReference, string? providerStatusCode, string failureCode, CancellationToken cancellationToken)
    {
        var refund = await db.Refunds.SingleAsync(item => item.Id == refundId, cancellationToken);
        if (refund.Status == RefundStatus.InternallyRecorded) return new(ToView(refund), true);
        if (refund.Status is not (RefundStatus.ProviderProcessing or RefundStatus.ProviderResultUnknown)) return new(ToView(refund), FailureCode: "PAYTABS_REFUND_REQUIRES_REVIEW", FailureMessage: "The provider refund state requires review.");
        var prior = refund.Status;
        refund.Status = RefundStatus.ProviderFailed;
        refund.ProviderRefundReference ??= providerReference;
        refund.ProviderStatusCode = providerStatusCode;
        refund.ProviderFailureCode = failureCode;
        refund.FailureCode = failureCode;
        AddRefundTransition(refund, prior, RefundStatus.ProviderFailed, RefundTransitionSource.PayTabsProviderFailure, actor, refund.ProviderRefundReference, failureCode);
        Audit(actor, "PayTabsRefundProviderFailed", refund.Id, new { refund.PaymentId, refund.ProviderRefundReference, failureCode, refund.ProviderStatusCode });
        await db.SaveChangesAsync(cancellationToken);
        return new(ToView(refund), FailureCode: failureCode, FailureMessage: "PayTabs declined or could not execute the refund.");
    }

    private async Task<RefundProviderWorkflowResult> RecordProviderResultUnknownAsync(string actor, Guid refundId, string failureCode, CancellationToken cancellationToken, string? providerReference = null, string? providerStatusCode = null)
    {
        var refund = await db.Refunds.SingleAsync(item => item.Id == refundId, cancellationToken);
        if (refund.Status == RefundStatus.InternallyRecorded) return new(ToView(refund), true);
        if (refund.Status is not (RefundStatus.ProviderProcessing or RefundStatus.ProviderResultUnknown)) return new(ToView(refund), FailureCode: "PAYTABS_REFUND_REQUIRES_REVIEW", FailureMessage: "The provider refund state requires review.");
        var prior = refund.Status;
        refund.ProviderRefundReference ??= providerReference;
        refund.ProviderStatusCode = providerStatusCode;
        refund.ProviderFailureCode = failureCode;
        refund.FailureCode = failureCode;
        refund.ProviderResultUnknownAtUtc = DateTimeOffset.UtcNow;
        if (prior == RefundStatus.ProviderProcessing)
        {
            refund.Status = RefundStatus.ProviderResultUnknown;
            AddRefundTransition(refund, prior, RefundStatus.ProviderResultUnknown, RefundTransitionSource.PayTabsProviderAmbiguousResult, actor, refund.ProviderRefundReference, failureCode);
        }
        Audit(actor, "PayTabsRefundProviderResultUnknown", refund.Id, new { refund.PaymentId, refund.ProviderRefundReference, failureCode });
        var identity = $"PayTabs|refund:{refund.Id:N}|{refund.ProviderRefundReference ?? "none"}|{ProviderReconciliationCaseType.ProviderRefundResultUnknown}";
        if (!await db.ProviderReconciliationCases.AnyAsync(item => item.BusinessIdentity == identity, cancellationToken))
            db.ProviderReconciliationCases.Add(new ProviderReconciliationCase { Provider = "PayTabs", CaseType = ProviderReconciliationCaseType.ProviderRefundResultUnknown, RefundId = refund.Id, BusinessIdentity = identity, LocalStatus = refund.Status.ToString(), ProviderTransactionReference = refund.ProviderRefundReference, ProviderStatusCode = refund.ProviderStatusCode, LocalAmount = refund.Amount, Currency = refund.Currency, CorrelationReference = refund.CorrelationReference, CreatedByUserId = actor });
        await db.SaveChangesAsync(cancellationToken);
        return new(ToView(refund), FailureCode: failureCode, FailureMessage: "The PayTabs refund result is unknown and requires review or deterministic query verification.");
    }

    private static bool IsExpectedProviderTransaction(PaymentProviderRefundTransaction transaction, Refund refund, Payment payment, string? expectedProviderReference) =>
        transaction.IsSuccessful &&
        transaction.ProfileMatchesConfigured &&
        string.Equals(transaction.Provider, "PayTabs", StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrWhiteSpace(transaction.ProviderRefundReference) &&
        string.Equals(transaction.ProviderRefundReference, expectedProviderReference, StringComparison.Ordinal) &&
        string.Equals(transaction.TransactionType, "refund", StringComparison.OrdinalIgnoreCase) &&
        string.Equals(transaction.CartId, PayTabsPaymentProvider.RefundCartId(refund.Id), StringComparison.Ordinal) &&
        string.Equals(transaction.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase) &&
        transaction.Amount == refund.Amount;

    private static bool IsPostgresConcurrencyConflict(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres
                && postgres.SqlState is PostgresErrorCodes.SerializationFailure
                    or PostgresErrorCodes.DeadlockDetected
                    or PostgresErrorCodes.UniqueViolation)
                return true;
        }
        return false;
    }

    private static bool IsValidProviderRequest(InitiatePayTabsRefund request, out string? code, out string? message)
    {
        if (string.IsNullOrWhiteSpace(request.ReasonCode) || request.ReasonCode.Trim().Length > 100) { code = "REFUND_REASON_INVALID"; message = "A valid refund reason code is required."; return false; }
        if (request.Note?.Trim().Length > 1_000) { code = "REFUND_NOTE_INVALID"; message = "Refund note is too long."; return false; }
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Trim().Length > 128) { code = "REFUND_IDEMPOTENCY_KEY_INVALID"; message = "A valid refund idempotency key is required."; return false; }
        code = null; message = null; return true;
    }

    private async Task BookFullCourseSaleRefundAsync(Payment payment, Refund refund, IReadOnlyCollection<CourseSaleAllocation> allocations, CancellationToken cancellationToken)
    {
        var clearing = await LedgerAccountAsync(LedgerAccountCode.CourseSaleClearing, payment.Currency, cancellationToken);
        var commission = await LedgerAccountAsync(LedgerAccountCode.PlatformCommission, payment.Currency, cancellationToken);
        var teacherPayable = await LedgerAccountAsync(LedgerAccountCode.TeacherEarningsPayable, payment.Currency, cancellationToken);
        var reversal = new LedgerTransaction
        {
            EventType = LedgerEventType.PaidCourseSaleRefund,
            Currency = payment.Currency,
            RefundId = refund.Id,
            IdempotencyKey = refund.IdempotencyKey,
            BusinessEventReference = $"refund:{refund.Id:N}:paid-course-sale-reversal",
            CorrelationId = refund.CorrelationReference
        };
        foreach (var allocation in allocations)
        {
            reversal.Entries.Add(new LedgerEntry { LedgerAccount = clearing, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = allocation.NetAmount, Currency = allocation.Currency });
            reversal.Entries.Add(new LedgerEntry { LedgerAccount = commission, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = allocation.PlatformCommission, Currency = allocation.Currency });
            reversal.Entries.Add(new LedgerEntry { LedgerAccount = teacherPayable, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = allocation.TeacherEarning, Currency = allocation.Currency });
        }
        db.LedgerTransactions.Add(reversal);
    }

    private void AddWalletReversals(Payment payment, Refund refund, IReadOnlyCollection<CourseSaleAllocation> allocations)
    {
        AddWalletReversal("platform", "PlatformCommissionRefundReversal", -allocations.Sum(item => item.PlatformCommission), "Platform commission reversed for internal refund");
        AddWalletReversal("platform", "UnassignedCourseRevenueRefundReversal", -allocations.Where(item => string.IsNullOrWhiteSpace(item.TeacherUserId)).Sum(item => item.TeacherEarning), "Unassigned course revenue reversed for internal refund");
        foreach (var teacher in allocations.Where(item => !string.IsNullOrWhiteSpace(item.TeacherUserId)).GroupBy(item => item.TeacherUserId!))
            AddWalletReversal(teacher.Key, "TeacherCourseEarningRefundReversal", -teacher.Sum(item => item.TeacherEarning), "Teacher earning reversed for internal refund");

        void AddWalletReversal(string userId, string type, decimal amount, string description)
        {
            if (amount == 0m) return;
            db.WalletTransactions.Add(new WalletTransaction { UserId = userId, Type = type, Amount = amount, Currency = payment.Currency, PaymentId = payment.Id, RefundId = refund.Id, Description = description });
        }
    }

    private async Task<LedgerAccount> LedgerAccountAsync(LedgerAccountCode code, string currency, CancellationToken cancellationToken)
    {
        var account = await db.LedgerAccounts.SingleOrDefaultAsync(item => item.Code == code && item.Currency == currency, cancellationToken);
        if (account is not null) return account;
        account = new LedgerAccount { Code = code, Currency = currency };
        db.LedgerAccounts.Add(account);
        return account;
    }

    private async Task<RefundRecordingResult> RejectAsync(string actor, Guid paymentId, string code, string message, CancellationToken cancellationToken)
    {
        Audit(actor, code == "REFUND_CURRENCY_INVALID" ? "RefundInvalidCurrencyRejected" : "RefundRejected", paymentId, new { failureCode = code });
        await db.SaveChangesAsync(cancellationToken);
        return new(null, FailureCode: code, FailureMessage: message);
    }

    private async Task<RefundRecordingResult> RejectAndCommitAsync(string actor, Guid paymentId, string code, string message, IDbContextTransaction transaction, CancellationToken cancellationToken)
    {
        Audit(actor, code == "REFUND_CURRENCY_INVALID" ? "RefundInvalidCurrencyRejected" : "RefundRejected", paymentId, new { failureCode = code });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(null, FailureCode: code, FailureMessage: message);
    }

    private async Task<RefundProviderWorkflowResult> RejectProviderAsync(string actor, Guid paymentId, string code, string message, CancellationToken cancellationToken)
    {
        Audit(actor, "PayTabsRefundRejected", paymentId, new { failureCode = code });
        await db.SaveChangesAsync(cancellationToken);
        return new(null, FailureCode: code, FailureMessage: message);
    }

    private async Task<RefundProviderWorkflowResult> RejectProviderAndCommitAsync(string actor, Guid paymentId, string code, string message, IDbContextTransaction transaction, CancellationToken cancellationToken)
    {
        var result = await RejectProviderAsync(actor, paymentId, code, message, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private static bool IsValidRequest(RecordInternalRefund request, out string? code, out string? message)
    {
        if (request.Amount <= 0m) { code = "REFUND_AMOUNT_INVALID"; message = "Refund amount must be greater than zero."; return false; }
        if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Trim().Length > 8) { code = "REFUND_CURRENCY_INVALID"; message = "A valid refund currency is required."; return false; }
        if (string.IsNullOrWhiteSpace(request.ReasonCode) || request.ReasonCode.Trim().Length > 100) { code = "REFUND_REASON_INVALID"; message = "A valid refund reason code is required."; return false; }
        if (request.Note?.Trim().Length > 1_000) { code = "REFUND_NOTE_INVALID"; message = "Refund note is too long."; return false; }
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Trim().Length > 128) { code = "REFUND_IDEMPOTENCY_KEY_INVALID"; message = "A valid refund idempotency key is required."; return false; }
        code = null; message = null; return true;
    }

    private static Refund NewRefund(string actor, RecordInternalRefund request, string paymentCurrency) => new()
    {
        PaymentId = request.PaymentId,
        Amount = request.Amount,
        Currency = paymentCurrency,
        ReasonCode = request.ReasonCode.Trim(),
        Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
        RequestedByUserId = actor,
        IdempotencyKey = request.IdempotencyKey.Trim(),
        CorrelationReference = $"refund:{Guid.NewGuid():N}",
        CreatedByUserId = actor
    };

    private void Audit(string actor, string action, Guid entityId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actor,
        Action = action,
        EntityType = nameof(Refund),
        EntityId = entityId.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = action.Contains("Rejected", StringComparison.Ordinal) ? "Rejected" : "Success"
    });

    private void AddRefundTransition(Refund refund, RefundStatus previous, RefundStatus next, RefundTransitionSource source, string actor, string? providerReference, string? reasonCode) => db.RefundStatusTransitions.Add(new RefundStatusTransition
    {
        RefundId = refund.Id,
        PreviousStatus = previous,
        NewStatus = next,
        Source = source,
        ActorContext = actor,
        ProviderReference = providerReference,
        ReasonCode = reasonCode,
        CorrelationId = refund.CorrelationReference
    });

    private static RefundView ToView(Refund refund) => new(refund.Id, refund.PaymentId, refund.Amount, refund.Currency, refund.Status.ToString(), refund.ReasonCode, refund.RequestedAtUtc, refund.InternallyRecordedAtUtc, refund.ProviderRefundReference, refund.ProviderStatusCode, refund.ProviderFailureCode, refund.CorrelationReference, refund.FailureCode, refund.EntitlementDisposition.ToString());
}
