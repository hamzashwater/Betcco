using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/security")]
public sealed class SecurityController(IAntiforgery antiforgery) : ControllerBase
{
    [HttpGet("antiforgery")]
    public IActionResult GetAntiforgeryToken()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new { token = tokens.RequestToken });
    }
}
