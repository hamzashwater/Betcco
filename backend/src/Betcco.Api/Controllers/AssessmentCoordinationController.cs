using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/assessment-coordination")]
public sealed class AssessmentCoordinationController(IAssessmentCoordinationService coordination) : ControllerBase
{
    [HttpGet("queue")]
    public async Task<ActionResult<AssessmentCoordinationPage>> Queue(
        [FromQuery] string? status = null,
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

        return Ok(await coordination.QueueAsync(selectedStatus, page, pageSize, cancellationToken));
    }
}
