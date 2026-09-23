using System.Security.Claims;
using System.Text.Json;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[EnableRateLimiting("write")]
[Route("api/v1/admin/academic-records")]
public sealed class AdminAcademicStatusController(BetccoDbContext db) : ControllerBase
{
    [HttpPut("qualifications/{id:guid}/status")]
    public async Task<IActionResult> Qualification(Guid id, AcademicRecordStatusRequest request, CancellationToken cancellationToken)
    {
        var item = await db.Qualifications.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (!request.IsActive && await db.DeliveryPlans.AnyAsync(x => x.IsActive && x.QualificationVersion!.QualificationId == id, cancellationToken))
            return Conflict(new ProblemDetails { Status = 409, Title = "Deactivate active delivery plans first" });
        item.IsActive = request.IsActive;
        Audit("QualificationStatusChanged", id, request.IsActive);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("versions/{id:guid}/status")]
    public async Task<IActionResult> Version(Guid id, AcademicRecordStatusRequest request, CancellationToken cancellationToken)
    {
        var item = await db.QualificationVersions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (!request.IsActive && await db.DeliveryPlans.AnyAsync(x => x.IsActive && x.QualificationVersionId == id, cancellationToken))
            return Conflict(new ProblemDetails { Status = 409, Title = "Deactivate active delivery plans first" });
        item.IsActive = request.IsActive;
        Audit("QualificationVersionStatusChanged", id, request.IsActive);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("units/{id:guid}/status")]
    public async Task<IActionResult> Unit(Guid id, AcademicRecordStatusRequest request, CancellationToken cancellationToken)
    {
        var item = await db.UnitDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (!request.IsActive && await db.DeliveryPlanEntries.AnyAsync(x => x.UnitDefinitionId == id && x.DeliveryPlan!.IsActive, cancellationToken))
            return Conflict(new ProblemDetails { Status = 409, Title = "Deactivate active delivery plans first" });
        if (request.IsActive && item.Source == AcademicSource.AdminCustom)
            item.PublishedAtUtc ??= DateTimeOffset.UtcNow;
        item.IsActive = request.IsActive;
        Audit("AcademicUnitStatusChanged", id, request.IsActive);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("units/{id:guid}/arabic-localization")]
    public async Task<IActionResult> UnitArabicLocalization(Guid id, AcademicArabicLocalizationRequest request, CancellationToken cancellationToken)
    {
        var unit = await db.UnitDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (unit is null) return NotFound();
        // Pearson source ownership applies to code, English identity and reference.
        // The Arabic display field is BETCCO-localized and may be corrected by SystemAdmin.
        var title = request.ArabicTitle?.Trim() ?? string.Empty;
        if (unit.Source != AcademicSource.PearsonOfficial || title.Length is < 3 or > 256
            || title == unit.EnglishTitle || !title.Any(ch => ch is >= '\u0621' and <= '\u064A'))
            return BadRequest(new ProblemDetails { Status = 400, Title = "Invalid BETCCO Arabic localization" });
        if (unit.ArabicTitle == title) return NoContent();
        var previousTitle = unit.ArabicTitle;
        unit.ArabicTitle = title;
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            Action = "OfficialUnitArabicLocalizationChanged",
            EntityType = nameof(UnitDefinition),
            EntityId = unit.Id.ToString(),
            Outcome = "Success",
            MetadataJson = JsonSerializer.Serialize(new { previousTitle, arabicTitle = title })
        });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private void Audit(string action, Guid id, bool isActive) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        Action = action,
        EntityType = action switch
        {
            "QualificationStatusChanged" => "Qualification",
            "QualificationVersionStatusChanged" => "QualificationVersion",
            _ => "UnitDefinition"
        },
        EntityId = id.ToString(),
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(new { isActive })
    });
}

public sealed record AcademicRecordStatusRequest(bool IsActive);
public sealed record AcademicArabicLocalizationRequest(string ArabicTitle);
