using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/evaluation-appeals")]
public sealed class EvaluationAppealsController(IEvaluationAppealService appeals) : ControllerBase
{
    [Authorize(Policy = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken cancellationToken) => Ok(await appeals.ListMineAsync(UserId, cancellationToken));

    [Authorize(Policy = "Student")]
    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateEvaluationAppealCommand command, CancellationToken cancellationToken)
    {
        var appeal = await appeals.CreateAsync(UserId, command, cancellationToken);
        return appeal is null ? BadRequest(new { message = "You can appeal a released evaluation once at a time with a documented reason." }) : Ok(appeal);
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{appealId:guid}/withdraw")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Withdraw(Guid appealId, CancellationToken cancellationToken) =>
        await appeals.WithdrawAsync(UserId, appealId, cancellationToken) ? NoContent() : NotFound();

    [Authorize(Policy = "AssessmentAppealReviewer")]
    [HttpGet("review-queue")]
    public async Task<IActionResult> ReviewQueue(CancellationToken cancellationToken) => Ok(await appeals.ListForReviewAsync(cancellationToken));

    [Authorize(Policy = "AssessmentAppealReviewer")]
    [HttpPost("{appealId:guid}/review")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Review(Guid appealId, ReviewEvaluationAppealCommand command, CancellationToken cancellationToken) =>
        await appeals.ReviewAsync(UserId, appealId, command, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "A lead verifier independent from the original assessment must record an upheld or rejected decision with a rationale." });

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
