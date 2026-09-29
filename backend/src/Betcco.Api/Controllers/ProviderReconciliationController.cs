using System.Security.Claims;
using Betcco.Application.Commerce;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/provider-reconciliation")]
public sealed class ProviderReconciliationController(IProviderReconciliationService reconciliation) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default) =>
        Ok(await reconciliation.ListAsync(page, pageSize, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        await reconciliation.GetAsync(id, cancellationToken) is { } item ? Ok(item) : NotFound();

    [HttpPost("{id:guid}/requery")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Requery(Guid id, CancellationToken cancellationToken) =>
        Map(await reconciliation.RequeryAsync(UserId, id, cancellationToken));

    [HttpPost("{id:guid}/resolve")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Resolve(Guid id, ResolveReconciliationCase request, CancellationToken cancellationToken) =>
        Map(await reconciliation.ResolveAsync(UserId, id, request.ResolutionCode, request.Note, cancellationToken));

    private IActionResult Map(ProviderReconciliationActionResult result) => result.FailureCode switch
    {
        "RECONCILIATION_NOT_FOUND" => NotFound(new { code = result.FailureCode }),
        "RECONCILIATION_RESOLUTION_CODE_INVALID" or "RECONCILIATION_RESOLUTION_NOTE_INVALID"
            => BadRequest(new { code = result.FailureCode }),
        "RECONCILIATION_REFERENCE_REQUIRED" or "RECONCILIATION_PROVIDER_UNSUPPORTED"
            or "RECONCILIATION_PROVIDER_EVIDENCE_REQUIRED" or "RECONCILIATION_ALREADY_RESOLVED"
            or "RECONCILIATION_FINANCIAL_STATE_UNRESOLVED" or "RECONCILIATION_REFUND_NOT_FOUND"
            or "RECONCILIATION_CONCURRENCY_CONFLICT" => Conflict(new { code = result.FailureCode, result.Case }),
        _ => result.Case is null ? NotFound() : Ok(new { result.Case, result.FailureCode, result.IsIdempotentReplay })
    };

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

public sealed record ResolveReconciliationCase(string ResolutionCode, string? Note);
