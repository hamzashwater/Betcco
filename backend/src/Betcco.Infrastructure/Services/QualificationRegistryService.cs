using System.Text.Json;
using System.Text.RegularExpressions;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed partial class QualificationRegistryService(BetccoDbContext db) : IQualificationRegistryService
{
    public async Task<IReadOnlyCollection<QualificationView>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.Qualifications
            .AsNoTracking()
            .Include(item => item.Versions)
            .OrderBy(item => item.Code)
            .Select(item => new QualificationView(
                item.Id,
                item.Code,
                item.ArabicName,
                item.EnglishName,
                item.IsActive,
                item.Versions
                    .OrderByDescending(version => version.EffectiveFromUtc)
                    .Select(version => new QualificationVersionView(
                        version.Id,
                        version.VersionCode,
                        version.SourceReference,
                        version.EffectiveFromUtc,
                        version.EffectiveUntilUtc,
                        version.IsActive))
                    .ToArray()))
            .ToArrayAsync(cancellationToken);

    public async Task<QualificationView?> CreateQualificationAsync(
        string actorUserId,
        CreateQualificationCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!TryCode(command.Code, out var code)
            || !TryText(command.ArabicName, 2, 256, out var arabicName)
            || !TryText(command.EnglishName, 2, 256, out var englishName)
            || await db.Qualifications.AnyAsync(item => item.Code == code, cancellationToken))
            return null;

        var qualification = new Qualification
        {
            Code = code,
            ArabicName = arabicName,
            EnglishName = englishName
        };
        db.Qualifications.Add(qualification);
        db.AuditLogs.Add(Audit(actorUserId, "QualificationCreated", nameof(Qualification), qualification.Id.ToString(), new { code }));
        await db.SaveChangesAsync(cancellationToken);
        return ToView(qualification);
    }

    public async Task<QualificationVersionView?> CreateVersionAsync(
        string actorUserId,
        CreateQualificationVersionCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!TryCode(command.VersionCode, out var versionCode)
            || !TryText(command.SourceReference, 10, 2_048, out var sourceReference)
            || command.EffectiveUntilUtc is { } effectiveUntil && effectiveUntil <= command.EffectiveFromUtc)
            return null;
        var qualification = await db.Qualifications.SingleOrDefaultAsync(
            item => item.Id == command.QualificationId && item.IsActive,
            cancellationToken);
        if (qualification is null
            || await db.QualificationVersions.AnyAsync(item =>
                item.QualificationId == qualification.Id && item.VersionCode == versionCode,
                cancellationToken))
            return null;

        var version = new QualificationVersion
        {
            QualificationId = qualification.Id,
            VersionCode = versionCode,
            SourceReference = sourceReference,
            EffectiveFromUtc = command.EffectiveFromUtc,
            EffectiveUntilUtc = command.EffectiveUntilUtc
        };
        db.QualificationVersions.Add(version);
        db.AuditLogs.Add(Audit(actorUserId, "QualificationVersionCreated", nameof(QualificationVersion), version.Id.ToString(), new
        {
            qualification.Code,
            versionCode
        }));
        await db.SaveChangesAsync(cancellationToken);
        return ToView(version);
    }

    public async Task<IReadOnlyCollection<RubricQualificationBindingView>> ListRubricBindingsAsync(CancellationToken cancellationToken = default) =>
        await db.RubricTemplates
            .AsNoTracking()
            .Include(item => item.QualificationVersion)
            .ThenInclude(item => item!.Qualification)
            .OrderBy(item => item.ArabicTitle)
            .Select(item => new RubricQualificationBindingView(
                item.Id,
                item.ArabicTitle,
                item.EnglishTitle,
                item.QualificationVersionId,
                item.QualificationVersion == null ? null : item.QualificationVersion.Qualification!.Code,
                item.QualificationVersion == null ? null : item.QualificationVersion.VersionCode))
            .ToArrayAsync(cancellationToken);

    public async Task<bool> AssignToRubricAsync(
        string actorUserId,
        Guid rubricTemplateId,
        Guid qualificationVersionId,
        CancellationToken cancellationToken = default)
    {
        var rubric = await db.RubricTemplates.SingleOrDefaultAsync(item => item.Id == rubricTemplateId, cancellationToken);
        var version = await db.QualificationVersions
            .Include(item => item.Qualification)
            .SingleOrDefaultAsync(item => item.Id == qualificationVersionId && item.IsActive && item.Qualification!.IsActive, cancellationToken);
        if (rubric is null || version is null) return false;
        // A published formal scope must retain its approved rubric/version identity.
        if (await db.AssessmentScopes.AnyAsync(x => x.RubricTemplateId == rubric.Id && (x.PublishedAtUtc != null || x.IsActive), cancellationToken))
            return false;

        rubric.QualificationVersionId = version.Id;
        db.AuditLogs.Add(Audit(actorUserId, "RubricQualificationVersionAssigned", nameof(RubricTemplate), rubric.Id.ToString(), new
        {
            version.Qualification!.Code,
            version.VersionCode
        }));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static QualificationView ToView(Qualification qualification) => new(
        qualification.Id,
        qualification.Code,
        qualification.ArabicName,
        qualification.EnglishName,
        qualification.IsActive,
        []);

    private static QualificationVersionView ToView(QualificationVersion version) => new(
        version.Id,
        version.VersionCode,
        version.SourceReference,
        version.EffectiveFromUtc,
        version.EffectiveUntilUtc,
        version.IsActive);

    private static bool TryCode(string? raw, out string code)
    {
        code = raw?.Trim().ToUpperInvariant() ?? string.Empty;
        return code.Length is >= 2 and <= 64 && CodePattern().IsMatch(code);
    }

    private static bool TryText(string? raw, int minimum, int maximum, out string text)
    {
        text = raw?.Trim() ?? string.Empty;
        return text.Length >= minimum && text.Length <= maximum;
    }

    private static AuditLog Audit(string actorUserId, string action, string entityType, string entityId, object metadata) => new()
    {
        ActorUserId = actorUserId,
        Action = action,
        EntityType = entityType,
        EntityId = entityId,
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(metadata)
    };

    [GeneratedRegex("^[A-Z0-9][A-Z0-9._-]*$")]
    private static partial Regex CodePattern();
}
