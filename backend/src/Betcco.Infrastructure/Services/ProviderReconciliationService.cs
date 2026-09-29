using System.Data;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class ProviderReconciliationService(
    BetccoDbContext db,
    IPaymentProvider payments,
    IRefundService refunds) : IProviderReconciliationService
{
    public async Task<IReadOnlyCollection<ProviderReconciliationCaseView>> ListAsync(
        int page, int pageSize, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var cases = await db.ProviderReconciliationCases.AsNoTracking()
            .OrderByDescending(item => item.CreatedAtUtc).ThenByDescending(item => item.Id)
            .Skip((int)Math.Min((long)(page - 1) * pageSize, int.MaxValue))
            .Take(pageSize).ToArrayAsync(cancellationToken);
        return await ProjectAsync(cases, cancellationToken);
    }

    public async Task<ProviderReconciliationCaseView?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var item = await db.ProviderReconciliationCases.AsNoTracking()
            .SingleOrDefaultAsync(value => value.Id == id, cancellationToken);
        return item is null ? null : (await ProjectAsync([item], cancellationToken)).Single();
    }

    public async Task<ProviderReconciliationActionResult> RequeryAsync(
        string actor, Guid id, CancellationToken cancellationToken = default)
    {
        var snapshot = await db.ProviderReconciliationCases.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (snapshot is null) return new(null, "RECONCILIATION_NOT_FOUND");
        if (snapshot.Status == ProviderReconciliationCaseStatus.Resolved)
            return new(await GetAsync(id, cancellationToken), IsIdempotentReplay: true);

        string? resultCode = null;
        PaymentTransactionVerification? observedPayment = null;
        var beforeRefundStatus = snapshot.RefundId is { } beforeRefundId
            ? await db.Refunds.AsNoTracking().Where(item => item.Id == beforeRefundId)
                .Select(item => (RefundStatus?)item.Status).SingleOrDefaultAsync(cancellationToken)
            : null;
        if (snapshot.RefundId is { } refundId)
        {
            if (!string.Equals(snapshot.Provider, "PayTabs", StringComparison.OrdinalIgnoreCase))
                return new(await GetAsync(id, cancellationToken), "RECONCILIATION_PROVIDER_UNSUPPORTED");
            var result = await refunds.VerifyPayTabsRefundAsync(actor, refundId, cancellationToken);
            resultCode = result.FailureCode;
        }
        else if (!string.IsNullOrWhiteSpace(snapshot.ProviderTransactionReference))
        {
            try
            {
                var observed = await payments.VerifyTransactionAsync(snapshot.ProviderTransactionReference, cancellationToken);
                observedPayment = observed;
                resultCode = observed.IsSuccessful ? "PAYMENT_PROVIDER_RESULT_REVIEW_REQUIRED"
                    : observed.IsDefiniteFailure ? "PAYMENT_PROVIDER_DEFINITE_FAILURE" : "PAYMENT_PROVIDER_RESULT_UNKNOWN";
            }
            catch (Exception exception) when (exception is HttpRequestException or InvalidOperationException)
            {
                resultCode = "RECONCILIATION_PROVIDER_QUERY_FAILED";
            }
        }
        else return new(await GetAsync(id, cancellationToken), "RECONCILIATION_REFERENCE_REQUIRED");

        // Provider I/O has finished. Only the local case transition is retried;
        // the refund service owns all financial state and its own transaction.
        db.ChangeTracker.Clear();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var item = await db.ProviderReconciliationCases.SingleAsync(value => value.Id == id, cancellationToken);
                if (item.Status == ProviderReconciliationCaseStatus.Resolved)
                {
                    db.AuditLogs.Add(Audit(actor, "ProviderReconciliationRequeryPerformed", item.Id, new
                    {
                        caseId = item.Id,
                        item.RefundId,
                        item.PaymentId,
                        item.Provider,
                        previousStatus = snapshot.Status.ToString(),
                        newStatus = item.Status.ToString(),
                        resultCode,
                        item.ResolutionCode,
                        item.CorrelationReference,
                        observedStatus = observedPayment?.ProviderStatus,
                        observedAmount = observedPayment?.Amount,
                        observedCurrency = observedPayment?.Currency
                    }));
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    return new(await GetAsync(id, cancellationToken), IsIdempotentReplay: true);
                }

                var refund = item.RefundId is { } currentRefundId
                    ? await db.Refunds.AsNoTracking().SingleOrDefaultAsync(value => value.Id == currentRefundId, cancellationToken) : null;
                var paymentId = refund?.PaymentId ?? item.PaymentId;
                var previousStatus = item.Status;
                var recordedWithAccounting = refund?.Status == RefundStatus.InternallyRecorded
                    && await db.RefundStatusTransitions.AsNoTracking().AnyAsync(value => value.RefundId == refund.Id
                        && value.NewStatus == RefundStatus.InternallyRecorded
                        && value.Source == RefundTransitionSource.InternalAccounting, cancellationToken)
                    && await db.LedgerTransactions.AsNoTracking().AnyAsync(value => value.RefundId == refund.Id,
                        cancellationToken);
                if (recordedWithAccounting)
                {
                    item.Status = ProviderReconciliationCaseStatus.Resolved;
                    item.ResolutionCode = "TrustedInternalFinalization";
                    item.ResolvedByUserId = actor;
                    item.ResolvedAtUtc = DateTimeOffset.UtcNow;
                }
                else item.Status = ProviderReconciliationCaseStatus.UnderReview;

                var revokedGrants = refund is null ? 0 : await db.CourseAccessGrants.AsNoTracking()
                    .CountAsync(value => value.RevokedByRefundId == refund.Id, cancellationToken);
                var revokedCredits = refund is null ? 0 : await db.IncludedEvaluationEntitlements.AsNoTracking()
                    .CountAsync(value => value.RevokedByRefundId == refund.Id, cancellationToken);
                var accountingRecoveryOccurred = beforeRefundStatus != RefundStatus.InternallyRecorded
                    && refund?.Status == RefundStatus.InternallyRecorded;
                db.AuditLogs.Add(Audit(actor, "ProviderReconciliationRequeryPerformed", item.Id, new
                {
                    caseId = item.Id,
                    item.RefundId,
                    paymentId,
                    item.Provider,
                    providerReference = refund?.ProviderRefundReference ?? item.ProviderTransactionReference,
                    providerStatus = refund?.ProviderStatusCode ?? item.ProviderStatusCode,
                    previousStatus = previousStatus.ToString(),
                    newStatus = item.Status.ToString(),
                    refundStatus = refund?.Status.ToString(),
                    resultCode,
                    observedStatus = observedPayment?.ProviderStatus,
                    observedAmount = observedPayment?.Amount,
                    observedCurrency = observedPayment?.Currency,
                    item.CorrelationReference,
                    accountingRecoveryOccurred,
                    accessDispositionOccurred = accountingRecoveryOccurred && revokedGrants > 0,
                    includedCreditDispositionOccurred = accountingRecoveryOccurred && revokedCredits > 0
                }));
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(await GetAsync(id, cancellationToken), resultCode);
            }
            catch (DbUpdateConcurrencyException) when (attempt < 2) { db.ChangeTracker.Clear(); }
            catch (Exception exception) when (attempt < 2 && IsConcurrencyConflict(exception)) { db.ChangeTracker.Clear(); }
        }
        return new(await GetAsync(id, cancellationToken), "RECONCILIATION_CONCURRENCY_CONFLICT");
    }

    public async Task<ProviderReconciliationActionResult> ResolveAsync(string actor, Guid id,
        string resolutionCode, string? note, CancellationToken cancellationToken = default)
    {
        if (resolutionCode == "ProviderConfirmed")
            return new(await GetAsync(id, cancellationToken), "RECONCILIATION_PROVIDER_EVIDENCE_REQUIRED");
        if (resolutionCode is not ("ReviewedNoFinancialAction" or "EscalatedToFinance"))
            return new(await GetAsync(id, cancellationToken), "RECONCILIATION_RESOLUTION_CODE_INVALID");
        var trimmedNote = note?.Trim();
        if (trimmedNote?.Length > 1_000 || resolutionCode == "EscalatedToFinance" && string.IsNullOrWhiteSpace(trimmedNote))
            return new(await GetAsync(id, cancellationToken), "RECONCILIATION_RESOLUTION_NOTE_INVALID");

        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var item = await db.ProviderReconciliationCases.SingleOrDefaultAsync(value => value.Id == id, cancellationToken);
                if (item is null) return new(null, "RECONCILIATION_NOT_FOUND");
                if (item.Status == ProviderReconciliationCaseStatus.Resolved)
                    return new(await GetAsync(id, cancellationToken),
                        item.ResolutionCode == resolutionCode && item.ResolutionNote == trimmedNote
                            ? null : "RECONCILIATION_ALREADY_RESOLVED",
                        item.ResolutionCode == resolutionCode && item.ResolutionNote == trimmedNote);

                var refund = item.RefundId is { } refundId
                    ? await db.Refunds.AsNoTracking().SingleOrDefaultAsync(value => value.Id == refundId, cancellationToken) : null;
                if (item.RefundId is not null && refund is null)
                    return new(await GetAsync(id, cancellationToken), "RECONCILIATION_REFUND_NOT_FOUND");
                if (resolutionCode == "ReviewedNoFinancialAction"
                    && refund?.Status is not (RefundStatus.ProviderFailed or RefundStatus.InternallyRecorded))
                    return new(await GetAsync(id, cancellationToken), "RECONCILIATION_FINANCIAL_STATE_UNRESOLVED");

                var previousStatus = item.Status;
                item.Status = ProviderReconciliationCaseStatus.Resolved;
                item.ResolutionCode = resolutionCode;
                item.ResolutionNote = trimmedNote;
                item.ResolvedByUserId = actor;
                item.ResolvedAtUtc = DateTimeOffset.UtcNow;
                db.AuditLogs.Add(Audit(actor, "ProviderReconciliationCaseResolved", item.Id, new
                {
                    caseId = item.Id,
                    item.RefundId,
                    paymentId = refund?.PaymentId ?? item.PaymentId,
                    item.Provider,
                    item.ProviderTransactionReference,
                    previousStatus = previousStatus.ToString(),
                    newStatus = item.Status.ToString(),
                    refundStatus = refund?.Status.ToString(),
                    resolutionCode,
                    item.CorrelationReference
                }));
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(await GetAsync(id, cancellationToken));
            }
            catch (DbUpdateConcurrencyException) when (attempt < 2) { db.ChangeTracker.Clear(); }
            catch (Exception exception) when (attempt < 2 && IsConcurrencyConflict(exception)) { db.ChangeTracker.Clear(); }
        }
        return new(await GetAsync(id, cancellationToken), "RECONCILIATION_CONCURRENCY_CONFLICT");
    }

    private async Task<IReadOnlyCollection<ProviderReconciliationCaseView>> ProjectAsync(
        IReadOnlyCollection<ProviderReconciliationCase> cases, CancellationToken cancellationToken)
    {
        if (cases.Count == 0) return [];
        var refundIds = cases.Where(item => item.RefundId.HasValue).Select(item => item.RefundId!.Value).Distinct().ToArray();
        var refundById = await db.Refunds.AsNoTracking().Where(item => refundIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var paymentIds = cases.Where(item => item.PaymentId.HasValue).Select(item => item.PaymentId!.Value)
            .Concat(refundById.Values.Select(item => item.PaymentId)).Distinct().ToArray();
        var paymentById = await db.Payments.AsNoTracking().Where(item => paymentIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var caseIds = cases.Select(item => item.Id.ToString()).ToArray();
        var checks = await db.AuditLogs.AsNoTracking().Where(item => item.EntityType == nameof(ProviderReconciliationCase)
                && item.Action == "ProviderReconciliationRequeryPerformed" && caseIds.Contains(item.EntityId))
            .Select(item => new { item.EntityId, item.CreatedAtUtc, item.MetadataJson }).ToListAsync(cancellationToken);
        var latestCheckById = checks.Where(item => item.EntityId is not null)
            .GroupBy(item => item.EntityId!)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.CreatedAtUtc).First());
        var refundIdentityKeys = refundIds.Select(id => id.ToString()).ToArray();
        var observations = await db.AuditLogs.AsNoTracking().Where(item => item.EntityType == nameof(Refund)
                && item.Action == "PayTabsRefundProviderResultUnknown" && refundIdentityKeys.Contains(item.EntityId))
            .Select(item => new { item.EntityId, item.CreatedAtUtc, item.MetadataJson }).ToListAsync(cancellationToken);
        var latestObservationByRefundId = observations.Where(item => item.EntityId is not null)
            .GroupBy(item => item.EntityId!)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.CreatedAtUtc).First());

        return cases.Select(item =>
        {
            var refund = item.RefundId is { } refundId && refundById.TryGetValue(refundId, out var foundRefund) ? foundRefund : null;
            var paymentId = refund?.PaymentId ?? item.PaymentId;
            var payment = paymentId is { } id && paymentById.TryGetValue(id, out var foundPayment) ? foundPayment : null;
            latestCheckById.TryGetValue(item.Id.ToString(), out var latestCheck);
            var checkObservation = ReadObservation(latestCheck?.MetadataJson);
            latestObservationByRefundId.TryGetValue(item.RefundId?.ToString() ?? string.Empty, out var latestRefundObservation);
            var refundObservation = refund?.Status is RefundStatus.ProviderProcessing or RefundStatus.ProviderResultUnknown
                ? ReadObservation(latestRefundObservation?.MetadataJson) : default;
            var recoveryState = refund?.Status switch
            {
                RefundStatus.InternallyRecorded => "AlreadyInternallyRecorded",
                RefundStatus.ProviderFailed => item.ResolutionCode == "ProviderDefiniteFailure"
                    ? "ProviderDefiniteFailure" : "ProviderFailureReviewRequired",
                RefundStatus.ProviderVerified => "StoredVerificationReviewRequired",
                RefundStatus.ProviderResultUnknown when refund.FailureCode == "PAYTABS_REFUND_REFERENCE_CONFLICT" => "ProviderReferenceConflict",
                RefundStatus.ProviderResultUnknown when refund.FailureCode == "PAYTABS_REFUND_RECOVERY_AMBIGUOUS" => "AmbiguousProviderCandidates",
                RefundStatus.ProviderResultUnknown when refund.FailureCode == "PAYTABS_REFUND_RECOVERY_NOT_FOUND" => "ProviderReferenceMissing",
                RefundStatus.ProviderResultUnknown when refundObservation.Amount is { } amount && amount != refund.Amount => "ProviderAmountMismatch",
                RefundStatus.ProviderResultUnknown when refundObservation.Currency is { } currency && !string.Equals(currency, refund.Currency, StringComparison.OrdinalIgnoreCase) => "ProviderCurrencyMismatch",
                RefundStatus.ProviderResultUnknown when refund.FailureCode is "PAYTABS_REFUND_RECOVERY_UNVERIFIED" or "PAYTABS_REFUND_QUERY_UNVERIFIED" or "PAYTABS_REFUND_RESPONSE_UNVERIFIED" => "ProviderEvidenceReviewRequired",
                RefundStatus.ProviderResultUnknown when string.IsNullOrWhiteSpace(refund.ProviderRefundReference) => "DiscoverProviderReference",
                RefundStatus.ProviderProcessing when string.IsNullOrWhiteSpace(refund.ProviderRefundReference) => "DiscoverProviderReference",
                RefundStatus.ProviderResultUnknown or RefundStatus.ProviderProcessing => "RequeryProvider",
                _ => item.Status == ProviderReconciliationCaseStatus.Resolved && item.ResolutionCode == "EscalatedToFinance"
                    ? "EscalatedToFinance" : "ManualReview"
            };
            return new ProviderReconciliationCaseView(
                item.Id, item.Provider, item.CaseType.ToString(), item.Status.ToString(), paymentId, item.RefundId,
                item.LocalStatus, refund?.Status.ToString(), payment?.Status.ToString(),
                refund?.ProviderRefundReference ?? item.ProviderTransactionReference,
                refund?.ProviderStatusCode ?? refundObservation.Status ?? checkObservation.Status ?? item.ProviderStatusCode,
                refund?.Amount ?? payment?.Total ?? item.LocalAmount,
                refund?.Status is RefundStatus.ProviderVerified or RefundStatus.InternallyRecorded
                    ? refund.Amount : refundObservation.Amount ?? checkObservation.Amount ?? item.ObservedProviderAmount,
                refund?.Currency ?? payment?.Currency ?? item.Currency,
                refund?.Status is RefundStatus.ProviderVerified or RefundStatus.InternallyRecorded
                    ? refund.Currency : refundObservation.Currency ?? checkObservation.Currency,
                refund?.CorrelationReference ?? item.CorrelationReference,
                recoveryState, refund?.FailureCode ?? checkObservation.ResultCode, checkObservation.ResultCode,
                item.CreatedAtUtc, latestCheck?.CreatedAtUtc,
                item.ResolvedAtUtc, item.ResolutionCode, item.ResolutionNote, item.ResolvedByUserId);
        }).ToArray();
    }

    private static ProviderObservation ReadObservation(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return default;
        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            var root = document.RootElement;
            string? String(string key) => root.TryGetProperty(key, out var value)
                && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
            decimal? Amount() => root.TryGetProperty("observedAmount", out var value)
                && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var amount) ? amount : null;
            return new(Amount(), String("observedCurrency"), String("observedStatus"),
                String("resultCode") ?? String("failureCode"));
        }
        catch (JsonException) { return default; }
    }

    private readonly record struct ProviderObservation(decimal? Amount, string? Currency, string? Status, string? ResultCode);

    private static AuditLog Audit(string actor, string action, Guid caseId, object metadata) => new()
    {
        ActorUserId = actor,
        Action = action,
        EntityType = nameof(ProviderReconciliationCase),
        EntityId = caseId.ToString(),
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(metadata)
    };

    private static bool IsConcurrencyConflict(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
            if (current is PostgresException postgres && postgres.SqlState is
                    PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected)
                return true;
        return false;
    }
}
