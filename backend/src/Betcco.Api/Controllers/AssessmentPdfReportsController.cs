using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "AssessmentAppealReviewer")]
[Route("api/v1/assessment-pdf-reports")]
public sealed class AssessmentPdfReportsController(IAssessmentPdfReportService reports) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        isConfigured = reports.IsConfigured,
        unavailableReason = reports.IsConfigured ? null : reports.UnavailableReason
    });

    [HttpGet("{evaluationRequestId:guid}")]
    public async Task<IActionResult> Download(Guid evaluationRequestId, [FromQuery] string? locale, CancellationToken cancellationToken)
    {
        if (!reports.IsConfigured)
            return Problem(
                title: "Assessment PDF reporting is not configured.",
                detail: reports.UnavailableReason,
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: new Dictionary<string, object?> { ["code"] = "assessment_pdf_reporting_unconfigured" });
        var report = await reports.CreateAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!, evaluationRequestId, locale, cancellationToken);
        return report is null ? NotFound() : File(report.Content, "application/pdf", report.FileName);
    }
}
