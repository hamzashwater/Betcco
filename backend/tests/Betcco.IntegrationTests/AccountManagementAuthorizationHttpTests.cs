using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
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
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

// Real MVC routes, Identity cookies, sessions, staff MFA, authorization and CSRF.
// Only email delivery/background work is isolated; the database is PostgreSQL.
public sealed class AccountManagementAuthorizationHttpTests
{
    [Fact]
    public async Task Limited_roles_cannot_manage_identities_and_denials_do_not_change_account_state()
    {
        await using var api = await AccountApi.CreateAsync();
        foreach (var role in new[] { PlatformRoles.SupportAdmin, PlatformRoles.Student, PlatformRoles.Teacher })
        {
            using var actor = await api.ActorAsync(role);
            var before = await api.StateAsync();
            Assert.Equal(HttpStatusCode.Forbidden, (await actor.GetAsync("/api/v1/admin/users?role=Teacher")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{api.Teacher}/email-change/request", new { newEmail = "denied@betcco.test" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await actor.PostAsJsonAsync("/api/v1/admin/users/support-admins/invite", new { displayName = "Denied", email = "denied@betcco.test" })).StatusCode);
            Assert.Equal(before, await api.StateAsync());
            Assert.Equal(0, api.Mail.Count);
        }
    }

    [Fact]
    public async Task System_admin_can_request_managed_email_and_invite_with_eligibility_and_audit_guards()
    {
        await using var api = await AccountApi.CreateAsync();
        using var actor = await api.ActorAsync(PlatformRoles.SystemAdmin);
        Assert.Equal(HttpStatusCode.OK, (await actor.GetAsync("/api/v1/admin/users?role=Teacher")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await actor.GetAsync("/api/v1/admin/users/freeze-targets?role=Student")).StatusCode);
        var emailPath = $"/api/v1/admin/users/{api.Teacher}/email-change/request";
        Assert.Equal(HttpStatusCode.Accepted, (await actor.PostAsJsonAsync(emailPath, new { newEmail = "pending@betcco.test" })).StatusCode);
        await using (var db = api.Database.CreateContext())
        {
            Assert.Equal("teacher@betcco.test", (await db.Users.SingleAsync(user => user.Id == api.Teacher)).Email);
            var audit = await db.AuditLogs.SingleAsync(item => item.Action == "ManagedUserEmailChangeRequested");
            Assert.Equal(api.Teacher.ToString(), audit.EntityId);
            Assert.Equal(api.ActorIds[PlatformRoles.SystemAdmin].ToString(), audit.ActorUserId);
        }
        Assert.Equal(1, api.Mail.Count);
        foreach (var (target, status) in new[]
        {
            (api.ActorIds[PlatformRoles.SystemAdmin], HttpStatusCode.NotFound),
            (api.LegacyAdmin, HttpStatusCode.NotFound),
            (api.Student, HttpStatusCode.NotFound),
            (api.UnactivatedTeacher, HttpStatusCode.Conflict)
        })
        {
            var before = await api.StateAsync();
            Assert.Equal(status, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{target}/email-change/request", new { newEmail = "guarded@betcco.test" })).StatusCode);
            Assert.Equal(before, await api.StateAsync());
            Assert.Equal(1, api.Mail.Count);
        }
        foreach (var (email, status) in new[] { ("teacher@betcco.test", HttpStatusCode.BadRequest), ("student@betcco.test", HttpStatusCode.Conflict) })
        {
            var before = await api.StateAsync();
            Assert.Equal(status, (await actor.PostAsJsonAsync(emailPath, new { newEmail = email })).StatusCode);
            Assert.Equal(before, await api.StateAsync());
        }
        var invitation = await actor.PostAsJsonAsync("/api/v1/admin/users/support-admins/invite", new { displayName = "New Support", email = "invited@betcco.test" });
        Assert.Equal(HttpStatusCode.Accepted, invitation.StatusCode);
        await using (var scope = api.Factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var invited = await users.FindByEmailAsync("invited@betcco.test");
            Assert.NotNull(invited);
            Assert.False(invited.EmailConfirmed);
            Assert.True(invited.MustChangePassword);
            Assert.Equal(new[] { PlatformRoles.SupportAdmin }, await users.GetRolesAsync(invited));
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            var audit = await db.AuditLogs.SingleAsync(item => item.Action == "SupportAdminProvisioned");
            Assert.Equal(invited.Id.ToString(), audit.EntityId);
            Assert.Equal(api.ActorIds[PlatformRoles.SystemAdmin].ToString(), audit.ActorUserId);
        }
        Assert.Equal(2, api.Mail.Count);
        var beforeDuplicate = await api.StateAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await actor.PostAsJsonAsync("/api/v1/admin/users/support-admins/invite", new { displayName = "Duplicate", email = "invited@betcco.test" })).StatusCode);
        Assert.Equal(beforeDuplicate, await api.StateAsync());
        Assert.Equal(2, api.Mail.Count);
    }

    [Fact]
    public async Task Freeze_policy_enforces_target_scope_and_commits_state_stamp_sessions_and_audit()
    {
        await using var api = await AccountApi.CreateAsync();
        using var support = await api.ActorAsync(PlatformRoles.SupportAdmin);
        foreach (var (role, id) in new[] { (PlatformRoles.Student, api.Student), (PlatformRoles.Teacher, api.Teacher) })
        {
            var list = await support.GetAsync($"/api/v1/admin/users/freeze-targets?role={role}");
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            using var body = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            var ids = body.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToArray();
            Assert.Contains(id, ids);
            Assert.DoesNotContain(api.MixedStudent, ids);
            Assert.DoesNotContain(api.LegacyAdmin, ids);
            await using var beforeDb = api.Database.CreateContext();
            var oldStamp = (await beforeDb.Users.AsNoTracking().SingleAsync(user => user.Id == id)).SecurityStamp;
            Assert.Equal(HttpStatusCode.NoContent, (await support.PostAsJsonAsync($"/api/v1/admin/users/{id}/freeze", new { frozen = true })).StatusCode);
            await using (var db = api.Database.CreateContext())
            {
                var user = await db.Users.SingleAsync(user => user.Id == id);
                Assert.True(user.IsFrozen);
                Assert.NotEqual(oldStamp, user.SecurityStamp);
                Assert.NotNull(user.SessionsInvalidBeforeUtc);
                Assert.All(await db.UserSessions.Where(session => session.UserId == id.ToString()).ToListAsync(), session =>
                {
                    Assert.NotNull(session.RevokedAtUtc);
                    Assert.Equal(api.ActorIds[PlatformRoles.SupportAdmin].ToString(), session.RevokedByUserId);
                });
                var audit = await db.AuditLogs.SingleAsync(item => item.EntityId == id.ToString() && item.Action == role + "Frozen");
                Assert.Contains("true", audit.NewValuesJson);
            }
            Assert.Equal(HttpStatusCode.NoContent, (await support.PostAsJsonAsync($"/api/v1/admin/users/{id}/freeze", new { frozen = false })).StatusCode);
            await using (var db = api.Database.CreateContext())
            {
                Assert.False((await db.Users.SingleAsync(user => user.Id == id)).IsFrozen);
                Assert.True(await db.AuditLogs.AnyAsync(item => item.EntityId == id.ToString() && item.Action == role + "Unfrozen"));
                Assert.All(await db.UserSessions.Where(session => session.UserId == id.ToString()).ToListAsync(), session => Assert.NotNull(session.RevokedAtUtc));
            }
        }
        var before = await api.StateAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await support.GetAsync("/api/v1/admin/users/freeze-targets?role=SupportAdmin")).StatusCode);
        foreach (var target in new[] { api.LegacyAdmin, api.MixedStudent, api.ActorIds[PlatformRoles.SystemAdmin] })
            Assert.Equal(HttpStatusCode.NotFound, (await support.PostAsJsonAsync($"/api/v1/admin/users/{target}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await support.PostAsJsonAsync($"/api/v1/admin/users/{api.ActorIds[PlatformRoles.SupportAdmin]}/freeze", new { frozen = true })).StatusCode);
        foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher })
        {
            using var limited = await api.ActorAsync(role);
            Assert.Equal(HttpStatusCode.Forbidden, (await limited.GetAsync("/api/v1/admin/users/freeze-targets?role=Student")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await limited.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
        }
        Assert.Equal(before, await api.StateAsync());
        using var system = await api.ActorAsync(PlatformRoles.SystemAdmin);
        Assert.Equal(HttpStatusCode.NotFound, (await system.PostAsJsonAsync($"/api/v1/admin/users/{api.LegacyAdmin}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(before, await api.StateAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await system.PostAsJsonAsync($"/api/v1/admin/users/{api.ActorIds[PlatformRoles.SupportAdmin]}/freeze", new { frozen = true })).StatusCode);
        await using (var db = api.Database.CreateContext())
        {
            var target = api.ActorIds[PlatformRoles.SupportAdmin];
            Assert.True((await db.Users.SingleAsync(user => user.Id == target)).IsFrozen);
            Assert.True(await db.AuditLogs.AnyAsync(audit => audit.EntityId == target.ToString()
                && audit.Action == "UserFrozen" && audit.ActorUserId == api.ActorIds[PlatformRoles.SystemAdmin].ToString()));
        }
    }

    [Fact]
    public async Task Missing_invalid_and_other_identity_antiforgery_tokens_reject_writes_without_mutation()
    {
        await using var api = await AccountApi.CreateAsync();
        using var actor = await api.ActorAsync(PlatformRoles.SystemAdmin);
        var before = await api.StateAsync();
        foreach (var token in new string?[] { null, "invalid-token" })
        {
            actor.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
            if (token is not null) actor.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
            Assert.Equal(HttpStatusCode.BadRequest, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{api.Teacher}/email-change/request", new { newEmail = "csrf@betcco.test" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await actor.PostAsJsonAsync("/api/v1/admin/users/support-admins/invite", new { displayName = "CSRF", email = "csrf@betcco.test" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
            Assert.Equal(before, await api.StateAsync());
            Assert.Equal(0, api.Mail.Count);
        }
        using var student = await api.ActorAsync(PlatformRoles.Student);
        actor.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        actor.DefaultRequestHeaders.Add("X-CSRF-TOKEN", student.DefaultRequestHeaders.GetValues("X-CSRF-TOKEN").Single());
        Assert.Equal(HttpStatusCode.BadRequest, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(before, await api.StateAsync());
    }

    [Fact]
    public async Task Anonymous_unenrolled_and_revoked_sessions_cannot_reach_management_mutations()
    {
        await using var api = await AccountApi.CreateAsync();
        using var anonymous = api.NewClient();
        var before = await api.StateAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(before, await api.StateAsync());
        using var unenrolled = await api.ActorAsync(PlatformRoles.SystemAdmin, enrolled: false);
        var gate = await unenrolled.GetAsync("/api/v1/admin/users");
        Assert.Equal(HttpStatusCode.Forbidden, gate.StatusCode);
        Assert.Contains("MFA_ENROLLMENT_REQUIRED", await gate.Content.ReadAsStringAsync());
        before = await api.StateAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await unenrolled.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(before, await api.StateAsync());
        using var actor = await api.ActorAsync(PlatformRoles.SystemAdmin);
        await using (var db = api.Database.CreateContext())
        {
            foreach (var session in await db.UserSessions.Where(session => session.UserId == api.ActorIds[PlatformRoles.SystemAdmin].ToString()).ToListAsync())
                session.RevokedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }
        before = await api.StateAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await actor.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await actor.PostAsJsonAsync($"/api/v1/admin/users/{api.Student}/freeze", new { frozen = true })).StatusCode);
        Assert.Equal(before, await api.StateAsync());
        Assert.Equal(0, api.Mail.Count);
    }

    private sealed class AccountApi : IAsyncDisposable
    {
        public required PostgresTestDatabase Database { get; init; }
        public required WebApplicationFactory<Program> Factory { get; init; }
        public required TestMail Mail { get; init; }
        public Dictionary<string, Guid> ActorIds { get; } = [];
        public Guid Student { get; private set; }
        public Guid Teacher { get; private set; }
        public Guid LegacyAdmin { get; private set; }
        public Guid MixedStudent { get; private set; }
        public Guid UnactivatedTeacher { get; private set; }

        public static async Task<AccountApi> CreateAsync()
        {
            var database = await PostgresTestDatabase.CreateAsync("ui_accept_r03_auth");
            var mail = new TestMail();
            var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:Postgres", database.ConnectionString);
                builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:Postgres"] = database.ConnectionString,
                    ["APP_PUBLIC_URL"] = "https://frontend.betcco.test"
                }));
                builder.ConfigureLogging(logging => logging.ClearProviders());
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<DbContextOptions<BetccoDbContext>>();
                    services.RemoveAll<IDbContextOptionsConfiguration<BetccoDbContext>>();
                    services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(database.ConnectionString));
                    services.RemoveAll<IEmailSender>();
                    services.AddSingleton<IEmailSender>(mail);
                    services.AddDataProtection().UseEphemeralDataProtectionProvider();
                    foreach (var descriptor in services.Where(service => service.ServiceType == typeof(IHostedService)
                        && service.ImplementationType?.Namespace?.StartsWith("Betcco", StringComparison.Ordinal) == true).ToArray())
                        services.Remove(descriptor);
                });
            });
            var api = new AccountApi { Database = database, Factory = factory, Mail = mail };
            using var boot = api.NewClient();
            await using var scope = factory.Services.CreateAsyncScope();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher, PlatformRoles.SupportAdmin, PlatformRoles.SystemAdmin, PlatformRoles.Admin, PlatformRoles.FinanceAdmin })
                Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);
            api.Student = await api.SeedAsync("student", [PlatformRoles.Student]);
            api.Teacher = await api.SeedAsync("teacher", [PlatformRoles.Teacher]);
            api.LegacyAdmin = await api.SeedAsync("legacy", [PlatformRoles.Admin]);
            api.MixedStudent = await api.SeedAsync("mixed", [PlatformRoles.Student, PlatformRoles.FinanceAdmin]);
            api.UnactivatedTeacher = await api.SeedAsync("unactivated", [PlatformRoles.Teacher], activated: false);
            foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Teacher, PlatformRoles.SupportAdmin, PlatformRoles.SystemAdmin })
                api.ActorIds[role] = await api.SeedAsync("actor-" + role.ToLowerInvariant(), [role]);
            return api;
        }

        private async Task<Guid> SeedAsync(string name, string[] roles, bool activated = true)
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = name + "@betcco.test", Email = name + "@betcco.test", DisplayName = name, EmailConfirmed = activated, MustChangePassword = !activated, TwoFactorEnabled = true };
            Assert.True((await users.CreateAsync(user)).Succeeded);
            Assert.True((await users.AddToRolesAsync(user, roles)).Succeeded);
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            db.UserSessions.Add(new UserSession { UserId = user.Id.ToString(), DeviceName = "Isolated authorization test", BrowserName = "TestServer", LoggedInAtUtc = DateTimeOffset.UtcNow, LastActiveAtUtc = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            return user.Id;
        }

        public HttpClient NewClient() => Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, BaseAddress = new Uri("https://localhost") });

        public async Task<HttpClient> ActorAsync(string role, bool enrolled = true)
        {
            var client = NewClient();
            await using var scope = Factory.Services.CreateAsyncScope();
            var services = scope.ServiceProvider;
            var users = services.GetRequiredService<UserManager<ApplicationUser>>();
            var user = (await users.FindByIdAsync(ActorIds[role].ToString()))!;
            if (await users.GetTwoFactorEnabledAsync(user) != enrolled)
                Assert.True((await users.SetTwoFactorEnabledAsync(user, enrolled)).Succeeded);
            var db = services.GetRequiredService<BetccoDbContext>();
            var session = await db.UserSessions.SingleAsync(item => item.UserId == user.Id.ToString());
            var principal = await services.GetRequiredService<SignInManager<ApplicationUser>>().CreateUserPrincipalAsync(user);
            ((ClaimsIdentity)principal.Identity!).AddClaim(new Claim(BetccoAuthClaims.SessionId, session.Id.ToString()));
            var options = services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(IdentityConstants.ApplicationScheme);
            var ticket = options.TicketDataFormat.Protect(new AuthenticationTicket(principal,
                new AuthenticationProperties { IssuedUtc = DateTimeOffset.UtcNow, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1) }, IdentityConstants.ApplicationScheme));
            client.DefaultRequestHeaders.Add("Cookie", $"{options.Cookie.Name}={ticket}");
            using var csrf = await client.GetAsync("/api/v1/security/antiforgery");
            Assert.Equal(HttpStatusCode.OK, csrf.StatusCode);
            using var body = JsonDocument.Parse(await csrf.Content.ReadAsStringAsync());
            client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", body.RootElement.GetProperty("token").GetString());
            return client;
        }

        public async Task<string> StateAsync()
        {
            await using var db = Database.CreateContext();
            // Session activity timestamps may be refreshed by normal authentication;
            // account state, stamps, roles, revocations and operation audits must not.
            return JsonSerializer.Serialize(new
            {
                users = await db.Users.OrderBy(user => user.Id).Select(user => new { user.Id, user.Email, user.IsFrozen, user.EmailConfirmed, user.MustChangePassword, user.SecurityStamp, user.SessionsInvalidBeforeUtc }).ToListAsync(),
                roles = await db.UserRoles.OrderBy(link => link.UserId).ThenBy(link => link.RoleId).ToListAsync(),
                sessions = await db.UserSessions.OrderBy(session => session.Id).Select(session => new { session.Id, session.RevokedAtUtc, session.RevokedByUserId, session.RevocationReason }).ToListAsync(),
                audits = await db.AuditLogs.OrderBy(audit => audit.Id).Select(audit => new { audit.Id, audit.Action, audit.EntityId, audit.ActorUserId }).ToListAsync()
            });
        }

        public async ValueTask DisposeAsync()
        {
            await Factory.DisposeAsync();
            await Database.DisposeAsync();
        }
    }

    private sealed class TestMail : IEmailSender
    {
        private List<string> Messages { get; } = [];
        public int Count => Messages.Count;
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            Messages.Add(subject); // Never persist proofs, activation links or credentials.
            return Task.CompletedTask;
        }
    }
}
