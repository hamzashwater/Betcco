using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Controlled, evidence-backed fulfillment for the supported lower-risk
/// privacy requests. Erasure/concealment and portability are deliberately not
/// implemented here.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/privacy/fulfillment")]
public sealed class PrivacyFulfillmentController(
    BetccoDbContext db,
    IDataSubjectFulfillmentService fulfillmentService,
    IPrivacySubjectDataService subjectDataService) : ControllerBase
{
    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/access/generate")]
    [EnableRateLimiting("write")]
    public Task<IActionResult> GenerateAccess(Guid requestId, CancellationToken cancellationToken) =>
        FulfillmentResultAsync(fulfillmentService.GenerateAccessAsync(requestId, UserId, cancellationToken));

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/access/release")]
    [EnableRateLimiting("write")]
    public Task<IActionResult> ReleaseAccess(Guid requestId, CancellationToken cancellationToken) =>
        FulfillmentResultAsync(fulfillmentService.ReleaseAccessAsync(requestId, UserId, cancellationToken));

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/correction")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ApplyCorrection(Guid requestId, ApplyCorrectionRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.Field))
            return BadRequest(new { code = "CORRECTION_FIELD_UNSUPPORTED", message = "The requested field is not supported by this correction workflow." });
        return await FulfillmentResultAsync(fulfillmentService.ApplyCorrectionAsync(requestId, request.Field, request.Value, UserId, cancellationToken));
    }

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/restriction")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ApplyRestriction(Guid requestId, ApplyRestrictionRequest request, CancellationToken cancellationToken) =>
        await FulfillmentResultAsync(fulfillmentService.ApplyRestrictionAsync(requestId, request.ProcessingScope, request.Reason, UserId, cancellationToken));

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/withdraw-optional-consent")]
    [EnableRateLimiting("write")]
    public Task<IActionResult> WithdrawOptionalConsent(Guid requestId, CancellationToken cancellationToken) =>
        FulfillmentResultAsync(fulfillmentService.WithdrawOptionalConsentAsync(requestId, UserId, cancellationToken));

    /// <summary>
    /// Records the authorized human review of an objection to profiling. BETCCO
    /// currently has no runtime profiling or automated-decision subsystem, so
    /// this route does not claim to disable one.
    /// Requires legal review: the reviewed outcome is entered by the authorized
    /// reviewer and is not a legal determination made by the application.
    /// </summary>
    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/profiling-objection/review")]
    [EnableRateLimiting("write")]
    public Task<IActionResult> RecordProfilingObjection(Guid requestId, RecordProfilingObjectionRequest request, CancellationToken cancellationToken) =>
        FulfillmentResultAsync(fulfillmentService.RecordProfilingObjectionAsync(requestId, request.Scope, request.ReviewedOutcome, request.Reason, UserId, cancellationToken));

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("restrictions/{restrictionId:guid}/release")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ReleaseRestriction(Guid restrictionId, ReleaseRestrictionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 2_000)
            return BadRequest(new { code = "RESTRICTION_RELEASE_REASON_REQUIRED", message = "A release reason of up to 2000 characters is required." });

        var restriction = await db.DataProcessingRestrictions.SingleOrDefaultAsync(item => item.Id == restrictionId, cancellationToken);
        if (restriction is null) return NotFound();
        if (restriction.Status != DataProcessingRestrictionStatus.Active)
            return Conflict(new { code = "RESTRICTION_NOT_ACTIVE", message = "Only an active restriction can be released." });

        restriction.Status = DataProcessingRestrictionStatus.Released;
        restriction.ReleasedAtUtc = DateTimeOffset.UtcNow;
        restriction.ReleasedByUserId = UserId;
        restriction.ReleaseReason = request.Reason.Trim();
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = "DataSubjectRestrictionReleased",
            EntityType = nameof(DataProcessingRestriction),
            EntityId = restriction.Id.ToString(),
            MetadataJson = JsonSerializer.Serialize(new { restriction.DataSubjectRequestId, restriction.ProcessingScope, restriction.Status }),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        // Requires legal review: releasing a restriction only changes this
        // marker. It does not decide which other processing may resume.
        return Ok(ToView(restriction));
    }

    /// <summary>
    /// Releases only the requester's controlled profile and privacy-history
    /// domains after an authorized staff member has recorded release evidence.
    /// Password hashes, tokens, security records, staff data, and other users'
    /// information are intentionally absent from this response.
    /// </summary>
    [HttpGet("requests/{requestId:guid}/access-response")]
    public async Task<IActionResult> GetMyAccessResponse(Guid requestId, CancellationToken cancellationToken)
    {
        var request = await db.DataSubjectRequests.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Id == requestId && item.OwnerUserId == UserId && item.RequestType == DataSubjectRequestType.Access,
            cancellationToken);
        if (request is null) return NotFound();

        var fulfillment = await db.DataSubjectFulfillments.AsNoTracking().SingleOrDefaultAsync(item => item.DataSubjectRequestId == request.Id, cancellationToken);
        if (fulfillment?.Status != DataSubjectFulfillmentStatus.Released || fulfillment.ReleasedAtUtc is null) return NotFound();
        var data = await subjectDataService.GetSupportedDataAsync(request.OwnerUserId, cancellationToken);
        if (data is null) return NotFound();

        return Ok(new AccessResponseView(
            request.Id,
            fulfillment.GeneratedAtUtc,
            fulfillment.ReleasedAtUtc.Value,
            new AccessProfileView(data.Profile.DisplayName, data.Profile.Email, data.Profile.PhoneDisplay, data.Profile.CountryCode, data.Profile.Gender, data.Profile.DateOfBirth),
            new AccessPrivacyPreferencesView(data.PrivacyPreferences.MarketingConsent, data.PrivacyPreferences.MarketingConsentAtUtc),
            data.LegalAcceptances.Select(item => new AccessLegalAcceptanceView(item.DocumentSlug, item.Version, item.AcceptedAtUtc)).ToArray(),
            data.OptionalConsentHistory.Select(item => new AccessConsentHistoryView(item.Purpose, item.Decision, item.PolicyVersion, item.CaptureMethod, item.RecordedAtUtc)).ToArray()));
    }

    private async Task<IActionResult> FulfillmentResultAsync(Task<DataSubjectFulfillmentResult> operation)
    {
        var result = await operation;
        return result.Fulfillment is null
            ? Conflict(new { code = result.FailureCode, message = result.FailureMessage })
            : Ok(ToView(result.Fulfillment));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static DataSubjectFulfillmentView ToView(DataSubjectFulfillment fulfillment) => new(
        fulfillment.Id,
        fulfillment.DataSubjectRequestId,
        fulfillment.RequestType,
        fulfillment.Status,
        fulfillment.GeneratedAtUtc,
        fulfillment.GeneratedByUserId,
        fulfillment.ReleasedAtUtc,
        fulfillment.ReleasedByUserId,
        fulfillment.EvidenceJson);
    private static DataProcessingRestrictionView ToView(DataProcessingRestriction restriction) => new(
        restriction.Id,
        restriction.DataSubjectRequestId,
        restriction.SubjectUserId,
        restriction.ProcessingScope,
        restriction.Status,
        restriction.CreatedAtUtc,
        restriction.CreatedByUserId,
        restriction.ReleasedAtUtc,
        restriction.ReleasedByUserId,
        restriction.ReleaseReason);
}

public sealed record ApplyCorrectionRequest(CorrectablePersonalField Field, [param: StringLength(160)] string Value);
public sealed record ApplyRestrictionRequest([param: StringLength(100)] string ProcessingScope, [param: StringLength(2_000)] string Reason);
public sealed record RecordProfilingObjectionRequest(
    [param: StringLength(100)] string Scope,
    [param: StringLength(100)] string ReviewedOutcome,
    [param: StringLength(2_000)] string Reason);
public sealed record ReleaseRestrictionRequest([param: StringLength(2_000)] string Reason);
public sealed record DataSubjectFulfillmentView(Guid Id, Guid DataSubjectRequestId, DataSubjectRequestType RequestType, DataSubjectFulfillmentStatus Status, DateTimeOffset GeneratedAtUtc, string GeneratedByUserId, DateTimeOffset? ReleasedAtUtc, string? ReleasedByUserId, string EvidenceJson);
public sealed record DataProcessingRestrictionView(Guid Id, Guid DataSubjectRequestId, string SubjectUserId, string ProcessingScope, DataProcessingRestrictionStatus Status, DateTimeOffset CreatedAtUtc, string? CreatedByUserId, DateTimeOffset? ReleasedAtUtc, string? ReleasedByUserId, string? ReleaseReason);
public sealed record AccessResponseView(Guid RequestId, DateTimeOffset GeneratedAtUtc, DateTimeOffset ReleasedAtUtc, AccessProfileView Profile, AccessPrivacyPreferencesView PrivacyPreferences, IReadOnlyCollection<AccessLegalAcceptanceView> LegalAcceptances, IReadOnlyCollection<AccessConsentHistoryView> OptionalConsentHistory);
public sealed record AccessProfileView(string DisplayName, string? Email, string? PhoneDisplay, string? CountryCode, string? Gender, DateOnly? DateOfBirth);
public sealed record AccessPrivacyPreferencesView(bool MarketingConsent, DateTimeOffset? MarketingConsentAtUtc);
public sealed record AccessLegalAcceptanceView(string DocumentSlug, string Version, DateTimeOffset AcceptedAtUtc);
public sealed record AccessConsentHistoryView(ConsentPurpose Purpose, ConsentDecision Decision, string PolicyVersion, string CaptureMethod, DateTimeOffset RecordedAtUtc);
