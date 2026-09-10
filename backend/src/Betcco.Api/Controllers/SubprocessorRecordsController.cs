using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Versioned governance register for subprocessors. It documents configured
/// provider information only and never changes a runtime integration.
/// Requires legal review: contractual, transfer, and provider classifications
/// are administrator-provided records rather than compliance conclusions.
/// </summary>
[ApiController]
[Authorize(Policy = "PrivacyAdmin")]
[Route("api/v1/privacy/admin/subprocessors")]
public sealed class SubprocessorRecordsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? code = null,
        [FromQuery] SubprocessorRecordStatus? status = null,
        CancellationToken cancellationToken = default)
    {
        if (code is not null && !IsCode(code)) return BadRequest(new { code = "SUBPROCESSOR_CODE_INVALID", message = "Use a valid subprocessor code." });
        if (status.HasValue && !Enum.IsDefined(status.Value)) return BadRequest(new { code = "SUBPROCESSOR_STATUS_INVALID", message = "Use a valid subprocessor status." });

        var query = db.SubprocessorRecords.AsNoTracking();
        if (code is not null) query = query.Where(item => item.Code == code.Trim());
        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        var items = await query.OrderBy(item => item.Code).ThenByDescending(item => item.EffectiveAtUtc).ThenByDescending(item => item.Version)
            .Select(item => new SubprocessorRecordSummaryView(item.Id, item.Code, item.Version, item.Name, item.ProviderLegalEntityName,
                item.Status, item.IsCurrent, item.EffectiveAtUtc, item.ReviewDueAtUtc, item.OwnerRole))
            .ToListAsync(cancellationToken);

        Audit("SubprocessorRecordAdminListRead", null, new
        {
            authorizationPolicy = "PrivacyAdmin",
            readScope = "subprocessor-record-list",
            code = code?.Trim(),
            status = status?.ToString(),
            resultCount = items.Count
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("{subprocessorRecordId:guid}")]
    public async Task<IActionResult> Get(Guid subprocessorRecordId, CancellationToken cancellationToken)
    {
        var item = await db.SubprocessorRecords.AsNoTracking().SingleOrDefaultAsync(item => item.Id == subprocessorRecordId, cancellationToken);
        if (item is null) return NotFound();
        var processingActivityIds = await ProcessingActivityIdsAsync(item.Id, cancellationToken);

        Audit("SubprocessorRecordAdminDetailRead", item.Id, new
        {
            authorizationPolicy = "PrivacyAdmin",
            item.Code,
            item.Version,
            status = item.Status.ToString(),
            item.IsCurrent,
            processingActivityLinkCount = processingActivityIds.Count,
            item.HasInternationalOrThirdPartyTransfer,
            item.HasFurtherSubprocessor
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item, processingActivityIds));
    }

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateDraft(CreateSubprocessorRecordRequest request, CancellationToken cancellationToken)
    {
        var input = Normalize(request);
        if (input is null) return BadRequest(new { code = "SUBPROCESSOR_INVALID", message = "Provide a stable code, version, provider, service, purpose, categories, owner, and valid configured options." });
        if (await db.SubprocessorRecords.AnyAsync(item => item.Code == input.Code && item.Version == input.Version, cancellationToken))
            return Conflict(new { code = "SUBPROCESSOR_VERSION_EXISTS", message = "That subprocessor code and version already exist." });
        if (!await HasValidProcessingActivityLinksAsync(input.ProcessingActivityIds, cancellationToken))
            return Conflict(new { code = "SUBPROCESSOR_PROCESSING_ACTIVITY_INVALID", message = "Linked processing activities must be active current records." });

        var item = new SubprocessorRecord
        {
            Code = input.Code,
            Version = input.Version,
            Name = input.Name,
            ProviderLegalEntityName = input.ProviderLegalEntityName,
            ServiceDescription = input.ServiceDescription,
            ProcessingPurpose = input.ProcessingPurpose,
            PersonalDataCategoriesJson = JsonSerializer.Serialize(input.PersonalDataCategories),
            DataSubjectCategoriesJson = JsonSerializer.Serialize(input.DataSubjectCategories),
            HostingRegionOrCountry = input.HostingRegionOrCountry,
            HasInternationalOrThirdPartyTransfer = input.HasInternationalOrThirdPartyTransfer,
            TransferConfiguration = input.TransferConfiguration,
            RelatedSystemModule = input.RelatedSystemModule,
            ContractDpaStatusOrReference = input.ContractDpaStatusOrReference,
            SecurityControlReferences = input.SecurityControlReferences,
            RetentionDeletionCommitments = input.RetentionDeletionCommitments,
            HasFurtherSubprocessor = input.HasFurtherSubprocessor,
            FurtherSubprocessorConfiguration = input.FurtherSubprocessorConfiguration,
            OwnerRole = input.OwnerRole,
            Status = SubprocessorRecordStatus.Draft,
            IsCurrent = false,
            EffectiveAtUtc = input.EffectiveAtUtc,
            ReviewDueAtUtc = input.ReviewDueAtUtc,
            CreatedByUserId = UserId,
            UpdatedByUserId = UserId
        };
        db.SubprocessorRecords.Add(item);
        AddProcessingActivityLinks(item.Id, input.ProcessingActivityIds);
        Audit("SubprocessorRecordDraftCreated", item.Id, new { item.Code, item.Version, status = item.Status.ToString(), processingActivityLinkCount = input.ProcessingActivityIds.Count });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { subprocessorRecordId = item.Id }, ToView(item, input.ProcessingActivityIds));
    }

    [HttpPut("{subprocessorRecordId:guid}")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> UpdateDraft(Guid subprocessorRecordId, CreateSubprocessorRecordRequest request, CancellationToken cancellationToken)
    {
        var input = Normalize(request);
        if (input is null) return BadRequest(new { code = "SUBPROCESSOR_INVALID", message = "Provide valid configured subprocessor fields." });
        var item = await db.SubprocessorRecords.SingleOrDefaultAsync(item => item.Id == subprocessorRecordId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status != SubprocessorRecordStatus.Draft)
            return Conflict(new { code = "SUBPROCESSOR_VERSION_IMMUTABLE", message = "Only a draft may be edited. Create a new version for an active, suspended, or archived record." });
        if (!string.Equals(item.Code, input.Code, StringComparison.Ordinal) || !string.Equals(item.Version, input.Version, StringComparison.Ordinal))
            return BadRequest(new { code = "SUBPROCESSOR_IDENTITY_IMMUTABLE", message = "A draft's code and version cannot be changed." });
        if (!await HasValidProcessingActivityLinksAsync(input.ProcessingActivityIds, cancellationToken))
            return Conflict(new { code = "SUBPROCESSOR_PROCESSING_ACTIVITY_INVALID", message = "Linked processing activities must be active current records." });

        Apply(item, input);
        item.UpdatedByUserId = UserId;
        var existingLinks = await db.SubprocessorProcessingActivities.Where(link => link.SubprocessorRecordId == item.Id).ToListAsync(cancellationToken);
        db.SubprocessorProcessingActivities.RemoveRange(existingLinks);
        AddProcessingActivityLinks(item.Id, input.ProcessingActivityIds);
        Audit("SubprocessorRecordDraftUpdated", item.Id, new { item.Code, item.Version, status = item.Status.ToString(), processingActivityLinkCount = input.ProcessingActivityIds.Count });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item, input.ProcessingActivityIds));
    }

    [HttpPost("{subprocessorRecordId:guid}/activate")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Activate(Guid subprocessorRecordId, CancellationToken cancellationToken)
    {
        var item = await db.SubprocessorRecords.SingleOrDefaultAsync(item => item.Id == subprocessorRecordId, cancellationToken);
        if (item is null) return NotFound();

        if (item.Status == SubprocessorRecordStatus.Suspended)
        {
            item.Status = SubprocessorRecordStatus.Active;
            item.IsCurrent = true;
            item.UpdatedByUserId = UserId;
            Audit("SubprocessorRecordReactivated", item.Id, new { item.Code, item.Version });
            await db.SaveChangesAsync(cancellationToken);
            return Ok(ToView(item, await ProcessingActivityIdsAsync(item.Id, cancellationToken)));
        }
        if (item.Status != SubprocessorRecordStatus.Draft)
            return Conflict(new { code = "SUBPROCESSOR_TRANSITION_INVALID", message = "Only a draft or suspended subprocessor record can become active." });

        var previousCurrentVersions = await db.SubprocessorRecords
            .Where(existing => existing.Code == item.Code && existing.Id != item.Id && existing.IsCurrent &&
                (existing.Status == SubprocessorRecordStatus.Active || existing.Status == SubprocessorRecordStatus.Suspended))
            .ToListAsync(cancellationToken);
        foreach (var previous in previousCurrentVersions)
        {
            previous.Status = SubprocessorRecordStatus.Archived;
            previous.IsCurrent = false;
            previous.UpdatedByUserId = UserId;
        }
        item.Status = SubprocessorRecordStatus.Active;
        item.IsCurrent = true;
        item.UpdatedByUserId = UserId;
        Audit("SubprocessorRecordActivated", item.Id, new { item.Code, item.Version, previousCurrentVersionCount = previousCurrentVersions.Count });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item, await ProcessingActivityIdsAsync(item.Id, cancellationToken)));
    }

    [HttpPost("{subprocessorRecordId:guid}/suspend")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Suspend(Guid subprocessorRecordId, CancellationToken cancellationToken)
    {
        var item = await db.SubprocessorRecords.SingleOrDefaultAsync(item => item.Id == subprocessorRecordId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status != SubprocessorRecordStatus.Active)
            return Conflict(new { code = "SUBPROCESSOR_TRANSITION_INVALID", message = "Only an active subprocessor record can be suspended." });

        item.Status = SubprocessorRecordStatus.Suspended;
        item.UpdatedByUserId = UserId;
        Audit("SubprocessorRecordSuspended", item.Id, new { item.Code, item.Version });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item, await ProcessingActivityIdsAsync(item.Id, cancellationToken)));
    }

    [HttpPost("{subprocessorRecordId:guid}/archive")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Archive(Guid subprocessorRecordId, CancellationToken cancellationToken)
    {
        var item = await db.SubprocessorRecords.SingleOrDefaultAsync(item => item.Id == subprocessorRecordId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status == SubprocessorRecordStatus.Archived)
            return Conflict(new { code = "SUBPROCESSOR_TRANSITION_INVALID", message = "This subprocessor-record version is already archived." });

        item.Status = SubprocessorRecordStatus.Archived;
        item.IsCurrent = false;
        item.UpdatedByUserId = UserId;
        Audit("SubprocessorRecordArchived", item.Id, new { item.Code, item.Version });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item, await ProcessingActivityIdsAsync(item.Id, cancellationToken)));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<bool> HasValidProcessingActivityLinksAsync(IReadOnlyCollection<Guid> processingActivityIds, CancellationToken cancellationToken) =>
        processingActivityIds.Count == 0 || await db.ProcessingActivities.AsNoTracking()
            .CountAsync(activity => processingActivityIds.Contains(activity.Id) && activity.Status == ProcessingActivityStatus.Active && activity.IsCurrent, cancellationToken) == processingActivityIds.Count;

    private async Task<IReadOnlyCollection<Guid>> ProcessingActivityIdsAsync(Guid subprocessorRecordId, CancellationToken cancellationToken) =>
        await db.SubprocessorProcessingActivities.AsNoTracking().Where(link => link.SubprocessorRecordId == subprocessorRecordId)
            .OrderBy(link => link.ProcessingActivityId).Select(link => link.ProcessingActivityId).ToArrayAsync(cancellationToken);

    private void AddProcessingActivityLinks(Guid subprocessorRecordId, IReadOnlyCollection<Guid> processingActivityIds)
    {
        foreach (var processingActivityId in processingActivityIds)
            db.SubprocessorProcessingActivities.Add(new SubprocessorProcessingActivity { SubprocessorRecordId = subprocessorRecordId, ProcessingActivityId = processingActivityId });
    }

    private void Audit(string action, Guid? entityId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(SubprocessorRecord),
        EntityId = entityId?.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private static void Apply(SubprocessorRecord item, SubprocessorRecordInput input)
    {
        item.Name = input.Name;
        item.ProviderLegalEntityName = input.ProviderLegalEntityName;
        item.ServiceDescription = input.ServiceDescription;
        item.ProcessingPurpose = input.ProcessingPurpose;
        item.PersonalDataCategoriesJson = JsonSerializer.Serialize(input.PersonalDataCategories);
        item.DataSubjectCategoriesJson = JsonSerializer.Serialize(input.DataSubjectCategories);
        item.HostingRegionOrCountry = input.HostingRegionOrCountry;
        item.HasInternationalOrThirdPartyTransfer = input.HasInternationalOrThirdPartyTransfer;
        item.TransferConfiguration = input.TransferConfiguration;
        item.RelatedSystemModule = input.RelatedSystemModule;
        item.ContractDpaStatusOrReference = input.ContractDpaStatusOrReference;
        item.SecurityControlReferences = input.SecurityControlReferences;
        item.RetentionDeletionCommitments = input.RetentionDeletionCommitments;
        item.HasFurtherSubprocessor = input.HasFurtherSubprocessor;
        item.FurtherSubprocessorConfiguration = input.FurtherSubprocessorConfiguration;
        item.OwnerRole = input.OwnerRole;
        item.EffectiveAtUtc = input.EffectiveAtUtc;
        item.ReviewDueAtUtc = input.ReviewDueAtUtc;
    }

    private static SubprocessorRecordInput? Normalize(CreateSubprocessorRecordRequest request)
    {
        if (!IsCode(request.Code) || !IsRequiredText(request.Version, 64) || !IsRequiredText(request.Name, 300) ||
            !IsRequiredText(request.ProviderLegalEntityName, 300) || !IsRequiredText(request.ServiceDescription, 4_000) ||
            !IsRequiredText(request.ProcessingPurpose, 2_000) || !IsRequiredText(request.OwnerRole, 120) ||
            request.EffectiveAtUtc == DateTimeOffset.MinValue || !IsOptionalText(request.HostingRegionOrCountry, 300) ||
            !IsOptionalText(request.TransferConfiguration, 2_000) || !IsOptionalText(request.RelatedSystemModule, 160) ||
            !IsOptionalText(request.ContractDpaStatusOrReference, 2_000) || !IsOptionalText(request.SecurityControlReferences, 2_000) ||
            !IsOptionalText(request.RetentionDeletionCommitments, 2_000) || !IsOptionalText(request.FurtherSubprocessorConfiguration, 2_000) ||
            request.ReviewDueAtUtc.HasValue && request.ReviewDueAtUtc < request.EffectiveAtUtc)
            return null;

        var personalData = NormalizeCategories(request.PersonalDataCategories, required: true);
        var subjects = NormalizeCategories(request.DataSubjectCategories, required: true);
        var activityIds = (request.ProcessingActivityIds ?? []).Distinct().ToArray();
        if (personalData is null || subjects is null || activityIds.Length > 40 ||
            request.HasInternationalOrThirdPartyTransfer && string.IsNullOrWhiteSpace(request.TransferConfiguration) ||
            request.HasFurtherSubprocessor && string.IsNullOrWhiteSpace(request.FurtherSubprocessorConfiguration))
            return null;

        return new SubprocessorRecordInput(
            request.Code.Trim(), request.Version.Trim(), request.Name.Trim(), request.ProviderLegalEntityName.Trim(), request.ServiceDescription.Trim(),
            request.ProcessingPurpose.Trim(), personalData, subjects, TrimOrNull(request.HostingRegionOrCountry), request.HasInternationalOrThirdPartyTransfer,
            TrimOrNull(request.TransferConfiguration), TrimOrNull(request.RelatedSystemModule), TrimOrNull(request.ContractDpaStatusOrReference),
            TrimOrNull(request.SecurityControlReferences), TrimOrNull(request.RetentionDeletionCommitments), request.HasFurtherSubprocessor,
            TrimOrNull(request.FurtherSubprocessorConfiguration), request.OwnerRole.Trim(), request.EffectiveAtUtc, request.ReviewDueAtUtc, activityIds);
    }

    private static string[]? NormalizeCategories(IReadOnlyCollection<string>? values, bool required)
    {
        var normalized = (values ?? []).Select(value => value?.Trim() ?? string.Empty).Where(value => value.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        return normalized.Length > 40 || normalized.Any(value => value.Length > 240) || required && normalized.Length == 0
            ? null
            : normalized;
    }

    private static bool IsCode(string? value) => value is { Length: > 0 and <= 100 } && value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');
    private static bool IsRequiredText(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum;
    private static bool IsOptionalText(string? value, int maximum) => value is null || value.Trim().Length <= maximum;
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static SubprocessorRecordView ToView(SubprocessorRecord item, IReadOnlyCollection<Guid> processingActivityIds) => new(
        item.Id, item.Code, item.Version, item.Name, item.ProviderLegalEntityName, item.ServiceDescription, item.ProcessingPurpose,
        DeserializeCategories(item.PersonalDataCategoriesJson), DeserializeCategories(item.DataSubjectCategoriesJson), item.HostingRegionOrCountry,
        item.HasInternationalOrThirdPartyTransfer, item.TransferConfiguration, processingActivityIds, item.RelatedSystemModule,
        item.ContractDpaStatusOrReference, item.SecurityControlReferences, item.RetentionDeletionCommitments, item.HasFurtherSubprocessor,
        item.FurtherSubprocessorConfiguration, item.OwnerRole, item.Status, item.IsCurrent, item.EffectiveAtUtc, item.ReviewDueAtUtc,
        item.CreatedAtUtc, item.CreatedByUserId, item.UpdatedAtUtc, item.UpdatedByUserId);
    private static IReadOnlyCollection<string> DeserializeCategories(string value) => JsonSerializer.Deserialize<string[]>(value) ?? [];
}

public sealed record CreateSubprocessorRecordRequest(
    [param: StringLength(100)] string Code,
    [param: StringLength(64)] string Version,
    [param: StringLength(300)] string Name,
    [param: StringLength(300)] string ProviderLegalEntityName,
    [param: StringLength(4_000)] string ServiceDescription,
    [param: StringLength(2_000)] string ProcessingPurpose,
    IReadOnlyCollection<string>? PersonalDataCategories,
    IReadOnlyCollection<string>? DataSubjectCategories,
    [param: StringLength(300)] string? HostingRegionOrCountry,
    bool HasInternationalOrThirdPartyTransfer,
    [param: StringLength(2_000)] string? TransferConfiguration,
    IReadOnlyCollection<Guid>? ProcessingActivityIds,
    [param: StringLength(160)] string? RelatedSystemModule,
    [param: StringLength(2_000)] string? ContractDpaStatusOrReference,
    [param: StringLength(2_000)] string? SecurityControlReferences,
    [param: StringLength(2_000)] string? RetentionDeletionCommitments,
    bool HasFurtherSubprocessor,
    [param: StringLength(2_000)] string? FurtherSubprocessorConfiguration,
    [param: StringLength(120)] string OwnerRole,
    DateTimeOffset EffectiveAtUtc,
    DateTimeOffset? ReviewDueAtUtc);

public sealed record SubprocessorRecordSummaryView(Guid Id, string Code, string Version, string Name, string ProviderLegalEntityName,
    SubprocessorRecordStatus Status, bool IsCurrent, DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc, string OwnerRole);

public sealed record SubprocessorRecordView(Guid Id, string Code, string Version, string Name, string ProviderLegalEntityName,
    string ServiceDescription, string ProcessingPurpose, IReadOnlyCollection<string> PersonalDataCategories, IReadOnlyCollection<string> DataSubjectCategories,
    string? HostingRegionOrCountry, bool HasInternationalOrThirdPartyTransfer, string? TransferConfiguration, IReadOnlyCollection<Guid> ProcessingActivityIds,
    string? RelatedSystemModule, string? ContractDpaStatusOrReference, string? SecurityControlReferences, string? RetentionDeletionCommitments,
    bool HasFurtherSubprocessor, string? FurtherSubprocessorConfiguration, string OwnerRole, SubprocessorRecordStatus Status, bool IsCurrent,
    DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc, DateTimeOffset CreatedAtUtc, string? CreatedByUserId,
    DateTimeOffset UpdatedAtUtc, string? UpdatedByUserId);

internal sealed record SubprocessorRecordInput(string Code, string Version, string Name, string ProviderLegalEntityName,
    string ServiceDescription, string ProcessingPurpose, IReadOnlyCollection<string> PersonalDataCategories,
    IReadOnlyCollection<string> DataSubjectCategories, string? HostingRegionOrCountry, bool HasInternationalOrThirdPartyTransfer,
    string? TransferConfiguration, string? RelatedSystemModule, string? ContractDpaStatusOrReference, string? SecurityControlReferences,
    string? RetentionDeletionCommitments, bool HasFurtherSubprocessor, string? FurtherSubprocessorConfiguration, string OwnerRole,
    DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc, IReadOnlyCollection<Guid> ProcessingActivityIds);
