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
/// Versioned privacy-governance register. It documents configured processing
/// activities and deliberately does not alter the runtime processing it describes.
/// Requires legal review: classifications and bases are administrator-provided.
/// </summary>
[ApiController]
[Authorize(Policy = "PrivacyAdmin")]
[Route("api/v1/privacy/admin/processing-activities")]
public sealed class ProcessingActivitiesController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? code = null,
        [FromQuery] ProcessingActivityStatus? status = null,
        CancellationToken cancellationToken = default)
    {
        if (code is not null && !IsCode(code)) return BadRequest(new { code = "PROCESSING_ACTIVITY_CODE_INVALID", message = "Use a valid processing-activity code." });
        if (status.HasValue && !Enum.IsDefined(status.Value)) return BadRequest(new { code = "PROCESSING_ACTIVITY_STATUS_INVALID", message = "Use a valid processing-activity status." });

        var query = db.ProcessingActivities.AsNoTracking();
        if (code is not null) query = query.Where(item => item.Code == code.Trim());
        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        var items = await query.OrderBy(item => item.Code).ThenByDescending(item => item.EffectiveAtUtc).ThenByDescending(item => item.Version)
            .Select(item => new ProcessingActivitySummaryView(item.Id, item.Code, item.Version, item.Name, item.Status, item.IsCurrent,
                item.EffectiveAtUtc, item.ReviewDueAtUtc, item.RetentionPolicyId, item.ApplicableConsentPurpose, item.OwnerRole))
            .ToListAsync(cancellationToken);

        Audit("ProcessingActivityAdminListRead", null, new
        {
            authorizationPolicy = "PrivacyAdmin",
            readScope = "processing-activity-list",
            code = code?.Trim(),
            status = status?.ToString(),
            resultCount = items.Count
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("{processingActivityId:guid}")]
    public async Task<IActionResult> Get(Guid processingActivityId, CancellationToken cancellationToken)
    {
        var item = await db.ProcessingActivities.AsNoTracking().SingleOrDefaultAsync(item => item.Id == processingActivityId, cancellationToken);
        if (item is null) return NotFound();

        Audit("ProcessingActivityAdminDetailRead", item.Id, new
        {
            authorizationPolicy = "PrivacyAdmin",
            item.Code,
            item.Version,
            status = item.Status.ToString(),
            item.IsCurrent,
            hasRetentionPolicyReference = item.RetentionPolicyId.HasValue,
            hasConsentPurposeReference = item.ApplicableConsentPurpose.HasValue
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateDraft(CreateProcessingActivityRequest request, CancellationToken cancellationToken)
    {
        var input = Normalize(request);
        if (input is null) return BadRequest(new { code = "PROCESSING_ACTIVITY_INVALID", message = "Provide a stable code, version, purpose, required categories, configurable basis, owner, and valid optional references." });
        if (await db.ProcessingActivities.AnyAsync(item => item.Code == input.Code && item.Version == input.Version, cancellationToken))
            return Conflict(new { code = "PROCESSING_ACTIVITY_VERSION_EXISTS", message = "That processing-activity code and version already exist." });
        if (!await HasUsableRetentionPolicyAsync(input.RetentionPolicyId, cancellationToken))
            return Conflict(new { code = "PROCESSING_ACTIVITY_RETENTION_POLICY_INVALID", message = "Use an enabled current retention policy when linking one." });

        var item = new ProcessingActivity
        {
            Code = input.Code,
            Version = input.Version,
            Name = input.Name,
            Description = input.Description,
            ProcessingPurpose = input.ProcessingPurpose,
            DataSubjectCategoriesJson = JsonSerializer.Serialize(input.DataSubjectCategories),
            PersonalDataCategoriesJson = JsonSerializer.Serialize(input.PersonalDataCategories),
            HasSpecialCategoryData = input.HasSpecialCategoryData,
            SpecialCategoryClassification = input.SpecialCategoryClassification,
            LegalOrProcessingBasis = input.LegalOrProcessingBasis,
            DataSourcesJson = SerializeOptional(input.DataSources),
            RecipientCategoriesJson = SerializeOptional(input.RecipientCategories),
            RelatedSystemModule = input.RelatedSystemModule,
            RetentionPolicyId = input.RetentionPolicyId,
            ApplicableConsentPurpose = input.ApplicableConsentPurpose,
            HasInternationalOrThirdPartyTransfer = input.HasInternationalOrThirdPartyTransfer,
            TransferConfiguration = input.TransferConfiguration,
            SecurityControlReferences = input.SecurityControlReferences,
            OwnerRole = input.OwnerRole,
            Status = ProcessingActivityStatus.Draft,
            IsCurrent = false,
            EffectiveAtUtc = input.EffectiveAtUtc,
            ReviewDueAtUtc = input.ReviewDueAtUtc,
            CreatedByUserId = UserId,
            UpdatedByUserId = UserId
        };
        db.ProcessingActivities.Add(item);
        Audit("ProcessingActivityDraftCreated", item.Id, new { item.Code, item.Version, status = item.Status.ToString(), hasRetentionPolicyReference = item.RetentionPolicyId.HasValue });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { processingActivityId = item.Id }, ToView(item));
    }

    [HttpPut("{processingActivityId:guid}")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> UpdateDraft(Guid processingActivityId, CreateProcessingActivityRequest request, CancellationToken cancellationToken)
    {
        var input = Normalize(request);
        if (input is null) return BadRequest(new { code = "PROCESSING_ACTIVITY_INVALID", message = "Provide valid configured processing-activity fields." });
        var item = await db.ProcessingActivities.SingleOrDefaultAsync(item => item.Id == processingActivityId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status != ProcessingActivityStatus.Draft)
            return Conflict(new { code = "PROCESSING_ACTIVITY_VERSION_IMMUTABLE", message = "Only a draft may be edited. Create a new version for an active or archived record." });
        if (!string.Equals(item.Code, input.Code, StringComparison.Ordinal) || !string.Equals(item.Version, input.Version, StringComparison.Ordinal))
            return BadRequest(new { code = "PROCESSING_ACTIVITY_IDENTITY_IMMUTABLE", message = "A draft's code and version cannot be changed." });
        if (!await HasUsableRetentionPolicyAsync(input.RetentionPolicyId, cancellationToken))
            return Conflict(new { code = "PROCESSING_ACTIVITY_RETENTION_POLICY_INVALID", message = "Use an enabled current retention policy when linking one." });

        Apply(item, input);
        item.UpdatedByUserId = UserId;
        Audit("ProcessingActivityDraftUpdated", item.Id, new { item.Code, item.Version, status = item.Status.ToString(), hasRetentionPolicyReference = item.RetentionPolicyId.HasValue });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    [HttpPost("{processingActivityId:guid}/activate")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Activate(Guid processingActivityId, CancellationToken cancellationToken)
    {
        var item = await db.ProcessingActivities.SingleOrDefaultAsync(item => item.Id == processingActivityId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status != ProcessingActivityStatus.Draft)
            return Conflict(new { code = "PROCESSING_ACTIVITY_TRANSITION_INVALID", message = "Only a draft processing activity can become active." });
        if (!await HasUsableRetentionPolicyAsync(item.RetentionPolicyId, cancellationToken))
            return Conflict(new { code = "PROCESSING_ACTIVITY_RETENTION_POLICY_INVALID", message = "The linked retention policy must remain enabled and current before activation." });

        var previousActiveVersions = await db.ProcessingActivities
            .Where(existing => existing.Code == item.Code && existing.Id != item.Id && existing.Status == ProcessingActivityStatus.Active && existing.IsCurrent)
            .ToListAsync(cancellationToken);
        foreach (var previous in previousActiveVersions)
        {
            previous.Status = ProcessingActivityStatus.Archived;
            previous.IsCurrent = false;
            previous.UpdatedByUserId = UserId;
        }
        item.Status = ProcessingActivityStatus.Active;
        item.IsCurrent = true;
        item.UpdatedByUserId = UserId;
        Audit("ProcessingActivityActivated", item.Id, new { item.Code, item.Version, previousActiveVersionCount = previousActiveVersions.Count });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    [HttpPost("{processingActivityId:guid}/archive")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Archive(Guid processingActivityId, CancellationToken cancellationToken)
    {
        var item = await db.ProcessingActivities.SingleOrDefaultAsync(item => item.Id == processingActivityId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status == ProcessingActivityStatus.Archived)
            return Conflict(new { code = "PROCESSING_ACTIVITY_TRANSITION_INVALID", message = "This processing-activity version is already archived." });

        item.Status = ProcessingActivityStatus.Archived;
        item.IsCurrent = false;
        item.UpdatedByUserId = UserId;
        Audit("ProcessingActivityArchived", item.Id, new { item.Code, item.Version });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<bool> HasUsableRetentionPolicyAsync(Guid? retentionPolicyId, CancellationToken cancellationToken) =>
        !retentionPolicyId.HasValue || await db.RetentionPolicies.AsNoTracking().AnyAsync(policy =>
            policy.Id == retentionPolicyId.Value && policy.IsCurrent && policy.IsEnabled, cancellationToken);

    private void Audit(string action, Guid? entityId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(ProcessingActivity),
        EntityId = entityId?.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private static void Apply(ProcessingActivity item, ProcessingActivityInput input)
    {
        item.Name = input.Name;
        item.Description = input.Description;
        item.ProcessingPurpose = input.ProcessingPurpose;
        item.DataSubjectCategoriesJson = JsonSerializer.Serialize(input.DataSubjectCategories);
        item.PersonalDataCategoriesJson = JsonSerializer.Serialize(input.PersonalDataCategories);
        item.HasSpecialCategoryData = input.HasSpecialCategoryData;
        item.SpecialCategoryClassification = input.SpecialCategoryClassification;
        item.LegalOrProcessingBasis = input.LegalOrProcessingBasis;
        item.DataSourcesJson = SerializeOptional(input.DataSources);
        item.RecipientCategoriesJson = SerializeOptional(input.RecipientCategories);
        item.RelatedSystemModule = input.RelatedSystemModule;
        item.RetentionPolicyId = input.RetentionPolicyId;
        item.ApplicableConsentPurpose = input.ApplicableConsentPurpose;
        item.HasInternationalOrThirdPartyTransfer = input.HasInternationalOrThirdPartyTransfer;
        item.TransferConfiguration = input.TransferConfiguration;
        item.SecurityControlReferences = input.SecurityControlReferences;
        item.OwnerRole = input.OwnerRole;
        item.EffectiveAtUtc = input.EffectiveAtUtc;
        item.ReviewDueAtUtc = input.ReviewDueAtUtc;
    }

    private static ProcessingActivityInput? Normalize(CreateProcessingActivityRequest request)
    {
        if (!IsCode(request.Code) || !IsRequiredText(request.Version, 64) || !IsRequiredText(request.Name, 300) ||
            !IsRequiredText(request.ProcessingPurpose, 2_000) || !IsRequiredText(request.LegalOrProcessingBasis, 2_000) ||
            !IsRequiredText(request.OwnerRole, 120) || request.EffectiveAtUtc == DateTimeOffset.MinValue ||
            !IsOptionalText(request.Description, 4_000) || !IsOptionalText(request.SpecialCategoryClassification, 500) ||
            !IsOptionalText(request.RelatedSystemModule, 160) || !IsOptionalText(request.TransferConfiguration, 2_000) ||
            !IsOptionalText(request.SecurityControlReferences, 2_000) ||
            request.ApplicableConsentPurpose.HasValue && !Enum.IsDefined(request.ApplicableConsentPurpose.Value) ||
            request.ReviewDueAtUtc.HasValue && request.ReviewDueAtUtc < request.EffectiveAtUtc)
            return null;

        var subjects = NormalizeCategories(request.DataSubjectCategories, required: true);
        var personalData = NormalizeCategories(request.PersonalDataCategories, required: true);
        var sources = NormalizeCategories(request.DataSources, required: false);
        var recipients = NormalizeCategories(request.RecipientCategories, required: false);
        if (subjects is null || personalData is null || sources is null || recipients is null ||
            request.HasSpecialCategoryData && string.IsNullOrWhiteSpace(request.SpecialCategoryClassification) ||
            request.HasInternationalOrThirdPartyTransfer && string.IsNullOrWhiteSpace(request.TransferConfiguration))
            return null;

        return new ProcessingActivityInput(
            request.Code.Trim(), request.Version.Trim(), request.Name.Trim(), TrimOrNull(request.Description), request.ProcessingPurpose.Trim(),
            subjects, personalData, request.HasSpecialCategoryData, TrimOrNull(request.SpecialCategoryClassification), request.LegalOrProcessingBasis.Trim(),
            sources, recipients, TrimOrNull(request.RelatedSystemModule), request.RetentionPolicyId, request.ApplicableConsentPurpose,
            request.HasInternationalOrThirdPartyTransfer, TrimOrNull(request.TransferConfiguration), TrimOrNull(request.SecurityControlReferences),
            request.OwnerRole.Trim(), request.EffectiveAtUtc, request.ReviewDueAtUtc);
    }

    private static string[]? NormalizeCategories(IReadOnlyCollection<string>? values, bool required)
    {
        var normalized = (values ?? []).Select(value => value?.Trim() ?? string.Empty).Where(value => value.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        return normalized.Length > 40 || normalized.Any(value => value.Length > 240) || required && normalized.Length == 0
            ? null
            : normalized;
    }

    private static string? SerializeOptional(IReadOnlyCollection<string> values) => values.Count == 0 ? null : JsonSerializer.Serialize(values);
    private static bool IsCode(string? value) => value is { Length: > 0 and <= 100 } && value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');
    private static bool IsRequiredText(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum;
    private static bool IsOptionalText(string? value, int maximum) => value is null || value.Trim().Length <= maximum;
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ProcessingActivityView ToView(ProcessingActivity item) => new(
        item.Id, item.Code, item.Version, item.Name, item.Description, item.ProcessingPurpose,
        DeserializeCategories(item.DataSubjectCategoriesJson), DeserializeCategories(item.PersonalDataCategoriesJson), item.HasSpecialCategoryData,
        item.SpecialCategoryClassification, item.LegalOrProcessingBasis, DeserializeCategories(item.DataSourcesJson), DeserializeCategories(item.RecipientCategoriesJson),
        item.RelatedSystemModule, item.RetentionPolicyId, item.ApplicableConsentPurpose, item.HasInternationalOrThirdPartyTransfer, item.TransferConfiguration,
        item.SecurityControlReferences, item.OwnerRole, item.Status, item.IsCurrent, item.EffectiveAtUtc, item.ReviewDueAtUtc,
        item.CreatedAtUtc, item.CreatedByUserId, item.UpdatedAtUtc, item.UpdatedByUserId);
    private static IReadOnlyCollection<string> DeserializeCategories(string? value) => JsonSerializer.Deserialize<string[]>(value ?? "[]") ?? [];
}

public sealed record CreateProcessingActivityRequest(
    [param: StringLength(100)] string Code,
    [param: StringLength(64)] string Version,
    [param: StringLength(300)] string Name,
    [param: StringLength(4_000)] string? Description,
    [param: StringLength(2_000)] string ProcessingPurpose,
    IReadOnlyCollection<string>? DataSubjectCategories,
    IReadOnlyCollection<string>? PersonalDataCategories,
    bool HasSpecialCategoryData,
    [param: StringLength(500)] string? SpecialCategoryClassification,
    [param: StringLength(2_000)] string LegalOrProcessingBasis,
    IReadOnlyCollection<string>? DataSources,
    IReadOnlyCollection<string>? RecipientCategories,
    [param: StringLength(160)] string? RelatedSystemModule,
    Guid? RetentionPolicyId,
    ConsentPurpose? ApplicableConsentPurpose,
    bool HasInternationalOrThirdPartyTransfer,
    [param: StringLength(2_000)] string? TransferConfiguration,
    [param: StringLength(2_000)] string? SecurityControlReferences,
    [param: StringLength(120)] string OwnerRole,
    DateTimeOffset EffectiveAtUtc,
    DateTimeOffset? ReviewDueAtUtc);

public sealed record ProcessingActivitySummaryView(Guid Id, string Code, string Version, string Name, ProcessingActivityStatus Status,
    bool IsCurrent, DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc, Guid? RetentionPolicyId, ConsentPurpose? ApplicableConsentPurpose, string OwnerRole);

public sealed record ProcessingActivityView(Guid Id, string Code, string Version, string Name, string? Description, string ProcessingPurpose,
    IReadOnlyCollection<string> DataSubjectCategories, IReadOnlyCollection<string> PersonalDataCategories, bool HasSpecialCategoryData,
    string? SpecialCategoryClassification, string LegalOrProcessingBasis, IReadOnlyCollection<string> DataSources,
    IReadOnlyCollection<string> RecipientCategories, string? RelatedSystemModule, Guid? RetentionPolicyId, ConsentPurpose? ApplicableConsentPurpose,
    bool HasInternationalOrThirdPartyTransfer, string? TransferConfiguration, string? SecurityControlReferences, string OwnerRole,
    ProcessingActivityStatus Status, bool IsCurrent, DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc,
    DateTimeOffset CreatedAtUtc, string? CreatedByUserId, DateTimeOffset UpdatedAtUtc, string? UpdatedByUserId);

internal sealed record ProcessingActivityInput(string Code, string Version, string Name, string? Description, string ProcessingPurpose,
    IReadOnlyCollection<string> DataSubjectCategories, IReadOnlyCollection<string> PersonalDataCategories, bool HasSpecialCategoryData,
    string? SpecialCategoryClassification, string LegalOrProcessingBasis, IReadOnlyCollection<string> DataSources,
    IReadOnlyCollection<string> RecipientCategories, string? RelatedSystemModule, Guid? RetentionPolicyId, ConsentPurpose? ApplicableConsentPurpose,
    bool HasInternationalOrThirdPartyTransfer, string? TransferConfiguration, string? SecurityControlReferences, string OwnerRole,
    DateTimeOffset EffectiveAtUtc, DateTimeOffset? ReviewDueAtUtc);
