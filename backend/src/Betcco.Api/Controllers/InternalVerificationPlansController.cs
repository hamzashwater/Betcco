using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "InternalVerificationPlanner")]
[Route("api/v1/internal-verification/plans")]
public sealed class InternalVerificationPlansController(
    IInternalVerificationSamplingService sampling,
    BetccoDbContext db) : ControllerBase
{
    [HttpGet("eligible-staff")]
    public async Task<IActionResult> EligibleStaff(CancellationToken cancellationToken)
    {
        var allowedRoles = new[]
        {
            PlatformRoles.Teacher,
            PlatformRoles.Assessor,
            PlatformRoles.InternalVerifier,
            PlatformRoles.LeadInternalVerifier,
            PlatformRoles.Admin
        };
        var staff = await (
                from user in db.Users.AsNoTracking()
                join userRole in db.UserRoles.AsNoTracking() on user.Id equals userRole.UserId
                join role in db.Roles.AsNoTracking() on userRole.RoleId equals role.Id
                where !user.IsFrozen && allowedRoles.Contains(role.Name!)
                select new { user.Id, user.DisplayName, user.Email, Role = role.Name! })
            .Take(500)
            .ToListAsync(cancellationToken);
        return Ok(staff
            .GroupBy(item => new { item.Id, item.DisplayName, item.Email })
            .OrderBy(item => item.Key.DisplayName)
            .Select(item => new
            {
                id = item.Key.Id.ToString(),
                item.Key.DisplayName,
                item.Key.Email,
                roles = item.Select(row => row.Role).Order().ToArray()
            }));
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await sampling.ListPlansAsync(cancellationToken));

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateInternalVerificationPlanCommand command, CancellationToken cancellationToken)
    {
        var plan = await sampling.CreatePlanAsync(UserId, command, cancellationToken);
        return plan is null
            ? BadRequest(new { message = "Provide a valid academic scope, documented rationale, and active staff accounts." })
            : CreatedAtAction(nameof(List), new { plan.Id }, plan);
    }

    [HttpGet("{planId:guid}/candidates")]
    public async Task<IActionResult> Candidates(Guid planId, [FromQuery] int take = 50, CancellationToken cancellationToken = default)
    {
        var candidates = await sampling.ListCandidatesAsync(UserId, planId, take, cancellationToken);
        return candidates is null ? NotFound() : Ok(candidates);
    }

    [HttpPost("{planId:guid}/samples")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> SelectSample(Guid planId, SelectInternalVerificationSampleCommand command, CancellationToken cancellationToken)
    {
        var selected = await sampling.SelectSampleAsync(UserId, planId, command, cancellationToken);
        return selected
            ? NoContent()
            : BadRequest(new { message = "The assessment must match the active plan, be pending review, and use an independent eligible verifier." });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
