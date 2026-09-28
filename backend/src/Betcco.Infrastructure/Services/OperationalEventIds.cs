using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

/// <summary>Stable event identifiers for repository-owned operational signals.</summary>
public static class OperationalEventIds
{
    public static readonly EventId ReadinessUnavailable = new(7001, "Operational.Readiness.Unavailable");
    public static readonly EventId EmailDeliveryFailed = new(7101, "Operational.EmailOutbox.DeliveryFailed");
    public static readonly EventId EmailWorkerFailed = new(7102, "Operational.EmailOutbox.WorkerFailed");
    public static readonly EventId EmailBacklogAged = new(7103, "Operational.EmailOutbox.BacklogAged");
    public static readonly EventId ScannerUnavailable = new(7201, "Operational.Scanner.Unavailable");
    public static readonly EventId StorageOperationDeferred = new(7301, "Operational.Storage.OperationDeferred");
    public static readonly EventId StorageReconciliationFailed = new(7302, "Operational.Storage.ReconciliationFailed");
    public static readonly EventId StorageWorkerFailed = new(7303, "Operational.Storage.WorkerFailed");
    public static readonly EventId PaymentResultUnknown = new(7401, "Operational.Payment.ProviderResultUnknown");
    public static readonly EventId RefundResultUnknown = new(7402, "Operational.Refund.ProviderResultUnknown");
}
