using System.Security.Claims;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/settings")]
public sealed class SettingsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet("public")]
    public async Task<IActionResult> GetPublic([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var settings = await db.SiteSettings.AsNoTracking().Where(x => x.IsPublic).ToListAsync(cancellationToken);
        return Ok(settings.ToDictionary(x => x.Key, x => locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? x.ArabicValue : x.EnglishValue));
    }

    [Authorize(Policy = "Admin")]
    [HttpPut("{key}")]
    public async Task<IActionResult> Set(string key, UpdateSettingRequest request, CancellationToken cancellationToken)
    {
        var setting = await db.SiteSettings.SingleOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (setting is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = key, ArabicValue = request.ArabicValue.Trim(), EnglishValue = request.EnglishValue.Trim(), IsPublic = request.IsPublic });
        }
        else
        {
            setting.ArabicValue = request.ArabicValue.Trim(); setting.EnglishValue = request.EnglishValue.Trim(); setting.IsPublic = request.IsPublic;
        }
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            Action = "SiteSettingUpdated",
            EntityType = nameof(SiteSetting),
            EntityId = key,
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}

public sealed record UpdateSettingRequest(string ArabicValue, string EnglishValue, bool IsPublic);
