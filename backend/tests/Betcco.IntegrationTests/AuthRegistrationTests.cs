using Betcco.Api.Controllers;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Identity;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Betcco.IntegrationTests;

public sealed class AuthRegistrationTests
{
    [Fact]
    public async Task Registration_commits_required_state_then_dispatches_confirmation_email()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();

        var result = await fixture.Controller.Register(
            new RegisterRequest(
                "Learner",
                "learner@betcco.test",
                "T!estPassword123",
                "+962790000000",
                "JO",
                "PreferNotToSay",
                new DateOnly(2000, 1, 1),
                true,
                "1.0",
                "1.0",
                true),
            CancellationToken.None);

        Assert.IsType<AcceptedResult>(result);
        Assert.Null(fixture.Email.HtmlBody);
        var outbox = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Pending, outbox.Status);
        Assert.Equal(1, await fixture.EmailDispatcher.DispatchPendingAsync());
        Assert.NotNull(fixture.Email.HtmlBody);
        Assert.Contains("http://frontend.betcco.test/ar/confirm-email?userId=", fixture.Email.HtmlBody);
        Assert.DoesNotContain("/api/v1/auth/confirm-email", fixture.Email.HtmlBody);

        var registered = await fixture.Users.FindByEmailAsync("learner@betcco.test");
        Assert.NotNull(registered);
        Assert.Equal("+962790000000", registered.PhoneDisplay);
        Assert.Equal("JO", registered.CountryCode);
        Assert.Equal("PreferNotToSay", registered.Gender);
        Assert.Equal(new DateOnly(2000, 1, 1), registered.DateOfBirth);
        Assert.True(await fixture.Users.IsInRoleAsync(registered, PlatformRoles.Student));
        Assert.Equal(2, await fixture.Db.LegalAcceptances.CountAsync(item => item.UserId == registered.Id.ToString()));
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "StudentRegistered" && item.EntityId == registered.Id.ToString());
        var marketingConsent = await fixture.Db.ConsentRecords.SingleAsync();
        Assert.Equal(ConsentPurpose.MarketingCommunications, marketingConsent.Purpose);
        Assert.Equal(ConsentDecision.Granted, marketingConsent.Decision);
        Assert.Equal("Registration", marketingConsent.CaptureMethod);

        var start = fixture.Email.HtmlBody.IndexOf("href=\"", StringComparison.Ordinal) + "href=\"".Length;
        var end = fixture.Email.HtmlBody.IndexOf('"', start);
        var confirmationUrl = new Uri(fixture.Email.HtmlBody[start..end]);
        var query = QueryHelpers.ParseQuery(confirmationUrl.Query);
        var confirmation = await fixture.Controller.ConfirmEmail(
            Guid.Parse(query["userId"].ToString()),
            query["token"].ToString());
        Assert.IsType<OkObjectResult>(confirmation);
    }

    [Fact]
    public async Task Email_failure_after_registration_commit_is_recoverable()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        fixture.Email.Failure = new InvalidOperationException("Simulated SMTP outage.");

        var result = await fixture.Controller.Register(
            new RegisterRequest(
                "Partial learner",
                "partial@betcco.test",
                "T!estPassword123",
                "+962790000000",
                "JO",
                "PreferNotToSay",
                new DateOnly(2000, 1, 1),
                true,
                "1.0",
                "1.0",
                true),
            CancellationToken.None);

        Assert.IsType<AcceptedResult>(result);
        var registered = await fixture.Users.FindByEmailAsync("partial@betcco.test");
        Assert.NotNull(registered);
        Assert.True(await fixture.Users.IsInRoleAsync(registered!, PlatformRoles.Student));
        Assert.Equal(2, await fixture.Db.LegalAcceptances.CountAsync(item => item.UserId == registered.Id.ToString()));
        Assert.Single(await fixture.Db.ConsentRecords.Where(item => item.UserId == registered.Id.ToString()).ToListAsync());
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "StudentRegistered" && item.EntityId == registered.Id.ToString());

        Assert.Equal(0, await fixture.EmailDispatcher.DispatchPendingAsync());
        var failed = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Failed, failed.Status);
        Assert.Equal(1, failed.AttemptCount);
        Assert.Equal(nameof(InvalidOperationException), failed.LastFailureCode);
        Assert.NotNull(failed.ProtectedConfirmationToken);
        Assert.Single(fixture.Email.AttemptedHtmlBodies);

        fixture.Email.Failure = null;
        failed.NextAttemptAtUtc = DateTimeOffset.UtcNow.AddSeconds(-1);
        await fixture.Db.SaveChangesAsync();

        Assert.Equal(1, await fixture.EmailDispatcher.DispatchPendingAsync());
        var sent = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Sent, sent.Status);
        Assert.Equal(2, sent.AttemptCount);
        Assert.NotNull(sent.SentAtUtc);
        Assert.Null(sent.ProtectedConfirmationToken);
        Assert.Equal(2, fixture.Email.AttemptedHtmlBodies.Count);
        Assert.Equal(fixture.Email.AttemptedHtmlBodies[0], fixture.Email.AttemptedHtmlBodies[1]);
    }

    [Fact]
    public async Task Expired_processing_lease_is_recovered_after_worker_crash()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        Assert.IsType<AcceptedResult>(await fixture.Controller.Register(
            new RegisterRequest("Lease recovery", "lease-recovery@betcco.test", "T!estPassword123", "+962790000000", "JO", "PreferNotToSay", new DateOnly(2000, 1, 1), true, "1.0", "1.0", false),
            CancellationToken.None));
        var message = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        message.Status = RegistrationEmailDeliveryStatus.Processing;
        message.ProcessingStartedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-6);
        message.LastAttemptAtUtc = message.ProcessingStartedAtUtc;
        message.AttemptCount = 1;
        await fixture.Db.SaveChangesAsync();

        Assert.Equal(1, await fixture.EmailDispatcher.DispatchPendingAsync());
        var recovered = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Sent, recovered.Status);
        Assert.Equal(2, recovered.AttemptCount);
        Assert.Single(fixture.Email.AttemptedHtmlBodies);
    }

    [Fact]
    public async Task Confirmation_token_generation_failure_occurs_after_committed_outbox_intent()
    {
        await using var fixture = await RegistrationFixture.CreateAsync(failEmailConfirmationTokenGeneration: true);

        Assert.IsType<AcceptedResult>(await fixture.Controller.Register(
            new RegisterRequest("Token failure", "token-failure@betcco.test", "T!estPassword123", "+962790000000", "JO", "PreferNotToSay", new DateOnly(2000, 1, 1), true, "1.0", "1.0", false),
            CancellationToken.None));
        var user = await fixture.Users.FindByEmailAsync("token-failure@betcco.test");
        Assert.NotNull(user);
        Assert.True(await fixture.Users.IsInRoleAsync(user!, PlatformRoles.Student));
        Assert.Equal(2, await fixture.Db.LegalAcceptances.CountAsync(item => item.UserId == user.Id.ToString()));
        Assert.Single(await fixture.Db.AuditLogs.Where(item => item.Action == "StudentRegistered" && item.EntityId == user.Id.ToString()).ToListAsync());
        Assert.Equal(RegistrationEmailDeliveryStatus.Pending, (await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync()).Status);

        Assert.Equal(0, await fixture.EmailDispatcher.DispatchPendingAsync());
        var failed = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Failed, failed.Status);
        Assert.Equal(nameof(InvalidOperationException), failed.LastFailureCode);
        Assert.Null(failed.ProtectedConfirmationToken);
        Assert.Empty(fixture.Email.AttemptedHtmlBodies);
    }

    [Fact]
    public async Task Duplicate_registration_does_not_duplicate_account_evidence_or_email_intent()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var request = new RegisterRequest(
            "Duplicate learner",
            "duplicate@betcco.test",
            "T!estPassword123",
            "+962790000000",
            "JO",
            "PreferNotToSay",
            new DateOnly(2000, 1, 1),
            true,
            "1.0",
            "1.0",
            true);

        Assert.IsType<AcceptedResult>(await fixture.Controller.Register(request, CancellationToken.None));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.Register(request, CancellationToken.None));

        var user = await fixture.Users.FindByEmailAsync(request.Email);
        Assert.NotNull(user);
        Assert.Single(await fixture.Db.Users.Where(item => item.NormalizedEmail == user!.NormalizedEmail).ToListAsync());
        Assert.Equal(2, await fixture.Db.LegalAcceptances.CountAsync(item => item.UserId == user.Id.ToString()));
        Assert.Single(await fixture.Db.ConsentRecords.Where(item => item.UserId == user.Id.ToString()).ToListAsync());
        Assert.Single(await fixture.Db.AuditLogs.Where(item => item.Action == "StudentRegistered" && item.EntityId == user.Id.ToString()).ToListAsync());
        Assert.Single(await fixture.Db.RegistrationEmailOutboxMessages.Where(item => item.UserId == user.Id).ToListAsync());
    }

    [Fact]
    public async Task Registration_email_outbox_never_stores_a_raw_confirmation_token()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        fixture.Email.Failure = new InvalidOperationException("Simulated SMTP outage.");
        Assert.IsType<AcceptedResult>(await fixture.Controller.Register(
            new RegisterRequest("Protected token", "protected-token@betcco.test", "T!estPassword123", "+962790000000", "JO", "PreferNotToSay", new DateOnly(2000, 1, 1), true, "1.0", "1.0", false),
            CancellationToken.None));

        Assert.Equal(0, await fixture.EmailDispatcher.DispatchPendingAsync());
        var message = await fixture.Db.RegistrationEmailOutboxMessages.SingleAsync();
        var attemptedUrl = new Uri(fixture.Email.AttemptedHtmlBodies.Single()
            .Split("href=\"", StringSplitOptions.None)[1]
            .Split('\"')[0]);
        var rawToken = QueryHelpers.ParseQuery(attemptedUrl.Query)["token"].ToString();

        Assert.NotNull(message.ProtectedConfirmationToken);
        Assert.NotEqual(rawToken, message.ProtectedConfirmationToken);
        Assert.DoesNotContain(rawToken, message.ProtectedConfirmationToken, StringComparison.Ordinal);
        Assert.DoesNotContain(fixture.Db.AuditLogs, audit =>
            audit.MetadataJson != null && audit.MetadataJson.Contains(rawToken, StringComparison.Ordinal));
    }

    [Fact]
    public async Task New_user_registration_records_the_current_legal_document_version()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var versionOne = await fixture.Db.LegalDocuments.SingleAsync(document => document.Slug == "terms");
        versionOne.IsCurrent = false;
        var versionTwo = new LegalDocument
        {
            Slug = "terms",
            Version = "2.0",
            ArabicTitle = "الشروط",
            EnglishTitle = "Terms",
            ArabicContent = "نص محدث",
            EnglishContent = "Updated text",
            IsPublished = true,
            IsCurrent = true,
            RequiresReacceptance = true
        };
        fixture.Db.LegalDocuments.Add(versionTwo);
        await fixture.Db.SaveChangesAsync();

        var result = await fixture.Controller.Register(
            new RegisterRequest(
                "New learner",
                "new-learner@betcco.test",
                "T!estPassword123",
                "+962790000000",
                "JO",
                "PreferNotToSay",
                new DateOnly(2000, 1, 1),
                true,
                "2.0",
                "1.0",
                false),
            CancellationToken.None);

        Assert.IsType<AcceptedResult>(result);
        var user = await fixture.Users.FindByEmailAsync("new-learner@betcco.test");
        Assert.NotNull(user);
        var acceptedTerms = await fixture.Db.LegalAcceptances.SingleAsync(acceptance =>
            acceptance.UserId == user!.Id.ToString() && acceptance.LegalDocumentId == versionTwo.Id);
        Assert.Equal("2.0", acceptedTerms.Version);
        Assert.DoesNotContain(fixture.Db.LegalAcceptances, acceptance =>
            acceptance.UserId == user.Id.ToString() && acceptance.LegalDocumentId == versionOne.Id);
    }

    [Fact]
    public async Task Registration_rejects_a_profile_for_a_student_under_18()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var result = await fixture.Controller.Register(
            new RegisterRequest(
                "Young learner",
                "young@betcco.test",
                "T!estPassword123",
                "+962790000000",
                "JO",
                "Male",
                DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-17),
                true,
                "1.0",
                "1.0",
                false),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Null(await fixture.Users.FindByEmailAsync("young@betcco.test"));
    }

    [Fact]
    public async Task Authenticated_user_can_update_only_their_own_basic_profile_and_preferences()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var user = new ApplicationUser
        {
            UserName = "profile@betcco.test",
            Email = "profile@betcco.test",
            DisplayName = "Before"
        };
        Assert.True((await fixture.Users.CreateAsync(user, "T!estPassword123")).Succeeded);
        fixture.Controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                RequestServices = fixture.Services,
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], "Test"))
            }
        };

        var result = await fixture.Controller.UpdateProfile(
            new UpdateProfileRequest("Updated learner", "+962700000000", true),
            CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(response.Value);
        var saved = await fixture.Users.FindByIdAsync(user.Id.ToString());
        Assert.Equal("Updated learner", saved!.DisplayName);
        Assert.Equal("+962700000000", saved.PhoneDisplay);
        Assert.True(saved.MarketingConsent);
        Assert.Contains(fixture.Db.ConsentRecords, item => item.UserId == user.Id.ToString() && item.Decision == ConsentDecision.Granted && item.CaptureMethod == "ProfilePreferences");
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "ProfileAndMarketingPreferencesUpdated" && item.ActorUserId == user.Id.ToString());

        var withdrawn = await fixture.Controller.UpdateProfile(
            new UpdateProfileRequest("Updated learner", "+962700000000", false),
            CancellationToken.None);
        Assert.IsType<OkObjectResult>(withdrawn);
        Assert.False((await fixture.Users.FindByIdAsync(user.Id.ToString()))!.MarketingConsent);
        Assert.Contains(fixture.Db.ConsentRecords, item => item.UserId == user.Id.ToString() && item.Decision == ConsentDecision.Withdrawn && item.CaptureMethod == "ProfilePreferences");
    }

    [Fact]
    public async Task Student_can_sign_in_from_a_new_device_while_the_change_is_audited()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var user = new ApplicationUser
        {
            UserName = "student-device@betcco.test",
            Email = "student-device@betcco.test",
            DisplayName = "Student",
            EmailConfirmed = true
        };
        Assert.True((await fixture.Users.CreateAsync(user, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(user, PlatformRoles.Student)).Succeeded);
        fixture.Db.StudentDeviceBindings.Add(new StudentDeviceBinding
        {
            StudentUserId = user.Id.ToString(),
            DeviceHash = "an-existing-device-hash"
        });
        await fixture.Db.SaveChangesAsync();

        var context = new DefaultHttpContext { RequestServices = fixture.Services };
        fixture.Services.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
        fixture.Controller.ControllerContext = new ControllerContext { HttpContext = context };

        var result = await fixture.Controller.Login(
            new LoginRequest("student-device@betcco.test", "T!estPassword123", false, null),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "StudentDeviceChangeObserved" && item.ActorUserId == user.Id.ToString());
    }

    [Fact]
    public async Task Required_password_change_blocks_login_until_the_password_is_reset()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var user = new ApplicationUser
        {
            UserName = "password-change@betcco.test",
            Email = "password-change@betcco.test",
            DisplayName = "Password change required",
            EmailConfirmed = true,
            MustChangePassword = true
        };
        Assert.True((await fixture.Users.CreateAsync(user, "T!estPassword123")).Succeeded);
        SetRequestContext(fixture);

        var blockedLogin = await fixture.Controller.Login(
            new LoginRequest(user.Email!, "T!estPassword123", false),
            CancellationToken.None);

        var blockedResponse = Assert.IsType<UnauthorizedObjectResult>(blockedLogin);
        Assert.Equal("PASSWORD_CHANGE_REQUIRED", blockedResponse.Value?.GetType().GetProperty("code")?.GetValue(blockedResponse.Value));
        Assert.Empty(await fixture.Db.UserSessions.Where(item => item.UserId == user.Id.ToString()).ToListAsync());

        var token = await fixture.Users.GeneratePasswordResetTokenAsync(user);
        var resetResult = await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(user.Id, token, "N!ewPassword123"));

        Assert.IsType<OkObjectResult>(resetResult);
        Assert.False((await fixture.Users.FindByIdAsync(user.Id.ToString()))!.MustChangePassword);
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "RequiredPasswordChanged" && item.EntityId == user.Id.ToString());

        SetRequestContext(fixture);
        var successfulLogin = await fixture.Controller.Login(
            new LoginRequest(user.Email!, "N!ewPassword123", false),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(successfulLogin);
        Assert.Single(await fixture.Db.UserSessions.Where(item => item.UserId == user.Id.ToString()).ToListAsync());
    }

    [Fact]
    public async Task Login_remains_available_when_a_password_change_is_not_required()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var user = new ApplicationUser
        {
            UserName = "standard-login@betcco.test",
            Email = "standard-login@betcco.test",
            DisplayName = "Standard login",
            EmailConfirmed = true
        };
        Assert.True((await fixture.Users.CreateAsync(user, "T!estPassword123")).Succeeded);
        SetRequestContext(fixture);

        var result = await fixture.Controller.Login(
            new LoginRequest(user.Email!, "T!estPassword123", false),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        Assert.False((await fixture.Users.FindByIdAsync(user.Id.ToString()))!.MustChangePassword);
        Assert.Single(await fixture.Db.UserSessions.Where(item => item.UserId == user.Id.ToString()).ToListAsync());
    }

    [Fact]
    public async Task Teacher_invitation_is_accepted_only_after_a_valid_password_reset()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var teacher = new ApplicationUser
        {
            UserName = "teacher-invitation@betcco.test",
            Email = "teacher-invitation@betcco.test",
            DisplayName = "Invited teacher",
            EmailConfirmed = true,
            MustChangePassword = true
        };
        Assert.True((await fixture.Users.CreateAsync(teacher, "T!estPassword123")).Succeeded);
        var invitation = new TeacherInvitation
        {
            Email = teacher.Email!,
            DisplayName = teacher.DisplayName,
            TeacherUserId = teacher.Id.ToString(),
            InvitedByUserId = Guid.NewGuid().ToString(),
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(1)
        };
        fixture.Db.TeacherInvitations.Add(invitation);
        await fixture.Db.SaveChangesAsync();
        var token = await fixture.Users.GeneratePasswordResetTokenAsync(teacher);

        var result = await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(teacher.Id, token, "N!ewPassword123"));

        Assert.IsType<OkObjectResult>(result);
        var accepted = await fixture.Db.TeacherInvitations.SingleAsync(item => item.Id == invitation.Id);
        Assert.Equal(TeacherInvitationStatus.Accepted, accepted.Status);
        Assert.NotNull(accepted.AcceptedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "TeacherInvitationAccepted" && item.EntityId == invitation.Id.ToString());
        Assert.False((await fixture.Users.FindByIdAsync(teacher.Id.ToString()))!.MustChangePassword);
    }

    [Fact]
    public async Task Expired_teacher_invitation_cannot_be_accepted()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var teacher = new ApplicationUser
        {
            UserName = "expired-teacher@betcco.test",
            Email = "expired-teacher@betcco.test",
            DisplayName = "Expired teacher",
            EmailConfirmed = true,
            MustChangePassword = true
        };
        Assert.True((await fixture.Users.CreateAsync(teacher, "T!estPassword123")).Succeeded);
        var invitation = new TeacherInvitation
        {
            Email = teacher.Email,
            DisplayName = teacher.DisplayName,
            TeacherUserId = teacher.Id.ToString(),
            InvitedByUserId = Guid.NewGuid().ToString(),
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1)
        };
        fixture.Db.TeacherInvitations.Add(invitation);
        await fixture.Db.SaveChangesAsync();
        var token = await fixture.Users.GeneratePasswordResetTokenAsync(teacher);

        var result = await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(teacher.Id, token, "N!ewPassword123"));

        Assert.IsType<BadRequestObjectResult>(result);
        var expired = await fixture.Db.TeacherInvitations.SingleAsync(item => item.Id == invitation.Id);
        Assert.Equal(TeacherInvitationStatus.Expired, expired.Status);
        Assert.Null(expired.AcceptedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "TeacherInvitationExpired" && item.EntityId == invitation.Id.ToString());
        Assert.True((await fixture.Users.FindByIdAsync(teacher.Id.ToString()))!.MustChangePassword);
    }

    [Fact]
    public async Task Revoked_teacher_invitation_freezes_the_account_and_blocks_acceptance()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var teacher = new ApplicationUser
        {
            UserName = "revoked-teacher@betcco.test",
            Email = "revoked-teacher@betcco.test",
            DisplayName = "Revoked teacher",
            EmailConfirmed = true,
            MustChangePassword = true
        };
        Assert.True((await fixture.Users.CreateAsync(teacher, "T!estPassword123")).Succeeded);
        var invitation = new TeacherInvitation
        {
            Email = teacher.Email,
            DisplayName = teacher.DisplayName,
            TeacherUserId = teacher.Id.ToString(),
            InvitedByUserId = Guid.NewGuid().ToString(),
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(1)
        };
        fixture.Db.TeacherInvitations.Add(invitation);
        await fixture.Db.SaveChangesAsync();
        var token = await fixture.Users.GeneratePasswordResetTokenAsync(teacher);
        var adminUserId = Guid.NewGuid().ToString();

        var revokeResult = await fixture.CreateAdminUsersController(adminUserId).RevokeTeacherInvitation(
            invitation.Id,
            new RevokeTeacherInvitationRequest("Invitation issued in error"),
            CancellationToken.None);
        var resetResult = await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(teacher.Id, token, "N!ewPassword123"));

        Assert.IsType<NoContentResult>(revokeResult);
        Assert.IsType<BadRequestObjectResult>(resetResult);
        var revoked = await fixture.Db.TeacherInvitations.SingleAsync(item => item.Id == invitation.Id);
        Assert.Equal(TeacherInvitationStatus.Revoked, revoked.Status);
        Assert.Equal(adminUserId, revoked.RevokedByUserId);
        Assert.Equal("Invitation issued in error", revoked.RevocationReason);
        Assert.NotNull(revoked.RevokedAtUtc);
        Assert.True((await fixture.Users.FindByIdAsync(teacher.Id.ToString()))!.IsFrozen);
        Assert.Contains(fixture.Db.AuditLogs, item => item.Action == "TeacherInvitationRevoked" && item.EntityId == invitation.Id.ToString());
    }

    [Fact]
    public async Task Support_admin_can_freeze_students_and_teachers_but_not_privileged_accounts()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in new[] { PlatformRoles.Teacher, PlatformRoles.SupportAdmin, PlatformRoles.Admin, PlatformRoles.SystemAdmin })
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);

        var targets = new Dictionary<string, ApplicationUser>();
        foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher, PlatformRoles.SupportAdmin, PlatformRoles.Admin, PlatformRoles.SystemAdmin })
        {
            var user = new ApplicationUser { UserName = $"{role}@betcco.test", Email = $"{role}@betcco.test", DisplayName = role, EmailConfirmed = true };
            Assert.True((await fixture.Users.CreateAsync(user, "T!estPassword123")).Succeeded);
            Assert.True((await fixture.Users.AddToRoleAsync(user, role)).Succeeded);
            targets[role] = user;
            fixture.Db.UserSessions.Add(new UserSession { UserId = user.Id.ToString(), DeviceName = "Test", BrowserName = "Test", LoggedInAtUtc = DateTimeOffset.UtcNow, LastActiveAtUtc = DateTimeOffset.UtcNow });
        }
        await fixture.Db.SaveChangesAsync();

        var controller = fixture.CreateAdminUsersController(Guid.NewGuid().ToString(), PlatformRoles.SupportAdmin);
        foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher })
        {
            Assert.IsType<NoContentResult>(await controller.Freeze(targets[role].Id, new FreezeUserRequest(true), CancellationToken.None));
            Assert.True(targets[role].IsFrozen);
            Assert.All(fixture.Db.UserSessions.Where(session => session.UserId == targets[role].Id.ToString()), session => Assert.NotNull(session.RevokedAtUtc));
            Assert.IsType<NoContentResult>(await controller.Freeze(targets[role].Id, new FreezeUserRequest(false), CancellationToken.None));
            Assert.False(targets[role].IsFrozen);
        }
        foreach (var role in new[] { PlatformRoles.SupportAdmin, PlatformRoles.Admin, PlatformRoles.SystemAdmin })
        {
            Assert.IsType<NotFoundResult>(await controller.Freeze(targets[role].Id, new FreezeUserRequest(true), CancellationToken.None));
            Assert.False(targets[role].IsFrozen);
        }
        var studentList = Assert.IsType<OkObjectResult>(await controller.ListFreezeTargets(PlatformRoles.Student, null, cancellationToken: CancellationToken.None));
        var listedUsers = JsonSerializer.Serialize(studentList.Value);
        Assert.Contains(targets[PlatformRoles.Student].Id.ToString(), listedUsers);
        Assert.DoesNotContain(targets[PlatformRoles.SupportAdmin].Id.ToString(), listedUsers);
        Assert.IsType<NoContentResult>(await fixture.CreateAdminUsersController(Guid.NewGuid().ToString()).Freeze(
            targets[PlatformRoles.SupportAdmin].Id, new FreezeUserRequest(true), CancellationToken.None));
        Assert.True(targets[PlatformRoles.SupportAdmin].IsFrozen);
        Assert.IsType<NotFoundResult>(await fixture.CreateAdminUsersController(Guid.NewGuid().ToString(), PlatformRoles.SystemAdmin).Freeze(
            targets[PlatformRoles.Admin].Id, new FreezeUserRequest(true), CancellationToken.None));
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "StudentFrozen");
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "TeacherUnfrozen");
    }

    [Theory]
    [InlineData(PlatformRoles.Admin)]
    [InlineData(PlatformRoles.SystemAdmin)]
    public async Task Admin_revokes_support_authority_without_freezing_or_deleting_the_account(string actorRole)
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in new[] { PlatformRoles.SupportAdmin, PlatformRoles.Teacher })
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);
        var target = new ApplicationUser { UserName = "support-role@betcco.test", Email = "support-role@betcco.test", DisplayName = "Support colleague", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(target, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, PlatformRoles.SupportAdmin)).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, PlatformRoles.Teacher)).Succeeded);
        var originalStamp = target.SecurityStamp;
        var sessions = Enumerable.Range(0, 2).Select(_ => new UserSession
        {
            UserId = target.Id.ToString(),
            DeviceName = "Test",
            BrowserName = "Test",
            LoggedInAtUtc = DateTimeOffset.UtcNow,
            LastActiveAtUtc = DateTimeOffset.UtcNow
        }).ToArray();
        fixture.Db.UserSessions.AddRange(sessions);
        await fixture.Db.SaveChangesAsync();

        var actorId = Guid.NewGuid().ToString();
        var admin = fixture.CreateAdminUsersController(actorId, actorRole);
        Assert.IsType<NoContentResult>(await admin.RevokeSupportAdminAuthority(target.Id, CancellationToken.None));
        var persisted = await fixture.Db.Users.AsNoTracking().SingleAsync(user => user.Id == target.Id);
        Assert.Equal("support-role@betcco.test", persisted.Email);
        Assert.Equal("Support colleague", persisted.DisplayName);
        Assert.False(persisted.IsFrozen);
        Assert.False(await fixture.Users.IsInRoleAsync(target, PlatformRoles.SupportAdmin));
        Assert.True(await fixture.Users.IsInRoleAsync(target, PlatformRoles.Teacher));
        Assert.NotEqual(originalStamp, persisted.SecurityStamp);
        Assert.All(sessions, session =>
        {
            Assert.NotNull(session.RevokedAtUtc);
            Assert.Equal(actorId, session.RevokedByUserId);
        });
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "SupportAdminAuthorityRevoked" && log.ActorUserId == actorId && log.EntityId == target.Id.ToString());
        Assert.IsType<NotFoundResult>(await admin.RevokeSupportAdminAuthority(target.Id, CancellationToken.None));

        Assert.IsType<NoContentResult>(await admin.Freeze(target.Id, new FreezeUserRequest(true), CancellationToken.None));
        Assert.True(target.IsFrozen);
        Assert.IsType<NoContentResult>(await admin.Freeze(target.Id, new FreezeUserRequest(false), CancellationToken.None));
        Assert.False(target.IsFrozen);
        Assert.True(await fixture.Users.IsInRoleAsync(target, PlatformRoles.Teacher));
    }

    [Theory]
    [InlineData(PlatformRoles.SupportAdmin)]
    [InlineData(PlatformRoles.Teacher)]
    [InlineData(PlatformRoles.Student)]
    public async Task Non_admin_roles_cannot_revoke_another_support_administrator(string actorRole)
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.SupportAdmin))).Succeeded);
        var target = new ApplicationUser { UserName = "support-target@betcco.test", Email = "support-target@betcco.test", DisplayName = "Target", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(target, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, PlatformRoles.SupportAdmin)).Succeeded);
        var originalStamp = target.SecurityStamp;
        var session = new UserSession { UserId = target.Id.ToString(), DeviceName = "Test", BrowserName = "Test", LoggedInAtUtc = DateTimeOffset.UtcNow, LastActiveAtUtc = DateTimeOffset.UtcNow };
        fixture.Db.UserSessions.Add(session);
        await fixture.Db.SaveChangesAsync();

        var controller = fixture.CreateAdminUsersController(Guid.NewGuid().ToString(), actorRole);
        Assert.IsType<ForbidResult>(await controller.RevokeSupportAdminAuthority(target.Id, CancellationToken.None));
        Assert.True(await fixture.Users.IsInRoleAsync(target, PlatformRoles.SupportAdmin));
        Assert.Equal(originalStamp, target.SecurityStamp);
        Assert.Null(session.RevokedAtUtc);
    }

    [Fact]
    public async Task Support_administrator_cannot_revoke_own_authority()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.SupportAdmin))).Succeeded);
        var target = new ApplicationUser { UserName = "self@betcco.test", Email = "self@betcco.test", DisplayName = "Self", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(target, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, PlatformRoles.SupportAdmin)).Succeeded);

        var controller = fixture.CreateAdminUsersController(target.Id.ToString(), PlatformRoles.SupportAdmin);
        Assert.IsType<ForbidResult>(await controller.RevokeSupportAdminAuthority(target.Id, CancellationToken.None));
        Assert.True(await fixture.Users.IsInRoleAsync(target, PlatformRoles.SupportAdmin));
    }

    [Theory]
    [InlineData(PlatformRoles.Admin)]
    [InlineData(PlatformRoles.SystemAdmin)]
    public async Task Support_authority_revocation_does_not_modify_privileged_identities(string privilegedRole)
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in new[] { PlatformRoles.SupportAdmin, privilegedRole })
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);
        var target = new ApplicationUser { UserName = "privileged@betcco.test", Email = "privileged@betcco.test", DisplayName = "Privileged", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(target, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, PlatformRoles.SupportAdmin)).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(target, privilegedRole)).Succeeded);

        Assert.IsType<NotFoundResult>(await fixture.CreateAdminUsersController(Guid.NewGuid().ToString()).RevokeSupportAdminAuthority(target.Id, CancellationToken.None));
        Assert.True(await fixture.Users.IsInRoleAsync(target, PlatformRoles.SupportAdmin));
        Assert.True(await fixture.Users.IsInRoleAsync(target, privilegedRole));
    }

    [Fact]
    public async Task Student_email_changes_only_after_password_and_new_mailbox_confirmation()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var student = new ApplicationUser { UserName = "student-old@betcco.test", Email = "student-old@betcco.test", DisplayName = "Student", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(student, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(student, PlatformRoles.Student)).Succeeded);
        var session = new UserSession { UserId = student.Id.ToString(), DeviceName = "Browser", BrowserName = "Test", LoggedInAtUtc = DateTimeOffset.UtcNow, LastActiveAtUtc = DateTimeOffset.UtcNow };
        fixture.Db.UserSessions.Add(session);
        await fixture.Db.SaveChangesAsync();
        SetAuthenticatedRequestContext(fixture, student.Id, PlatformRoles.Student, session.Id);

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.RequestStudentEmailChange(
            new StudentEmailChangeRequest("student-new@betcco.test", "wrong"), CancellationToken.None));
        Assert.Null(fixture.Email.HtmlBody);
        Assert.IsType<AcceptedResult>(await fixture.Controller.RequestStudentEmailChange(
            new StudentEmailChangeRequest("student-new@betcco.test", "T!estPassword123"), CancellationToken.None));
        Assert.Equal("student-old@betcco.test", student.Email);

        var url = new Uri(fixture.Email.HtmlBody!.Split("href=\"")[1].Split('"')[0]);
        var query = QueryHelpers.ParseQuery(url.Query);
        var confirmation = new EmailChangeConfirmationRequest(student.Id, query["email"]!, query["proof"]!, query["mode"]!);
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.ConfirmEmailChange(
            confirmation with { Proof = "invalid-proof" }, CancellationToken.None));
        Assert.IsType<NoContentResult>(await fixture.Controller.ConfirmEmailChange(confirmation, CancellationToken.None));
        Assert.Equal("student-new@betcco.test", student.Email);
        Assert.Equal(student.Email, student.UserName);
        Assert.NotNull(session.RevokedAtUtc);
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.ConfirmEmailChange(confirmation, CancellationToken.None));
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "StudentEmailChanged");
    }

    [Fact]
    public async Task Managed_teacher_email_requires_admin_initiation_and_teacher_confirmation()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Teacher))).Succeeded);
        var teacher = new ApplicationUser { UserName = "teacher-old@betcco.test", Email = "teacher-old@betcco.test", DisplayName = "Teacher", EmailConfirmed = true };
        Assert.True((await fixture.Users.CreateAsync(teacher, "T!estPassword123")).Succeeded);
        Assert.True((await fixture.Users.AddToRoleAsync(teacher, PlatformRoles.Teacher)).Succeeded);
        SetAuthenticatedRequestContext(fixture, teacher.Id, PlatformRoles.Teacher, Guid.NewGuid());
        Assert.IsType<ForbidResult>(await fixture.Controller.RequestStudentEmailChange(
            new StudentEmailChangeRequest("teacher-new@betcco.test", "T!estPassword123"), CancellationToken.None));

        var admin = fixture.CreateAdminUsersController(Guid.NewGuid().ToString());
        Assert.IsType<AcceptedResult>(await admin.RequestManagedEmailChange(teacher.Id,
            new ManagedEmailChangeRequest("teacher-new@betcco.test"), CancellationToken.None));
        Assert.Equal("teacher-old@betcco.test", teacher.Email);
        var url = new Uri(fixture.Email.HtmlBody!.Split("href=\"")[1].Split('"')[0]);
        var query = QueryHelpers.ParseQuery(url.Query);
        var confirmation = new EmailChangeConfirmationRequest(teacher.Id, query["email"]!, query["proof"]!, query["mode"]!);
        Assert.IsType<NoContentResult>(await fixture.Controller.ConfirmEmailChange(confirmation, CancellationToken.None));
        Assert.Equal("teacher-new@betcco.test", teacher.Email);
        Assert.Equal(teacher.Email, teacher.UserName);
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "ManagedUserEmailChangeRequested");
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "ManagedUserEmailChanged");
    }

    [Fact]
    public async Task Support_admin_activation_keeps_password_private_and_requires_mailbox_token()
    {
        await using var fixture = await RegistrationFixture.CreateAsync();
        var roleManager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.SupportAdmin))).Succeeded);
        var admin = fixture.CreateAdminUsersController(Guid.NewGuid().ToString());
        Assert.IsType<AcceptedResult>(await admin.InviteSupportAdmin(
            new InviteSupportAdminRequest("Support colleague", "support@betcco.test"), CancellationToken.None));
        var user = (await fixture.Users.FindByEmailAsync("support@betcco.test"))!;
        Assert.True(user.MustChangePassword);
        Assert.False(user.EmailConfirmed);
        Assert.True(await fixture.Users.IsInRoleAsync(user, PlatformRoles.SupportAdmin));
        Assert.Empty(fixture.Db.TeacherInvitations);
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(user.Id, "invalid", "N!ewPassword123")));
        var url = new Uri(fixture.Email.HtmlBody!.Split("href=\"")[1].Split('"')[0]);
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.IsType<OkObjectResult>(await fixture.Controller.ResetPassword(
            new ResetPasswordRequest(user.Id, query["token"]!, "N!ewPassword123")));
        Assert.True(user.EmailConfirmed);
        Assert.False(user.MustChangePassword);
        Assert.True(await fixture.Users.CheckPasswordAsync(user, "N!ewPassword123"));
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "SupportAdminProvisioned");
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "SupportAdminActivated");
    }

    private static void SetAuthenticatedRequestContext(RegistrationFixture fixture, Guid userId, string role, Guid sessionId)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = fixture.Services,
            User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Role, role),
                new Claim(BetccoAuthClaims.SessionId, sessionId.ToString())
            ], "Test"))
        };
        fixture.Services.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
        fixture.Controller.ControllerContext = new ControllerContext { HttpContext = context };
    }

    private static void SetRequestContext(RegistrationFixture fixture)
    {
        var context = new DefaultHttpContext { RequestServices = fixture.Services };
        fixture.Services.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
        fixture.Controller.ControllerContext = new ControllerContext { HttpContext = context };
    }

    private sealed class RegistrationFixture : IAsyncDisposable
    {
        private readonly ServiceProvider services;
        public AuthController Controller { get; }
        public CapturingEmailSender Email { get; }
        public UserManager<ApplicationUser> Users { get; }
        public BetccoDbContext Db { get; }
        public RegistrationEmailOutboxDispatcher EmailDispatcher { get; }
        public ServiceProvider Services => services;
        private IConfiguration Configuration { get; }

        public AdminUsersController CreateAdminUsersController(string actorUserId, string role = PlatformRoles.Admin) => new(Users, Db, Email, Configuration, services.GetRequiredService<IDataProtectionProvider>())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    RequestServices = services,
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, actorUserId), new Claim(ClaimTypes.Role, role)], "Test"))
                }
            }
        };

        private RegistrationFixture(ServiceProvider services, AuthController controller, CapturingEmailSender email, UserManager<ApplicationUser> users, BetccoDbContext db, IConfiguration configuration, RegistrationEmailOutboxDispatcher emailDispatcher)
        {
            this.services = services;
            Controller = controller;
            Email = email;
            Users = users;
            Db = db;
            Configuration = configuration;
            EmailDispatcher = emailDispatcher;
        }

        public static async Task<RegistrationFixture> CreateAsync(bool failEmailConfirmationTokenGeneration = false)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDbContext<BetccoDbContext>(options => options.UseInMemoryDatabase(Guid.NewGuid().ToString()));
            services.AddDataProtection();
            services.AddHttpContextAccessor();
            services.AddAuthentication(IdentityConstants.ApplicationScheme).AddCookie(IdentityConstants.ApplicationScheme);
            services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 12;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
                if (failEmailConfirmationTokenGeneration)
                    options.Tokens.EmailConfirmationTokenProvider = ThrowingEmailConfirmationTokenProvider.ProviderName;
            })
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>()
                .AddSignInManager()
                .AddTokenProvider<ThrowingEmailConfirmationTokenProvider>(ThrowingEmailConfirmationTokenProvider.ProviderName)
                .AddDefaultTokenProviders();

            var provider = services.BuildServiceProvider();
            var db = provider.GetRequiredService<BetccoDbContext>();
            db.LegalDocuments.AddRange(
                new LegalDocument
                {
                    Slug = "terms",
                    Version = "1.0",
                    ArabicTitle = "الشروط",
                    EnglishTitle = "Terms",
                    ArabicContent = "نص",
                    EnglishContent = "Text",
                    IsPublished = true
                },
                new LegalDocument
                {
                    Slug = "privacy",
                    Version = "1.0",
                    ArabicTitle = "الخصوصية",
                    EnglishTitle = "Privacy",
                    ArabicContent = "نص",
                    EnglishContent = "Text",
                    IsPublished = true
                });
            await db.SaveChangesAsync();

            var roleManager = provider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);

            var email = new CapturingEmailSender();
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APP_PUBLIC_URL"] = "http://frontend.betcco.test"
                })
                .Build();
            var users = provider.GetRequiredService<UserManager<ApplicationUser>>();
            var controller = new AuthController(
                users,
                provider.GetRequiredService<SignInManager<ApplicationUser>>(),
                db,
                email,
                provider.GetRequiredService<IDataProtectionProvider>(),
                new TestWebHostEnvironment(),
                configuration)
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext { RequestServices = provider }
                }
            };
            var emailDispatcher = new RegistrationEmailOutboxDispatcher(
                db,
                users,
                email,
                provider.GetRequiredService<IDataProtectionProvider>(),
                configuration,
                new TestWebHostEnvironment(),
                NullLogger<RegistrationEmailOutboxDispatcher>.Instance);
            return new RegistrationFixture(provider, controller, email, users, db, configuration, emailDispatcher);
        }

        public async ValueTask DisposeAsync()
        {
            await services.DisposeAsync();
        }
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public string? HtmlBody { get; private set; }
        public Exception? Failure { get; set; }
        public List<string> AttemptedHtmlBodies { get; } = [];

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            HtmlBody = htmlBody;
            AttemptedHtmlBodies.Add(htmlBody);
            if (Failure is not null) throw Failure;
            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingEmailConfirmationTokenProvider : IUserTwoFactorTokenProvider<ApplicationUser>
    {
        public const string ProviderName = "ThrowingEmailConfirmation";

        public Task<bool> CanGenerateTwoFactorTokenAsync(UserManager<ApplicationUser> manager, ApplicationUser user) =>
            Task.FromResult(true);

        public Task<string> GenerateAsync(string purpose, UserManager<ApplicationUser> manager, ApplicationUser user) =>
            throw new InvalidOperationException("Simulated confirmation-token generation failure.");

        public Task<bool> ValidateAsync(string purpose, string token, UserManager<ApplicationUser> manager, ApplicationUser user) =>
            Task.FromResult(false);
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ApplicationName { get; set; } = "Betcco.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = "Development";
    }
}
