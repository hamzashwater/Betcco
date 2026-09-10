using System.Security.Claims;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/taxonomy")]
public sealed class TeacherTaxonomyController(BetccoDbContext db) : ControllerBase
{
    [HttpPost("subjects")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateSubject(CreateTeacherSubjectRequest request, CancellationToken cancellationToken)
    {
        var arabicName = request.ArabicName?.Trim();
        var englishName = request.EnglishName?.Trim();
        if (string.IsNullOrWhiteSpace(arabicName) || string.IsNullOrWhiteSpace(englishName)
            || arabicName.Length > 120 || englishName.Length > 120)
            return BadRequest(new { message = "Provide Arabic and English subject names of up to 120 characters." });

        var specialization = await db.Specializations.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == request.SpecializationId && item.IsVisible, cancellationToken);
        if (specialization is null)
            return BadRequest(new { message = "Select an available specialization before adding a subject." });

        var normalizedArabic = arabicName.ToUpperInvariant();
        var normalizedEnglish = englishName.ToUpperInvariant();
        var duplicate = await db.Subjects.AsNoTracking().AnyAsync(item =>
            item.SpecializationId == specialization.Id
            && (item.ArabicName.ToUpper() == normalizedArabic || item.EnglishName.ToUpper() == normalizedEnglish),
            cancellationToken);
        if (duplicate)
            return Conflict(new { code = "SUBJECT_ALREADY_EXISTS", message = "A subject with this name already exists for the selected specialization." });

        var subject = new Subject
        {
            ArabicName = arabicName,
            EnglishName = englishName,
            Slug = await UniqueSlugAsync(englishName, cancellationToken),
            SpecializationId = specialization.Id,
            IsVisible = false,
            SortOrder = (await db.Subjects.Where(item => item.SpecializationId == specialization.Id)
                .Select(item => (int?)item.SortOrder)
                .MaxAsync(cancellationToken) ?? 0) + 1,
            CreatedByUserId = UserId,
            UpdatedByUserId = UserId
        };
        db.Subjects.Add(subject);
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = "TeacherSubjectProposed",
            EntityType = nameof(Subject),
            EntityId = subject.Id.ToString(),
            Outcome = "Success",
            MetadataJson = $"{{\"specializationId\":\"{specialization.Id}\"}}"
        });
        await db.SaveChangesAsync(cancellationToken);

        var arabic = Request.Headers.AcceptLanguage.ToString().StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        return Created($"/api/v1/teacher/taxonomy/subjects/{subject.Id}", new
        {
            subject.Id,
            name = arabic ? subject.ArabicName : subject.EnglishName,
            subject.SpecializationId,
            isPendingReview = true
        });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<string> UniqueSlugAsync(string name, CancellationToken cancellationToken)
    {
        var baseSlug = string.Concat(name.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-')).Trim('-');
        if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "subject";
        var candidate = baseSlug;
        var suffix = 2;
        while (await db.Subjects.AnyAsync(item => item.Slug == candidate, cancellationToken))
            candidate = $"{baseSlug}-{suffix++}";
        return candidate;
    }
}

public sealed record CreateTeacherSubjectRequest(Guid SpecializationId, string? ArabicName, string? EnglishName);
