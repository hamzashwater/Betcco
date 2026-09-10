using System.Text.Json;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Privacy;

/// <summary>
/// Controlled lower-risk data-subject-request fulfillment. Each operation is
/// tied to one reviewed, identity-verified request and writes evidence before
/// any request can be completed. It has no portability or erasure behavior.
/// </summary>
public sealed class DataSubjectFulfillmentService(BetccoDbContext db) : IDataSubjectFulfillmentService, IDataProcessingRestrictionChecker
{
    public async Task<DataSubjectFulfillmentResult> GenerateAccessAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.Access, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);

        var fulfillment = Create(eligibility.Request, actorUserId, DataSubjectFulfillmentStatus.Generated, new
        {
            domains = new[] { "profile", "privacy-preferences", "legal-acceptance-history", "optional-consent-history" },
            excluded = new[] { "credentials", "tokens", "security-data", "staff-only-data", "other-users-data" }
        });
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("DataSubjectAccessGenerated", fulfillment, actorUserId, new { fulfillment.Status });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public async Task<DataSubjectFulfillmentResult> ReleaseAccessAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.Access, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var fulfillment = await ExistingAsync(requestId, cancellationToken);
        if (fulfillment is null) return new(null, "ACCESS_FULFILLMENT_NOT_GENERATED", "Generate controlled access fulfillment before release.");
        if (fulfillment.Status == DataSubjectFulfillmentStatus.Released) return new(fulfillment);
        if (fulfillment.Status != DataSubjectFulfillmentStatus.Generated)
            return new(null, "ACCESS_FULFILLMENT_INVALID", "This request does not have releasable access fulfillment evidence.");

        fulfillment.Status = DataSubjectFulfillmentStatus.Released;
        fulfillment.ReleasedAtUtc = DateTimeOffset.UtcNow;
        fulfillment.ReleasedByUserId = actorUserId;
        Audit("DataSubjectAccessReleased", fulfillment, actorUserId, new { fulfillment.Status });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public async Task<DataSubjectFulfillmentResult> ApplyCorrectionAsync(Guid requestId, CorrectablePersonalField field, string value, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.Rectification, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);
        if (!TryNormalizeCorrection(field, value, out var normalized, out var error)) return new(null, "CORRECTION_VALUE_INVALID", error);

        var user = await SubjectUserAsync(eligibility.Request.OwnerUserId, cancellationToken);
        if (user is null) return new(null, "SUBJECT_ACCOUNT_NOT_FOUND", "The subject account is unavailable for this correction.");

        var changed = ApplyCorrection(user, field, normalized);
        var fulfillment = Create(eligibility.Request, actorUserId, DataSubjectFulfillmentStatus.Applied, new
        {
            field = field.ToString(),
            valueChanged = changed,
            beforeValueRecorded = false,
            afterValueRecorded = false
        });
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("DataSubjectCorrectionApplied", fulfillment, actorUserId, new { field = field.ToString(), valueChanged = changed });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public async Task<DataSubjectFulfillmentResult> ApplyRestrictionAsync(Guid requestId, string processingScope, string reason, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.Restriction, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);
        if (!IsScope(processingScope) || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 2_000)
            return new(null, "RESTRICTION_INPUT_INVALID", "Provide a configured processing scope and a reason of up to 2000 characters.");

        var restriction = new DataProcessingRestriction
        {
            DataSubjectRequestId = eligibility.Request.Id,
            SubjectUserId = eligibility.Request.OwnerUserId,
            ProcessingScope = processingScope.Trim(),
            Reason = reason.Trim(),
            CreatedByUserId = actorUserId
        };
        var fulfillment = Create(eligibility.Request, actorUserId, DataSubjectFulfillmentStatus.Applied, new
        {
            scope = restriction.ProcessingScope,
            restrictionStatus = restriction.Status.ToString(),
            reasonRecorded = true
        });
        db.DataProcessingRestrictions.Add(restriction);
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("DataSubjectRestrictionApplied", fulfillment, actorUserId, new { scope = restriction.ProcessingScope, restrictionId = restriction.Id });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public async Task<DataSubjectFulfillmentResult> WithdrawOptionalConsentAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default)
    {
        // MarketingCommunications is the only existing optional-consent purpose.
        // Whether any future purpose is withdrawable Requires legal review.
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.WithdrawMarketingConsent, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);

        var user = await SubjectUserAsync(eligibility.Request.OwnerUserId, cancellationToken);
        if (user is null) return new(null, "SUBJECT_ACCOUNT_NOT_FOUND", "The subject account is unavailable for this consent withdrawal.");

        var latestConsent = await db.ConsentRecords.AsNoTracking()
            .Where(consent => consent.UserId == eligibility.Request.OwnerUserId && consent.Purpose == ConsentPurpose.MarketingCommunications)
            .OrderByDescending(consent => consent.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (user.MarketingConsent && latestConsent is null)
            return new(null, "OPTIONAL_CONSENT_EVIDENCE_REQUIRED", "Existing optional-consent evidence is required before withdrawal can be fulfilled.");

        var changed = user.MarketingConsent;
        if (changed)
        {
            user.MarketingConsent = false;
            user.MarketingConsentAtUtc = null;
            db.ConsentRecords.Add(new ConsentRecord
            {
                UserId = eligibility.Request.OwnerUserId,
                Purpose = ConsentPurpose.MarketingCommunications,
                Decision = ConsentDecision.Withdrawn,
                PolicyVersion = latestConsent!.PolicyVersion,
                CaptureMethod = "DataSubjectRequestFulfillment"
            });
        }

        var fulfillment = Create(eligibility.Request, actorUserId, DataSubjectFulfillmentStatus.Applied, new
        {
            purpose = ConsentPurpose.MarketingCommunications.ToString(),
            consentChanged = changed,
            existingEvidencePreserved = true
        });
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("DataSubjectOptionalConsentWithdrawn", fulfillment, actorUserId, new { consentChanged = changed });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public async Task<DataSubjectFulfillmentResult> RecordProfilingObjectionAsync(
        Guid requestId,
        string scope,
        string reviewedOutcome,
        string reason,
        string actorUserId,
        CancellationToken cancellationToken = default)
    {
        // BETCCO has no runtime profiling or automated-decision subsystem to
        // disable. This records the authorized human review only. Whether the
        // objection is accepted, rejected, or subject to an exception Requires
        // legal review.
        var eligibility = await EligibleRequestAsync(requestId, DataSubjectRequestType.ObjectionToProfiling, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);
        if (!IsScope(scope) || !IsReviewOutcome(reviewedOutcome) || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 2_000)
            return new(null, "PROFILING_OBJECTION_INPUT_INVALID", "Provide a controlled scope, reviewed outcome, and reason of up to 2000 characters.");

        var normalizedScope = scope.Trim();
        var normalizedOutcome = reviewedOutcome.Trim();
        var fulfillment = Create(eligibility.Request, actorUserId, DataSubjectFulfillmentStatus.Applied, new
        {
            scope = normalizedScope,
            reviewedOutcome = normalizedOutcome,
            reason = reason.Trim(),
            runtimeProfilingControlApplied = false,
            requiresLegalReview = true
        });
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("DataSubjectProfilingObjectionReviewed", fulfillment, actorUserId, new
        {
            scope = normalizedScope,
            reviewedOutcome = normalizedOutcome,
            reasonRecorded = true,
            runtimeProfilingControlApplied = false
        });
        await db.SaveChangesAsync(cancellationToken);
        return new(fulfillment);
    }

    public Task<bool> IsRestrictedAsync(string subjectUserId, string processingScope, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subjectUserId) || !IsScope(processingScope)) return Task.FromResult(false);
        return db.DataProcessingRestrictions.AsNoTracking().AnyAsync(restriction =>
            restriction.SubjectUserId == subjectUserId &&
            restriction.Status == DataProcessingRestrictionStatus.Active &&
            restriction.ProcessingScope == processingScope,
            cancellationToken);
    }

    private async Task<EligibleRequest> EligibleRequestAsync(Guid requestId, DataSubjectRequestType expectedType, CancellationToken cancellationToken)
    {
        var request = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == requestId, cancellationToken);
        if (request is null) return new(null, "PRIVACY_REQUEST_NOT_FOUND", "The privacy request was not found.");
        if (request.RequestType != expectedType) return new(null, "PRIVACY_REQUEST_TYPE_INVALID", "This fulfillment does not match the privacy request type.");
        if (request.IdentityVerifiedAtUtc is null) return new(null, "PRIVACY_IDENTITY_VERIFICATION_REQUIRED", "Verify the requester's identity before fulfillment.");
        if (request.Status != DataSubjectRequestStatus.InReview) return new(null, "PRIVACY_REQUEST_NOT_READY", "Only an in-review privacy request can be fulfilled.");
        return new(request, null, null);
    }

    private Task<DataSubjectFulfillment?> ExistingAsync(Guid requestId, CancellationToken cancellationToken) =>
        db.DataSubjectFulfillments.SingleOrDefaultAsync(item => item.DataSubjectRequestId == requestId, cancellationToken);

    private async Task<ApplicationUser?> SubjectUserAsync(string userId, CancellationToken cancellationToken) =>
        Guid.TryParse(userId, out var id)
            ? await db.Users.SingleOrDefaultAsync(user => user.Id == id, cancellationToken)
            : null;

    private static DataSubjectFulfillment Create(DataSubjectRequest request, string actorUserId, DataSubjectFulfillmentStatus status, object evidence) => new()
    {
        DataSubjectRequestId = request.Id,
        RequestType = request.RequestType,
        Status = status,
        EvidenceJson = JsonSerializer.Serialize(evidence),
        GeneratedAtUtc = DateTimeOffset.UtcNow,
        GeneratedByUserId = actorUserId,
        CreatedByUserId = actorUserId
    };

    private void Audit(string action, DataSubjectFulfillment fulfillment, string actorUserId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actorUserId,
        Action = action,
        EntityType = nameof(DataSubjectFulfillment),
        EntityId = fulfillment.Id.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private static bool TryNormalizeCorrection(CorrectablePersonalField field, string? value, out string normalized, out string error)
    {
        normalized = value?.Trim() ?? string.Empty;
        error = "";
        if (field == CorrectablePersonalField.DisplayName && normalized.Length is > 0 and <= 160) return true;
        if (field == CorrectablePersonalField.PhoneDisplay && normalized.Length is > 0 and <= 40) return true;
        if (field == CorrectablePersonalField.CountryCode && normalized.Length == 2 && normalized.All(char.IsAsciiLetter))
        {
            normalized = normalized.ToUpperInvariant();
            return true;
        }
        if (field == CorrectablePersonalField.Gender && normalized is "Male" or "Female" or "PreferNotToSay") return true;
        error = "The requested correction value is not valid for the supported field.";
        return false;
    }

    private static bool ApplyCorrection(ApplicationUser user, CorrectablePersonalField field, string value)
    {
        var current = field switch
        {
            CorrectablePersonalField.DisplayName => user.DisplayName,
            CorrectablePersonalField.PhoneDisplay => user.PhoneDisplay,
            CorrectablePersonalField.CountryCode => user.CountryCode,
            CorrectablePersonalField.Gender => user.Gender,
            _ => null
        };
        var changed = !string.Equals(current, value, StringComparison.Ordinal);
        switch (field)
        {
            case CorrectablePersonalField.DisplayName:
                user.DisplayName = value;
                break;
            case CorrectablePersonalField.PhoneDisplay:
                user.PhoneDisplay = value;
                break;
            case CorrectablePersonalField.CountryCode:
                user.CountryCode = value;
                break;
            case CorrectablePersonalField.Gender:
                user.Gender = value;
                break;
        }
        return changed;
    }

    private static bool IsScope(string? value) => value is { Length: > 0 and <= 100 } &&
        value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');

    private static bool IsReviewOutcome(string? value) => value is { Length: > 0 and <= 100 } &&
        value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');

    private sealed record EligibleRequest(DataSubjectRequest? Request, string? FailureCode, string? FailureMessage)
    {
        public DataSubjectFulfillmentResult ToResult() => new(null, FailureCode, FailureMessage);
    }
}
