using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[Route("api/v1/admin/evaluator-specialisms")]
public sealed class AdminEvaluatorSpecialismsController(IEvaluatorSpecialismService specialisms) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? evaluatorUserId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default) =>
        Ok(await specialisms.ListAsync(evaluatorUserId, page, pageSize, cancellationToken));

    [HttpGet("staff")]
    public async Task<IActionResult> Staff(CancellationToken cancellationToken) =>
        Ok(await specialisms.ListStaffAsync(cancellationToken));

    [HttpGet("units")]
    public async Task<IActionResult> Units(CancellationToken cancellationToken) =>
        Ok(await specialisms.ListUnitsAsync(cancellationToken));

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Grant(GrantEvaluatorSpecialismRequest request, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId)) return Unauthorized();
        var result = await specialisms.GrantAsync(request.EvaluatorUserId, request.UnitDefinitionId,
            actorId, cancellationToken);
        return result switch
        {
            SpecialismWriteResult.Success => NoContent(),
            SpecialismWriteResult.EvaluatorNotEligible => BadRequest(new { code = "EVALUATOR_NOT_ELIGIBLE" }),
            SpecialismWriteResult.UnitNotFound => BadRequest(new { code = "UNIT_NOT_FOUND" }),
            SpecialismWriteResult.AlreadyActive => Conflict(new { code = "SPECIALISM_ALREADY_ACTIVE" }),
            SpecialismWriteResult.InvalidActor => Unauthorized(),
            _ => Conflict(new { code = "SPECIALISM_CONFLICT" })
        };
    }

    [HttpPost("{id:guid}/revoke")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Revoke(Guid id, RevokeEvaluatorSpecialismRequest request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId)) return Unauthorized();
        if (request.Reason?.Trim().Length > 500) return BadRequest(new { code = "REASON_TOO_LONG" });
        var result = await specialisms.RevokeAsync(id, actorId, request.Reason, cancellationToken);
        return result switch
        {
            SpecialismWriteResult.Success => NoContent(),
            SpecialismWriteResult.GrantNotFound => NotFound(),
            SpecialismWriteResult.AlreadyRevoked => Conflict(new { code = "SPECIALISM_ALREADY_REVOKED" }),
            SpecialismWriteResult.InvalidActor => Unauthorized(),
            _ => Conflict(new { code = "SPECIALISM_CONFLICT" })
        };
    }
}

public sealed record GrantEvaluatorSpecialismRequest(Guid EvaluatorUserId, Guid UnitDefinitionId);
public sealed record RevokeEvaluatorSpecialismRequest(string? Reason);
