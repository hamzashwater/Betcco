using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[EnableRateLimiting("write")]
[Route("api/v1/admin/academic-catalogue")]
public sealed class AdminAcademicCatalogueController(IAcademicCatalogueService catalogue) : ControllerBase
{
    [HttpGet("versions")]
    public async Task<IActionResult> Versions(CancellationToken cancellationToken) => Ok(await catalogue.ListVersionsAsync(cancellationToken));

    [HttpGet("versions/{id:guid}")]
    public async Task<IActionResult> Version(Guid id, CancellationToken cancellationToken) =>
        await catalogue.GetVersionAsync(id, cancellationToken) is { } value ? Ok(value) : NotFound();

    [HttpPost("units")]
    public Task<IActionResult> CreateUnit(SaveAcademicUnit command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveUnitAsync(null, command, ActorId, cancellationToken) });

    [HttpPut("units/{id:guid}")]
    public Task<IActionResult> UpdateUnit(Guid id, SaveAcademicUnit command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveUnitAsync(id, command, ActorId, cancellationToken) });

    [HttpPost("aims")]
    public Task<IActionResult> CreateAim(SaveAcademicAim command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveAimAsync(null, command, ActorId, cancellationToken) });

    [HttpPut("aims/{id:guid}")]
    public Task<IActionResult> UpdateAim(Guid id, SaveAcademicAim command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveAimAsync(id, command, ActorId, cancellationToken) });

    [HttpPost("criteria")]
    public Task<IActionResult> CreateCriterion(SaveAcademicCriterion command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveCriterionAsync(null, command, ActorId, cancellationToken) });

    [HttpPut("criteria/{id:guid}")]
    public Task<IActionResult> UpdateCriterion(Guid id, SaveAcademicCriterion command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveCriterionAsync(id, command, ActorId, cancellationToken) });

    [HttpPost("definitions")]
    public Task<IActionResult> CreateDefinition(SaveAcademicDefinition command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveDefinitionAsync(null, command, ActorId, cancellationToken) });

    [HttpPut("definitions/{id:guid}")]
    public Task<IActionResult> UpdateDefinition(Guid id, SaveAcademicDefinition command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveDefinitionAsync(id, command, ActorId, cancellationToken) });

    [HttpPut("definitions/{id:guid}/mappings")]
    public Task<IActionResult> MapDefinition(Guid id, SaveAcademicMappings command, CancellationToken cancellationToken) =>
        Write(async () => { await catalogue.SetMappingsAsync(id, command, ActorId, cancellationToken); return new { id }; });

    [HttpGet("definitions/{id:guid}/validation")]
    public Task<IActionResult> DefinitionValidation(Guid id, CancellationToken cancellationToken) =>
        Write(async () => new { issues = await catalogue.ValidateDefinitionAsync(id, cancellationToken) });

    [HttpPost("definitions/{id:guid}/publish")]
    public Task<IActionResult> PublishDefinition(Guid id, CancellationToken cancellationToken) =>
        Write(async () => { await catalogue.PublishDefinitionAsync(id, ActorId, cancellationToken); return new { id }; });

    [HttpPost("scopes")]
    public Task<IActionResult> CreateScope(SaveAcademicScope command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveScopeAsync(null, command, ActorId, cancellationToken) });

    [HttpPut("scopes/{id:guid}")]
    public Task<IActionResult> UpdateScope(Guid id, SaveAcademicScope command, CancellationToken cancellationToken) =>
        Write(async () => new { id = await catalogue.SaveScopeAsync(id, command, ActorId, cancellationToken) });

    [HttpGet("scopes/{id:guid}/validation")]
    public Task<IActionResult> ScopeValidation(Guid id, CancellationToken cancellationToken) =>
        Write(async () => new { issues = await catalogue.ValidateScopeAsync(id, cancellationToken) });

    [HttpPost("scopes/{id:guid}/activate")]
    public Task<IActionResult> ActivateScope(Guid id, CancellationToken cancellationToken) =>
        Write(async () => { await catalogue.ActivateScopeAsync(id, ActorId, cancellationToken); return new { id }; });

    private string ActorId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<IActionResult> Write(Func<Task<object>> action)
    {
        try { return Ok(await action()); }
        catch (AcademicCatalogueException exception) { return BadRequest(new ProblemDetails { Status = 400, Title = "Academic catalogue validation failed", Detail = exception.Message }); }
    }
}
