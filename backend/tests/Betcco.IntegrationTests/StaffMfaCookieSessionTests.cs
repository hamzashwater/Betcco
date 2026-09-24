using System.Net;
using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

public sealed class StaffMfaCookieSessionTests
{
    [Fact]
    public async Task Refreshed_security_stamp_preserves_session_validation_and_rejects_revoked_cookie()
    {
        var databaseName = Guid.NewGuid().ToString();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:Postgres", "Host=localhost;Database=unused");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?> { ["ConnectionStrings:Postgres"] = "Host=localhost;Database=unused" }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<DbContextOptions<BetccoDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<BetccoDbContext>>();
                services.AddDbContext<BetccoDbContext>(options => options.UseInMemoryDatabase(databaseName));
                foreach (var descriptor in services.Where(service => service.ServiceType == typeof(IHostedService)
                    && service.ImplementationType?.Namespace?.StartsWith("Betcco", StringComparison.Ordinal) == true).ToArray())
                    services.Remove(descriptor);
            });
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost")
        });
        Guid sessionId;
        string cookie;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var services = scope.ServiceProvider;
            var db = services.GetRequiredService<BetccoDbContext>();
            var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
            var signInManager = services.GetRequiredService<SignInManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = "session@betcco.test", Email = "session@betcco.test", DisplayName = "Session", EmailConfirmed = true };
            Assert.True((await userManager.CreateAsync(user, "T!estPassword123")).Succeeded);
            var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.SupportAdmin))).Succeeded);
            Assert.True((await userManager.AddToRoleAsync(user, PlatformRoles.SupportAdmin)).Succeeded);
            var session = new UserSession
            {
                UserId = user.Id.ToString(),
                DeviceName = "Test browser",
                BrowserName = "Test browser",
                LoggedInAtUtc = DateTimeOffset.UtcNow,
                LastActiveAtUtc = DateTimeOffset.UtcNow
            };
            db.UserSessions.Add(session);
            await db.SaveChangesAsync();
            sessionId = session.Id;

            var principal = await signInManager.CreateUserPrincipalAsync(user);
            ((ClaimsIdentity)principal.Identity!).AddClaim(new Claim(BetccoAuthClaims.SessionId, sessionId.ToString()));
            var options = services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
                .Get(IdentityConstants.ApplicationScheme);
            cookie = options.TicketDataFormat.Protect(new AuthenticationTicket(principal,
                new AuthenticationProperties { IssuedUtc = DateTimeOffset.UtcNow, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1) },
                IdentityConstants.ApplicationScheme));
            client.DefaultRequestHeaders.Add("Cookie", $"{options.Cookie.Name}={cookie}");
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        var protectedResponse = await client.GetAsync("/api/v1/auth/profile");
        Assert.Equal(HttpStatusCode.Forbidden, protectedResponse.StatusCode);
        Assert.Contains("MFA_ENROLLMENT_REQUIRED", await protectedResponse.Content.ReadAsStringAsync());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            var session = await db.UserSessions.SingleAsync(item => item.Id == sessionId);
            session.RevokedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }
}
