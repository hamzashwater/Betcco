using System.Security.Claims;
using System.Text;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "AssessmentAppealReviewer")]
[Route("api/v1/assessment-audit-exports")]
public sealed class AssessmentAuditExportsController(IAssessmentAuditExportService exports) : ControllerBase
{
    [HttpGet("{evaluationRequestId:guid}")]
    public async Task<IActionResult> Download(Guid evaluationRequestId, CancellationToken cancellationToken)
    {
        var export = await exports.CreateAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!, evaluationRequestId, cancellationToken);
        return export is null
            ? NotFound()
            : File(Encoding.UTF8.GetBytes(export.JsonContent), "application/json", export.FileName, enableRangeProcessing: false);
    }
}
