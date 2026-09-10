using System.Security.Claims;
using Betcco.Application.Commerce;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/wallet")]
public sealed class TeacherWalletController(IWalletService wallet) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) => Ok(await wallet.GetTeacherWalletAsync(UserId, cancellationToken));

    [HttpPost("withdrawals")]
    public async Task<IActionResult> RequestWithdrawal(CreatePayoutRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var payout = await wallet.CreatePayoutRequestAsync(UserId, request, cancellationToken);
            return payout is null ? BadRequest(new { message = "Unable to create the withdrawal request." }) : Ok(payout);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/wallet")]
public sealed class AdminWalletController(IWalletService wallet) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) => Ok(await wallet.GetAdminWalletAsync(cancellationToken));

    [HttpPost("payouts/{payoutId:guid}/approve")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Approve(Guid payoutId, PayoutReviewRequest request, CancellationToken cancellationToken) => await wallet.ApprovePayoutAsync(UserId, payoutId, request.Note, cancellationToken) ? NoContent() : BadRequest(new { message = "Only requested payouts can be approved." });

    [HttpPost("payouts/{payoutId:guid}/reject")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Reject(Guid payoutId, PayoutReviewRequest request, CancellationToken cancellationToken) => await wallet.RejectPayoutAsync(UserId, payoutId, request.Note, cancellationToken) ? NoContent() : BadRequest(new { message = "This payout cannot be rejected." });

    [HttpPost("payouts/{payoutId:guid}/execute")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Execute(Guid payoutId, CancellationToken cancellationToken)
    {
        try
        {
            var payout = await wallet.ExecutePayoutAsync(UserId, payoutId, cancellationToken);
            return payout is null ? BadRequest(new { message = "Only approved payouts can be paid." }) : Ok(payout);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("payouts/{payoutId:guid}/settle")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Settle(Guid payoutId, CancellationToken cancellationToken)
    {
        var payout = await wallet.SettlePayoutAsync(UserId, payoutId, cancellationToken);
        return payout is null ? BadRequest(new { message = "Only provider-confirmed payouts can be settled." }) : Ok(payout);
    }

    [HttpGet("payouts/{payoutId:guid}/history")]
    public async Task<IActionResult> History(Guid payoutId, CancellationToken cancellationToken)
    {
        var history = await wallet.GetPayoutHistoryAsync(payoutId, cancellationToken);
        return history is null ? NotFound() : Ok(history);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

public sealed record PayoutReviewRequest(string? Note);
