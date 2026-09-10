using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Domain.Identity;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[Route("api/v1/admin/users")]
public sealed class AdminUsersController(UserManager<ApplicationUser> userManager, BetccoDbContext db, IEmailSender emailSender, IConfiguration configuration) : ControllerBase
{
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
        var results = await users.OrderBy(x => x.Email).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new { x.Id, x.Email, x.DisplayName, x.EmailConfirmed, x.IsFrozen }).ToListAsync(cancellationToken);
        return Ok(new { items = results, page, pageSize, totalCount = count });
    }

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

    [HttpPost("{userId:guid}/freeze")]
    public async Task<IActionResult> Freeze(Guid userId, FreezeUserRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.Id.ToString() == UserId) return BadRequest();
        var roles = await userManager.GetRolesAsync(user);
        if (roles.Contains(PlatformRoles.Admin) || !roles.Any(role => role is PlatformRoles.Student or PlatformRoles.Teacher)) return NotFound();
        var wasFrozen = user.IsFrozen;
        user.IsFrozen = request.Frozen;
        user.SessionsInvalidBeforeUtc = DateTimeOffset.UtcNow;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        await userManager.UpdateSecurityStampAsync(user);
        db.AuditLogs.Add(new AuditLog { ActorUserId = UserId, Action = request.Frozen ? "UserFrozen" : "UserUnfrozen", EntityType = nameof(ApplicationUser), EntityId = userId.ToString(), Outcome = "Success", OldValuesJson = AuditValues(("isFrozen", wasFrozen)), NewValuesJson = AuditValues(("isFrozen", request.Frozen)) });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

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
