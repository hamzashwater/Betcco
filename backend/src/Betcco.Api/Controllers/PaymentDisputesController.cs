using System.Security.Claims;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/payment-disputes")]
public sealed class PaymentDisputesController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var disputes = await db.PaymentDisputes.AsNoTracking()
            .OrderByDescending(item => item.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        return Ok(disputes.Select(View));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        await db.PaymentDisputes.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id, cancellationToken) is { } dispute
            ? Ok(View(dispute))
            : NotFound();

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreatePaymentDisputeRequest request, CancellationToken cancellationToken)
    {
        if (!IsValid(request, out var validationFailure))
            return await RejectAsync(request.PaymentId, validationFailure!, cancellationToken);

        var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == request.PaymentId, cancellationToken);
        if (payment is null)
            return await RejectAsync(request.PaymentId, "DISPUTE_PAYMENT_NOT_FOUND", cancellationToken);

        if (payment.Status is PaymentStatus.Refunded or PaymentStatus.PartiallyRefunded)
        {
            await OpenRefundPrecedenceReconciliationAsync(payment, cancellationToken);
            return Conflict(new { code = "DISPUTE_REFUND_PRECEDENCE_REQUIRES_REVIEW" });
        }

        if (payment.Status != PaymentStatus.Paid)
            return await RejectAsync(payment.Id, "DISPUTE_PAYMENT_NOT_PAID", cancellationToken);

        if (request.Amount > payment.Total)
            return await RejectAsync(payment.Id, "DISPUTE_AMOUNT_EXCEEDS_PAYMENT", cancellationToken);
        if (!string.Equals(request.Currency.Trim(), payment.Currency, StringComparison.OrdinalIgnoreCase))
            return await RejectAsync(payment.Id, "DISPUTE_CURRENCY_INVALID", cancellationToken);
        if (!string.IsNullOrWhiteSpace(request.ProviderDisputeReference) && string.IsNullOrWhiteSpace(payment.Provider))
            return await RejectAsync(payment.Id, "DISPUTE_PROVIDER_REFERENCE_INVALID", cancellationToken);

        var identity = BusinessIdentity(payment, request);
        var existing = await db.PaymentDisputes.SingleOrDefaultAsync(item => item.BusinessIdentity == identity, cancellationToken);
        if (existing is not null)
        {
            await RecordDuplicateReplayOnceAsync(existing, cancellationToken);
            return Ok(new { dispute = View(existing), replay = true });
        }

        var dispute = new PaymentDispute
        {
            PaymentId = payment.Id,
            Provider = payment.Provider,
            ProviderDisputeReference = Trim(request.ProviderDisputeReference),
            Category = request.Category.Trim(),
            Amount = request.Amount,
            Currency = payment.Currency,
            ReasonCode = Trim(request.ReasonCode),
            Note = Trim(request.Note),
            Source = PaymentDisputeSource.FinanceAdminManualEvidence,
            BusinessIdentity = identity,
            CreatedByUserId = UserId
        };
        db.PaymentDisputes.Add(dispute);
        db.AuditLogs.Add(Audit("PaymentDisputeOpened", dispute.Id, "Success"));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var replay = await db.PaymentDisputes.SingleOrDefaultAsync(item => item.BusinessIdentity == identity, cancellationToken);
            if (replay is null) throw;
            await RecordDuplicateReplayOnceAsync(replay, cancellationToken);
            return Ok(new { dispute = View(replay), replay = true });
        }

        return CreatedAtAction(nameof(Get), new { id = dispute.Id }, View(dispute));
    }

    [HttpPost("{id:guid}/review")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> MoveToReview(Guid id, CancellationToken cancellationToken)
    {
        var dispute = await db.PaymentDisputes.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (dispute is null) return NotFound();
        if (dispute.Status == PaymentDisputeStatus.UnderReview) return Ok(new { dispute = View(dispute), replay = true });
        if (dispute.Status != PaymentDisputeStatus.Open) return Conflict(new { code = "DISPUTE_ALREADY_RESOLVED" });

        dispute.Status = PaymentDisputeStatus.UnderReview;
        db.AuditLogs.Add(Audit("PaymentDisputeMovedToReview", dispute.Id, "Success"));
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { dispute = View(dispute), replay = false });
    }

    [HttpPost("{id:guid}/resolve")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Resolve(Guid id, ResolvePaymentDisputeRequest request, CancellationToken cancellationToken)
    {
        if (request.ResolutionCode is not ("ReviewedNoFinancialAction" or "EscalatedToFinance" or "ProviderEvidenceRejected" or "ProviderEvidenceConfirmed"))
            return BadRequest(new { code = "DISPUTE_RESOLUTION_CODE_INVALID" });
        if (request.Note?.Trim().Length > 1_000) return BadRequest(new { code = "DISPUTE_NOTE_INVALID" });

        var dispute = await db.PaymentDisputes.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (dispute is null) return NotFound();
        if (dispute.Status == PaymentDisputeStatus.Resolved) return Ok(new { dispute = View(dispute), replay = true });
        if (dispute.Status != PaymentDisputeStatus.UnderReview) return Conflict(new { code = "DISPUTE_REVIEW_REQUIRED" });

        dispute.Status = PaymentDisputeStatus.Resolved;
        dispute.ResolutionCode = request.ResolutionCode;
        dispute.ResolutionNote = Trim(request.Note);
        dispute.ResolvedByUserId = UserId;
        dispute.ResolvedAtUtc = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(Audit("PaymentDisputeResolved", dispute.Id, "Success"));
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { dispute = View(dispute), replay = false });
    }

    private async Task<IActionResult> RejectAsync(Guid paymentId, string code, CancellationToken cancellationToken)
    {
        db.AuditLogs.Add(Audit("PaymentDisputeInvalidRejected", paymentId, code));
        await db.SaveChangesAsync(cancellationToken);
        return BadRequest(new { code });
    }

    private async Task OpenRefundPrecedenceReconciliationAsync(Payment payment, CancellationToken cancellationToken)
    {
        var identity = $"payment-dispute-refund-precedence|{payment.Id:N}|{payment.Status}";
        if (!await db.ProviderReconciliationCases.AnyAsync(item => item.BusinessIdentity == identity, cancellationToken))
        {
            db.ProviderReconciliationCases.Add(new ProviderReconciliationCase
            {
                Provider = payment.Provider ?? "InternalFinance",
                CaseType = ProviderReconciliationCaseType.LocalPaidProviderDisagreement,
                PaymentId = payment.Id,
                BusinessIdentity = identity,
                LocalStatus = payment.Status.ToString(),
                ProviderTransactionReference = payment.ProviderPaymentId,
                LocalAmount = payment.Total,
                Currency = payment.Currency,
                CorrelationReference = payment.ProviderPaymentId,
                CreatedByUserId = UserId
            });
            db.AuditLogs.Add(Audit("PaymentDisputeReconciliationRequired", payment.Id, "RefundPrecedence"));
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                if (!await db.ProviderReconciliationCases.AnyAsync(item => item.BusinessIdentity == identity, cancellationToken)) throw;
            }
        }
    }

    private async Task RecordDuplicateReplayOnceAsync(PaymentDispute dispute, CancellationToken cancellationToken)
    {
        if (!await db.AuditLogs.AnyAsync(item => item.Action == "PaymentDisputeDuplicateReplay" && item.EntityType == nameof(PaymentDispute) && item.EntityId == dispute.Id.ToString(), cancellationToken))
        {
            db.AuditLogs.Add(Audit("PaymentDisputeDuplicateReplay", dispute.Id, "Success"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private static bool IsValid(CreatePaymentDisputeRequest request, out string? failure)
    {
        failure = null;
        if (request.PaymentId == Guid.Empty) failure = "DISPUTE_PAYMENT_INVALID";
        else if (request.Amount <= 0m) failure = "DISPUTE_AMOUNT_INVALID";
        else if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Trim().Length > 8) failure = "DISPUTE_CURRENCY_INVALID";
        else if (string.IsNullOrWhiteSpace(request.Category) || request.Category.Trim().Length > 100) failure = "DISPUTE_CATEGORY_INVALID";
        else if (request.ReasonCode?.Trim().Length > 100) failure = "DISPUTE_REASON_CODE_INVALID";
        else if (request.Note?.Trim().Length > 1_000) failure = "DISPUTE_NOTE_INVALID";
        else if (request.ProviderDisputeReference?.Trim().Length > 200) failure = "DISPUTE_PROVIDER_REFERENCE_INVALID";
        else if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Trim().Length > 128) failure = "DISPUTE_IDEMPOTENCY_KEY_INVALID";
        return failure is null;
    }

    private static string BusinessIdentity(Payment payment, CreatePaymentDisputeRequest request)
    {
        var reference = Trim(request.ProviderDisputeReference)?.ToUpperInvariant() ?? $"MANUAL:{request.IdempotencyKey.Trim().ToUpperInvariant()}";
        return $"{payment.Provider ?? "InternalFinance"}|payment:{payment.Id:N}|dispute:{reference}";
    }

    private AuditLog Audit(string action, Guid entityId, string outcome) => new()
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(PaymentDispute),
        EntityId = entityId.ToString(),
        Outcome = outcome
    };

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "finance-admin";
    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static object View(PaymentDispute item) => new { item.Id, item.PaymentId, item.Provider, item.ProviderDisputeReference, item.Category, item.Amount, item.Currency, item.ReasonCode, item.Note, Source = item.Source.ToString(), Status = item.Status.ToString(), item.ProviderReconciliationCaseId, item.BusinessIdentity, item.CreatedAtUtc, item.ResolvedAtUtc, item.ResolutionCode, item.ResolutionNote, item.ResolvedByUserId };
}

public sealed record CreatePaymentDisputeRequest(Guid PaymentId, decimal Amount, string Currency, string Category, string? ReasonCode, string? Note, string? ProviderDisputeReference, string IdempotencyKey);
public sealed record ResolvePaymentDisputeRequest(string ResolutionCode, string? Note);
