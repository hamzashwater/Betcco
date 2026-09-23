using System.Security.Claims;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/assessment-coordination")]
public sealed class AssessmentCoordinationController(IAssessmentCoordinationService coordination) : ControllerBase
{
    [HttpGet("queue")]
    public async Task<ActionResult<AssessmentCoordinationPage>> Queue(
        [FromQuery] string? status = null,
        [FromQuery] string? expectedCompletionState = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (page is < 1 or > 1000 || pageSize is < 1 or > 50)
            return BadRequest(new { code = "INVALID_PAGE" });

        EvaluationStatus? selectedStatus = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = AssessmentCoordinationStatuses.Active.FirstOrDefault(value =>
                string.Equals(value.ToString(), status, StringComparison.OrdinalIgnoreCase));
            if (!AssessmentCoordinationStatuses.Active.Contains(parsed))
                return BadRequest(new { code = "INVALID_STATUS" });
            selectedStatus = parsed;
        }

        if (!string.IsNullOrWhiteSpace(expectedCompletionState)
            && expectedCompletionState is not (ExpectedCompletionStates.NotSet
                or ExpectedCompletionStates.OnTrack or ExpectedCompletionStates.Overdue))
            return BadRequest(new { code = "INVALID_EXPECTED_COMPLETION_STATE" });

        return Ok(await coordination.QueueAsync(selectedStatus, page, pageSize,
            cancellationToken, expectedCompletionState));
    }

    [HttpPut("{evaluationRequestId:guid}/expected-completion")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> SetExpectedCompletion(Guid evaluationRequestId,
        SetExpectedCompletionRequest request, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId))
            return Unauthorized();
        var result = await coordination.SetExpectedCompletionAsync(evaluationRequestId,
            request.ExpectedCompletionAtUtc, request.Reason, actorId, cancellationToken);
        return result switch
        {
            ExpectedCompletionWriteResult.Success => NoContent(),
            ExpectedCompletionWriteResult.RequestNotFound => NotFound(),
            ExpectedCompletionWriteResult.RequestNotActive => Conflict(new { code = "REQUEST_NOT_ACTIVE" }),
            ExpectedCompletionWriteResult.InvalidTarget => BadRequest(new { code = "INVALID_EXPECTED_COMPLETION" }),
            ExpectedCompletionWriteResult.InvalidReason => BadRequest(new { code = "INVALID_REASON" }),
            ExpectedCompletionWriteResult.InvalidActor => Unauthorized(),
            _ => Conflict(new { code = "EXPECTED_COMPLETION_CONFLICT" })
        };
    }
}

public sealed record SetExpectedCompletionRequest(DateTimeOffset ExpectedCompletionAtUtc, string? Reason);
