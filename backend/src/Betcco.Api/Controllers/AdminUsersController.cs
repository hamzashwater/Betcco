using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Text.Json;
using Betcco.Api.Authorization;
using Betcco.Application.Common;
using Betcco.Domain.Identity;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/admin/users")]
public sealed class AdminUsersController(UserManager<ApplicationUser> userManager, BetccoDbContext db, IEmailSender emailSender, IConfiguration configuration, IDataProtectionProvider dataProtection) : ControllerBase
{
    [Authorize(Policy = "SystemAdmin")]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? role, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var users = userManager.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search)) users = users.Where(x => x.Email!.Contains(search) || x.DisplayName.Contains(search));
        if (!string.IsNullOrWhiteSpace(role))
        {
            var userIds = await db.UserRoles.Where(x => db.Roles.Where(r => r.Name == role).Select(r => r.Id).Contains(x.RoleId)).Select(x => x.UserId).ToArrayAsync(cancellationToken);
            users = users.Where(x => userIds.Contains(x.Id));
        }
        var count = await users.CountAsync(cancellationToken);
        var results = await users.OrderBy(x => x.Email).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new { x.Id, x.Email, x.DisplayName, x.EmailConfirmed, x.IsFrozen, x.MustChangePassword }).ToListAsync(cancellationToken);
        return Ok(new { items = results, page, pageSize, totalCount = count });
    }

    [Authorize(Policy = "StudentTeacherFreeze")]
    [HttpGet("freeze-targets")]
    public async Task<IActionResult> ListFreezeTargets([FromQuery] string role, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        if (role is not (PlatformRoles.Student or PlatformRoles.Teacher)) return BadRequest();
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var requestedRoleIds = db.Roles.Where(item => item.Name == role).Select(item => item.Id);
        var otherRoleIds = db.Roles.Where(item => item.Name != PlatformRoles.Student && item.Name != PlatformRoles.Teacher).Select(item => item.Id);
        var users = db.Users.AsNoTracking().Where(user =>
            db.UserRoles.Any(link => link.UserId == user.Id && requestedRoleIds.Contains(link.RoleId))
            && !db.UserRoles.Any(link => link.UserId == user.Id && otherRoleIds.Contains(link.RoleId)));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (term.Length > 100) return BadRequest();
            users = users.Where(user => user.DisplayName.Contains(term) || user.Email!.Contains(term));
        }
        var totalCount = await users.CountAsync(cancellationToken);
        var items = await users.OrderBy(user => user.DisplayName).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(user => new { user.Id, user.DisplayName, user.Email, user.IsFrozen }).ToListAsync(cancellationToken);
        return Ok(new { items, totalCount, page, pageSize });
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("teachers/invite")]
    public async Task<IActionResult> InviteTeacher(InviteTeacherRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var displayName = request.DisplayName.Trim();
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || string.IsNullOrWhiteSpace(displayName) || displayName.Length > 200)
            return BadRequest(new { message = "Enter a valid teacher name and email address." });
        if (await userManager.FindByEmailAsync(email) is not null) return Conflict(new { message = "This email already has an account." });
        var password = $"T!{Guid.NewGuid():N}a9";
        var teacher = new ApplicationUser { UserName = email, Email = email, DisplayName = displayName, EmailConfirmed = true, MustChangePassword = true };
        var result = await userManager.CreateAsync(teacher, password);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        await userManager.AddToRoleAsync(teacher, PlatformRoles.Teacher);
        var invitation = new TeacherInvitation
        {
            Email = email,
            DisplayName = displayName,
            TeacherUserId = teacher.Id.ToString(),
            InvitedByUserId = UserId,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(7)
        };
        db.TeacherInvitations.Add(invitation);
        var token = await userManager.GeneratePasswordResetTokenAsync(teacher);
        var publicAppUrl = configuration["APP_PUBLIC_URL"]?.TrimEnd('/') ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/') ?? $"{Request.Scheme}://{Request.Host}";
        var resetUrl = $"{publicAppUrl}/ar/reset-password?userId={teacher.Id}&token={Uri.EscapeDataString(token)}";
        await emailSender.SendAsync(teacher.Email, "Your BETCCO teacher invitation", $"<p>Set your BETCCO teacher password: <a href=\"{resetUrl}\">Set password</a></p>", cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "TeacherInvited", EntityType = nameof(TeacherInvitation), EntityId = invitation.Id.ToString(), Outcome = "Success", NewValuesJson = AuditValues(("role", PlatformRoles.Teacher), ("emailConfirmed", true), ("expiresAtUtc", invitation.ExpiresAtUtc)) });
        await db.SaveChangesAsync(cancellationToken);
        return Accepted(new { id = teacher.Id, invitationId = invitation.Id, status = invitation.Status.ToString(), invitation.ExpiresAtUtc, message = "Teacher invitation sent." });
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("{userId:guid}/email-change/request")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> RequestManagedEmailChange(Guid userId, ManagedEmailChangeRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.Id.ToString() == UserId) return NotFound();
        if (user.MustChangePassword || !user.EmailConfirmed) return Conflict(new { message = "Activate the account before changing its email." });
        var roles = await userManager.GetRolesAsync(user);
        if (roles.Contains(PlatformRoles.Admin) || roles.Contains(PlatformRoles.SystemAdmin)
            || !roles.Any(role => role is PlatformRoles.Teacher or PlatformRoles.SupportAdmin)) return NotFound();
        var newEmail = request.NewEmail.Trim();
        if (string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Enter a different email address." });
        if (await userManager.FindByEmailAsync(newEmail) is not null) return Conflict(new { message = "This email already has an account." });

        var identityToken = await userManager.GenerateChangeEmailTokenAsync(user, newEmail);
        var proof = EmailChangeProof.Protect(dataProtection, "managed", identityToken);
        var publicAppUrl = configuration["APP_PUBLIC_URL"]?.TrimEnd('/') ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/') ?? $"{Request.Scheme}://{Request.Host}";
        var url = $"{publicAppUrl}/ar/change-email?mode=managed&userId={user.Id}&email={Uri.EscapeDataString(newEmail)}&proof={Uri.EscapeDataString(proof)}";
        await emailSender.SendAsync(newEmail, "Confirm your BETCCO work email", $"<p>Confirm your new work email: <a href=\"{url}\">Confirm email</a></p>", cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "ManagedUserEmailChangeRequested", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return Accepted(new { message = "A confirmation link was sent to the new email address. It expires in one hour." });
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("support-admins/invite")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> InviteSupportAdmin(InviteSupportAdminRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var email = request.Email.Trim();
        var displayName = request.DisplayName.Trim();
        if (await userManager.FindByEmailAsync(email) is not null) return Conflict(new { message = "This email already has an account." });
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken) : null;
        var user = new ApplicationUser { UserName = email, Email = email, DisplayName = displayName, EmailConfirmed = false, MustChangePassword = true };
        var temporaryPassword = $"T!{Guid.NewGuid():N}a9";
        var result = await userManager.CreateAsync(user, temporaryPassword);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
        result = await userManager.AddToRoleAsync(user, PlatformRoles.SupportAdmin);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "SupportAdminProvisioned", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await SendSupportAdminActivationAsync(user, cancellationToken);
        return Accepted(new { id = user.Id, message = "Support administrator activation email sent." });
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("support-admins/{userId:guid}/resend-activation")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ResendSupportAdminActivation(Guid userId, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.IsFrozen || !user.MustChangePassword || user.EmailConfirmed
            || !await userManager.IsInRoleAsync(user, PlatformRoles.SupportAdmin)) return NotFound();
        await SendSupportAdminActivationAsync(user, cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "SupportAdminActivationResent", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return Accepted();
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("support-admins/{userId:guid}/revoke-authority")]
    public async Task<IActionResult> RevokeSupportAdminAuthority(Guid userId, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionAuthorizationHandler.HasPermission(User, PlatformPermissions.ManageUsers)) return Forbid();
        if (userId.ToString() == UserId) return Forbid();
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null) return NotFound();
        var roles = await userManager.GetRolesAsync(user);
        if (!roles.Contains(PlatformRoles.SupportAdmin) || roles.Contains(PlatformRoles.Admin) || roles.Contains(PlatformRoles.SystemAdmin)) return NotFound();

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        var removeResult = await userManager.RemoveFromRoleAsync(user, PlatformRoles.SupportAdmin);
        if (!removeResult.Succeeded) return BadRequest(new ValidationProblemDetails(removeResult.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
        var stampResult = await userManager.UpdateSecurityStampAsync(user);
        if (!stampResult.Succeeded) return Problem("Unable to invalidate account sessions.");

        var now = DateTimeOffset.UtcNow;
        var sessions = await db.UserSessions.Where(session => session.UserId == userId.ToString() && session.RevokedAtUtc == null && !session.IsDeleted).ToListAsync(cancellationToken);
        foreach (var session in sessions)
        {
            session.RevokedAtUtc = now;
            session.RevokedByUserId = UserId;
            session.RevocationReason = "Support administrator authority revoked";
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "SupportAdminAuthorityRevoked", EntityType = nameof(ApplicationUser), EntityId = userId.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    private async Task SendSupportAdminActivationAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var publicAppUrl = configuration["APP_PUBLIC_URL"]?.TrimEnd('/') ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/') ?? $"{Request.Scheme}://{Request.Host}";
        var resetUrl = $"{publicAppUrl}/ar/reset-password?userId={user.Id}&token={Uri.EscapeDataString(token)}";
        await emailSender.SendAsync(user.Email!, "Activate your BETCCO support administrator account", $"<p>Set your private BETCCO password to activate your account: <a href=\"{resetUrl}\">Activate account</a></p>", cancellationToken);
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpGet("teachers/invitations")]
    public async Task<IActionResult> ListTeacherInvitations([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        await ExpireTeacherInvitationsAsync(cancellationToken);
        var query = db.TeacherInvitations.AsNoTracking().OrderByDescending(item => item.CreatedAtUtc);
        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).Select(item => new
        {
            item.Id,
            item.Email,
            item.DisplayName,
            status = item.Status.ToString(),
            item.CreatedAtUtc,
            item.ExpiresAtUtc,
            item.AcceptedAtUtc,
            item.RevokedAtUtc,
            canRevoke = item.Status == TeacherInvitationStatus.Issued
        }).ToListAsync(cancellationToken);
        return Ok(new { items, page, pageSize, totalCount });
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("teachers/invitations/{invitationId:guid}/revoke")]
    public async Task<IActionResult> RevokeTeacherInvitation(Guid invitationId, RevokeTeacherInvitationRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 500)
            return BadRequest(new { message = "A revocation reason of up to 500 characters is required." });
        var invitation = await db.TeacherInvitations.SingleOrDefaultAsync(item => item.Id == invitationId, cancellationToken);
        if (invitation is null) return NotFound();
        if (invitation.Status == TeacherInvitationStatus.Issued && invitation.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            invitation.Status = TeacherInvitationStatus.Expired;
            db.AuditLogs.Add(new AuditLog
            {
                Action = "TeacherInvitationExpired",
                EntityType = nameof(TeacherInvitation),
                EntityId = invitation.Id.ToString(),
                Outcome = "Success",
                MetadataJson = "{\"source\":\"RevocationAttempt\"}"
            });
            await db.SaveChangesAsync(cancellationToken);
            return Conflict(new { message = "This invitation has expired." });
        }
        if (invitation.Status != TeacherInvitationStatus.Issued) return Conflict(new { message = "Only an issued invitation can be revoked." });

        invitation.Status = TeacherInvitationStatus.Revoked;
        invitation.RevokedAtUtc = DateTimeOffset.UtcNow;
        invitation.RevokedByUserId = UserId;
        invitation.RevocationReason = request.Reason.Trim();
        var teacher = await userManager.FindByIdAsync(invitation.TeacherUserId);
        if (teacher is not null)
        {
            teacher.IsFrozen = true;
            teacher.SessionsInvalidBeforeUtc = DateTimeOffset.UtcNow;
            var result = await userManager.UpdateAsync(teacher);
            if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
            await userManager.UpdateSecurityStampAsync(teacher);
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "TeacherInvitationRevoked", EntityType = nameof(TeacherInvitation), EntityId = invitation.Id.ToString(), Outcome = "Success", MetadataJson = "{\"reason\":\"recorded\"}" });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "StudentTeacherFreeze")]
    [HttpPost("{userId:guid}/freeze")]
    public async Task<IActionResult> Freeze(Guid userId, FreezeUserRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.Id.ToString() == UserId) return BadRequest();
        var roles = await userManager.GetRolesAsync(user);
        var privilegedActor = User.IsInRole(PlatformRoles.Admin) || User.IsInRole(PlatformRoles.SystemAdmin);
        if (!privilegedActor && (roles.Count == 0 || roles.Any(role => role is not (PlatformRoles.Student or PlatformRoles.Teacher)))) return NotFound();
        if (privilegedActor && roles.Contains(PlatformRoles.Admin) && !User.IsInRole(PlatformRoles.Admin)) return NotFound();
        if (roles.Count == 0) return NotFound();
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        var wasFrozen = user.IsFrozen;
        user.IsFrozen = request.Frozen;
        user.SessionsInvalidBeforeUtc = DateTimeOffset.UtcNow;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        var stampResult = await userManager.UpdateSecurityStampAsync(user);
        if (!stampResult.Succeeded) return Problem("Unable to update account security.");
        var sessions = await db.UserSessions.Where(session => session.UserId == userId.ToString() && session.RevokedAtUtc == null && !session.IsDeleted).ToListAsync(cancellationToken);
        foreach (var session in sessions)
        {
            session.RevokedAtUtc = DateTimeOffset.UtcNow;
            session.RevokedByUserId = UserId;
            session.RevocationReason = request.Frozen ? "Account frozen" : "Account unfrozen; sign in again";
        }
        var action = roles.Contains(PlatformRoles.Teacher) ? (request.Frozen ? "TeacherFrozen" : "TeacherUnfrozen")
            : roles.Contains(PlatformRoles.Student) ? (request.Frozen ? "StudentFrozen" : "StudentUnfrozen")
            : request.Frozen ? "UserFrozen" : "UserUnfrozen";
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = action, EntityType = nameof(ApplicationUser), EntityId = userId.ToString(), Outcome = "Success", OldValuesJson = AuditValues(("isFrozen", wasFrozen)), NewValuesJson = AuditValues(("isFrozen", request.Frozen)) });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpDelete("{userId:guid}")]
    public async Task<IActionResult> DeleteStudent(Guid userId, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.Id.ToString() == UserId || !await userManager.IsInRoleAsync(user, PlatformRoles.Student)) return NotFound();

        // Student device identifiers are account-scoped and must be removed together
        // with the account. Financial and learning records remain for audit purposes.
        var bindings = await db.StudentDeviceBindings.Where(x => x.StudentUserId == user.Id.ToString()).ToListAsync(cancellationToken);
        db.StudentDeviceBindings.RemoveRange(bindings);
        var result = await userManager.DeleteAsync(user);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));

        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "StudentDeleted", EntityType = nameof(ApplicationUser), EntityId = userId.ToString(), Outcome = "Success", OldValuesJson = AuditValues(("accountState", "Active")), NewValuesJson = AuditValues(("accountState", "Deleted")) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("{userId:guid}/approve")]
    public async Task<IActionResult> ApproveStudent(Guid userId, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || !await userManager.IsInRoleAsync(user, PlatformRoles.Student)) return NotFound();
        if (user.EmailConfirmed) return NoContent();

        var wasApproved = user.EmailConfirmed;
        user.EmailConfirmed = true;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));

        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "StudentApproved", EntityType = nameof(ApplicationUser), EntityId = userId.ToString(), Outcome = "Success", OldValuesJson = AuditValues(("emailConfirmed", wasApproved)), NewValuesJson = AuditValues(("emailConfirmed", true)) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "SystemAdmin")]
    [HttpPost("{userId:guid}/reset-device")]
    public async Task<IActionResult> ResetDevice(Guid userId, ResetDeviceRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { message = "A reset reason is required." });
        var binding = await db.StudentDeviceBindings.SingleOrDefaultAsync(x => x.StudentUserId == userId.ToString() && x.IsActive, cancellationToken);
        if (binding is null) return NotFound();
        binding.IsActive = false; binding.ResetReason = request.Reason.Trim();
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = "StudentDeviceReset", EntityType = "StudentDeviceBinding", EntityId = binding.Id.ToString(), Outcome = "Success", MetadataJson = "{\"reason\":\"recorded\"}", OldValuesJson = AuditValues(("isActive", true)), NewValuesJson = AuditValues(("isActive", false)) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static string AuditValues(params (string Name, object Value)[] values) => JsonSerializer.Serialize(values.ToDictionary(value => value.Name, value => value.Value));

    private async Task ExpireTeacherInvitationsAsync(CancellationToken cancellationToken)
    {
        var expired = await db.TeacherInvitations
            .Where(item => item.Status == TeacherInvitationStatus.Issued && item.ExpiresAtUtc <= DateTimeOffset.UtcNow)
            .ToListAsync(cancellationToken);
        if (expired.Count == 0) return;
        foreach (var invitation in expired)
        {
            invitation.Status = TeacherInvitationStatus.Expired;
            db.AuditLogs.Add(new AuditLog
            {
                Action = "TeacherInvitationExpired",
                EntityType = nameof(TeacherInvitation),
                EntityId = invitation.Id.ToString(),
                Outcome = "Success",
                MetadataJson = "{\"source\":\"InvitationList\"}"
            });
        }
        await db.SaveChangesAsync(cancellationToken);
    }
}

public sealed record InviteTeacherRequest(string DisplayName, string Email);
public sealed record RevokeTeacherInvitationRequest(string Reason);
public sealed record FreezeUserRequest(bool Frozen);
public sealed record ResetDeviceRequest(string Reason);
public sealed record ManagedEmailChangeRequest([param: Required, EmailAddress, StringLength(320)] string NewEmail);
public sealed record InviteSupportAdminRequest(
    [param: Required, StringLength(160, MinimumLength = 2)] string DisplayName,
    [param: Required, EmailAddress, StringLength(320)] string Email);
