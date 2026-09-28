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

public sealed class TeacherInvitationProvisioningPostgresTests
{
    private static readonly InviteTeacherRequest InvitationRequest = new("Invited teacher", "invited@betcco.test");

    [Fact]
    public async Task Role_assignment_failure_rolls_back_created_teacher_without_delivery()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_invite_role_failure");
        var email = new CapturingEmailSender();
        var validator = new FailSecondUserValidation();
        await using (var client = new Client(database.ConnectionString, email, validator: validator))
        {
            await client.EnsureTeacherRoleAsync();
            Assert.IsType<BadRequestObjectResult>(await client.Controller.InviteTeacher(InvitationRequest, CancellationToken.None));
        }

        Assert.Equal(2, validator.ValidationCount);
        Assert.Equal(0, email.DeliveredCount);
        await AssertNoProvisioningAsync(database);
    }

    [Fact]
    public async Task Final_invitation_persistence_failure_rolls_back_user_role_and_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_invite_db_failure");
        var email = new CapturingEmailSender();
        var interceptor = new FailInvitationPersistence();
        await using (var client = new Client(database.ConnectionString, email, interceptor))
        {
            await client.EnsureTeacherRoleAsync();
            await Assert.ThrowsAsync<SimulatedInvitationPersistenceFailure>(() =>
                client.Controller.InviteTeacher(InvitationRequest, CancellationToken.None));
        }

        Assert.True(interceptor.ObservedPersistedRoleBeforeFailure);
        Assert.Equal(0, email.DeliveredCount);
        await AssertNoProvisioningAsync(database);
    }

    [Fact]
    public async Task Email_failure_preserves_provisioning_and_resend_recovers_without_duplicates()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_invite_email_failure");
        var failedEmail = new CapturingEmailSender { Failure = new SimulatedEmailFailure() };
        await using (var client = new Client(database.ConnectionString, failedEmail))
        {
            await client.EnsureTeacherRoleAsync();
            await Assert.ThrowsAsync<SimulatedEmailFailure>(() =>
                client.Controller.InviteTeacher(InvitationRequest, CancellationToken.None));
        }
        Assert.Equal(0, failedEmail.DeliveredCount);

        Guid invitationId;
        Guid teacherId;
        await using (var verification = database.CreateContext())
        {
            var teacher = await verification.Users.AsNoTracking().SingleAsync(user => user.Email == InvitationRequest.Email);
            teacherId = teacher.Id;
            Assert.True(teacher.MustChangePassword);
            Assert.True(teacher.EmailConfirmed);
            var teacherRoleId = await verification.Roles.AsNoTracking()
                .Where(role => role.Name == PlatformRoles.Teacher).Select(role => role.Id).SingleAsync();
            Assert.True(await verification.UserRoles.AsNoTracking()
                .AnyAsync(link => link.UserId == teacherId && link.RoleId == teacherRoleId));
            var invitation = await verification.TeacherInvitations.AsNoTracking().SingleAsync();
            invitationId = invitation.Id;
            Assert.Equal(TeacherInvitationStatus.Issued, invitation.Status);
            Assert.Equal(teacherId.ToString(), invitation.TeacherUserId);
            Assert.Equal(1, await verification.AuditLogs.AsNoTracking()
                .CountAsync(audit => audit.Action == "TeacherInvited" && audit.EntityId == invitationId.ToString()));
        }

        var workingEmail = new CapturingEmailSender();
        await using (var recovery = new Client(database.ConnectionString, workingEmail))
        {
            Assert.IsType<ConflictObjectResult>(await recovery.Controller.InviteTeacher(InvitationRequest, CancellationToken.None));
            Assert.IsType<AcceptedResult>(await recovery.Controller.ResendTeacherInvitation(invitationId, CancellationToken.None));
        }
        Assert.Equal(1, workingEmail.DeliveredCount);
        Assert.Contains("/ar/reset-password?userId=", workingEmail.HtmlBody);
        await using var final = database.CreateContext();
        Assert.Equal(1, await final.Users.AsNoTracking().CountAsync(user => user.Email == InvitationRequest.Email));
        Assert.Equal(1, await final.TeacherInvitations.AsNoTracking().CountAsync());
        Assert.Equal(TeacherInvitationStatus.Issued, (await final.TeacherInvitations.AsNoTracking().SingleAsync()).Status);
        Assert.Equal(1, await final.AuditLogs.AsNoTracking().CountAsync(audit => audit.Action == "TeacherInvited"));
        var resendAudit = await final.AuditLogs.AsNoTracking().SingleAsync(audit => audit.Action == "TeacherInvitationResent");
        Assert.Equal(invitationId.ToString(), resendAudit.EntityId);
        Assert.Null(resendAudit.MetadataJson);
    }

    private static async Task AssertNoProvisioningAsync(PostgresTestDatabase database)
    {
        await using var verification = database.CreateContext();
        Assert.False(await verification.Users.AsNoTracking().AnyAsync(user => user.Email == InvitationRequest.Email));
        Assert.Empty(await verification.UserRoles.AsNoTracking().ToListAsync());
        Assert.Empty(await verification.TeacherInvitations.AsNoTracking().ToListAsync());
        Assert.False(await verification.AuditLogs.AsNoTracking().AnyAsync(audit => audit.Action == "TeacherInvited"));
    }

    private sealed class Client : IAsyncDisposable
    {
        private readonly ServiceProvider services;

        public Client(string connectionString, CapturingEmailSender email, IInterceptor? interceptor = null,
            IUserValidator<ApplicationUser>? validator = null)
        {
            var collection = new ServiceCollection();
            collection.AddLogging();
            collection.AddDbContext<BetccoDbContext>(options =>
            {
                options.UseNpgsql(connectionString);
                if (interceptor is not null) options.AddInterceptors(interceptor);
            });
            collection.AddDataProtection();
            collection.AddIdentityCore<ApplicationUser>(options => options.User.RequireUniqueEmail = true)
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>()
                .AddUserStore<ProtectedRecoveryCodeUserStore>()
                .AddDefaultTokenProviders();
            if (validator is not null) collection.AddSingleton(validator);
            services = collection.BuildServiceProvider();
            var db = services.GetRequiredService<BetccoDbContext>();
            var users = services.GetRequiredService<UserManager<ApplicationUser>>();
            Controller = new AdminUsersController(users, db, email,
                new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APP_PUBLIC_URL"] = "http://frontend.betcco.test"
                }).Build(), services.GetRequiredService<IDataProtectionProvider>())
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        RequestServices = services,
                        User = new ClaimsPrincipal(new ClaimsIdentity(
                            [new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString())], "Test"))
                    }
                }
            };
        }

        public AdminUsersController Controller { get; }

        public async Task EnsureTeacherRoleAsync()
        {
            var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Teacher))).Succeeded);
        }

        public ValueTask DisposeAsync() => services.DisposeAsync();
    }

    private sealed class FailSecondUserValidation : IUserValidator<ApplicationUser>
    {
        public int ValidationCount { get; private set; }

        public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user)
        {
            ValidationCount++;
            return Task.FromResult(ValidationCount == 2
                ? IdentityResult.Failed(new IdentityError { Code = "InjectedRoleFailure", Description = "Role assignment rejected." })
                : IdentityResult.Success);
        }
    }

    private sealed class FailInvitationPersistence : SaveChangesInterceptor
    {
        public bool ObservedPersistedRoleBeforeFailure { get; private set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = eventData.Context;
            var hasAudit = db?.ChangeTracker.Entries<AuditLog>()
                .Any(entry => entry.State == EntityState.Added && entry.Entity.Action == "TeacherInvited") == true;
            if (!hasAudit) return result;
            ObservedPersistedRoleBeforeFailure = await db!.Set<IdentityUserRole<Guid>>().AsNoTracking()
                .AnyAsync(cancellationToken);
            throw new SimulatedInvitationPersistenceFailure();
        }
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public Exception? Failure { get; init; }
        public int DeliveredCount { get; private set; }
        public string? HtmlBody { get; private set; }

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            if (Failure is not null) throw Failure;
            DeliveredCount++;
            HtmlBody = htmlBody;
            return Task.CompletedTask;
        }
    }

    private sealed class SimulatedInvitationPersistenceFailure : Exception;
    private sealed class SimulatedEmailFailure : Exception;
}
