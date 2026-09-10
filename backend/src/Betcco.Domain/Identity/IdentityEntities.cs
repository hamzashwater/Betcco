using Betcco.Domain.Common;

namespace Betcco.Domain.Identity;

public enum TeacherInvitationStatus
{
    Issued,
    Accepted,
    Expired,
    Revoked
}

public enum RegistrationEmailDeliveryStatus
{
    Pending,
    Processing,
    Failed,
    Sent
}

/// <summary>
/// Durable intent to deliver the confirmation email for a committed student
/// registration. Confirmation tokens are generated only during delivery and
/// are never persisted in the outbox.
/// </summary>
public sealed class RegistrationEmailOutboxMessage : Entity
{
    public Guid UserId { get; set; }
    public required string RecipientEmail { get; set; }
    public RegistrationEmailDeliveryStatus Status { get; set; } = RegistrationEmailDeliveryStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTimeOffset NextAttemptAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessingStartedAtUtc { get; set; }
    public DateTimeOffset? LastAttemptAtUtc { get; set; }
    public DateTimeOffset? SentAtUtc { get; set; }
    public string? LastFailureCode { get; set; }
    public string? ProtectedConfirmationToken { get; set; }
}

/// <summary>
/// Records the lifecycle of an administrator-issued teacher invitation. The
/// actual password-reset token remains an ASP.NET Identity protected token and
/// is never persisted in this table.
/// </summary>
public sealed class TeacherInvitation : Entity
{
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public required string TeacherUserId { get; set; }
    public required string InvitedByUserId { get; set; }
    public TeacherInvitationStatus Status { get; set; } = TeacherInvitationStatus.Issued;
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? AcceptedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? RevokedByUserId { get; set; }
    public string? RevocationReason { get; set; }
}

public sealed class StudentDeviceBinding : Entity
{
    public required string StudentUserId { get; set; }
    public required string DeviceHash { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset LastSeenAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? ResetReason { get; set; }
}
