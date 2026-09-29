namespace Betcco.Application.Commerce;

public sealed record ProviderReconciliationCaseView(
    Guid Id,
    string Provider,
    string CaseType,
    string Status,
    Guid? PaymentId,
    Guid? RefundId,
    string? LocalStatus,
    string? LocalRefundStatus,
    string? LocalPaymentStatus,
    string? ProviderTransactionReference,
    string? ProviderStatusCode,
    decimal? LocalAmount,
    decimal? ObservedProviderAmount,
    string? Currency,
    string? ObservedProviderCurrency,
    string? CorrelationReference,
    string RecoveryState,
    string? RecoveryResultCode,
    string? LastRequeryResultCode,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? LastCheckedAtUtc,
    DateTimeOffset? ResolvedAtUtc,
    string? ResolutionCode,
    string? ResolutionNote,
    string? ResolvedByUserId);

public sealed record ProviderReconciliationActionResult(
    ProviderReconciliationCaseView? Case,
    string? FailureCode = null,
    bool IsIdempotentReplay = false);

public interface IProviderReconciliationService
{
    Task<IReadOnlyCollection<ProviderReconciliationCaseView>> ListAsync(int page, int pageSize, CancellationToken cancellationToken = default);
    Task<ProviderReconciliationCaseView?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProviderReconciliationActionResult> RequeryAsync(string actor, Guid id, CancellationToken cancellationToken = default);
    Task<ProviderReconciliationActionResult> ResolveAsync(string actor, Guid id, string resolutionCode, string? note, CancellationToken cancellationToken = default);
}
