using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Identity;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Betcco.IntegrationTests;

public sealed class StudentApprovalPostgresTests
{
    [Fact]
    public async Task Student_approval_commits_identity_and_one_audit_together()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("student_approval_success");
        var userId = await SeedStudentAsync(database);
        var actorId = Guid.NewGuid();

        await using (var client = new Client(database.ConnectionString, actorId))
            Assert.IsType<NoContentResult>(await client.Controller.ApproveStudent(userId, CancellationToken.None));

        await using var verification = database.CreateContext();
        Assert.True(await verification.Users.AsNoTracking().Where(user => user.Id == userId)
            .Select(user => user.EmailConfirmed).SingleAsync());
        var audit = Assert.Single(await verification.AuditLogs.AsNoTracking()
            .Where(item => item.Action == "StudentApproved" && item.EntityId == userId.ToString()).ToListAsync());
        Assert.Equal(actorId.ToString(), audit.ActorUserId);
        Assert.Equal(nameof(ApplicationUser), audit.EntityType);
        Assert.Equal("Success", audit.Outcome);
        Assert.False(JsonDocument.Parse(audit.OldValuesJson!).RootElement.GetProperty("emailConfirmed").GetBoolean());
        Assert.True(JsonDocument.Parse(audit.NewValuesJson!).RootElement.GetProperty("emailConfirmed").GetBoolean());
    }

    [Fact]
    public async Task Audit_save_failure_rolls_back_identity_approval_and_retry_succeeds()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("student_approval_rollback");
        var userId = await SeedStudentAsync(database);
        var actorId = Guid.NewGuid();
        var interceptor = new FailAfterIdentityApproval();

        await using (var client = new Client(database.ConnectionString, actorId, interceptor))
            await Assert.ThrowsAsync<SimulatedAuditFailure>(() => client.Controller.ApproveStudent(userId, CancellationToken.None));
        Assert.True(interceptor.ObservedApprovedIdentityBeforeFailure);

        await using (var verification = database.CreateContext())
        {
            Assert.False(await verification.Users.AsNoTracking().Where(user => user.Id == userId)
                .Select(user => user.EmailConfirmed).SingleAsync());
            Assert.False(await verification.AuditLogs.AsNoTracking()
                .AnyAsync(item => item.Action == "StudentApproved" && item.EntityId == userId.ToString()));
        }

        await using (var retry = new Client(database.ConnectionString, actorId))
            Assert.IsType<NoContentResult>(await retry.Controller.ApproveStudent(userId, CancellationToken.None));

        await using var final = database.CreateContext();
        Assert.True(await final.Users.AsNoTracking().Where(user => user.Id == userId)
            .Select(user => user.EmailConfirmed).SingleAsync());
        Assert.Equal(1, await final.AuditLogs.AsNoTracking()
            .CountAsync(item => item.Action == "StudentApproved" && item.EntityId == userId.ToString()));
    }

    private static async Task<Guid> SeedStudentAsync(PostgresTestDatabase database)
    {
        await using var client = new Client(database.ConnectionString, Guid.NewGuid());
        var roles = client.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);
        var user = new ApplicationUser
        {
            UserName = "student@betcco.test",
            Email = "student@betcco.test",
            DisplayName = "Student",
            EmailConfirmed = false
        };
        Assert.True((await client.Users.CreateAsync(user)).Succeeded);
        Assert.True((await client.Users.AddToRoleAsync(user, PlatformRoles.Student)).Succeeded);
        return user.Id;
    }

    private sealed class Client : IAsyncDisposable
    {
        private readonly ServiceProvider services;

        public Client(string connectionString, Guid actorId, IInterceptor? interceptor = null)
        {
            var collection = new ServiceCollection();
            collection.AddLogging();
            collection.AddDbContext<BetccoDbContext>(options =>
            {
                options.UseNpgsql(connectionString);
                if (interceptor is not null) options.AddInterceptors(interceptor);
            });
            collection.AddDataProtection();
            collection.AddIdentityCore<ApplicationUser>()
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>()
                .AddUserStore<ProtectedRecoveryCodeUserStore>();
            services = collection.BuildServiceProvider();
            Db = services.GetRequiredService<BetccoDbContext>();
            Users = services.GetRequiredService<UserManager<ApplicationUser>>();
            Controller = new AdminUsersController(Users, Db, new NoopEmailSender(), new ConfigurationBuilder().Build(), services.GetRequiredService<IDataProtectionProvider>())
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        RequestServices = services,
                        User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, actorId.ToString())], "Test"))
                    }
                }
            };
        }

        public ServiceProvider Services => services;
        public BetccoDbContext Db { get; }
        public UserManager<ApplicationUser> Users { get; }
        public AdminUsersController Controller { get; }

        public ValueTask DisposeAsync() => services.DisposeAsync();
    }

    private sealed class FailAfterIdentityApproval : SaveChangesInterceptor
    {
        public bool ObservedApprovedIdentityBeforeFailure { get; private set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = eventData.Context;
            var audit = db?.ChangeTracker.Entries<AuditLog>()
                .SingleOrDefault(entry => entry.State == EntityState.Added && entry.Entity.Action == "StudentApproved");
            if (audit is null) return result;

            var userId = Guid.Parse(audit.Entity.EntityId!);
            ObservedApprovedIdentityBeforeFailure = await db!.Set<ApplicationUser>().AsNoTracking()
                .Where(user => user.Id == userId).Select(user => user.EmailConfirmed).SingleAsync(cancellationToken);
            if (!ObservedApprovedIdentityBeforeFailure)
                throw new InvalidOperationException("Identity approval did not precede the audit save.");
            throw new SimulatedAuditFailure();
        }
    }

    private sealed class SimulatedAuditFailure : Exception;

    private sealed class NoopEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
