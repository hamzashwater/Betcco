using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[Route("api/v1/qualification-registry")]
public sealed class QualificationRegistryController(IQualificationRegistryService registry) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) => Ok(await registry.ListAsync(cancellationToken));

    [HttpPost("qualifications")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateQualification(CreateQualificationCommand command, CancellationToken cancellationToken)
    {
        var qualification = await registry.CreateQualificationAsync(UserId, command, cancellationToken);
        return qualification is null
            ? BadRequest(new { message = "A qualification requires a unique code and Arabic and English names." })
            : Created($"/api/v1/qualification-registry/qualifications/{qualification.Id}", qualification);
    }

    [HttpPost("versions")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateVersion(CreateQualificationVersionCommand command, CancellationToken cancellationToken)
    {
        var version = await registry.CreateVersionAsync(UserId, command, cancellationToken);
        return version is null
            ? BadRequest(new { message = "The version, source reference, and effective dates are invalid or duplicate." })
            : Ok(version);
    }

    [HttpGet("rubrics")]
    public async Task<IActionResult> Rubrics(CancellationToken cancellationToken) => Ok(await registry.ListRubricBindingsAsync(cancellationToken));

    [HttpPost("rubrics/{rubricTemplateId:guid}/qualification-version/{qualificationVersionId:guid}")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Assign(Guid rubricTemplateId, Guid qualificationVersionId, CancellationToken cancellationToken) =>
        await registry.AssignToRubricAsync(UserId, rubricTemplateId, qualificationVersionId, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "Choose an active qualification version and an existing rubric." });

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
