using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Student")]
[Route("api/v1/student/resit-authorizations")]
public sealed class StudentResitAuthorizationsController(IResitService resits) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var studentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(studentUserId)) return Unauthorized();
        if (page < 1 || pageSize is < 1 or > 50)
            return BadRequest(new { code = "RESIT_PAGE_INVALID" });
        return Ok(await resits.ListStudentAuthorizationsAsync(
            studentUserId, page, pageSize, cancellationToken));
    }

    [HttpPost("{authorizationId:guid}/activate")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Activate(
        Guid authorizationId,
        CancellationToken cancellationToken)
    {
        var studentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(studentUserId)) return Unauthorized();

        var result = await resits.ActivateAsync(
            studentUserId, authorizationId, cancellationToken);
        return result.Status switch
        {
            ResitActivationStatus.Activated or ResitActivationStatus.AlreadyActivated => Ok(new
            {
                status = result.Status.ToString(),
                originalEvaluationRequestId = result.OriginalEvaluationRequestId,
                resitEvaluationRequestId = result.ResitEvaluationRequestId
            }),
            ResitActivationStatus.NotFound => NotFound(),
            ResitActivationStatus.InvalidActor => Unauthorized(),
            ResitActivationStatus.Revoked => Conflict(new { code = "RESIT_AUTHORIZATION_REVOKED" }),
            ResitActivationStatus.OriginalNoLongerValid => Conflict(new { code = "RESIT_ORIGINAL_NO_LONGER_VALID" }),
            ResitActivationStatus.AcademicSnapshotInvalid => Conflict(new { code = "RESIT_ACADEMIC_SNAPSHOT_INVALID" }),
            _ => Conflict(new { code = "RESIT_ACTIVATION_CONFLICT" })
        };
    }
}
