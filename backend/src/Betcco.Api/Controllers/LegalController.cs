using System.Security.Claims;
using System.Text.Json;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/legal")]
public sealed class LegalController(BetccoDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("required")]
    public async Task<IActionResult> GetRequired([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var documents = await CurrentPublishedDocuments()
            .Where(document => document.Slug == "terms" || document.Slug == "privacy")
            .ToListAsync(cancellationToken);
        return Ok(documents.OrderBy(document => document.Slug).Select(document => new LegalDocumentSummary(
            document.Slug,
            document.Version,
            arabic ? document.ArabicTitle : document.EnglishTitle,
            document.EffectiveAtUtc)));
    }

    [Authorize]
    [HttpGet("required/acceptance-status")]
    public async Task<IActionResult> GetRequiredAcceptanceStatus(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var documents = await CurrentPublishedDocuments()
            .Where(document => document.Slug == "terms" || document.Slug == "privacy")
            .ToListAsync(cancellationToken);
        var documentIds = documents.Select(document => document.Id).ToArray();
        var acceptances = await db.LegalAcceptances.AsNoTracking()
            .Where(acceptance => acceptance.UserId == userId && documentIds.Contains(acceptance.LegalDocumentId))
            .ToListAsync(cancellationToken);

        return Ok(documents.OrderBy(document => document.Slug).Select(document =>
        {
            var acceptedCurrentVersion = acceptances.Any(acceptance =>
                acceptance.LegalDocumentId == document.Id &&
                string.Equals(acceptance.Version, document.Version, StringComparison.Ordinal));
            return new RequiredLegalAcceptanceStatus(
                document.Slug,
                document.Version,
                document.RequiresReacceptance,
                acceptedCurrentVersion,
                document.RequiresReacceptance && !acceptedCurrentVersion);
        }));
    }

    [AllowAnonymous]
    [HttpGet("{slug}")]
    public async Task<IActionResult> Get(string slug, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var document = await CurrentPublishedDocuments().SingleOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (document is null) return NotFound();
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        return Ok(new LegalDocumentView(
            document.Slug,
            document.Version,
            arabic ? document.ArabicTitle : document.EnglishTitle,
            arabic ? document.ArabicContent : document.EnglishContent,
            document.EffectiveAtUtc));
    }

    [Authorize(Policy = "Admin")]
    [HttpGet("admin/documents")]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken) => Ok(await db.LegalDocuments.AsNoTracking()
        .OrderBy(document => document.Slug)
        .ThenByDescending(document => document.IsCurrent)
        .ThenByDescending(document => document.EffectiveAtUtc)
        .Select(document => new AdminLegalDocumentView(document.Id, document.Slug, document.Version, document.ArabicTitle, document.EnglishTitle, document.ArabicContent, document.EnglishContent, document.EffectiveAtUtc, document.IsPublished, document.IsCurrent, document.RequiresReacceptance))
        .ToListAsync(cancellationToken));

    [Authorize(Policy = "Admin")]
    [HttpPut("admin/documents/{slug}")]
    public async Task<IActionResult> Upsert(string slug, UpdateLegalDocumentRequest request, CancellationToken cancellationToken)
    {
        if (!IsSlug(slug) || !IsValid(request)) return BadRequest(new { message = "Enter a valid legal document, version, titles, and content." });
        var input = LegalDocumentVersionInput.From(request);
        var document = await db.LegalDocuments.SingleOrDefaultAsync(item => item.Slug == slug && item.Version == input.Version, cancellationToken);
        var action = "LegalDocumentVersionCreated";

        if (document is null)
        {
            document = new LegalDocument
            {
                Slug = slug,
                Version = input.Version,
                ArabicTitle = input.ArabicTitle,
                EnglishTitle = input.EnglishTitle,
                ArabicContent = input.ArabicContent,
                EnglishContent = input.EnglishContent,
                EffectiveAtUtc = input.EffectiveAtUtc,
                IsPublished = input.IsPublished,
                IsCurrent = false,
                RequiresReacceptance = input.RequiresReacceptance
            };
            db.LegalDocuments.Add(document);
        }
        else
        {
            var hasAcceptances = await db.LegalAcceptances.AnyAsync(acceptance => acceptance.LegalDocumentId == document.Id, cancellationToken);
            if (document.IsPublished || hasAcceptances)
            {
                if (!Matches(document, input))
                    return Conflict(new { code = "LEGAL_VERSION_IMMUTABLE", message = "A published or accepted legal-document version cannot be changed. Create a new version instead." });
                return NoContent();
            }

            Apply(document, input);
            action = "LegalDocumentVersionDraftUpdated";
        }

        if (document.IsPublished)
        {
            var previousCurrentVersions = await db.LegalDocuments
                .Where(item => item.Slug == slug && item.IsCurrent && item.Id != document.Id)
                .ToListAsync(cancellationToken);
            foreach (var previous in previousCurrentVersions)
                previous.IsCurrent = false;
            document.IsCurrent = true;
            action = "LegalDocumentVersionPublished";
        }
        else
        {
            document.IsCurrent = false;
        }

        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            Action = action,
            EntityType = nameof(LegalDocument),
            EntityId = document.Id.ToString(),
            MetadataJson = JsonSerializer.Serialize(new
            {
                document.Slug,
                document.Version,
                document.IsPublished,
                document.IsCurrent,
                document.RequiresReacceptance
            }),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private IQueryable<LegalDocument> CurrentPublishedDocuments() => db.LegalDocuments.AsNoTracking()
        .Where(document => document.IsPublished && document.IsCurrent);

    private static void Apply(LegalDocument document, LegalDocumentVersionInput input)
    {
        document.ArabicTitle = input.ArabicTitle;
        document.EnglishTitle = input.EnglishTitle;
        document.ArabicContent = input.ArabicContent;
        document.EnglishContent = input.EnglishContent;
        document.EffectiveAtUtc = input.EffectiveAtUtc;
        document.IsPublished = input.IsPublished;
        document.RequiresReacceptance = input.RequiresReacceptance;
    }

    private static bool Matches(LegalDocument document, LegalDocumentVersionInput input) =>
        string.Equals(document.Version, input.Version, StringComparison.Ordinal) &&
        string.Equals(document.ArabicTitle, input.ArabicTitle, StringComparison.Ordinal) &&
        string.Equals(document.EnglishTitle, input.EnglishTitle, StringComparison.Ordinal) &&
        string.Equals(document.ArabicContent, input.ArabicContent, StringComparison.Ordinal) &&
        string.Equals(document.EnglishContent, input.EnglishContent, StringComparison.Ordinal) &&
        document.EffectiveAtUtc == input.EffectiveAtUtc &&
        document.IsPublished == input.IsPublished &&
        document.RequiresReacceptance == input.RequiresReacceptance;

    private static bool IsSlug(string value) => value.Length is > 0 and <= 80 && value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');
    private static bool IsValid(UpdateLegalDocumentRequest request) => request.Version.Trim().Length is > 0 and <= 64
        && request.ArabicTitle.Trim().Length is > 0 and <= 300
        && request.EnglishTitle.Trim().Length is > 0 and <= 300
        && request.ArabicContent.Trim().Length is > 0 and <= 100_000
        && request.EnglishContent.Trim().Length is > 0 and <= 100_000;
}

public sealed record LegalDocumentSummary(string Slug, string Version, string Title, DateTimeOffset EffectiveAtUtc);
public sealed record RequiredLegalAcceptanceStatus(string Slug, string Version, bool RequiresReacceptance, bool HasAcceptedCurrentVersion, bool RequiresAcceptance);
public sealed record LegalDocumentView(string Slug, string Version, string Title, string Content, DateTimeOffset EffectiveAtUtc);
public sealed record AdminLegalDocumentView(Guid Id, string Slug, string Version, string ArabicTitle, string EnglishTitle, string ArabicContent, string EnglishContent, DateTimeOffset EffectiveAtUtc, bool IsPublished, bool IsCurrent, bool RequiresReacceptance);
public sealed record UpdateLegalDocumentRequest(string Version, string ArabicTitle, string EnglishTitle, string ArabicContent, string EnglishContent, DateTimeOffset EffectiveAtUtc, bool IsPublished, bool RequiresReacceptance = false);
internal sealed record LegalDocumentVersionInput(string Version, string ArabicTitle, string EnglishTitle, string ArabicContent, string EnglishContent, DateTimeOffset EffectiveAtUtc, bool IsPublished, bool RequiresReacceptance)
{
    public static LegalDocumentVersionInput From(UpdateLegalDocumentRequest request) => new(
        request.Version.Trim(),
        request.ArabicTitle.Trim(),
        request.EnglishTitle.Trim(),
        request.ArabicContent.Trim(),
        request.EnglishContent.Trim(),
        request.EffectiveAtUtc,
        request.IsPublished,
        request.RequiresReacceptance);
}
