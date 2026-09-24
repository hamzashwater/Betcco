using System.Security.Cryptography;
using System.Security.Claims;
using System.Data;
using System.Text;
using System.ComponentModel.DataAnnotations;
using Betcco.Application.Common;
using Betcco.Api.Authorization;
using Betcco.Domain.Common;
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
[Route("api/v1/auth")]
public sealed class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    BetccoDbContext db,
    IEmailSender emailSender,
    IDataProtectionProvider dataProtection,
    IWebHostEnvironment environment,
    IConfiguration configuration) : ControllerBase
{
    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (!request.TermsAccepted) return BadRequest(new { message = "You must accept the Terms and Privacy Policy." });
        if (!IsValidRegistrationProfile(request, out var profileError))
            return BadRequest(new { code = "REGISTRATION_PROFILE_INVALID", message = profileError });
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var requiredLegalDocuments = await db.LegalDocuments
            .Where(document => document.IsPublished && document.IsCurrent && (document.Slug == "terms" || document.Slug == "privacy"))
            .ToListAsync(cancellationToken);
        var terms = requiredLegalDocuments.SingleOrDefault(document => document.Slug == "terms");
        var privacy = requiredLegalDocuments.SingleOrDefault(document => document.Slug == "privacy");
        if (terms is null || privacy is null) return Problem("Required legal documents are unavailable. Please try again later.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (!string.Equals(request.TermsVersion, terms.Version, StringComparison.Ordinal) || !string.Equals(request.PrivacyVersion, privacy.Version, StringComparison.Ordinal))
            return Conflict(new { message = "The legal documents have changed. Review the current version and submit your registration again." });
        if (await userManager.FindByEmailAsync(request.Email.Trim()) is not null) return Conflict(new { message = "An account with this email already exists." });
        var acceptedAt = DateTimeOffset.UtcNow;
        var user = new ApplicationUser
        {
            UserName = request.Email.Trim(),
            Email = request.Email.Trim(),
            DisplayName = request.DisplayName.Trim(),
            PhoneNumber = request.Phone.Trim(),
            PhoneDisplay = request.Phone.Trim(),
            CountryCode = request.CountryCode.Trim().ToUpperInvariant(),
            Gender = request.Gender.Trim(),
            DateOfBirth = request.DateOfBirth,
            TermsVersionAccepted = terms.Version,
            PrivacyVersionAccepted = privacy.Version,
            LegalAcceptedAtUtc = acceptedAt,
            MarketingConsent = request.MarketingConsent,
            MarketingConsentAtUtc = request.MarketingConsent ? acceptedAt : null
        };
        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        var roleResult = await userManager.AddToRoleAsync(user, PlatformRoles.Student);
        if (!roleResult.Succeeded) return Problem(
            "The account could not be assigned its required role.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
        db.LegalAcceptances.AddRange(
            new LegalAcceptance { UserId = user.Id.ToString(), LegalDocumentId = terms.Id, Version = terms.Version, AcceptedAtUtc = acceptedAt },
            new LegalAcceptance { UserId = user.Id.ToString(), LegalDocumentId = privacy.Id, Version = privacy.Version, AcceptedAtUtc = acceptedAt });
        if (request.MarketingConsent)
            RecordMarketingConsent(user.Id.ToString(), ConsentDecision.Granted, "Registration");
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "StudentRegistered", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        db.RegistrationEmailOutboxMessages.Add(new RegistrationEmailOutboxMessage
        {
            UserId = user.Id,
            RecipientEmail = user.Email,
            NextAttemptAtUtc = acceptedAt
        });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Accepted(new { message = "Account created. Verify your email before signing in." });
    }

    [HttpPost("forgot-password")]
    [EnableRateLimiting("password-reset")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is not null && user.EmailConfirmed)
        {
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var url = $"{PublicAppUrl}/ar/reset-password?userId={user.Id}&token={Uri.EscapeDataString(token)}";
            await emailSender.SendAsync(user.Email!, "Reset your BETCCO password", $"<p>Reset your BETCCO password: <a href=\"{url}\">Reset password</a></p>", cancellationToken);
        }
        return Accepted(new { message = "If an eligible account exists, a password-reset email has been sent." });
    }

    [HttpPost("reset-password")]
    [EnableRateLimiting("password-reset")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var user = await userManager.FindByIdAsync(request.UserId.ToString());
        if (user is null) return BadRequest(new { message = "The reset link is invalid or expired." });

        var invitation = await db.TeacherInvitations
            .SingleOrDefaultAsync(item => item.TeacherUserId == user.Id.ToString() && item.Status == TeacherInvitationStatus.Issued);
        if (invitation is not null && invitation.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            invitation.Status = TeacherInvitationStatus.Expired;
            db.AuditLogs.Add(new AuditLog
            {
                Action = "TeacherInvitationExpired",
                EntityType = nameof(TeacherInvitation),
                EntityId = invitation.Id.ToString(),
                Outcome = "Success",
                MetadataJson = "{\"source\":\"PasswordReset\"}"
            });
            await db.SaveChangesAsync();
            return BadRequest(new { message = "The reset link is invalid or expired." });
        }
        if (await db.TeacherInvitations.AsNoTracking().AnyAsync(item => item.TeacherUserId == user.Id.ToString()
            && (item.Status == TeacherInvitationStatus.Revoked || item.Status == TeacherInvitationStatus.Expired)))
            return BadRequest(new { message = "The reset link is invalid or expired." });

        var result = await userManager.ResetPasswordAsync(user, request.Token, request.Password);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        if (user.MustChangePassword)
        {
            var activatingSupportAdmin = !user.EmailConfirmed && await userManager.IsInRoleAsync(user, PlatformRoles.SupportAdmin);
            user.MustChangePassword = false;
            if (activatingSupportAdmin) user.EmailConfirmed = true;
            var updateResult = await userManager.UpdateAsync(user);
            if (!updateResult.Succeeded) return BadRequest(new ValidationProblemDetails(updateResult.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
            db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "RequiredPasswordChanged", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
            if (activatingSupportAdmin)
                db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "SupportAdminActivated", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        }
        if (invitation is not null)
        {
            invitation.Status = TeacherInvitationStatus.Accepted;
            invitation.AcceptedAtUtc = DateTimeOffset.UtcNow;
            db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "TeacherInvitationAccepted", EntityType = nameof(TeacherInvitation), EntityId = invitation.Id.ToString(), Outcome = "Success" });
        }
        await db.SaveChangesAsync();
        return Ok(new { message = "Password updated. You can now sign in." });
    }

    [HttpPost("confirm-email")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ConfirmEmail(Guid userId, string token)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null) return NotFound(new { code = "EMAIL_CONFIRMATION_INVALID", message = "The verification link is invalid or expired." });
        var result = await userManager.ConfirmEmailAsync(user, token);
        return result.Succeeded
            ? Ok(new { message = "Email verified." })
            : BadRequest(new { code = "EMAIL_CONFIRMATION_INVALID", message = "The verification link is invalid or expired." });
    }

    [HttpPost("test/confirm-email")]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> ConfirmEmailForDevelopment(DevelopmentConfirmRequest request)
    {
        if (!environment.IsDevelopment()) return NotFound();
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null) return NotFound();
        user.EmailConfirmed = true;
        await userManager.UpdateAsync(user);
        return Ok(new { message = "Development email confirmation completed." });
    }

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null || user.IsFrozen) return Unauthorized(new { message = "Invalid credentials or account unavailable." });
        var check = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!check.Succeeded) return Unauthorized(new { message = check.IsNotAllowed ? "Verify your email before signing in." : "Invalid credentials." });
        if (user.MustChangePassword)
            return Unauthorized(new { code = "PASSWORD_CHANGE_REQUIRED", message = "You must reset your password before signing in." });
        if (await userManager.GetTwoFactorEnabledAsync(user))
        {
            var code = NormalizeAuthenticatorCode(request.TwoFactorCode);
            if (code is null) return Unauthorized(new { code = "TWO_FACTOR_REQUIRED", message = "Enter the six-digit code from your authenticator app." });
            var valid = await userManager.VerifyTwoFactorTokenAsync(user, TokenOptions.DefaultAuthenticatorProvider, code);
            if (!valid) return Unauthorized(new { code = "TWO_FACTOR_INVALID", message = "The authenticator code is invalid or expired." });
        }
        // A browser/device change is a useful security signal, not an access
        // control. Blocking a legitimate student here created lockouts whenever
        // they changed browser or device. Sessions, password controls and the
        // audit trail remain the enforcement mechanisms.
        if (await userManager.IsInRoleAsync(user, PlatformRoles.Student))
            await ObserveStudentDeviceAsync(user, cancellationToken);
        var roles = await userManager.GetRolesAsync(user);
        var requiresMfaEnrollment = StaffMfaPolicy.RequiresStaffMfa(roles) && !await userManager.GetTwoFactorEnabledAsync(user);
        if (requiresMfaEnrollment)
            db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "StaffMfaEnrollmentRequired", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        var session = await CreateSessionAsync(user, cancellationToken);
        await signInManager.SignInWithClaimsAsync(user, request.RememberMe, [new Claim(BetccoAuthClaims.SessionId, session.Id.ToString())]);
        return Ok(new { user = new { id = user.Id, email = user.Email, displayName = user.DisplayName, roles, requiresMfaEnrollment } });
    }

    [Authorize]
    [HttpPost("logout")]
    [StaffMfaBootstrap]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is not null) await RevokeCurrentSessionAsync(user.Id.ToString(), "Signed out", cancellationToken);
        await signInManager.SignOutAsync();
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    [StaffMfaBootstrap]
    public async Task<IActionResult> Me()
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen)
        {
            if (user is not null) await signInManager.SignOutAsync();
            return Unauthorized();
        }
        var roles = await userManager.GetRolesAsync(user);
        return Ok(new
        {
            id = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            roles,
            isFrozen = user.IsFrozen,
            requiresMfaEnrollment = StaffMfaPolicy.RequiresStaffMfa(roles) && !await userManager.GetTwoFactorEnabledAsync(user)
        });
    }

    [Authorize]
    [HttpGet("profile")]
    public async Task<IActionResult> Profile()
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen) return Unauthorized();
        return Ok(new
        {
            displayName = user.DisplayName,
            email = user.Email,
            phone = user.PhoneDisplay ?? user.PhoneNumber,
            countryCode = user.CountryCode,
            gender = user.Gender,
            dateOfBirth = user.DateOfBirth,
            user.MarketingConsent
        });
    }

    [Authorize]
    [HttpPut("profile")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen) return Unauthorized();

        var displayName = request.DisplayName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        var countryCode = string.IsNullOrWhiteSpace(request.CountryCode) ? user.CountryCode : request.CountryCode.Trim().ToUpperInvariant();
        var gender = string.IsNullOrWhiteSpace(request.Gender) ? user.Gender : request.Gender.Trim();
        var dateOfBirth = request.DateOfBirth ?? user.DateOfBirth;
        if (!IsValidOptionalProfileFields(request, out var profileError))
            return BadRequest(new { code = "PROFILE_INVALID", message = profileError });
        var marketingChanged = user.MarketingConsent != request.MarketingConsent;
        var phoneChanged = !string.Equals(user.PhoneNumber, phone, StringComparison.Ordinal);
        user.DisplayName = displayName;
        user.PhoneNumber = phone;
        user.PhoneDisplay = phone;
        user.CountryCode = countryCode;
        user.Gender = gender;
        user.DateOfBirth = dateOfBirth;
        if (phoneChanged) user.PhoneNumberConfirmed = false;
        user.MarketingConsent = request.MarketingConsent;
        user.MarketingConsentAtUtc = request.MarketingConsent ? DateTimeOffset.UtcNow : null;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
            return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));

        if (marketingChanged)
            RecordMarketingConsent(
                user.Id.ToString(),
                request.MarketingConsent ? ConsentDecision.Granted : ConsentDecision.Withdrawn,
                "ProfilePreferences");

        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = user.Id.ToString(),
            Action = marketingChanged ? "ProfileAndMarketingPreferencesUpdated" : "ProfileUpdated",
            EntityType = nameof(ApplicationUser),
            EntityId = user.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new
        {
            displayName = user.DisplayName,
            email = user.Email,
            phone = user.PhoneDisplay,
            countryCode = user.CountryCode,
            gender = user.Gender,
            dateOfBirth = user.DateOfBirth,
            user.MarketingConsent
        });
    }

    [Authorize]
    [HttpPost("change-password")]
    [EnableRateLimiting("password-reset")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen) return Unauthorized();
        if (string.Equals(request.CurrentPassword, request.NewPassword, StringComparison.Ordinal))
            return BadRequest(new { code = "PASSWORD_UNCHANGED", message = "Choose a different password." });

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));

        var currentSessionId = GetCurrentSessionId();
        var now = DateTimeOffset.UtcNow;
        var otherSessions = await db.UserSessions
            .Where(session => session.UserId == user.Id.ToString() && session.Id != currentSessionId && session.RevokedAtUtc == null && !session.IsDeleted)
            .ToListAsync(cancellationToken);
        foreach (var session in otherSessions)
        {
            session.RevokedAtUtc = now;
            session.RevokedByUserId = user.Id.ToString();
            session.RevocationReason = "Password changed";
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "PasswordChanged", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        await RefreshCurrentSessionCookieAsync(user, cancellationToken);
        return NoContent();
    }

    [Authorize]
    [HttpPost("email-change/request")]
    [EnableRateLimiting("password-reset")]
    public async Task<IActionResult> RequestStudentEmailChange(StudentEmailChangeRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen) return Unauthorized();
        var roles = await userManager.GetRolesAsync(user);
        if (roles.Count != 1 || !roles.Contains(PlatformRoles.Student)) return Forbid();
        var newEmail = request.NewEmail.Trim();
        if (string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Enter a different email address." });
        if (await userManager.FindByEmailAsync(newEmail) is not null) return Conflict(new { message = "This email already has an account." });
        var passwordCheck = await signInManager.CheckPasswordSignInAsync(user, request.CurrentPassword, lockoutOnFailure: true);
        if (!passwordCheck.Succeeded) return BadRequest(new { code = "REAUTH_FAILED", message = "Current password could not be verified." });

        var identityToken = await userManager.GenerateChangeEmailTokenAsync(user, newEmail);
        var proof = EmailChangeProof.Protect(dataProtection, "student", identityToken);
        var url = $"{PublicAppUrl}/ar/change-email?mode=student&userId={user.Id}&email={Uri.EscapeDataString(newEmail)}&proof={Uri.EscapeDataString(proof)}";
        await emailSender.SendAsync(newEmail, "Confirm your BETCCO email change", $"<p>Confirm your new email: <a href=\"{url}\">Confirm email</a></p>", cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "StudentEmailChangeRequested", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return Accepted(new { message = "Check the new email address for a confirmation link. The link expires in one hour." });
    }

    [Authorize]
    [HttpPost("email-change/confirm")]
    [EnableRateLimiting("password-reset")]
    public async Task<IActionResult> ConfirmEmailChange(EmailChangeConfirmationRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (request.Mode is not ("student" or "managed")) return BadRequest();
        var user = await userManager.GetUserAsync(User);
        if (user is null || user.IsFrozen || user.MustChangePassword || user.Id != request.UserId) return Unauthorized();
        var roles = await userManager.GetRolesAsync(user);
        if (request.Mode == "student" && (roles.Count != 1 || !roles.Contains(PlatformRoles.Student))) return Forbid();
        if (request.Mode == "managed" && (roles.Contains(PlatformRoles.Admin) || roles.Contains(PlatformRoles.SystemAdmin)
            || !roles.Any(role => role is PlatformRoles.Teacher or PlatformRoles.SupportAdmin))) return Forbid();
        var newEmail = request.NewEmail.Trim();
        if (string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase)) return Conflict(new { message = "Email has already changed." });
        if (await userManager.FindByEmailAsync(newEmail) is not null) return Conflict(new { message = "This email already has an account." });
        var identityToken = EmailChangeProof.Unprotect(dataProtection, request.Mode, request.Proof);
        if (identityToken is null) return BadRequest(new { code = "EMAIL_CHANGE_EXPIRED", message = "The confirmation link is invalid or expired." });

        var oldEmail = user.Email;
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken) : null;
        var result = await userManager.ChangeEmailAsync(user, newEmail, identityToken);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
        result = await userManager.SetUserNameAsync(user, newEmail);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
        var now = DateTimeOffset.UtcNow;
        var sessions = await db.UserSessions.Where(session => session.UserId == user.Id.ToString() && session.RevokedAtUtc == null && !session.IsDeleted).ToListAsync(cancellationToken);
        foreach (var session in sessions)
        {
            session.RevokedAtUtc = now;
            session.RevokedByUserId = user.Id.ToString();
            session.RevocationReason = "Email changed";
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = request.Mode == "student" ? "StudentEmailChanged" : "ManagedUserEmailChanged", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await signInManager.SignOutAsync();
        if (!string.IsNullOrWhiteSpace(oldEmail))
        {
            try
            {
                await emailSender.SendAsync(oldEmail, "Your BETCCO email changed", "<p>The email address on your BETCCO account was changed. Contact support if you did not request this.</p>", cancellationToken);
            }
            catch (Exception)
            {
                db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "OldEmailChangeNoticeFailed", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Failure" });
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return NoContent();
    }

    [Authorize]
    [HttpGet("two-factor")]
    [StaffMfaBootstrap]
    public async Task<IActionResult> TwoFactorStatus()
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var authenticatorKey = await userManager.GetAuthenticatorKeyAsync(user);
        return Ok(new
        {
            isEnabled = await userManager.GetTwoFactorEnabledAsync(user),
            hasAuthenticator = !string.IsNullOrWhiteSpace(authenticatorKey),
            isRequired = StaffMfaPolicy.RequiresStaffMfa(await userManager.GetRolesAsync(user))
        });
    }

    [Authorize]
    [HttpPost("two-factor/setup")]
    [StaffMfaBootstrap]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SetupTwoFactor(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (await userManager.GetTwoFactorEnabledAsync(user))
            return Conflict(new { code = "TWO_FACTOR_ALREADY_ENABLED", message = "Two-factor authentication is already enabled." });

        var resetResult = await userManager.ResetAuthenticatorKeyAsync(user);
        if (!resetResult.Succeeded) return BadRequest(new ValidationProblemDetails(resetResult.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        var key = await userManager.GetAuthenticatorKeyAsync(user);
        if (string.IsNullOrWhiteSpace(key)) return Problem("Unable to create an authenticator key. Please try again.", statusCode: StatusCodes.Status500InternalServerError);

        await RefreshCurrentSessionCookieAsync(user, cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "TwoFactorSetupStarted", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);

        var brandName = await BrandNameAsync(cancellationToken);
        var accountName = $"{brandName}:{user.Email}";
        var authenticatorUri = $"otpauth://totp/{Uri.EscapeDataString(accountName)}?secret={Uri.EscapeDataString(key)}&issuer={Uri.EscapeDataString(brandName)}&digits=6";
        return Ok(new { sharedKey = FormatAuthenticatorKey(key), authenticatorUri });
    }

    [Authorize]
    [HttpPost("two-factor/enable")]
    [StaffMfaBootstrap]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> EnableTwoFactor(TwoFactorCodeRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (await userManager.GetTwoFactorEnabledAsync(user)) return NoContent();
        if (!await VerifyAuthenticatorCodeAsync(user, request.Code))
            return BadRequest(new { code = "TWO_FACTOR_INVALID", message = "The authenticator code is invalid or expired." });

        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        var result = await userManager.SetTwoFactorEnabledAsync(user, true);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        if (StaffMfaPolicy.RequiresStaffMfa(await userManager.GetRolesAsync(user)))
        {
            var stampResult = await userManager.UpdateSecurityStampAsync(user);
            if (!stampResult.Succeeded) return BadRequest(new ValidationProblemDetails(stampResult.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
            // A password-only bootstrap session must not gain privileged access when
            // this browser finishes enrollment. End every other active session.
            var currentSessionId = GetCurrentSessionId();
            var otherSessions = await db.UserSessions.Where(session => session.UserId == user.Id.ToString()
                && session.Id != currentSessionId && session.RevokedAtUtc == null && !session.IsDeleted).ToListAsync(cancellationToken);
            foreach (var session in otherSessions)
            {
                session.RevokedAtUtc = DateTimeOffset.UtcNow;
                session.RevokedByUserId = user.Id.ToString();
                session.RevocationReason = "MFA enrolled";
            }
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "TwoFactorEnabled", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await RefreshCurrentSessionCookieAsync(user, cancellationToken);
        return NoContent();
    }

    [Authorize]
    [HttpPost("two-factor/disable")]
    [StaffMfaBootstrap]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> DisableTwoFactor(TwoFactorCodeRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (StaffMfaPolicy.RequiresStaffMfa(await userManager.GetRolesAsync(user)))
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "STAFF_MFA_REQUIRED", message = "Multi-factor authentication is required for this staff account." });
        if (!await userManager.GetTwoFactorEnabledAsync(user)) return NoContent();
        if (!await VerifyAuthenticatorCodeAsync(user, request.Code))
            return BadRequest(new { code = "TWO_FACTOR_INVALID", message = "The authenticator code is invalid or expired." });

        var result = await userManager.SetTwoFactorEnabledAsync(user, false);
        if (!result.Succeeded) return BadRequest(new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        await RefreshCurrentSessionCookieAsync(user, cancellationToken);
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "TwoFactorDisabled", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize]
    [HttpGet("sessions")]
    public async Task<IActionResult> ListSessions(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var currentSessionId = GetCurrentSessionId();
        var sessions = await db.UserSessions.AsNoTracking()
            .Where(item => item.UserId == user.Id.ToString() && item.RevokedAtUtc == null && !item.IsDeleted)
            .OrderByDescending(item => item.LastActiveAtUtc)
            .Take(100)
            .Select(item => new
            {
                item.Id,
                item.DeviceName,
                item.BrowserName,
                item.IpAddress,
                item.LoggedInAtUtc,
                item.LastActiveAtUtc
            })
            .ToListAsync(cancellationToken);
        return Ok(new
        {
            items = sessions.Select(item => new
            {
                id = item.Id,
                deviceName = item.DeviceName,
                browserName = item.BrowserName,
                ipAddress = item.IpAddress,
                loggedInAtUtc = item.LoggedInAtUtc,
                lastActiveAtUtc = item.LastActiveAtUtc,
                isCurrent = item.Id == currentSessionId
            })
        });
    }

    [Authorize]
    [HttpDelete("sessions/{sessionId:guid}")]
    public async Task<IActionResult> RevokeSession(Guid sessionId, CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var session = await db.UserSessions.SingleOrDefaultAsync(item => item.Id == sessionId && item.UserId == user.Id.ToString() && item.RevokedAtUtc == null && !item.IsDeleted, cancellationToken);
        if (session is null) return NotFound();

        session.RevokedAtUtc = DateTimeOffset.UtcNow;
        session.RevokedByUserId = user.Id.ToString();
        session.RevocationReason = "Account owner ended session";
        var isCurrent = session.Id == GetCurrentSessionId();
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "UserSessionRevoked", EntityType = nameof(UserSession), EntityId = session.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        if (isCurrent) await signInManager.SignOutAsync();
        return Ok(new { currentSessionRevoked = isCurrent });
    }

    [Authorize]
    [HttpPost("sessions/logout-others")]
    public async Task<IActionResult> LogoutOtherSessions(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var currentSessionId = GetCurrentSessionId();
        if (currentSessionId is null || !await db.UserSessions.AnyAsync(session =>
                session.Id == currentSessionId && session.UserId == user.Id.ToString() && session.RevokedAtUtc == null && !session.IsDeleted, cancellationToken))
            return Unauthorized();

        var otherSessions = await db.UserSessions
            .Where(session => session.UserId == user.Id.ToString() && session.Id != currentSessionId && session.RevokedAtUtc == null && !session.IsDeleted)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var session in otherSessions)
        {
            session.RevokedAtUtc = now;
            session.RevokedByUserId = user.Id.ToString();
            session.RevocationReason = "Account owner signed out other sessions";
        }
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "OtherUserSessionsRevoked", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success", MetadataJson = "{\"scope\":\"other-sessions\"}" });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { revokedCount = otherSessions.Count });
    }

    [Authorize]
    [HttpPost("sessions/logout-all")]
    public async Task<IActionResult> LogoutAllSessions(CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var now = DateTimeOffset.UtcNow;
        var sessions = await db.UserSessions.Where(item => item.UserId == user.Id.ToString() && item.RevokedAtUtc == null && !item.IsDeleted).ToListAsync(cancellationToken);
        foreach (var session in sessions)
        {
            session.RevokedAtUtc = now;
            session.RevokedByUserId = user.Id.ToString();
            session.RevocationReason = "Account owner signed out all sessions";
        }
        user.SessionsInvalidBeforeUtc = now;
        var identityResult = await userManager.UpdateAsync(user);
        if (!identityResult.Succeeded) return BadRequest(new ValidationProblemDetails(identityResult.Errors.ToDictionary(x => x.Code, x => new[] { x.Description })));
        await userManager.UpdateSecurityStampAsync(user);
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "AllUserSessionsRevoked", EntityType = nameof(ApplicationUser), EntityId = user.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        await signInManager.SignOutAsync();
        return NoContent();
    }

    private async Task ObserveStudentDeviceAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var protector = dataProtection.CreateProtector("BETCCO.StudentDevice.v1");
        var protectedId = Request.Cookies["betcco.device"];
        string deviceId;
        try { deviceId = string.IsNullOrWhiteSpace(protectedId) ? string.Empty : protector.Unprotect(protectedId); }
        catch (CryptographicException) { deviceId = string.Empty; }
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            deviceId = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            Response.Cookies.Append("betcco.device", protector.Protect(deviceId), new CookieOptions { HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Lax, MaxAge = TimeSpan.FromDays(90) });
        }
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(deviceId)));
        var byDevice = await db.StudentDeviceBindings.SingleOrDefaultAsync(x => x.DeviceHash == hash, cancellationToken);
        var current = await db.StudentDeviceBindings.SingleOrDefaultAsync(x => x.StudentUserId == user.Id.ToString() && x.IsActive, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        if (byDevice is not null && byDevice.StudentUserId == user.Id.ToString())
        {
            byDevice.LastSeenAtUtc = now;
        }
        else if (current is null && byDevice is null)
        {
            // This is the student's first observed browser. The stored value is
            // a SHA-256 digest of an opaque, HttpOnly cookie – never a raw device
            // identifier or browser fingerprint.
            db.StudentDeviceBindings.Add(new StudentDeviceBinding { StudentUserId = user.Id.ToString(), DeviceHash = hash, LastSeenAtUtc = now });
        }
        else
        {
            // Keep the original binding as a risk indicator only. A student must
            // still be able to sign in from a new device, and any administrator
            // action remains based on audited evidence rather than the UI alone.
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = user.Id.ToString(),
                Action = "StudentDeviceChangeObserved",
                EntityType = nameof(ApplicationUser),
                EntityId = user.Id.ToString(),
                Outcome = "RiskObserved",
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = TruncateUserAgent(Request.Headers.UserAgent.ToString()),
                MetadataJson = byDevice is not null
                    ? "{\"reason\":\"device-cookie-associated-with-another-account\"}"
                    : "{\"reason\":\"new-device-cookie\"}"
            });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<UserSession> CreateSessionAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var userAgent = TruncateUserAgent(Request.Headers.UserAgent.ToString());
        var session = new UserSession
        {
            UserId = user.Id.ToString(),
            DeviceName = DescribeDevice(userAgent),
            BrowserName = DescribeBrowser(userAgent),
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? null : userAgent,
            LoggedInAtUtc = DateTimeOffset.UtcNow,
            LastActiveAtUtc = DateTimeOffset.UtcNow
        };
        db.UserSessions.Add(session);
        db.AuditLogs.Add(new AuditLog { ActorUserId = user.Id.ToString(), Action = "UserSessionStarted", EntityType = nameof(UserSession), EntityId = session.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
        return session;
    }

    private static string TruncateUserAgent(string userAgent) => userAgent.Length > 512 ? userAgent[..512] : userAgent;

    private async Task RefreshCurrentSessionCookieAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var sessionId = GetCurrentSessionId();
        if (sessionId is null || !await db.UserSessions.AnyAsync(item => item.Id == sessionId && item.UserId == user.Id.ToString() && item.RevokedAtUtc == null && !item.IsDeleted, cancellationToken))
            sessionId = (await CreateSessionAsync(user, cancellationToken)).Id;
        await signInManager.SignInWithClaimsAsync(user, isPersistent: false, [new Claim(BetccoAuthClaims.SessionId, sessionId.Value.ToString())]);
    }

    private async Task RevokeCurrentSessionAsync(string userId, string reason, CancellationToken cancellationToken)
    {
        var sessionId = GetCurrentSessionId();
        if (sessionId is null) return;
        var session = await db.UserSessions.SingleOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId && item.RevokedAtUtc == null && !item.IsDeleted, cancellationToken);
        if (session is null) return;
        session.RevokedAtUtc = DateTimeOffset.UtcNow;
        session.RevokedByUserId = userId;
        session.RevocationReason = reason;
        db.AuditLogs.Add(new AuditLog { ActorUserId = userId, Action = "UserSessionSignedOut", EntityType = nameof(UserSession), EntityId = session.Id.ToString(), Outcome = "Success" });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<bool> VerifyAuthenticatorCodeAsync(ApplicationUser user, string? submittedCode)
    {
        var code = NormalizeAuthenticatorCode(submittedCode);
        return code is not null && await userManager.VerifyTwoFactorTokenAsync(user, TokenOptions.DefaultAuthenticatorProvider, code);
    }

    private async Task<string> BrandNameAsync(CancellationToken cancellationToken)
    {
        var setting = await db.SiteSettings.AsNoTracking().SingleOrDefaultAsync(item => item.Key == "BrandName", cancellationToken);
        return setting?.EnglishValue.Trim() is { Length: > 0 } brandName ? brandName : "BETCCO";
    }

    private Guid? GetCurrentSessionId() => Guid.TryParse(User.FindFirstValue(BetccoAuthClaims.SessionId), out var sessionId) ? sessionId : null;

    private static string? NormalizeAuthenticatorCode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var characters = value.Trim().Where(character => character is not ' ' and not '-').ToArray();
        return characters.Length == 6 && characters.All(character => character is >= '0' and <= '9')
            ? new string(characters)
            : null;
    }

    private static string FormatAuthenticatorKey(string key) => string.Join(' ', key.Chunk(4).Select(part => new string(part)));

    private static string DescribeDevice(string userAgent) =>
        userAgent.Contains("iPad", StringComparison.OrdinalIgnoreCase) ? "iPad" :
        userAgent.Contains("iPhone", StringComparison.OrdinalIgnoreCase) ? "iPhone" :
        userAgent.Contains("Android", StringComparison.OrdinalIgnoreCase) ? "Android device" :
        userAgent.Contains("Macintosh", StringComparison.OrdinalIgnoreCase) ? "Mac" :
        userAgent.Contains("Windows", StringComparison.OrdinalIgnoreCase) ? "Windows device" :
        userAgent.Contains("Linux", StringComparison.OrdinalIgnoreCase) ? "Linux device" : "Unknown device";

    private static string DescribeBrowser(string userAgent) =>
        userAgent.Contains("Edg/", StringComparison.OrdinalIgnoreCase) ? "Microsoft Edge" :
        userAgent.Contains("Firefox/", StringComparison.OrdinalIgnoreCase) ? "Firefox" :
        userAgent.Contains("Chrome/", StringComparison.OrdinalIgnoreCase) ? "Google Chrome" :
        userAgent.Contains("Safari/", StringComparison.OrdinalIgnoreCase) ? "Safari" : "Unknown browser";

    private static bool IsValidRegistrationProfile(RegisterRequest request, out string error)
    {
        if (string.IsNullOrWhiteSpace(request.Phone) || request.Phone.Trim().Length is < 7 or > 40)
        {
            error = "Enter a valid phone number.";
            return false;
        }

        return IsValidProfileFields(request.CountryCode, request.Gender, request.DateOfBirth, out error);
    }

    private static bool IsValidProfileFields(string? countryCode, string? gender, DateOnly? dateOfBirth, out string error)
    {
        if (string.IsNullOrWhiteSpace(countryCode) || countryCode.Trim().Length != 2 || !countryCode.Trim().All(char.IsAsciiLetter))
        {
            error = "Select a valid country.";
            return false;
        }

        if (gender is not ("Male" or "Female" or "PreferNotToSay"))
        {
            error = "Select a valid gender option.";
            return false;
        }

        if (!dateOfBirth.HasValue || dateOfBirth.Value > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-18))
        {
            error = "You must be at least 18 years old to create an account.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private static bool IsValidOptionalProfileFields(UpdateProfileRequest request, out string error)
    {
        if (request.CountryCode is not null && (request.CountryCode.Trim().Length != 2 || !request.CountryCode.Trim().All(char.IsAsciiLetter)))
        {
            error = "Select a valid country.";
            return false;
        }

        if (request.Gender is not null && request.Gender is not ("Male" or "Female" or "PreferNotToSay"))
        {
            error = "Select a valid gender option.";
            return false;
        }

        if (request.DateOfBirth.HasValue && request.DateOfBirth.Value > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-18))
        {
            error = "You must be at least 18 years old to create an account.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private string PublicAppUrl => configuration["APP_PUBLIC_URL"]?.TrimEnd('/')
        ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/')
        ?? (environment.IsDevelopment() ? "http://localhost:3000" : $"{Request.Scheme}://{Request.Host}");

    private void RecordMarketingConsent(string userId, ConsentDecision decision, string captureMethod)
    {
        var policyVersion = configuration["Privacy:MarketingConsentVersion"];
        var ipAddress = Request.HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();
        db.ConsentRecords.Add(new ConsentRecord
        {
            UserId = userId,
            Purpose = ConsentPurpose.MarketingCommunications,
            Decision = decision,
            PolicyVersion = BoundedOrDefault(policyVersion, 80, "marketing-consent-v1"),
            CaptureMethod = captureMethod,
            IpAddress = BoundedOrNull(ipAddress, 64),
            UserAgent = BoundedOrNull(userAgent, 512)
        });
    }

    private static string BoundedOrDefault(string? value, int maximum, string fallback) => BoundedOrNull(value, maximum) ?? fallback;
    private static string? BoundedOrNull(string? value, int maximum) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim()[..Math.Min(value.Trim().Length, maximum)];
}

public sealed record RegisterRequest(
    [param: Required, StringLength(160)] string DisplayName,
    [param: Required, EmailAddress] string Email,
    [param: Required, StringLength(128)] string Password,
    [param: Required, StringLength(40)] string Phone,
    [param: Required, StringLength(2)] string CountryCode,
    [param: Required, StringLength(24)] string Gender,
    [param: Required] DateOnly? DateOfBirth,
    bool TermsAccepted,
    [param: Required, StringLength(50)] string TermsVersion,
    [param: Required, StringLength(50)] string PrivacyVersion,
    bool MarketingConsent);
public sealed record UpdateProfileRequest(
    [param: Required, StringLength(160)] string DisplayName,
    [param: StringLength(40)] string? Phone,
    bool MarketingConsent,
    [param: StringLength(2)] string? CountryCode = null,
    [param: StringLength(24)] string? Gender = null,
    DateOnly? DateOfBirth = null);
public sealed record LoginRequest(string Email, string Password, bool RememberMe, string? TwoFactorCode = null);
public sealed record TwoFactorCodeRequest(string? Code);
public sealed record DevelopmentConfirmRequest(string Email);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(Guid UserId, string Token, string Password);
public sealed record ChangePasswordRequest(
    [param: Required] string CurrentPassword,
    [param: Required] string NewPassword);
public sealed record StudentEmailChangeRequest(
    [param: Required, EmailAddress, StringLength(320)] string NewEmail,
    [param: Required] string CurrentPassword);
public sealed record EmailChangeConfirmationRequest(
    Guid UserId,
    [param: Required, EmailAddress, StringLength(320)] string NewEmail,
    [param: Required] string Proof,
    [param: Required] string Mode);
