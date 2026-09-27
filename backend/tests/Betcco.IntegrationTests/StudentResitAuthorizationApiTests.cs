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

public sealed class StudentResitAuthorizationApiTests
{
    [Fact]
    public async Task Student_list_enforces_authentication_before_pagination_and_preserves_bounded_errors()
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
        var clientOptions = new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost")
        };
        using var studentClient = factory.CreateClient(clientOptions);
        using var anonymousClient = factory.CreateClient(clientOptions);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var services = scope.ServiceProvider;
            var users = services.GetRequiredService<UserManager<ApplicationUser>>();
            var roles = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            var student = new ApplicationUser
            {
                UserName = "resit-list@betcco.test",
                Email = "resit-list@betcco.test",
                DisplayName = "Resit Student",
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(student, "T!estPassword123")).Succeeded);
            Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);
            Assert.True((await users.AddToRoleAsync(student, PlatformRoles.Student)).Succeeded);
            var session = new UserSession
            {
                UserId = student.Id.ToString(),
                DeviceName = "Test browser",
                BrowserName = "Test browser",
                LoggedInAtUtc = DateTimeOffset.UtcNow,
                LastActiveAtUtc = DateTimeOffset.UtcNow
            };
            var db = services.GetRequiredService<BetccoDbContext>();
            db.UserSessions.Add(session);
            await db.SaveChangesAsync();

            var principal = await services.GetRequiredService<SignInManager<ApplicationUser>>()
                .CreateUserPrincipalAsync(student);
            ((ClaimsIdentity)principal.Identity!).AddClaim(new Claim(BetccoAuthClaims.SessionId, session.Id.ToString()));
            var cookie = services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
                .Get(IdentityConstants.ApplicationScheme);
            var protectedTicket = cookie.TicketDataFormat.Protect(new AuthenticationTicket(
                principal,
                new AuthenticationProperties { IssuedUtc = DateTimeOffset.UtcNow, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1) },
                IdentityConstants.ApplicationScheme));
            studentClient.DefaultRequestHeaders.Add("Cookie", $"{cookie.Cookie.Name}={protectedTicket}");
        }

        const string route = "/api/v1/student/resit-authorizations";
        foreach (var query in new[] { "", "?page=1&pageSize=20", "?page=1&pageSize=50" })
        {
            using var response = await studentClient.GetAsync(route + query);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains("\"items\":[]", await response.Content.ReadAsStringAsync());
        }
        foreach (var query in new[] { "?page=0", "?page=-1", "?pageSize=0", "?pageSize=51" })
        {
            using var response = await studentClient.GetAsync(route + query);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("RESIT_PAGE_INVALID", await response.Content.ReadAsStringAsync());
        }
        foreach (var query in new[] { "?page=abc", "?pageSize=2147483648" })
        {
            using var response = await studentClient.GetAsync(route + query);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        foreach (var query in new[] { "", "?page=0", "?pageSize=51" })
        {
            using var response = await anonymousClient.GetAsync(route + query);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }
}
