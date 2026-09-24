using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Api.Authorization;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

namespace Betcco.IntegrationTests;

public sealed class AccountSecurityControllerTests
{
    [Theory]
    [InlineData(PlatformRoles.Admin, true)]
    [InlineData(PlatformRoles.SystemAdmin, true)]
    [InlineData(PlatformRoles.SupportAdmin, true)]
    [InlineData(PlatformRoles.FinanceAdmin, true)]
    [InlineData(PlatformRoles.Student, false)]
    [InlineData(PlatformRoles.Teacher, false)]
    [InlineData(PlatformRoles.Assessor, false)]
    [InlineData(PlatformRoles.InternalVerifier, false)]
    [InlineData(PlatformRoles.LeadInternalVerifier, false)]
    [InlineData(PlatformRoles.CourseReviewer, false)]
    public async Task Staff_mfa_gate_uses_current_roles_and_preserves_public_endpoints(string role, bool enforced)
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        await AddRoleAsync(fixture, role);

        Assert.Equal(enforced, StaffMfaPolicy.RequiresStaffMfa(await fixture.UserManager.GetRolesAsync(fixture.User)));
        Assert.Equal(enforced ? StatusCodes.Status403Forbidden : StatusCodes.Status204NoContent,
            await GateStatusAsync(fixture));
        Assert.Equal(StatusCodes.Status204NoContent, await GateStatusAsync(fixture, bootstrap: true));
        Assert.Equal(StatusCodes.Status204NoContent, await GateStatusAsync(fixture, publicEndpoint: true));
    }

    [Fact]
    public async Task Staff_mfa_gate_handles_multiple_roles_activation_revocation_and_freeze()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        await AddRoleAsync(fixture, PlatformRoles.Teacher);
        Assert.Equal(204, await GateStatusAsync(fixture));
        await AddRoleAsync(fixture, PlatformRoles.SupportAdmin);
        Assert.Equal(403, await GateStatusAsync(fixture));
        Assert.True((await fixture.UserManager.SetTwoFactorEnabledAsync(fixture.User, true)).Succeeded);
        Assert.Equal(204, await GateStatusAsync(fixture));
        Assert.True((await fixture.UserManager.SetTwoFactorEnabledAsync(fixture.User, false)).Succeeded);
        Assert.True((await fixture.UserManager.RemoveFromRoleAsync(fixture.User, PlatformRoles.SupportAdmin)).Succeeded);
        Assert.Equal(204, await GateStatusAsync(fixture));
        fixture.User.IsFrozen = true;
        Assert.True((await fixture.UserManager.UpdateAsync(fixture.User)).Succeeded);
        Assert.Equal(401, await GateStatusAsync(fixture, bootstrap: false));
    }

    [Fact]
    public async Task Multi_role_enforcement_and_staff_disable_are_server_owned()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        await AddRoleAsync(fixture, PlatformRoles.Teacher);
        await AddRoleAsync(fixture, PlatformRoles.FinanceAdmin);
        Assert.True(StaffMfaPolicy.RequiresStaffMfa(await fixture.UserManager.GetRolesAsync(fixture.User)));
        Assert.Equal(403, await GateStatusAsync(fixture));
        var me = Assert.IsType<OkObjectResult>(await fixture.CreateController(Guid.NewGuid()).Me());
        Assert.Contains("\"requiresMfaEnrollment\":true", JsonSerializer.Serialize(me.Value));
        var denied = Assert.IsType<ObjectResult>(await fixture.CreateController(Guid.NewGuid()).DisableTwoFactor(new TwoFactorCodeRequest(null), CancellationToken.None));
        Assert.Equal(403, denied.StatusCode);
        Assert.Contains("STAFF_MFA_REQUIRED", JsonSerializer.Serialize(denied.Value));
    }

    [Fact]
    public async Task Enabling_staff_mfa_rotates_stamp_and_revokes_other_bootstrap_sessions()
    {
        await using var fixture = await SecurityFixture.CreateAsync(mockAuthenticatorProvider: true);
        await AddRoleAsync(fixture, PlatformRoles.SupportAdmin);
        var current = Session(fixture.User.Id.ToString(), "Current");
        var other = Session(fixture.User.Id.ToString(), "Other bootstrap browser");
        fixture.Db.UserSessions.AddRange(current, other);
        await fixture.Db.SaveChangesAsync();
        Assert.True((await fixture.UserManager.ResetAuthenticatorKeyAsync(fixture.User)).Succeeded);
        var oldStamp = fixture.User.SecurityStamp;
        var code = await fixture.UserManager.GenerateTwoFactorTokenAsync(fixture.User, TokenOptions.DefaultAuthenticatorProvider);

        Assert.IsType<NoContentResult>(await fixture.CreateController(current.Id).EnableTwoFactor(new TwoFactorCodeRequest(code), CancellationToken.None));
        Assert.True(await fixture.UserManager.GetTwoFactorEnabledAsync(fixture.User));
        Assert.NotEqual(oldStamp, fixture.User.SecurityStamp);
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(x => x.Id == current.Id)).RevokedAtUtc);
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(x => x.Id == other.Id)).RevokedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "TwoFactorEnabled");
        Assert.Equal(204, await GateStatusAsync(fixture));
    }

    [Fact]
    public async Task Enabling_optional_teacher_mfa_does_not_revoke_other_session_records()
    {
        await using var fixture = await SecurityFixture.CreateAsync(mockAuthenticatorProvider: true);
        await AddRoleAsync(fixture, PlatformRoles.Teacher);
        var current = Session(fixture.User.Id.ToString(), "Current");
        var other = Session(fixture.User.Id.ToString(), "Other");
        fixture.Db.UserSessions.AddRange(current, other);
        await fixture.Db.SaveChangesAsync();
        Assert.True((await fixture.UserManager.ResetAuthenticatorKeyAsync(fixture.User)).Succeeded);
        var code = await fixture.UserManager.GenerateTwoFactorTokenAsync(fixture.User, TokenOptions.DefaultAuthenticatorProvider);

        Assert.IsType<NoContentResult>(await fixture.CreateController(current.Id).EnableTwoFactor(new TwoFactorCodeRequest(code), CancellationToken.None));

        Assert.True(await fixture.UserManager.GetTwoFactorEnabledAsync(fixture.User));
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(session => session.Id == other.Id)).RevokedAtUtc);
    }

    [Fact]
    public async Task Non_enforced_user_can_still_disable_authenticator_with_a_valid_code()
    {
        await using var fixture = await SecurityFixture.CreateAsync(mockAuthenticatorProvider: true);
        await AddRoleAsync(fixture, PlatformRoles.Teacher);
        var current = Session(fixture.User.Id.ToString(), "Current");
        fixture.Db.UserSessions.Add(current);
        await fixture.Db.SaveChangesAsync();
        Assert.True((await fixture.UserManager.ResetAuthenticatorKeyAsync(fixture.User)).Succeeded);
        Assert.True((await fixture.UserManager.SetTwoFactorEnabledAsync(fixture.User, true)).Succeeded);
        var code = await fixture.UserManager.GenerateTwoFactorTokenAsync(fixture.User, TokenOptions.DefaultAuthenticatorProvider);
        Assert.IsType<NoContentResult>(await fixture.CreateController(current.Id).DisableTwoFactor(new TwoFactorCodeRequest(code), CancellationToken.None));
        Assert.False(await fixture.UserManager.GetTwoFactorEnabledAsync(fixture.User));
    }

    private static async Task AddRoleAsync(SecurityFixture fixture, string role)
    {
        var manager = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        if (!await manager.RoleExistsAsync(role)) Assert.True((await manager.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);
        Assert.True((await fixture.UserManager.AddToRoleAsync(fixture.User, role)).Succeeded);
    }

    private static async Task<int> GateStatusAsync(SecurityFixture fixture, bool bootstrap = false, bool publicEndpoint = false)
    {
        var context = new DefaultHttpContext { RequestServices = fixture.Services };
        context.Response.Body = new MemoryStream();
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, fixture.User.Id.ToString())], "test"));
        var metadata = publicEndpoint ? Array.Empty<object>() : bootstrap
            ? [new AuthorizeAttribute(), new StaffMfaBootstrapAttribute()]
            : new object[] { new AuthorizeAttribute() };
        context.SetEndpoint(new Endpoint(_ => Task.CompletedTask, new EndpointMetadataCollection(metadata), "test"));
        await new StaffMfaEnrollmentMiddleware(next => { next.Response.StatusCode = 204; return Task.CompletedTask; })
            .InvokeAsync(context, fixture.UserManager);
        return context.Response.StatusCode;
    }

    [Fact]
    public async Task Identity_authenticator_provider_creates_a_protected_setup_key()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        Assert.True((await fixture.UserManager.ResetAuthenticatorKeyAsync(fixture.User)).Succeeded);
        var key = await fixture.UserManager.GetAuthenticatorKeyAsync(fixture.User);
        Assert.False(string.IsNullOrWhiteSpace(key));

        Assert.True((await fixture.UserManager.SetTwoFactorEnabledAsync(fixture.User, true)).Succeeded);
        Assert.True(await fixture.UserManager.GetTwoFactorEnabledAsync(fixture.User));
    }

    [Fact]
    public async Task Account_owner_can_list_and_end_only_their_own_active_sessions()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        var otherUser = new ApplicationUser { UserName = "other@betcco.test", Email = "other@betcco.test", DisplayName = "Other", EmailConfirmed = true };
        Assert.True((await fixture.UserManager.CreateAsync(otherUser, "T!estPassword123")).Succeeded);

        var current = Session(fixture.User.Id.ToString(), "Current device");
        var another = Session(fixture.User.Id.ToString(), "Another device");
        var revoked = Session(fixture.User.Id.ToString(), "Old device");
        revoked.RevokedAtUtc = DateTimeOffset.UtcNow;
        var foreign = Session(otherUser.Id.ToString(), "Foreign device");
        fixture.Db.UserSessions.AddRange(current, another, revoked, foreign);
        await fixture.Db.SaveChangesAsync();

        var controller = fixture.CreateController(current.Id);
        var listed = Assert.IsType<OkObjectResult>(await controller.ListSessions(CancellationToken.None));
        var json = JsonSerializer.Serialize(listed.Value);
        Assert.Contains(current.Id.ToString(), json);
        Assert.Contains(another.Id.ToString(), json);
        Assert.DoesNotContain(revoked.Id.ToString(), json);
        Assert.DoesNotContain(foreign.Id.ToString(), json);
        Assert.Contains("\"isCurrent\":true", json);

        Assert.IsType<NotFoundResult>(await controller.RevokeSession(foreign.Id, CancellationToken.None));
        Assert.IsType<OkObjectResult>(await controller.RevokeSession(another.Id, CancellationToken.None));
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(item => item.Id == another.Id)).RevokedAtUtc);
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(item => item.Id == current.Id)).RevokedAtUtc);
    }

    [Fact]
    public async Task Logout_other_sessions_preserves_current_and_foreign_sessions()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        var current = Session(fixture.User.Id.ToString(), "Current");
        var other = Session(fixture.User.Id.ToString(), "Other");
        var foreign = Session(Guid.NewGuid().ToString(), "Foreign");
        fixture.Db.UserSessions.AddRange(current, other, foreign);
        await fixture.Db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await fixture.CreateController(current.Id).LogoutOtherSessions(CancellationToken.None));
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(x => x.Id == current.Id)).RevokedAtUtc);
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(x => x.Id == other.Id)).RevokedAtUtc);
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(x => x.Id == foreign.Id)).RevokedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, x => x.Action == "OtherUserSessionsRevoked");
    }

    [Fact]
    public async Task Password_change_requires_current_password_and_revokes_other_sessions()
    {
        await using var fixture = await SecurityFixture.CreateAsync();
        var current = Session(fixture.User.Id.ToString(), "Current");
        var other = Session(fixture.User.Id.ToString(), "Other");
        fixture.Db.UserSessions.AddRange(current, other);
        await fixture.Db.SaveChangesAsync();
        var controller = fixture.CreateController(current.Id);

        Assert.IsType<BadRequestObjectResult>(await controller.ChangePassword(new ChangePasswordRequest("wrong", "N!ewPassword123"), CancellationToken.None));
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(x => x.Id == other.Id)).RevokedAtUtc);
        Assert.IsType<NoContentResult>(await controller.ChangePassword(new ChangePasswordRequest("T!estPassword123", "N!ewPassword123"), CancellationToken.None));
        Assert.True(await fixture.UserManager.CheckPasswordAsync(fixture.User, "N!ewPassword123"));
        Assert.False(await fixture.UserManager.CheckPasswordAsync(fixture.User, "T!estPassword123"));
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(x => x.Id == current.Id)).RevokedAtUtc);
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(x => x.Id == other.Id)).RevokedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, x => x.Action == "PasswordChanged");
    }

    [Fact]
    public async Task PostgreSql_email_confirmation_and_session_revocation_commit_together()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("account_security");
        await using var fixture = await SecurityFixture.CreateAsync(database.ConnectionString);
        var roles = fixture.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);
        Assert.True((await fixture.UserManager.AddToRoleAsync(fixture.User, PlatformRoles.Student)).Succeeded);
        var current = Session(fixture.User.Id.ToString(), "Current");
        var other = Session(fixture.User.Id.ToString(), "Other");
        fixture.Db.UserSessions.AddRange(current, other);
        await fixture.Db.SaveChangesAsync();
        var controller = fixture.CreateController(current.Id);

        Assert.IsType<OkObjectResult>(await controller.LogoutOtherSessions(CancellationToken.None));
        Assert.Null((await fixture.Db.UserSessions.SingleAsync(item => item.Id == current.Id)).RevokedAtUtc);
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(item => item.Id == other.Id)).RevokedAtUtc);
        Assert.IsType<AcceptedResult>(await controller.RequestStudentEmailChange(
            new StudentEmailChangeRequest("new-owner@betcco.test", "T!estPassword123"), CancellationToken.None));
        var url = new Uri(fixture.Email.HtmlBody!.Split("href=\"")[1].Split('"')[0]);
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.IsType<NoContentResult>(await controller.ConfirmEmailChange(
            new EmailChangeConfirmationRequest(fixture.User.Id, query["email"]!, query["proof"]!, query["mode"]!), CancellationToken.None));

        var persisted = await fixture.Db.Users.AsNoTracking().SingleAsync(user => user.Id == fixture.User.Id);
        Assert.Equal("new-owner@betcco.test", persisted.Email);
        Assert.Equal(persisted.Email, persisted.UserName);
        Assert.True(persisted.EmailConfirmed);
        Assert.NotNull((await fixture.Db.UserSessions.SingleAsync(item => item.Id == current.Id)).RevokedAtUtc);
        Assert.Contains(fixture.Db.AuditLogs, log => log.Action == "StudentEmailChanged");
    }

    private static UserSession Session(string userId, string deviceName) => new()
    {
        UserId = userId,
        DeviceName = deviceName,
        BrowserName = "Test browser",
        LoggedInAtUtc = DateTimeOffset.UtcNow,
        LastActiveAtUtc = DateTimeOffset.UtcNow
    };

    private sealed class SecurityFixture : IAsyncDisposable
    {
        private readonly ServiceProvider services;
        public BetccoDbContext Db { get; }
        public ServiceProvider Services => services;
        public CapturingEmailSender Email { get; }
        public UserManager<ApplicationUser> UserManager { get; }
        public SignInManager<ApplicationUser> SignInManager { get; }
        public ApplicationUser User { get; }

        private SecurityFixture(ServiceProvider services, BetccoDbContext db, UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, ApplicationUser user, CapturingEmailSender email)
        {
            this.services = services;
            Db = db;
            UserManager = userManager;
            SignInManager = signInManager;
            User = user;
            Email = email;
        }

        public static async Task<SecurityFixture> CreateAsync(string? postgresConnectionString = null, bool mockAuthenticatorProvider = false)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDbContext<BetccoDbContext>(options =>
            {
                if (postgresConnectionString is null) options.UseInMemoryDatabase(Guid.NewGuid().ToString());
                else options.UseNpgsql(postgresConnectionString);
            });
            services.AddDataProtection();
            services.AddHttpContextAccessor();
            services.AddAuthentication(IdentityConstants.ApplicationScheme).AddCookie(IdentityConstants.ApplicationScheme);
            services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 12;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
            })
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>()
                .AddSignInManager()
                .AddDefaultTokenProviders();
            if (mockAuthenticatorProvider)
            {
                // Isolate controller/session behavior without implementing TOTP in tests.
                services.AddTransient<TestAuthenticatorProvider>();
                services.Configure<IdentityOptions>(options => options.Tokens.ProviderMap[TokenOptions.DefaultAuthenticatorProvider] =
                    new TokenProviderDescriptor(typeof(TestAuthenticatorProvider)));
            }
            var provider = services.BuildServiceProvider();
            var db = provider.GetRequiredService<BetccoDbContext>();
            var userManager = provider.GetRequiredService<UserManager<ApplicationUser>>();
            var signInManager = provider.GetRequiredService<SignInManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = "owner@betcco.test", Email = "owner@betcco.test", DisplayName = "Owner", EmailConfirmed = true };
            Assert.True((await userManager.CreateAsync(user, "T!estPassword123")).Succeeded);
            return new SecurityFixture(provider, db, userManager, signInManager, user, new CapturingEmailSender());
        }

        public AuthController CreateController(Guid currentSessionId)
        {
            var context = new DefaultHttpContext
            {
                RequestServices = services,
                User = new ClaimsPrincipal(new ClaimsIdentity([
                    new Claim(ClaimTypes.NameIdentifier, User.Id.ToString()),
                    new Claim(BetccoAuthClaims.SessionId, currentSessionId.ToString())
                ], "test"))
            };
            services.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
            return new AuthController(
            UserManager,
            SignInManager,
            Db,
            Email,
            services.GetRequiredService<IDataProtectionProvider>(),
            new TestWebHostEnvironment(),
            new ConfigurationBuilder().Build())
            {
                ControllerContext = new ControllerContext { HttpContext = context }
            };
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            await services.DisposeAsync();
        }
    }

    private sealed class TestAuthenticatorProvider : IUserTwoFactorTokenProvider<ApplicationUser>
    {
        public Task<string> GenerateAsync(string purpose, UserManager<ApplicationUser> manager, ApplicationUser user) => Task.FromResult("123456");
        public Task<bool> ValidateAsync(string purpose, string token, UserManager<ApplicationUser> manager, ApplicationUser user) => Task.FromResult(token == "123456");
        public Task<bool> CanGenerateTwoFactorTokenAsync(UserManager<ApplicationUser> manager, ApplicationUser user) => Task.FromResult(true);
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public string? HtmlBody { get; private set; }
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            HtmlBody = htmlBody;
            return Task.CompletedTask;
        }
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
