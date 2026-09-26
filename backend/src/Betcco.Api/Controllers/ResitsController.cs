using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/resits")]
public sealed class ResitsController(IResitService resits) : ControllerBase
{
    [HttpGet("eligible")]
    public async Task<IActionResult> Eligible(CancellationToken cancellationToken)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        return Ok(await resits.ListEligibleAsync(actorUserId, cancellationToken));
    }

    [HttpGet("authorizations")]
    public async Task<IActionResult> Authorizations(CancellationToken cancellationToken)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        return Ok(await resits.ListAuthorizationsAsync(actorUserId, cancellationToken));
    }

    [HttpPost("{originalEvaluationRequestId:guid}/authorize")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Authorize(
        Guid originalEvaluationRequestId,
        AuthorizeResitCommand command,
        CancellationToken cancellationToken)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        return Map(await resits.AuthorizeAsync(
            actorUserId,
            originalEvaluationRequestId,
            command,
            cancellationToken));
    }

    [HttpPost("authorizations/{authorizationId:guid}/revoke")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Revoke(
        Guid authorizationId,
        RevokeResitAuthorizationCommand command,
        CancellationToken cancellationToken)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        return Map(await resits.RevokeAsync(
            actorUserId,
            authorizationId,
            command,
            cancellationToken));
    }

    private bool TryActor(out Guid actorUserId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out actorUserId);

    private IActionResult Map(ResitAuthorizationWriteResult result) => result.Status switch
    {
        ResitAuthorizationWriteStatus.Created => Ok(result.Authorization),
        ResitAuthorizationWriteStatus.Revoked => Ok(result.Authorization),
        ResitAuthorizationWriteStatus.NotFound => NotFound(),
        ResitAuthorizationWriteStatus.NotEligible =>
            Conflict(new { code = "RESIT_NOT_ELIGIBLE" }),
        ResitAuthorizationWriteStatus.Invalid =>
            BadRequest(new { code = "INVALID_RESIT_AUTHORIZATION" }),
        ResitAuthorizationWriteStatus.InvalidActor => Unauthorized(),
        ResitAuthorizationWriteStatus.AlreadyActivated =>
            Conflict(new { code = "RESIT_ALREADY_ACTIVATED" }),
        _ => Conflict(new { code = "RESIT_AUTHORIZATION_CONFLICT" })
    };
}
