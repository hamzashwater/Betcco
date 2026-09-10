using System.Security.Claims;
using System.Text.Json.Serialization;
using Betcco.Application.Commerce;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/payments")]
public sealed class PaymentsController(ICommerceService commerce, IWebHostEnvironment environment) : ControllerBase
{
    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    [HttpPost("paytabs/callback")]
    [EnableRateLimiting("webhook")]
    public async Task<IActionResult> PayTabsCallback(PayTabsCallbackRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CartId) || request.CartId.Length > 100 || string.IsNullOrWhiteSpace(request.TransactionReference) || request.TransactionReference.Length > 160)
            return BadRequest(new { message = "Invalid payment callback reference." });
        return await commerce.ConfirmPayTabsCallbackAsync(request.CartId.Trim(), request.TransactionReference.Trim(), cancellationToken)
            ? Ok(new { status = "accepted" })
            : BadRequest(new { message = "Payment verification was not accepted." });
    }

    /// <summary>
    /// Development-only confirmation for the local payment adapter. This is deliberately
    /// not exposed as a provider webhook and may only confirm the signed-in student's own
    /// fake payment. Production requires a provider-verified webhook or server verification.
    /// </summary>
    [Authorize(Policy = "Student")]
    [HttpPost("fake/confirm")]
    [EnableRateLimiting("webhook")]
    public async Task<IActionResult> ConfirmDevelopmentPayment(FakeWebhookRequest request, CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment()) return NotFound();
        if (string.IsNullOrWhiteSpace(request.ProviderEventId) || request.ProviderEventId.Trim().Length > 160)
            return BadRequest(new { message = "A valid development payment confirmation reference is required." });
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();
        return await commerce.ConfirmFakeWebhookAsync(request.PaymentId, request.ProviderEventId.Trim(), userId, cancellationToken)
            ? Ok(new { status = "accepted" })
            : BadRequest(new { message = "This development payment cannot be confirmed for the current account." });
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{paymentId:guid}/cancel")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CancelPayment(Guid paymentId, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();
        var result = await commerce.CancelProcessingPaymentAsync(userId, paymentId, cancellationToken);
        if (result.IsCancelled) return Ok(new { status = "cancelled", replay = result.IsIdempotentReplay });
        return Conflict(new { code = result.FailureCode, message = result.FailureMessage });
    }
}

public sealed record FakeWebhookRequest(Guid PaymentId, string ProviderEventId);
public sealed record PayTabsCallbackRequest(
    [property: JsonPropertyName("cart_id")] string? CartId,
    [property: JsonPropertyName("tran_ref")] string? TransactionReference);
