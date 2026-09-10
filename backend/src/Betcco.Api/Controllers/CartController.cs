using System.Security.Claims;
using Betcco.Application.Commerce;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Student")]
[Route("api/v1/cart")]
public sealed class CartController(ICommerceService commerce, BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string locale = "ar", CancellationToken cancellationToken = default) => Ok(await commerce.GetCartAsync(await OwnerKeyAsync(cancellationToken), UserId, locale, cancellationToken));

    [HttpPost("courses/{courseId:guid}")]
    public async Task<IActionResult> AddCourse(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        try { return Ok(await commerce.AddCourseAsync(await OwnerKeyAsync(cancellationToken), UserId, courseId, locale, cancellationToken)); }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    [HttpPost("packages/{packageId:guid}")]
    public async Task<IActionResult> AddPackage(Guid packageId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        try { return Ok(await commerce.AddPackageAsync(await OwnerKeyAsync(cancellationToken), UserId, packageId, locale, cancellationToken)); }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    [HttpDelete("items/{itemId:guid}")]
    public async Task<IActionResult> Remove(Guid itemId, CancellationToken cancellationToken) => await commerce.RemoveItemAsync(await OwnerKeyAsync(cancellationToken), UserId, itemId, cancellationToken) ? NoContent() : NotFound();

    [Authorize(Policy = "Student")]
    [HttpPost("checkout")]
    [EnableRateLimiting("checkout")]
    public async Task<IActionResult> Checkout(CheckoutRequest request, CancellationToken cancellationToken)
    {
        var idempotencyKey = Request.Headers["Idempotency-Key"].ToString();
        try
        {
            var result = await commerce.CreateCourseCheckoutAsync(UserId!, await OwnerKeyAsync(cancellationToken), request.CouponCode, request.PaymentMethod, idempotencyKey, cancellationToken);
            return result is null ? BadRequest(new { message = "Your cart is empty." }) : Ok(result);
        }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    private async Task<string> OwnerKeyAsync(CancellationToken cancellationToken)
    {
        var key = Request.Cookies["betcco.cart"];
        var shouldSetCookie = string.IsNullOrWhiteSpace(key);
        if (shouldSetCookie) key = Guid.NewGuid().ToString("N");
        if (UserId is not null)
        {
            var cartUserId = await db.Carts.AsNoTracking().Where(cart => cart.OwnerKey == key).Select(cart => cart.UserId).SingleOrDefaultAsync(cancellationToken);
            if (cartUserId is not null && cartUserId != UserId)
            {
                key = Guid.NewGuid().ToString("N");
                shouldSetCookie = true;
            }
        }
        if (shouldSetCookie) Response.Cookies.Append("betcco.cart", key!, new CookieOptions { HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Lax, MaxAge = TimeSpan.FromDays(30) });
        return key!;
    }
    private string? UserId => User.Identity?.IsAuthenticated == true ? User.FindFirstValue(ClaimTypes.NameIdentifier) : null;
}

public sealed record CheckoutRequest(string? CouponCode, string? PaymentMethod);
