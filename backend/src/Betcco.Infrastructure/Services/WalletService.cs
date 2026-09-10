using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Data;

namespace Betcco.Infrastructure.Services;

public sealed class WalletService(BetccoDbContext db, IDataProtectionProvider dataProtection, IPayoutProvider payoutProvider) : IWalletService
{
    private const string Currency = "JOD";
    private readonly IDataProtector destinationProtector = dataProtection.CreateProtector("BETCCO.PayoutDestination.v1");

    public async Task<TeacherWalletView> GetTeacherWalletAsync(string teacherUserId, CancellationToken cancellationToken = default)
    {
        var transactionQuery = db.WalletTransactions.AsNoTracking()
            .Where(transaction => transaction.UserId == teacherUserId);
        var availableBalance = await transactionQuery.SumAsync(transaction => (decimal?)transaction.Amount, cancellationToken) ?? 0m;
        var totalEarned = await transactionQuery
            .Where(transaction => transaction.Type == "TeacherCourseEarning")
            .SumAsync(transaction => (decimal?)transaction.Amount, cancellationToken) ?? 0m;
        var totalWithdrawn = -(
            await transactionQuery
                .Where(transaction => transaction.Type == "PayoutReserved")
                .SumAsync(transaction => (decimal?)transaction.Amount, cancellationToken) ?? 0m);
        var transactions = await transactionQuery
            .OrderByDescending(transaction => transaction.CreatedAtUtc)
            .Take(100)
            .ToListAsync(cancellationToken);
        var payouts = await db.PayoutRequests.AsNoTracking()
            .Where(payout => payout.TeacherUserId == teacherUserId)
            .OrderByDescending(payout => payout.CreatedAtUtc)
            .Take(50)
            .ToListAsync(cancellationToken);

        return new TeacherWalletView(
            availableBalance,
            totalEarned,
            totalWithdrawn,
            Currency,
            transactions.Select(ToTransactionView).ToArray(),
            payouts.Select(ToTeacherPayoutView).ToArray());
    }

    public async Task<TeacherPayoutView?> CreatePayoutRequestAsync(string teacherUserId, CreatePayoutRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Amount <= 0) throw new InvalidOperationException("Withdrawal amount must be greater than zero.");
        if (!Enum.TryParse<PayoutMethod>(request.Method, true, out var method) || !Enum.IsDefined(method)) throw new InvalidOperationException("Unsupported withdrawal method.");
        var destination = request.Destination?.Trim() ?? string.Empty;
        if (destination.Length is < 4 or > 512) throw new InvalidOperationException("Enter valid payout destination details.");
        var idempotencyKey = request.IdempotencyKey?.Trim() ?? string.Empty;
        if (idempotencyKey.Length is < 1 or > 128) throw new InvalidOperationException("A valid withdrawal idempotency key is required.");
        var amount = Math.Round(request.Amount, 3, MidpointRounding.AwayFromZero);

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var existing = await db.PayoutRequests.SingleOrDefaultAsync(payout => payout.TeacherUserId == teacherUserId && payout.IdempotencyKey == idempotencyKey, cancellationToken);
                if (existing is not null) return ToTeacherPayoutView(existing);
                var available = await db.WalletTransactions.Where(transaction => transaction.UserId == teacherUserId)
                    .SumAsync(transaction => (decimal?)transaction.Amount, cancellationToken) ?? 0m;
                if (amount > available) throw new InvalidOperationException("Withdrawal amount exceeds the available wallet balance.");

                var payout = new PayoutRequest
                {
                    TeacherUserId = teacherUserId,
                    IdempotencyKey = idempotencyKey,
                    Amount = amount,
                    Currency = Currency,
                    Method = method,
                    DestinationEncrypted = destinationProtector.Protect(destination),
                    DestinationMasked = MaskDestination(destination)
                };
                db.PayoutRequests.Add(payout);
                db.WalletTransactions.Add(new WalletTransaction
                {
                    UserId = teacherUserId,
                    Type = "PayoutReserved",
                    Amount = -payout.Amount,
                    Currency = Currency,
                    PayoutRequestId = payout.Id,
                    Description = "Withdrawal request reserved from teacher wallet"
                });
                db.AuditLogs.Add(Audit(teacherUserId, "TeacherPayoutRequested", nameof(PayoutRequest), payout.Id.ToString()));
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return ToTeacherPayoutView(payout);
            }
            catch (Exception exception) when (attempt < 2 && IsPostgresConcurrencyConflict(exception))
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    public async Task<AdminWalletView> GetAdminWalletAsync(CancellationToken cancellationToken = default)
    {
        var payouts = await db.PayoutRequests.AsNoTracking().OrderByDescending(payout => payout.CreatedAtUtc).Take(100).ToListAsync(cancellationToken);
        var allocations = await db.CourseSaleAllocations.AsNoTracking().OrderByDescending(allocation => allocation.CreatedAtUtc).Take(100).ToListAsync(cancellationToken);
        var teacherIds = payouts.Select(payout => payout.TeacherUserId)
            .Concat(allocations.Where(allocation => !string.IsNullOrWhiteSpace(allocation.TeacherUserId)).Select(allocation => allocation.TeacherUserId!))
            .Distinct()
            .ToArray();
        var teachers = await db.Users.AsNoTracking().Where(user => teacherIds.Contains(user.Id.ToString()))
            .Select(user => new TeacherInfo(user.Id.ToString(), user.DisplayName, user.Email ?? string.Empty))
            .ToDictionaryAsync(user => user.Id, cancellationToken);
        var courseIds = allocations.Select(allocation => allocation.CourseId).Distinct().ToArray();
        var courses = await db.Courses.AsNoTracking().Where(course => courseIds.Contains(course.Id))
            .Select(course => new { course.Id, course.ArabicTitle })
            .ToDictionaryAsync(course => course.Id, cancellationToken);
        var platformTransactions = await db.WalletTransactions.AsNoTracking().Where(transaction => transaction.UserId == "platform").ToListAsync(cancellationToken);

        return new AdminWalletView(
            platformTransactions.Sum(transaction => transaction.Amount),
            platformTransactions.Where(transaction => transaction.Type == "PlatformCommission").Sum(transaction => transaction.Amount),
            Currency,
            payouts.Select(payout => ToAdminPayoutView(payout, teachers.GetValueOrDefault(payout.TeacherUserId))).ToArray(),
            allocations.Select(allocation => new SaleAllocationView(
                allocation.Id,
                allocation.PaymentId,
                allocation.CourseId,
                courses.GetValueOrDefault(allocation.CourseId)?.ArabicTitle ?? allocation.CourseId.ToString(),
                allocation.TeacherUserId,
                allocation.TeacherUserId is null ? "Unassigned course" : teachers.GetValueOrDefault(allocation.TeacherUserId)?.DisplayName ?? "Deleted teacher",
                allocation.GrossAmount,
                allocation.DiscountAllocated,
                allocation.NetAmount,
                allocation.PlatformCommission,
                allocation.TeacherEarning,
                allocation.Currency,
                allocation.CreatedAtUtc)).ToArray());
    }

    public async Task<bool> ApprovePayoutAsync(string adminUserId, Guid payoutId, string? note, CancellationToken cancellationToken = default)
    {
        var payout = await db.PayoutRequests.SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
        if (payout is null || payout.Status != PayoutStatus.Requested) return false;
        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Approved;
        payout.ReviewedByAdminUserId = adminUserId;
        payout.ReviewNote = NormalizeNote(note);
        payout.ReviewedAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.FinanceApproval, adminUserId));
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutApproved", nameof(PayoutRequest), payout.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RejectPayoutAsync(string adminUserId, Guid payoutId, string? note, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var payout = await db.PayoutRequests.SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
        if (payout is null) return false;
        if (payout.Status == PayoutStatus.Rejected) return true;
        if (payout.Status is not (PayoutStatus.Requested or PayoutStatus.Approved)) return false;
        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Rejected;
        payout.ReviewedByAdminUserId = adminUserId;
        payout.ReviewNote = NormalizeNote(note);
        payout.ReviewedAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.FinanceRejection, adminUserId));
        await AddPayoutReversalIfMissingAsync(payout, "Rejected payout returned to teacher wallet", cancellationToken);
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutRejected", nameof(PayoutRequest), payout.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<TeacherPayoutView?> ExecutePayoutAsync(string adminUserId, Guid payoutId, CancellationToken cancellationToken = default)
    {
        if (!payoutProvider.IsAvailable)
            throw new PayoutProviderUnavailableException("Payout execution is unavailable until a verified provider is configured.");

        var payout = await db.PayoutRequests.SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
        if (payout is null || payout.Status == PayoutStatus.Rejected) return null;
        if (payout.Status != PayoutStatus.Approved) return ToTeacherPayoutView(payout);

        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Processing;
        payout.ExecutionInitiatedAtUtc = DateTimeOffset.UtcNow;
        payout.ProviderName = payoutProvider.ProviderName;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.ExecutionInitiated, adminUserId, payoutProvider.ProviderName));
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutExecutionInitiated", nameof(PayoutRequest), payout.Id.ToString()));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            var replay = await db.PayoutRequests.AsNoTracking().SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
            return replay is null || replay.Status == PayoutStatus.Rejected ? null : ToTeacherPayoutView(replay);
        }

        PayoutTransferResult transfer;
        try
        {
            transfer = await payoutProvider.SendAsync(destinationProtector.Unprotect(payout.DestinationEncrypted), payout.Amount, payout.Currency, payout.Id.ToString("N"), cancellationToken);
        }
        catch (PayoutProviderUnavailableException)
        {
            throw;
        }
        catch (Exception)
        {
            return await RecordProviderResultUnknownAsync(payout, adminUserId, "PROVIDER_RESULT_UNKNOWN", CancellationToken.None);
        }

        if (transfer.IsConfirmed && !string.IsNullOrWhiteSpace(transfer.Reference))
        {
            return await RecordProviderConfirmedAsync(payout, transfer, adminUserId, cancellationToken);
        }

        if (transfer.IsDefiniteFailure)
        {
            return await RecordProviderFailureAsync(payout, transfer, adminUserId, cancellationToken);
        }

        return await RecordProviderResultUnknownAsync(payout, adminUserId, transfer.ResultCode ?? "PROVIDER_RESULT_UNKNOWN", cancellationToken);
    }

    public async Task<TeacherPayoutView?> SettlePayoutAsync(string adminUserId, Guid payoutId, CancellationToken cancellationToken = default)
    {
        var payout = await db.PayoutRequests.SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
        if (payout is null) return null;
        if (payout.Status == PayoutStatus.Settled) return ToTeacherPayoutView(payout);
        if (payout.Status != PayoutStatus.Paid) return null;

        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Settled;
        payout.SettledAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.InternalSettlement, adminUserId, payout.ProviderName, payout.ProviderPayoutReference, payout.ProviderResultCode));
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutInternallySettled", nameof(PayoutRequest), payout.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return ToTeacherPayoutView(payout);
    }

    public async Task<IReadOnlyCollection<PayoutTransitionView>?> GetPayoutHistoryAsync(Guid payoutId, CancellationToken cancellationToken = default)
    {
        if (!await db.PayoutRequests.AsNoTracking().AnyAsync(request => request.Id == payoutId, cancellationToken)) return null;
        var history = await db.PayoutStatusTransitions.AsNoTracking()
            .Where(transition => transition.PayoutRequestId == payoutId)
            .OrderBy(transition => transition.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return history.Select(transition => new PayoutTransitionView(transition.Id, transition.PreviousStatus.ToString(), transition.NewStatus.ToString(), transition.Source.ToString(), transition.Provider, transition.ProviderTransferReference, transition.ResultCode, transition.CorrelationId, transition.CreatedAtUtc)).ToArray();
    }

    private async Task<TeacherPayoutView> RecordProviderConfirmedAsync(PayoutRequest payout, PayoutTransferResult transfer, string adminUserId, CancellationToken cancellationToken)
    {
        if (payout.Status != PayoutStatus.Processing) return await ReloadPayoutViewAsync(payout.Id, cancellationToken);
        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Paid;
        payout.ProviderPayoutReference = transfer.Reference;
        payout.ProviderName = transfer.Provider;
        payout.ProviderResultCode = transfer.ResultCode;
        payout.PaidAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.ProviderConfirmed, adminUserId, transfer.Provider, transfer.Reference, transfer.ResultCode));
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutProviderConfirmed", nameof(PayoutRequest), payout.Id.ToString()));
        return await SaveProviderOutcomeAsync(payout, cancellationToken);
    }

    private async Task<TeacherPayoutView> RecordProviderFailureAsync(PayoutRequest payout, PayoutTransferResult transfer, string adminUserId, CancellationToken cancellationToken)
    {
        if (payout.Status != PayoutStatus.Processing) return await ReloadPayoutViewAsync(payout.Id, cancellationToken);
        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.Failed;
        payout.ProviderName = transfer.Provider;
        payout.ProviderResultCode = transfer.ResultCode;
        payout.ExecutionFailureCode = transfer.ResultCode ?? "PROVIDER_EXECUTION_FAILED";
        payout.FailedAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.ProviderDefiniteFailure, adminUserId, transfer.Provider, transfer.Reference, transfer.ResultCode));
        await AddPayoutReversalIfMissingAsync(payout, "Failed payout returned to teacher wallet", cancellationToken);
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutExecutionFailed", nameof(PayoutRequest), payout.Id.ToString()));
        return await SaveProviderOutcomeAsync(payout, cancellationToken);
    }

    private async Task<TeacherPayoutView> RecordProviderResultUnknownAsync(PayoutRequest payout, string adminUserId, string resultCode, CancellationToken cancellationToken)
    {
        if (payout.Status != PayoutStatus.Processing) return await ReloadPayoutViewAsync(payout.Id, cancellationToken);
        var previousStatus = payout.Status;
        payout.Status = PayoutStatus.ProviderResultUnknown;
        payout.ProviderResultCode = resultCode;
        payout.ProviderResultUnknownAtUtc = DateTimeOffset.UtcNow;
        db.PayoutStatusTransitions.Add(Transition(payout, previousStatus, PayoutTransitionSource.ProviderResultUnknown, adminUserId, payout.ProviderName, payout.ProviderPayoutReference, resultCode));
        db.AuditLogs.Add(Audit(adminUserId, "TeacherPayoutProviderResultUnknown", nameof(PayoutRequest), payout.Id.ToString()));
        return await SaveProviderOutcomeAsync(payout, cancellationToken);
    }

    private async Task AddPayoutReversalIfMissingAsync(PayoutRequest payout, string description, CancellationToken cancellationToken)
    {
        if (await db.WalletTransactions.AnyAsync(transaction => transaction.PayoutRequestId == payout.Id && transaction.Type == "PayoutReversal", cancellationToken)) return;

        var reservation = await db.WalletTransactions.SingleOrDefaultAsync(transaction => transaction.PayoutRequestId == payout.Id && transaction.Type == "PayoutReserved", cancellationToken);
        if (reservation is null || reservation.Amount >= 0 || reservation.Currency != payout.Currency || -reservation.Amount != payout.Amount)
            throw new InvalidOperationException("The payout reservation does not match the immutable payout amount.");

        db.WalletTransactions.Add(new WalletTransaction
        {
            UserId = payout.TeacherUserId,
            Type = "PayoutReversal",
            Amount = -reservation.Amount,
            Currency = reservation.Currency,
            PayoutRequestId = payout.Id,
            Description = description
        });
    }

    private async Task<TeacherPayoutView> SaveProviderOutcomeAsync(PayoutRequest payout, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return ToTeacherPayoutView(payout);
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            return await ReloadPayoutViewAsync(payout.Id, cancellationToken);
        }
    }

    private async Task<TeacherPayoutView> ReloadPayoutViewAsync(Guid payoutId, CancellationToken cancellationToken)
    {
        var current = await db.PayoutRequests.AsNoTracking().SingleOrDefaultAsync(request => request.Id == payoutId, cancellationToken);
        return current is null
            ? throw new InvalidOperationException("The payout no longer exists.")
            : ToTeacherPayoutView(current);
    }

    private static WalletTransactionView ToTransactionView(WalletTransaction transaction) => new(transaction.Id, transaction.Type, transaction.Amount, transaction.Currency, transaction.Description, transaction.CreatedAtUtc, transaction.PaymentId, transaction.PayoutRequestId);
    private static TeacherPayoutView ToTeacherPayoutView(PayoutRequest payout) => new(payout.Id, payout.Amount, payout.Currency, payout.Method.ToString(), payout.DestinationMasked, payout.Status.ToString(), payout.ReviewNote, payout.CreatedAtUtc, payout.ExecutionInitiatedAtUtc, payout.PaidAtUtc, payout.SettledAtUtc);
    private static AdminPayoutView ToAdminPayoutView(PayoutRequest payout, TeacherInfo? teacher) => new(payout.Id, payout.TeacherUserId, teacher?.DisplayName ?? "Deleted teacher", teacher?.Email ?? string.Empty, payout.Amount, payout.Currency, payout.Method.ToString(), payout.DestinationMasked, payout.Status.ToString(), payout.ReviewNote, payout.CreatedAtUtc, payout.ExecutionInitiatedAtUtc, payout.PaidAtUtc, payout.SettledAtUtc);
    private static PayoutStatusTransition Transition(PayoutRequest payout, PayoutStatus previousStatus, PayoutTransitionSource source, string actor, string? provider = null, string? reference = null, string? resultCode = null) => new()
    {
        PayoutRequestId = payout.Id,
        PreviousStatus = previousStatus,
        NewStatus = payout.Status,
        Source = source,
        ActorContext = actor,
        Provider = provider,
        ProviderTransferReference = reference,
        ResultCode = resultCode,
        CorrelationId = $"payout:{payout.Id:N}"
    };
    private static string? NormalizeNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 1000)];
    private static string MaskDestination(string destination) => destination.Length <= 4 ? "••••" : $"•••• {destination[^4..]}";
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
    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success" };
    private sealed record TeacherInfo(string Id, string DisplayName, string Email);
}
