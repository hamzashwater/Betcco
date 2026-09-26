using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/assessment-coordination/{evaluationRequestId:guid}/reasonable-adjustments")]
public sealed class AssessmentReasonableAdjustmentsController(
    IAssessmentReasonableAdjustmentService adjustments) : ControllerBase
{
    [HttpGet("revision-deadline")]
    public async Task<ActionResult<EvaluationRevisionDeadlineAdjustmentSummary>> GetRevisionDeadline(
        Guid evaluationRequestId,
        CancellationToken cancellationToken)
    {
        var summary = await adjustments.GetRevisionDeadlineSummaryAsync(
            evaluationRequestId, cancellationToken);
        return summary is null ? NotFound() : Ok(summary);
    }

    [HttpPost("revision-deadline")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> GrantRevisionDeadline(
        Guid evaluationRequestId,
        GrantEvaluationRevisionDeadlineAdjustment request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId))
            return Unauthorized();
        var result = await adjustments.GrantRevisionDeadlineAsync(
            actorId, evaluationRequestId, request, cancellationToken);
        return Map(result);
    }

    [HttpPost("revision-deadline/{adjustmentId:guid}/revoke")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> RevokeRevisionDeadline(
        Guid evaluationRequestId,
        Guid adjustmentId,
        RevokeEvaluationRevisionDeadlineAdjustment request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId))
            return Unauthorized();
        var result = await adjustments.RevokeRevisionDeadlineAsync(
            actorId, evaluationRequestId, adjustmentId, request, cancellationToken);
        return Map(result);
    }

    private IActionResult Map(EvaluationReasonableAdjustmentWriteResult result) => result switch
    {
        EvaluationReasonableAdjustmentWriteResult.Success => NoContent(),
        EvaluationReasonableAdjustmentWriteResult.RequestNotFound => NotFound(),
        EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow =>
            Conflict(new { code = "NO_ACTIVE_REVISION_WINDOW" }),
        EvaluationReasonableAdjustmentWriteResult.Invalid =>
            BadRequest(new { code = "INVALID_REASONABLE_ADJUSTMENT" }),
        EvaluationReasonableAdjustmentWriteResult.InvalidActor => Unauthorized(),
        EvaluationReasonableAdjustmentWriteResult.Conflict =>
            Conflict(new { code = "REASONABLE_ADJUSTMENT_CONFLICT" }),
        _ => Conflict(new { code = "REASONABLE_ADJUSTMENT_CONFLICT" })
    };
}
