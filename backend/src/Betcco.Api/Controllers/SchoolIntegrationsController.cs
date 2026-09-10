using Betcco.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/v1/admin/integrations/school")]
public sealed class SchoolIntegrationsController(ISchoolIntegrationProvider schoolIntegration) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken) => Ok(await schoolIntegration.GetStatusAsync(false, cancellationToken));

    [HttpPost("test-connection")]
    public async Task<IActionResult> TestConnection(CancellationToken cancellationToken) => Ok(await schoolIntegration.GetStatusAsync(true, cancellationToken));
}
