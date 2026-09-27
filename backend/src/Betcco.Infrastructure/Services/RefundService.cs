using System.Data;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
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
                if (!MoneyPolicy.IsSupportedCurrency(payment.Currency))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_CURRENCY_UNSUPPORTED", "Refund currency precision is not configured.", transaction, cancellationToken);
                if (!MoneyPolicy.IsRepresentable(payment.Currency, request.Amount))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_AMOUNT_SCALE_INVALID", "Refund amount must conform to the supported currency precision.", transaction, cancellationToken);
                if (!MoneyPolicy.IsRepresentable(payment.Currency, payment.Total)
                    || !MoneyPolicy.IsRepresentable(payment.Currency, payment.Tax))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED", "The payment monetary snapshot requires review.", transaction, cancellationToken);

                var finalizedAmounts = await db.Refunds.AsNoTracking()
                    .Where(item => item.PaymentId == payment.Id && item.Status == RefundStatus.InternallyRecorded)
                    .Select(item => item.Amount).ToListAsync(cancellationToken);
                if (finalizedAmounts.Any(amount => !MoneyPolicy.IsRepresentable(payment.Currency, amount)))
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED", "A prior refund monetary snapshot requires review.", transaction, cancellationToken);
                var alreadyRefunded = finalizedAmounts.Sum();
                var refundableBalance = payment.Total - alreadyRefunded;
                if (request.Amount > refundableBalance)
                    return await RejectAndCommitAsync(financeAdminUserId, payment.Id, "REFUND_AMOUNT_EXCEEDS_BALANCE", "Refund amount exceeds the trusted refundable balance.", transaction, cancellationToken);

                var refund = NewRefund(financeAdminUserId, request, payment.Currency);
                db.Refunds.Add(refund);
                Audit(financeAdminUserId, "RefundRequested", refund.Id, new { refund.PaymentId, refund.Amount, refund.Currency, refund.ReasonCode });

                var accountingFailure = await FinalizeInternalAccountingAsync(financeAdminUserId, payment, refund, RefundStatus.Requested, cancellationToken);
                if (accountingFailure is not null)
                {
                    refund.FailureCode = accountingFailure;
                    Audit(financeAdminUserId, "RefundAccountingRejected", refund.Id, new { refund.PaymentId, payment.Purpose, accountingFailure });
                }
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(ToView(refund));
            }
            catch (DbUpdateConcurrencyException)
            {
                db.ChangeTracker.Clear();
            }
            catch (Exception exception) when (IsPostgresConcurrencyConflict(exception))
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
        if (snapshot.Status == RefundStatus.ProviderVerified)
            return await RecoverProviderVerifiedRefundAsync(financeAdminUserId, refundId, cancellationToken);
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

        if (await FinalizeInternalAccountingAsync(financeAdminUserId, payment, refund, RefundStatus.ProviderVerified, cancellationToken) is not null)
        {
            await transaction.CommitAsync(cancellationToken);
            return new(ToView(refund), FailureCode: "REFUND_ALLOCATION_POLICY_REQUIRED", FailureMessage: "Provider refund is verified, but internal allocation policy requires review.");
        }
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(ToView(refund));
    }

    private async Task<RefundProviderWorkflowResult> RecoverProviderVerifiedRefundAsync(string financeAdminUserId, Guid refundId, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var refund = await db.Refunds.SingleAsync(item => item.Id == refundId, cancellationToken);
                if (refund.Status == RefundStatus.InternallyRecorded)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return new(ToView(refund), true);
                }

                var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == refund.PaymentId, cancellationToken);
                if (refund.Status != RefundStatus.ProviderVerified || payment is null
                    || !await HasTrustedStoredVerificationAsync(refund, payment, cancellationToken))
                    return new(ToView(refund), FailureCode: "PAYTABS_REFUND_REQUIRES_REVIEW", FailureMessage: "Stored provider verification evidence requires review.");

                if (await FinalizeInternalAccountingAsync(financeAdminUserId, payment, refund, RefundStatus.ProviderVerified, cancellationToken) is not null)
                    return new(ToView(refund), FailureCode: "REFUND_ALLOCATION_POLICY_REQUIRED", FailureMessage: "Provider refund is verified, but internal allocation policy requires review.");

                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(ToView(refund));
            }
            catch (DbUpdateConcurrencyException) when (attempt == 0)
            {
                db.ChangeTracker.Clear();
            }
            catch (Exception exception) when (attempt == 0 && IsPostgresConcurrencyConflict(exception))
            {
                db.ChangeTracker.Clear();
            }
        }

        throw new InvalidOperationException("Provider-verified refund recovery did not complete after a concurrency retry.");
    }

    private async Task<bool> HasTrustedStoredVerificationAsync(Refund refund, Payment payment, CancellationToken cancellationToken)
    {
        if (refund.PaymentId == Guid.Empty || refund.PaymentId != payment.Id
            || !string.Equals(refund.ProviderName, "PayTabs", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(refund.ProviderRefundReference)
            || refund.ProviderInitiatedAtUtc is null
            || refund.ProviderVerifiedAtUtc is null
            || refund.ProviderVerifiedAtUtc < refund.ProviderInitiatedAtUtc
            || string.IsNullOrWhiteSpace(refund.CorrelationReference)
            || !string.Equals(payment.Provider, "PayTabs", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(payment.ProviderPaymentId)
            || payment.Status != PaymentStatus.Paid
            || refund.Amount != payment.Total
            || string.IsNullOrWhiteSpace(payment.Currency)
            || !string.Equals(refund.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase))
            return false;

        return await db.RefundStatusTransitions.AsNoTracking().AnyAsync(item =>
            item.RefundId == refund.Id
            && item.NewStatus == RefundStatus.ProviderVerified
            && (item.PreviousStatus == RefundStatus.ProviderProcessing || item.PreviousStatus == RefundStatus.ProviderResultUnknown)
            && item.Source == RefundTransitionSource.PayTabsProviderVerification
            && item.ProviderReference == refund.ProviderRefundReference
            && item.CorrelationId == refund.CorrelationReference, cancellationToken)
            && !await db.RefundStatusTransitions.AsNoTracking().AnyAsync(item => item.RefundId == refund.Id && item.NewStatus == RefundStatus.InternallyRecorded, cancellationToken)
            && !await db.PaymentStatusTransitions.AsNoTracking().AnyAsync(item => item.PaymentId == payment.Id && item.NewStatus == PaymentStatus.Refunded, cancellationToken)
            && !await db.LedgerTransactions.AsNoTracking().AnyAsync(item => item.RefundId == refund.Id, cancellationToken)
            && !await db.WalletTransactions.AsNoTracking().AnyAsync(item => item.RefundId == refund.Id, cancellationToken)
            && !await db.IncludedEvaluationEntitlements.AsNoTracking().AnyAsync(item => item.RevokedByRefundId == refund.Id, cancellationToken);
    }

    private async Task<string?> FinalizeInternalAccountingAsync(string financeAdminUserId, Payment payment, Refund refund, RefundStatus previousStatus, CancellationToken cancellationToken)
    {
        if (!string.Equals(payment.Purpose, "CourseCart", StringComparison.Ordinal))
            return "REFUND_PURPOSE_REVIEW_REQUIRED";
        if (!MoneyPolicy.IsSupportedCurrency(payment.Currency))
            return "REFUND_CURRENCY_UNSUPPORTED";
        if (!MoneyPolicy.IsRepresentable(payment.Currency, refund.Amount))
            return "REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED";

        var otherRefunds = await db.Refunds.AsNoTracking()
            .Where(item => item.PaymentId == payment.Id && item.Id != refund.Id).ToListAsync(cancellationToken);
        if (otherRefunds.Any(item => item.Status is RefundStatus.ProviderProcessing or RefundStatus.ProviderVerified or RefundStatus.ProviderResultUnknown))
            return "REFUND_PRIOR_PROVIDER_REVIEW_REQUIRED";
        var priorRefunds = otherRefunds.Where(item => item.Status == RefundStatus.InternallyRecorded).ToArray();
        var priorRefunded = priorRefunds.Sum(item => item.Amount);
        if ((priorRefunded == 0m && payment.Status != PaymentStatus.Paid)
            || (priorRefunded > 0m && payment.Status != PaymentStatus.PartiallyRefunded))
            return "REFUND_HISTORICAL_ACCOUNTING_REVIEW_REQUIRED";
        if (refund.Amount > payment.Total - priorRefunded)
            return "REFUND_AMOUNT_EXCEEDS_BALANCE";

        var allocations = await db.CourseSaleAllocations
            .Where(item => item.PaymentId == payment.Id).OrderBy(item => item.Id).ToListAsync(cancellationToken);
        if (allocations.Count == 0 || allocations.Any(item => !string.Equals(item.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)))
            return "REFUND_ALLOCATION_POLICY_REQUIRED";
        var prior = await LoadPriorAccountingAsync(payment, allocations, priorRefunds, cancellationToken);
        if (prior is null) return "REFUND_HISTORICAL_ACCOUNTING_REVIEW_REQUIRED";

        var (plan, failureCode) = RefundAccountingCalculator.Calculate(payment.Currency, payment.Total, payment.Tax,
            priorRefunded, prior.Revenue, refund.Amount, allocations.Select(item => new RefundAllocationSnapshot(
                item.Id, item.NetAmount, item.PlatformCommission, item.TeacherEarning,
                prior.Net.GetValueOrDefault(item.Id), prior.Platform.GetValueOrDefault(item.Id), prior.Teacher.GetValueOrDefault(item.Id))).ToArray());
        if (plan is null) return failureCode;

        var previousPaymentStatus = payment.Status;
        var nextPaymentStatus = priorRefunded + refund.Amount == payment.Total
            ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded;
        if (!PaymentWorkflow.CanTransition(previousPaymentStatus, nextPaymentStatus))
            return "REFUND_PAYMENT_TRANSITION_REVIEW_REQUIRED";

        refund.Status = RefundStatus.InternallyRecorded;
        refund.FailureCode = null;
        refund.InternallyRecordedAtUtc = DateTimeOffset.UtcNow;
        refund.InternallyRecordedByUserId = financeAdminUserId;
        AddRefundTransition(refund, previousStatus, RefundStatus.InternallyRecorded, RefundTransitionSource.InternalAccounting, financeAdminUserId, refund.ProviderRefundReference, refund.ReasonCode);
        payment.Status = nextPaymentStatus;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = previousPaymentStatus,
            NewStatus = nextPaymentStatus,
            Source = PaymentTransitionSource.InternalRefundRecorded,
            ActorContext = financeAdminUserId,
            Provider = payment.Provider,
            ProviderEventReference = refund.ProviderRefundReference,
            IdempotencyKey = refund.IdempotencyKey,
            ReasonCode = refund.ReasonCode,
            CorrelationId = refund.CorrelationReference
        });
        await BookCourseSaleRefundAsync(payment, refund, allocations, plan, cancellationToken);
        AddWalletReversals(payment, refund, allocations, plan);
        var revokedCredits = nextPaymentStatus == PaymentStatus.Refunded
            ? await RevokeUnusedIncludedEvaluationCreditsAsync(payment, refund, cancellationToken) : 0;
        if (revokedCredits > 0)
            refund.EntitlementDisposition = RefundEntitlementDisposition.UnusedIncludedEvaluationCreditsRevoked;
        Audit(financeAdminUserId, "RefundInternallyRecorded", refund.Id, new { refund.PaymentId, refund.Amount, refund.Currency, plan.TaxComponent, plan.RevenueComponent, providerRefundVerified = !string.IsNullOrWhiteSpace(refund.ProviderRefundReference) });
        Audit(financeAdminUserId, "RefundEntitlementDispositionApplied", refund.Id, new
        {
            refund.PaymentId,
            disposition = refund.EntitlementDisposition.ToString(),
            revokedIncludedEvaluationCredits = revokedCredits
        });
        return null;
    }

    private sealed record PriorAccounting(decimal Revenue, Dictionary<Guid, decimal> Net,
        Dictionary<Guid, decimal> Platform, Dictionary<Guid, decimal> Teacher);

    private async Task<PriorAccounting?> LoadPriorAccountingAsync(Payment payment,
        IReadOnlyCollection<CourseSaleAllocation> allocations, IReadOnlyCollection<Refund> priorRefunds,
        CancellationToken cancellationToken)
    {
        var net = new Dictionary<Guid, decimal>();
        var platform = new Dictionary<Guid, decimal>();
        var teacher = new Dictionary<Guid, decimal>();
        if (priorRefunds.Count == 0) return new(0m, net, platform, teacher);

        var ids = priorRefunds.Select(item => item.Id).ToHashSet();
        var allocationById = allocations.ToDictionary(item => item.Id);
        var ledgers = await db.LedgerTransactions.AsNoTracking()
            .Where(item => item.RefundId.HasValue && ids.Contains(item.RefundId.Value))
            .Include(item => item.Entries).ThenInclude(item => item.LedgerAccount)
            .ToListAsync(cancellationToken);
        var wallets = await db.WalletTransactions.AsNoTracking()
            .Where(item => item.RefundId.HasValue && ids.Contains(item.RefundId.Value))
            .ToListAsync(cancellationToken);
        var transitions = await db.RefundStatusTransitions.AsNoTracking()
            .Where(item => ids.Contains(item.RefundId) && item.NewStatus == RefundStatus.InternallyRecorded)
            .ToListAsync(cancellationToken);
        var paymentTransitions = await db.PaymentStatusTransitions.AsNoTracking()
            .Where(item => item.PaymentId == payment.Id && item.Source == PaymentTransitionSource.InternalRefundRecorded)
            .ToListAsync(cancellationToken);
        decimal revenue = 0m;
        foreach (var priorRefund in priorRefunds)
        {
            if (!string.Equals(priorRefund.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)
                || !MoneyPolicy.IsRepresentable(payment.Currency, priorRefund.Amount)
                || priorRefund.InternallyRecordedAtUtc is null
                || transitions.Count(item => item.RefundId == priorRefund.Id
                    && item.Source == RefundTransitionSource.InternalAccounting) != 1
                || paymentTransitions.Count(item => item.CorrelationId == priorRefund.CorrelationReference
                    && item.IdempotencyKey == priorRefund.IdempotencyKey) != 1)
                return null;

            var ledger = ledgers.Where(item => item.RefundId == priorRefund.Id).ToArray();
            if (ledger.Length != 1 || ledger[0].EventType != LedgerEventType.PaidCourseSaleRefund
                || !string.Equals(ledger[0].Currency, payment.Currency, StringComparison.OrdinalIgnoreCase))
                return null;
            var currentNet = new Dictionary<Guid, decimal>();
            var currentPlatform = new Dictionary<Guid, decimal>();
            var currentTeacher = new Dictionary<Guid, decimal>();
            foreach (var entry in ledger[0].Entries)
            {
                if (entry.CourseSaleAllocationId is not Guid allocationId || !allocationById.ContainsKey(allocationId)
                    || entry.LedgerAccount is null || entry.Amount <= 0m
                    || !MoneyPolicy.IsRepresentable(payment.Currency, entry.Amount)
                    || !string.Equals(entry.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(entry.LedgerAccount.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase))
                    return null;
                var target = (entry.LedgerAccount.Code, entry.Side) switch
                {
                    (LedgerAccountCode.CourseSaleClearing, LedgerEntrySide.Credit) => currentNet,
                    (LedgerAccountCode.PlatformCommission, LedgerEntrySide.Debit) => currentPlatform,
                    (LedgerAccountCode.TeacherEarningsPayable, LedgerEntrySide.Debit) => currentTeacher,
                    _ => null
                };
                if (target is null) return null;
                target[allocationId] = target.GetValueOrDefault(allocationId) + entry.Amount;
            }

            var currentRevenue = currentNet.Values.Sum();
            if (currentRevenue <= 0m || currentRevenue != currentPlatform.Values.Sum() + currentTeacher.Values.Sum()
                || currentRevenue > priorRefund.Amount
                || currentNet.Any(pair => pair.Value != currentPlatform.GetValueOrDefault(pair.Key) + currentTeacher.GetValueOrDefault(pair.Key))
                || currentPlatform.Keys.Concat(currentTeacher.Keys).Any(id => !currentNet.ContainsKey(id)))
                return null;

            var expectedWallets = new Dictionary<(string UserId, string Type), decimal>();
            AddExpected("platform", "PlatformCommissionRefundReversal", -currentPlatform.Values.Sum());
            foreach (var pair in currentTeacher)
            {
                var userId = allocationById[pair.Key].TeacherUserId;
                AddExpected(string.IsNullOrWhiteSpace(userId) ? "platform" : userId,
                    string.IsNullOrWhiteSpace(userId) ? "UnassignedCourseRevenueRefundReversal" : "TeacherCourseEarningRefundReversal", -pair.Value);
            }
            var actualWallets = wallets.Where(item => item.RefundId == priorRefund.Id).ToArray();
            if (actualWallets.Length != expectedWallets.Count
                || actualWallets.Any(item => item.PaymentId != payment.Id
                    || !string.Equals(item.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)
                    || !MoneyPolicy.IsRepresentable(payment.Currency, item.Amount)
                    || !expectedWallets.TryGetValue((item.UserId, item.Type), out var amount) || amount != item.Amount)
                || actualWallets.Select(item => (item.UserId, item.Type)).Distinct().Count() != actualWallets.Length)
                return null;

            foreach (var pair in currentNet) Add(net, pair.Key, pair.Value);
            foreach (var pair in currentPlatform) Add(platform, pair.Key, pair.Value);
            foreach (var pair in currentTeacher) Add(teacher, pair.Key, pair.Value);
            revenue += currentRevenue;

            void AddExpected(string userId, string type, decimal amount)
            {
                if (amount == 0m) return;
                var key = (userId, type);
                expectedWallets[key] = expectedWallets.GetValueOrDefault(key) + amount;
            }
        }

        return new(revenue, net, platform, teacher);

        static void Add(Dictionary<Guid, decimal> totals, Guid id, decimal amount) =>
            totals[id] = totals.GetValueOrDefault(id) + amount;
    }

    private async Task<int> RevokeUnusedIncludedEvaluationCreditsAsync(
        Payment payment,
        Refund refund,
        CancellationToken cancellationToken)
    {
        var unused = await db.IncludedEvaluationEntitlements
            .Where(item => item.GrantedByPaymentId == payment.Id
                && item.ConsumedByEvaluationRequestId == null
                && item.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        if (unused.Count == 0) return 0;

        var revokedAtUtc = DateTimeOffset.UtcNow;
        foreach (var entitlement in unused)
        {
            entitlement.RevokedByRefundId = refund.Id;
            entitlement.RevokedAtUtc = revokedAtUtc;
            Audit(
                refund.InternallyRecordedByUserId ?? refund.RequestedByUserId,
                "IncludedEvaluationCreditRevokedByRefund",
                entitlement.Id,
                new { entitlement.UnitDefinitionId, entitlement.GrantedByPaymentId, refundId = refund.Id });
        }

        return unused.Count;
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

    private async Task BookCourseSaleRefundAsync(Payment payment, Refund refund, IReadOnlyCollection<CourseSaleAllocation> allocations,
        RefundAccountingPlan plan, CancellationToken cancellationToken)
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
        var allocationById = allocations.ToDictionary(item => item.Id);
        foreach (var delta in plan.Allocations)
        {
            var allocation = allocationById[delta.Id];
            if (delta.NetAmount > 0m)
                reversal.Entries.Add(new LedgerEntry { LedgerAccount = clearing, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = delta.NetAmount, Currency = allocation.Currency });
            if (delta.PlatformCommission > 0m)
                reversal.Entries.Add(new LedgerEntry { LedgerAccount = commission, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = delta.PlatformCommission, Currency = allocation.Currency });
            if (delta.TeacherEarning > 0m)
                reversal.Entries.Add(new LedgerEntry { LedgerAccount = teacherPayable, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = delta.TeacherEarning, Currency = allocation.Currency });
        }
        db.LedgerTransactions.Add(reversal);
    }

    private void AddWalletReversals(Payment payment, Refund refund, IReadOnlyCollection<CourseSaleAllocation> allocations,
        RefundAccountingPlan plan)
    {
        var allocationById = allocations.ToDictionary(item => item.Id);
        AddWalletReversal("platform", "PlatformCommissionRefundReversal", -plan.Allocations.Sum(item => item.PlatformCommission), "Platform commission reversed for internal refund");
        AddWalletReversal("platform", "UnassignedCourseRevenueRefundReversal", -plan.Allocations
            .Where(item => string.IsNullOrWhiteSpace(allocationById[item.Id].TeacherUserId)).Sum(item => item.TeacherEarning), "Unassigned course revenue reversed for internal refund");
        foreach (var teacher in plan.Allocations.Where(item => !string.IsNullOrWhiteSpace(allocationById[item.Id].TeacherUserId))
            .GroupBy(item => allocationById[item.Id].TeacherUserId!))
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
