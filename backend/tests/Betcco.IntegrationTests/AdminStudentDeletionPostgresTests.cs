using System.Security.Claims;
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

public sealed class AdminStudentDeletionPostgresTests
{
    [Fact]
    public async Task Student_delete_commits_identity_binding_and_audit_together()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("student_delete_success");
        var userId = await SeedStudentAsync(database);
        await using (var client = new Client(database.ConnectionString))
            Assert.IsType<NoContentResult>(await client.Controller.DeleteStudent(userId, CancellationToken.None));
        await using (var replay = new Client(database.ConnectionString))
            Assert.IsType<NotFoundResult>(await replay.Controller.DeleteStudent(userId, CancellationToken.None));

        await using var verification = database.CreateContext();
        Assert.False(await verification.Users.AsNoTracking().AnyAsync(user => user.Id == userId));
        Assert.False(await verification.StudentDeviceBindings.AsNoTracking().AnyAsync(binding => binding.StudentUserId == userId.ToString()));
        Assert.Equal(1, await verification.AuditLogs.AsNoTracking().CountAsync(audit => audit.Action == "StudentDeleted" && audit.EntityId == userId.ToString()));
    }

    [Fact]
    public async Task Audit_persistence_failure_rolls_back_identity_delete_and_binding_cleanup()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("student_delete_rollback");
        var userId = await SeedStudentAsync(database);
        var interceptor = new FailAfterIdentityDelete();
        await using (var client = new Client(database.ConnectionString, interceptor))
            await Assert.ThrowsAsync<SimulatedAuditFailure>(() => client.Controller.DeleteStudent(userId, CancellationToken.None));
        Assert.True(interceptor.ObservedDeletedIdentity);

        await using var verification = database.CreateContext();
        Assert.True(await verification.Users.AsNoTracking().AnyAsync(user => user.Id == userId));
        var studentRoleId = await verification.Roles.AsNoTracking().Where(role => role.Name == PlatformRoles.Student).Select(role => role.Id).SingleAsync();
        Assert.True(await verification.UserRoles.AsNoTracking().AnyAsync(link => link.UserId == userId && link.RoleId == studentRoleId));
        Assert.True(await verification.StudentDeviceBindings.AsNoTracking().AnyAsync(binding => binding.StudentUserId == userId.ToString()));
        Assert.False(await verification.AuditLogs.AsNoTracking().AnyAsync(audit => audit.Action == "StudentDeleted" && audit.EntityId == userId.ToString()));
    }

    private static async Task<Guid> SeedStudentAsync(PostgresTestDatabase database)
    {
        await using var client = new Client(database.ConnectionString);
        var roleManager = client.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);
        var user = new ApplicationUser { UserName = "student@betcco.test", Email = "student@betcco.test", DisplayName = "Student" };
        Assert.True((await client.Users.CreateAsync(user)).Succeeded);
        Assert.True((await client.Users.AddToRoleAsync(user, PlatformRoles.Student)).Succeeded);
        client.Db.StudentDeviceBindings.Add(new StudentDeviceBinding { StudentUserId = user.Id.ToString(), DeviceHash = "student-device-hash" });
        await client.Db.SaveChangesAsync();
        return user.Id;
    }

    private sealed class Client : IAsyncDisposable
    {
        private readonly ServiceProvider services;

        public Client(string connectionString, IInterceptor? interceptor = null)
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
                        User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString())], "Test"))
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

    private sealed class FailAfterIdentityDelete : SaveChangesInterceptor
    {
        public bool ObservedDeletedIdentity { get; private set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = eventData.Context;
            var audit = db?.ChangeTracker.Entries<AuditLog>()
                .SingleOrDefault(entry => entry.State == EntityState.Added && entry.Entity.Action == "StudentDeleted");
            if (audit is null) return result;

            var userId = Guid.Parse(audit.Entity.EntityId!);
            ObservedDeletedIdentity = !await db!.Set<ApplicationUser>().AsNoTracking()
                .AnyAsync(user => user.Id == userId, cancellationToken);
            if (!ObservedDeletedIdentity) throw new InvalidOperationException("Identity deletion did not precede the audit save.");
            throw new SimulatedAuditFailure();
        }
    }

    private sealed class SimulatedAuditFailure : Exception;

    private sealed class NoopEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
