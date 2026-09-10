using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Guardian relationship foundation only. It intentionally contains no
/// student-data read route; future guardian-facing resources must authorize
/// through IGuardianAccessAuthorizer before querying student information.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/guardian-relationships")]
public sealed class GuardianRelationshipsController(
    BetccoDbContext db,
    UserManager<ApplicationUser> userManager,
    IEmailSender emailSender,
    IConfiguration configuration) : ControllerBase
{
    // Requires legal review: eligibility and legal capacity are not inferred
    // from a date of birth or a fixed age. No such policy is enforced here;
    // any future eligibility rule must be configured and independently reviewed.
    [Authorize(Policy = "Student")]
    [EnableRateLimiting("auth")]
    [HttpPost("invitations")]
    public async Task<IActionResult> CreateInvitation(CreateGuardianInvitationRequest request, CancellationToken cancellationToken)
    {
        var studentUserId = CurrentUserId();
        if (studentUserId is null) return Unauthorized();
        var email = NormalizeEmail(request.RecipientEmail);
        if (email is null) return BadRequest(new { message = "Enter a valid guardian email address." });

        var student = await userManager.FindByIdAsync(studentUserId);
        if (student is null || student.IsFrozen) return Unauthorized();
        if (string.Equals(student.Email, email, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "A guardian must use a separate account and email address." });

        var now = DateTimeOffset.UtcNow;
        var hasOutstandingInvitation = await db.GuardianInvitations.AsNoTracking().AnyAsync(invitation =>
            invitation.StudentUserId == studentUserId &&
            invitation.RecipientEmail == email &&
            invitation.Status == GuardianInvitationStatus.Issued &&
            invitation.ExpiresAtUtc > now,
            cancellationToken);
        if (hasOutstandingInvitation)
            return Conflict(new { message = "An active guardian invitation already exists for this email address." });

        var token = CreateToken();
        var invitation = new GuardianInvitation
        {
            StudentUserId = studentUserId,
            RecipientEmail = email,
            TokenHash = HashToken(token),
            ExpiresAtUtc = now.Add(GetInvitationLifetime())
        };
        db.GuardianInvitations.Add(invitation);
        db.AuditLogs.Add(Audit(
            "GuardianInvitationCreated",
            nameof(GuardianInvitation),
            invitation.Id,
            new { invitation.Status, invitation.ExpiresAtUtc }));
        await db.SaveChangesAsync(cancellationToken);

        var publicAppUrl = configuration["APP_PUBLIC_URL"]?.TrimEnd('/')
            ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/')
            ?? $"{Request.Scheme}://{Request.Host}";
        var invitationUrl = $"{publicAppUrl}/ar/guardian-invitation?invitationId={invitation.Id}&token={Uri.EscapeDataString(token)}";
        await emailSender.SendAsync(
            email,
            "Your BETCCO guardian invitation",
            $"<p>Use your own BETCCO account to accept this guardian invitation: <a href=\"{invitationUrl}\">Accept invitation</a></p>",
            cancellationToken);

        return Accepted(new GuardianInvitationView(invitation.Id, invitation.Status, invitation.ExpiresAtUtc, null));
    }

    [EnableRateLimiting("auth")]
    [HttpPost("invitations/accept")]
    public async Task<IActionResult> AcceptInvitation(AcceptGuardianInvitationRequest request, CancellationToken cancellationToken)
    {
        var guardianUserId = CurrentUserId();
        if (guardianUserId is null) return Unauthorized();
        if (!IsTokenShapeValid(request.Token)) return BadRequest(new { message = "The invitation is invalid or unavailable." });

        var guardian = await userManager.FindByIdAsync(guardianUserId);
        if (guardian is null || guardian.IsFrozen || !guardian.EmailConfirmed || string.IsNullOrWhiteSpace(guardian.Email))
            return Unauthorized();

        var invitation = await db.GuardianInvitations.SingleOrDefaultAsync(item => item.Id == request.InvitationId, cancellationToken);
        if (invitation is null || !MatchesToken(invitation.TokenHash, request.Token))
            return BadRequest(new { message = "The invitation is invalid or unavailable." });
        if (!string.Equals(invitation.RecipientEmail, NormalizeEmail(guardian.Email), StringComparison.Ordinal))
            return BadRequest(new { message = "This invitation is not issued to the signed-in account." });
        if (string.Equals(invitation.StudentUserId, guardianUserId, StringComparison.Ordinal))
            return BadRequest(new { message = "A guardian must use a separate account from the student." });

        if (invitation.Status != GuardianInvitationStatus.Issued)
            return Conflict(new { message = "This invitation is no longer available." });
        if (invitation.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            invitation.Status = GuardianInvitationStatus.Expired;
            db.AuditLogs.Add(Audit("GuardianInvitationExpired", nameof(GuardianInvitation), invitation.Id, new { source = "AcceptanceAttempt" }));
            await db.SaveChangesAsync(cancellationToken);
            return Conflict(new { message = "This invitation has expired." });
        }

        var relationship = new GuardianRelationship
        {
            GuardianInvitationId = invitation.Id,
            StudentUserId = invitation.StudentUserId,
            GuardianUserId = guardianUserId,
            Status = GuardianRelationshipStatus.Pending
        };
        invitation.Status = GuardianInvitationStatus.Accepted;
        invitation.AcceptedAtUtc = DateTimeOffset.UtcNow;
        invitation.AcceptedByUserId = guardianUserId;
        db.GuardianRelationships.Add(relationship);
        db.AuditLogs.Add(Audit("GuardianInvitationAccepted", nameof(GuardianInvitation), invitation.Id, new { relationshipId = relationship.Id }));
        db.AuditLogs.Add(Audit("GuardianRelationshipPending", nameof(GuardianRelationship), relationship.Id, new { relationship.GuardianInvitationId }));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "This invitation is no longer available." });
        }

        return Ok(ToView(relationship));
    }

    [HttpPost("{relationshipId:guid}/consents")]
    public async Task<IActionResult> RecordConsent(Guid relationshipId, RecordGuardianConsentRequest request, CancellationToken cancellationToken)
    {
        var guardianUserId = CurrentUserId();
        if (guardianUserId is null) return Unauthorized();
        if (!GuardianAccessCapabilities.IsSupported(request.Capability))
            return BadRequest(new { message = "The requested guardian capability is not supported." });
        if (request.Decision == GuardianConsentDecision.Withdrawn && string.IsNullOrWhiteSpace(request.DecisionReason))
            return BadRequest(new { message = "A reason is required when guardian consent is withdrawn." });
        if (!HasConsistentLegalReference(request))
            return BadRequest(new { message = "Provide both the legal document and version, or neither." });

        var relationship = await db.GuardianRelationships.SingleOrDefaultAsync(item => item.Id == relationshipId, cancellationToken);
        if (relationship is null || relationship.GuardianUserId != guardianUserId) return NotFound();
        if (relationship.Status is GuardianRelationshipStatus.Revoked or GuardianRelationshipStatus.Expired)
            return Conflict(new { message = "Consent cannot be recorded for a revoked or expired relationship." });

        LegalDocument? legalDocument = null;
        if (request.LegalDocumentId.HasValue)
        {
            legalDocument = await db.LegalDocuments.SingleOrDefaultAsync(document =>
                document.Id == request.LegalDocumentId &&
                document.Version == request.LegalDocumentVersion &&
                document.IsPublished && document.IsCurrent,
                cancellationToken);
            if (legalDocument is null)
                return Conflict(new { message = "The referenced legal document version is not currently available for consent." });
        }

        var consent = new GuardianConsent
        {
            GuardianRelationshipId = relationship.Id,
            StudentUserId = relationship.StudentUserId,
            GuardianUserId = guardianUserId,
            Capability = request.Capability,
            Decision = request.Decision,
            DecidedAtUtc = DateTimeOffset.UtcNow,
            ActorUserId = guardianUserId,
            DecisionReason = string.IsNullOrWhiteSpace(request.DecisionReason) ? null : request.DecisionReason.Trim(),
            LegalDocumentId = legalDocument?.Id,
            LegalDocumentVersion = legalDocument?.Version,
            CaptureMethod = "GuardianInvitation"
        };
        db.GuardianConsents.Add(consent);

        if (request.Decision == GuardianConsentDecision.Granted && relationship.Status == GuardianRelationshipStatus.Pending)
        {
            relationship.Status = GuardianRelationshipStatus.Active;
            relationship.ActivatedAtUtc = consent.DecidedAtUtc;
            db.AuditLogs.Add(Audit("GuardianRelationshipActivated", nameof(GuardianRelationship), relationship.Id, new { consent.Capability }));
        }
        else if (request.Decision == GuardianConsentDecision.Withdrawn && relationship.Status == GuardianRelationshipStatus.Active)
        {
            relationship.Status = GuardianRelationshipStatus.Pending;
            db.AuditLogs.Add(Audit("GuardianRelationshipConsentWithdrawn", nameof(GuardianRelationship), relationship.Id, new { consent.Capability }));
        }

        db.AuditLogs.Add(Audit(
            "GuardianConsentRecorded",
            nameof(GuardianConsent),
            consent.Id,
            new { consent.GuardianRelationshipId, consent.Capability, consent.Decision, consent.LegalDocumentId, consent.LegalDocumentVersion }));
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(relationship));
    }

    [Authorize(Policy = "Student")]
    [HttpPost("invitations/{invitationId:guid}/revoke")]
    public async Task<IActionResult> RevokeInvitation(Guid invitationId, RevokeGuardianInvitationRequest request, CancellationToken cancellationToken)
    {
        var studentUserId = CurrentUserId();
        if (studentUserId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 1_000)
            return BadRequest(new { message = "A revocation reason of up to 1000 characters is required." });

        var invitation = await db.GuardianInvitations.SingleOrDefaultAsync(item => item.Id == invitationId && item.StudentUserId == studentUserId, cancellationToken);
        if (invitation is null) return NotFound();
        if (invitation.Status != GuardianInvitationStatus.Issued)
            return Conflict(new { message = "Only an issued invitation can be revoked." });
        if (invitation.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            invitation.Status = GuardianInvitationStatus.Expired;
            db.AuditLogs.Add(Audit("GuardianInvitationExpired", nameof(GuardianInvitation), invitation.Id, new { source = "RevocationAttempt" }));
            await db.SaveChangesAsync(cancellationToken);
            return Conflict(new { message = "This invitation has expired." });
        }

        invitation.Status = GuardianInvitationStatus.Revoked;
        invitation.RevokedAtUtc = DateTimeOffset.UtcNow;
        invitation.RevokedByUserId = studentUserId;
        invitation.RevocationReason = request.Reason.Trim();
        db.AuditLogs.Add(Audit("GuardianInvitationRevoked", nameof(GuardianInvitation), invitation.Id, new { reason = "recorded" }));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{relationshipId:guid}/revoke")]
    public async Task<IActionResult> RevokeRelationship(Guid relationshipId, RevokeGuardianRelationshipRequest request, CancellationToken cancellationToken)
    {
        var actorUserId = CurrentUserId();
        if (actorUserId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 1_000)
            return BadRequest(new { message = "A revocation reason of up to 1000 characters is required." });

        var relationship = await db.GuardianRelationships.SingleOrDefaultAsync(item => item.Id == relationshipId, cancellationToken);
        if (relationship is null || (relationship.StudentUserId != actorUserId && relationship.GuardianUserId != actorUserId)) return NotFound();
        if (relationship.Status is GuardianRelationshipStatus.Revoked or GuardianRelationshipStatus.Expired)
            return Conflict(new { message = "This relationship is no longer active." });

        relationship.Status = GuardianRelationshipStatus.Revoked;
        relationship.RevokedAtUtc = DateTimeOffset.UtcNow;
        relationship.RevokedByUserId = actorUserId;
        relationship.RevocationReason = request.Reason.Trim();
        db.AuditLogs.Add(Audit("GuardianRelationshipRevoked", nameof(GuardianRelationship), relationship.Id, new { reason = "recorded" }));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private string? CurrentUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private AuditLog Audit(string action, string entityType, Guid entityId, object metadata) => new()
    {
        ActorUserId = CurrentUserId(),
        Action = action,
        EntityType = entityType,
        EntityId = entityId.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    };

    private TimeSpan GetInvitationLifetime()
    {
        var configuredHours = configuration.GetValue<int?>("Privacy:GuardianInvitationLifetimeHours") ?? 168;
        return TimeSpan.FromHours(Math.Clamp(configuredHours, 1, 30 * 24));
    }

    private static GuardianRelationshipView ToView(GuardianRelationship relationship) => new(
        relationship.Id,
        relationship.Status,
        relationship.ActivatedAtUtc,
        relationship.RevokedAtUtc);

    private static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim();
        return string.IsNullOrWhiteSpace(value) || value.Length > 320 || !value.Contains('@', StringComparison.Ordinal)
            ? null
            : value.ToUpperInvariant();
    }

    private static string CreateToken() => Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static bool MatchesToken(string storedHash, string token)
    {
        try
        {
            return CryptographicOperations.FixedTimeEquals(Convert.FromHexString(storedHash), SHA256.HashData(Encoding.UTF8.GetBytes(token)));
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool IsTokenShapeValid(string? token) => token?.Length is >= 32 and <= 512;

    private static bool HasConsistentLegalReference(RecordGuardianConsentRequest request) =>
        request.LegalDocumentId.HasValue == !string.IsNullOrWhiteSpace(request.LegalDocumentVersion);
}

public sealed record CreateGuardianInvitationRequest(string RecipientEmail);
public sealed record AcceptGuardianInvitationRequest(Guid InvitationId, string Token);
public sealed record RecordGuardianConsentRequest(
    string Capability,
    GuardianConsentDecision Decision,
    string? DecisionReason,
    Guid? LegalDocumentId,
    string? LegalDocumentVersion);
public sealed record RevokeGuardianInvitationRequest(string Reason);
public sealed record RevokeGuardianRelationshipRequest(string Reason);
public sealed record GuardianInvitationView(Guid Id, GuardianInvitationStatus Status, DateTimeOffset ExpiresAtUtc, DateTimeOffset? AcceptedAtUtc);
public sealed record GuardianRelationshipView(Guid Id, GuardianRelationshipStatus Status, DateTimeOffset? ActivatedAtUtc, DateTimeOffset? RevokedAtUtc);
