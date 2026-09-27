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
    public async Task<IActionResult> Eligible(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        try
        {
            return Ok(await resits.ListEligibleAsync(actorUserId, page, pageSize, cancellationToken));
        }
        catch (ArgumentOutOfRangeException)
        {
            return InvalidPage();
        }
    }

    [HttpGet("authorizations")]
    public async Task<IActionResult> Authorizations(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!TryActor(out var actorUserId)) return Unauthorized();
        try
        {
            return Ok(await resits.ListAuthorizationsAsync(actorUserId, page, pageSize, cancellationToken));
        }
        catch (ArgumentOutOfRangeException)
        {
            return InvalidPage();
        }
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


    private BadRequestObjectResult InvalidPage() => BadRequest(new
    {
        code = "RESIT_PAGE_INVALID",
        message = "Use page >= 1 and pageSize between 1 and 50."
    });

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