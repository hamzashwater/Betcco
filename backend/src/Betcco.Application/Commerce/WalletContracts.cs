using Betcco.Domain.Common;

namespace Betcco.Application.Commerce;

public sealed record WalletTransactionView(Guid Id, string Type, decimal Amount, string Currency, string Description, DateTimeOffset CreatedAtUtc, Guid? PaymentId, Guid? PayoutRequestId);
public sealed record TeacherPayoutView(Guid Id, decimal Amount, string Currency, string Method, string DestinationMasked, string Status, string? ReviewNote, DateTimeOffset CreatedAtUtc, DateTimeOffset? ExecutionInitiatedAtUtc, DateTimeOffset? PaidAtUtc, DateTimeOffset? SettledAtUtc);
public sealed record PayoutTransitionView(Guid Id, string PreviousStatus, string NewStatus, string Source, string? Provider, string? ProviderTransferReference, string? ResultCode, string? CorrelationId, DateTimeOffset CreatedAtUtc);
public sealed record TeacherWalletView(decimal AvailableBalance, decimal TotalEarned, decimal TotalWithdrawn, string Currency, IReadOnlyCollection<WalletTransactionView> Transactions, IReadOnlyCollection<TeacherPayoutView> Payouts);
public sealed record CreatePayoutRequest(decimal Amount, string Method, string Destination, string? IdempotencyKey);
public sealed record AdminPayoutView(Guid Id, string TeacherUserId, string TeacherName, string TeacherEmail, decimal Amount, string Currency, string Method, string DestinationMasked, string Status, string? ReviewNote, DateTimeOffset CreatedAtUtc, DateTimeOffset? ExecutionInitiatedAtUtc, DateTimeOffset? PaidAtUtc, DateTimeOffset? SettledAtUtc);
public sealed record SaleAllocationView(Guid Id, Guid PaymentId, Guid CourseId, string CourseTitle, string? TeacherUserId, string TeacherName, decimal GrossAmount, decimal DiscountAllocated, decimal NetAmount, decimal PlatformCommission, decimal TeacherEarning, string Currency, DateTimeOffset CreatedAtUtc);
public sealed record AdminWalletView(decimal PlatformBalance, decimal ConfirmedPlatformCommission, string Currency, IReadOnlyCollection<AdminPayoutView> Payouts, IReadOnlyCollection<SaleAllocationView> RecentSales);

public interface IWalletService
{
    Task<TeacherWalletView> GetTeacherWalletAsync(string teacherUserId, CancellationToken cancellationToken = default);
    Task<TeacherPayoutView?> CreatePayoutRequestAsync(string teacherUserId, CreatePayoutRequest request, CancellationToken cancellationToken = default);
    Task<AdminWalletView> GetAdminWalletAsync(CancellationToken cancellationToken = default);
    Task<bool> ApprovePayoutAsync(string adminUserId, Guid payoutId, string? note, CancellationToken cancellationToken = default);
    Task<bool> RejectPayoutAsync(string adminUserId, Guid payoutId, string? note, CancellationToken cancellationToken = default);
    Task<TeacherPayoutView?> ExecutePayoutAsync(string adminUserId, Guid payoutId, CancellationToken cancellationToken = default);
    Task<TeacherPayoutView?> SettlePayoutAsync(string adminUserId, Guid payoutId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PayoutTransitionView>?> GetPayoutHistoryAsync(Guid payoutId, CancellationToken cancellationToken = default);
}
