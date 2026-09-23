using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Betcco.Domain.Learning;
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
[Route("api/v1/admin/academic-taxonomy")]
public sealed class AdminAcademicTaxonomyController(BetccoDbContext db) : ControllerBase
{
    [HttpGet("specializations")]
    public async Task<IActionResult> Specializations(CancellationToken cancellationToken) => Ok(await db.Specializations.AsNoTracking()
        .OrderBy(x => x.LearningTrackId).ThenBy(x => x.SortOrder).ThenBy(x => x.Slug)
        .Select(x => new { x.Id, x.LearningTrackId, x.Slug, x.ArabicName, x.EnglishName, x.IsVisible, x.SortOrder })
        .ToArrayAsync(cancellationToken));

    [HttpPost("specializations")]
    public async Task<IActionResult> CreateSpecialization(SaveAcademicTaxonomyRequest request, CancellationToken cancellationToken)
    {
        if (!Valid(request) || !await db.LearningTracks.AnyAsync(x => x.Id == request.LearningTrackId && x.IsBtecFocused, cancellationToken)
            || await db.Specializations.AnyAsync(x => x.LearningTrackId == request.LearningTrackId && x.Slug == request.Slug.Trim().ToLowerInvariant(), cancellationToken))
            return BadRequest(new ProblemDetails { Status = 400, Title = "Invalid or duplicate specialization" });
        var item = new Specialization
        {
            LearningTrackId = request.LearningTrackId,
            Slug = request.Slug.Trim().ToLowerInvariant(),
            ArabicName = request.ArabicName.Trim(),
            EnglishName = request.EnglishName.Trim(),
            SortOrder = request.SortOrder,
            IsVisible = true
        };
        db.Specializations.Add(item);
        Audit("SpecializationCreated", item.Id, new { item.Slug });
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/admin/academic-taxonomy/specializations/{item.Id}", new { item.Id });
    }

    [HttpPut("specializations/{id:guid}")]
    public async Task<IActionResult> UpdateSpecialization(Guid id, SaveAcademicTaxonomyRequest request, CancellationToken cancellationToken)
    {
        var item = await db.Specializations.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (!Valid(request) || request.LearningTrackId != item.LearningTrackId || request.Slug.Trim().ToLowerInvariant() != item.Slug
            || (!request.IsVisible && await db.DeliveryPlans.AnyAsync(x => x.IsActive && x.QualificationVersion!.Qualification!.SpecializationId == id, cancellationToken)))
            return BadRequest(new ProblemDetails { Status = 400, Title = "Invalid specialization change or active plans exist" });
        item.ArabicName = request.ArabicName.Trim();
        item.EnglishName = request.EnglishName.Trim();
        item.SortOrder = request.SortOrder;
        item.IsVisible = request.IsVisible;
        Audit("SpecializationUpdated", item.Id, new { item.IsVisible });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("grades")]
    public async Task<IActionResult> Grades(CancellationToken cancellationToken) => Ok(await db.Grades.AsNoTracking()
        .OrderBy(x => x.LearningTrackId).ThenBy(x => x.SortOrder).ThenBy(x => x.Slug)
        .Select(x => new { x.Id, x.LearningTrackId, x.Slug, x.ArabicName, x.EnglishName, x.IsVisible, x.SortOrder })
        .ToArrayAsync(cancellationToken));

    [HttpPost("grades")]
    public async Task<IActionResult> CreateGrade(SaveAcademicTaxonomyRequest request, CancellationToken cancellationToken)
    {
        if (!Valid(request) || !await db.LearningTracks.AnyAsync(x => x.Id == request.LearningTrackId && x.IsBtecFocused, cancellationToken)
            || await db.Grades.AnyAsync(x => x.LearningTrackId == request.LearningTrackId && x.Slug == request.Slug.Trim().ToLowerInvariant(), cancellationToken))
            return BadRequest(new ProblemDetails { Status = 400, Title = "Invalid or duplicate grade" });
        var item = new Grade
        {
            LearningTrackId = request.LearningTrackId,
            Slug = request.Slug.Trim().ToLowerInvariant(),
            ArabicName = request.ArabicName.Trim(),
            EnglishName = request.EnglishName.Trim(),
            SortOrder = request.SortOrder,
            IsVisible = true
        };
        db.Grades.Add(item);
        Audit("GradeCreated", item.Id, new { item.Slug });
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/admin/academic-taxonomy/grades/{item.Id}", new { item.Id });
    }

    [HttpPut("grades/{id:guid}")]
    public async Task<IActionResult> UpdateGrade(Guid id, SaveAcademicTaxonomyRequest request, CancellationToken cancellationToken)
    {
        var item = await db.Grades.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null) return NotFound();
        if (!Valid(request) || request.LearningTrackId != item.LearningTrackId || request.Slug.Trim().ToLowerInvariant() != item.Slug
            || (!request.IsVisible && await db.DeliveryPlans.AnyAsync(x => x.GradeId == id && x.IsActive, cancellationToken)))
            return BadRequest(new ProblemDetails { Status = 400, Title = "Invalid grade change or active plans exist" });
        item.ArabicName = request.ArabicName.Trim();
        item.EnglishName = request.EnglishName.Trim();
        item.SortOrder = request.SortOrder;
        item.IsVisible = request.IsVisible;
        Audit("GradeUpdated", item.Id, new { item.IsVisible });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static bool Valid(SaveAcademicTaxonomyRequest request) => request.LearningTrackId != Guid.Empty
        && !string.IsNullOrWhiteSpace(request.Slug) && Regex.IsMatch(request.Slug.Trim(), "^[a-z0-9]+(?:-[a-z0-9]+)*$")
        && request.Slug.Length <= 100 && !string.IsNullOrWhiteSpace(request.ArabicName) && request.ArabicName.Length <= 120
        && !string.IsNullOrWhiteSpace(request.EnglishName) && request.EnglishName.Length <= 120
        && request.SortOrder is >= 0 and <= 10_000;

    private void Audit(string action, Guid id, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        Action = action,
        EntityType = action.StartsWith("Grade", StringComparison.Ordinal) ? nameof(Grade) : nameof(Specialization),
        EntityId = id.ToString(),
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(metadata)
    });
}

public sealed record SaveAcademicTaxonomyRequest(Guid LearningTrackId, string Slug, string ArabicName,
    string EnglishName, int SortOrder, bool IsVisible = true);
