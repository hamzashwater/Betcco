using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

namespace Betcco.IntegrationTests;

public sealed class AccountSecurityControllerTests
{
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
        public UserManager<ApplicationUser> UserManager { get; }
        public SignInManager<ApplicationUser> SignInManager { get; }
        public ApplicationUser User { get; }

        private SecurityFixture(ServiceProvider services, BetccoDbContext db, UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, ApplicationUser user)
        {
            this.services = services;
            Db = db;
            UserManager = userManager;
            SignInManager = signInManager;
            User = user;
        }

        public static async Task<SecurityFixture> CreateAsync()
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
            })
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>()
                .AddSignInManager()
                .AddDefaultTokenProviders();
            var provider = services.BuildServiceProvider();
            var db = provider.GetRequiredService<BetccoDbContext>();
            var userManager = provider.GetRequiredService<UserManager<ApplicationUser>>();
            var signInManager = provider.GetRequiredService<SignInManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = "owner@betcco.test", Email = "owner@betcco.test", DisplayName = "Owner", EmailConfirmed = true };
            Assert.True((await userManager.CreateAsync(user, "T!estPassword123")).Succeeded);
            return new SecurityFixture(provider, db, userManager, signInManager, user);
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
            new NullEmailSender(),
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

    private sealed class NullEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default) => Task.CompletedTask;
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
