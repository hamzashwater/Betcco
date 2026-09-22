using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "AssessmentAppealReviewer")]
[Route("api/v1/retakes")]
public sealed class RetakesController(IRetakeService retakes) : ControllerBase
{
    [HttpGet("eligible")]
    public async Task<IActionResult> Eligible(CancellationToken cancellationToken) =>
        Ok(await retakes.ListEligibleAsync(UserId, cancellationToken));

    [HttpPost("{originalEvaluationRequestId:guid}/authorize")]
    public async Task<IActionResult> Authorize(Guid originalEvaluationRequestId,
        AuthorizeRetakeCommand command, CancellationToken cancellationToken)
    {
        var result = await retakes.AuthorizeAsync(UserId, originalEvaluationRequestId, command, cancellationToken);
        return result.Status switch
        {
            RetakeAuthorizationStatus.Created => CreatedAtAction(nameof(EvaluationsController.Get), "Evaluations",
                new { requestId = result.Authorization!.RetakeEvaluationRequestId }, result.Authorization),
            RetakeAuthorizationStatus.Forbidden => Forbid(),
            RetakeAuthorizationStatus.NotEligible => BadRequest(new { message = "The original evaluation is not eligible for a Retake." }),
            RetakeAuthorizationStatus.InvalidScope => BadRequest(new { message = "Select a compatible Pass-only Retake assessment and provide a reason." }),
            RetakeAuthorizationStatus.Conflict => Conflict(new { message = "A Retake has already been created for this evaluation." }),
            _ => BadRequest()
        };
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
