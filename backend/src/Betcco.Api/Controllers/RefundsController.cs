using System.Security.Claims;
using Betcco.Application.Commerce;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/refunds")]
public sealed class RefundsController(IRefundService refunds) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> RecordInternal(RecordInternalRefund request, CancellationToken cancellationToken)
    {
        var result = await refunds.RecordInternalRefundAsync(UserId, request, cancellationToken);
        if (result.Refund is null) return BadRequest(new { code = result.FailureCode, message = result.FailureMessage });
        return result.IsIdempotentReplay ? Ok(result.Refund) : StatusCode(StatusCodes.Status201Created, result.Refund);
    }

    [HttpPost("paytabs")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> InitiatePayTabs(InitiatePayTabsRefund request, CancellationToken cancellationToken)
    {
        var result = await refunds.InitiatePayTabsRefundAsync(UserId, request, cancellationToken);
        if (result.Refund is null) return BadRequest(new { code = result.FailureCode, message = result.FailureMessage });
        return result.IsIdempotentReplay ? Ok(result.Refund) : StatusCode(StatusCodes.Status202Accepted, result.Refund);
    }

    [HttpPost("{refundId:guid}/paytabs/verify")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> VerifyPayTabs(Guid refundId, CancellationToken cancellationToken)
    {
        var result = await refunds.VerifyPayTabsRefundAsync(UserId, refundId, cancellationToken);
        if (result.Refund is null) return NotFound(new { code = result.FailureCode, message = result.FailureMessage });
        if (result.FailureCode is not null) return Conflict(new { code = result.FailureCode, message = result.FailureMessage, refund = result.Refund });
        return Ok(result.Refund);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
