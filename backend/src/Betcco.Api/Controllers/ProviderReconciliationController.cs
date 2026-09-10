using System.Security.Claims;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/provider-reconciliation")]
public sealed class ProviderReconciliationController(BetccoDbContext db, IPaymentProvider payments, IRefundService refunds) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var cases = await db.ProviderReconciliationCases.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(cases.Select(View));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        await db.ProviderReconciliationCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) is { } item ? Ok(View(item)) : NotFound();

    [HttpPost("{id:guid}/requery")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Requery(Guid id, CancellationToken cancellationToken)
    {
        var item = await db.ProviderReconciliationCases.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (item.RefundId is { } refundId) await refunds.VerifyPayTabsRefundAsync(UserId, refundId, cancellationToken);
        else if (!string.IsNullOrWhiteSpace(item.ProviderTransactionReference)) await payments.VerifyTransactionAsync(item.ProviderTransactionReference, cancellationToken);
        else return Conflict(new { code = "RECONCILIATION_REFERENCE_REQUIRED" });
        item.Status = ProviderReconciliationCaseStatus.UnderReview;
        db.AuditLogs.Add(new() { ActorUserId = UserId, Action = "ProviderReconciliationRequeryPerformed", EntityType = nameof(ProviderReconciliationCase), EntityId = item.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(View(item));
    }

    [HttpPost("{id:guid}/resolve")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Resolve(Guid id, ResolveReconciliationCase request, CancellationToken cancellationToken)
    {
        if (request.ResolutionCode is not ("ReviewedNoFinancialAction" or "EscalatedToFinance" or "ProviderConfirmed")) return BadRequest(new { code = "RECONCILIATION_RESOLUTION_CODE_INVALID" });
        var item = await db.ProviderReconciliationCases.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status == ProviderReconciliationCaseStatus.Resolved) return Conflict(new { code = "RECONCILIATION_ALREADY_RESOLVED" });
        item.Status = ProviderReconciliationCaseStatus.Resolved; item.ResolutionCode = request.ResolutionCode; item.ResolutionNote = request.Note?.Trim(); item.ResolvedByUserId = UserId; item.ResolvedAtUtc = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(new() { ActorUserId = UserId, Action = "ProviderReconciliationCaseResolved", EntityType = nameof(ProviderReconciliationCase), EntityId = item.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(View(item));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static object View(ProviderReconciliationCase item) => new { item.Id, item.Provider, CaseType = item.CaseType.ToString(), Status = item.Status.ToString(), item.PaymentId, item.RefundId, item.LocalStatus, item.ProviderTransactionReference, item.ProviderStatusCode, item.LocalAmount, item.ObservedProviderAmount, item.Currency, item.CorrelationReference, item.CreatedAtUtc, item.ResolvedAtUtc, item.ResolutionCode, item.ResolutionNote };
}
public sealed record ResolveReconciliationCase(string ResolutionCode, string? Note);
