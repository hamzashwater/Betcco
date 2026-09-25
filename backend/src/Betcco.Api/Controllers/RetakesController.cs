using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "AssessmentAppealReviewer")]
[Route("api/v1/retakes")]
public sealed class RetakesController : ControllerBase
{
    // Legacy compatibility only. BETCCO no longer creates Pearson-style Retake
    // requests; historical records remain readable through EvaluationRequest.
    [HttpGet("eligible")]
    public IActionResult Eligible() => Ok(Array.Empty<object>());

    [HttpPost("{originalEvaluationRequestId:guid}/authorize")]
    public IActionResult Authorize(Guid originalEvaluationRequestId)
    {
        _ = originalEvaluationRequestId;
        return StatusCode(410, new
        {
            code = "BETCCO_REVIEW_FLOW_ONLY",
            message = "New Retake requests are no longer created. BETCCO reviews include one revision check in the original evaluation service."
        });
    }
}
