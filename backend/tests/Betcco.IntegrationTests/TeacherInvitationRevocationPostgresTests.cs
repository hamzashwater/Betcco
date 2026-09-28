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
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class TeacherInvitationRevocationPostgresTests
{
    private static readonly string ActorId = Guid.NewGuid().ToString();

    [Fact]
    public async Task Revocation_commits_invitation_identity_sessions_and_one_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_success");
        Guid invitationId;
        Guid teacherId;
        string originalStamp;
        await using (var client = new Client(database.ConnectionString))
        {
            (invitationId, teacherId, originalStamp) = await client.SeedAsync();
            Assert.IsType<NoContentResult>(await client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("  Issued in error  "), CancellationToken.None));
        }

        await using var db = database.CreateContext();
        var invitation = await db.TeacherInvitations.AsNoTracking().SingleAsync();
        Assert.Equal(TeacherInvitationStatus.Revoked, invitation.Status);
        Assert.Equal(ActorId, invitation.RevokedByUserId);
        Assert.Equal("Issued in error", invitation.RevocationReason);
        Assert.NotNull(invitation.RevokedAtUtc);
        var teacher = await db.Users.AsNoTracking().SingleAsync(user => user.Id == teacherId);
        Assert.True(teacher.IsFrozen);
        Assert.True(teacher.MustChangePassword);
        Assert.Equal(invitation.RevokedAtUtc, teacher.SessionsInvalidBeforeUtc);
        Assert.NotEqual(originalStamp, teacher.SecurityStamp);
        var sessions = await db.UserSessions.AsNoTracking().OrderBy(session => session.DeviceName).ToListAsync();
        Assert.Equal(4, sessions.Count);
        Assert.All(sessions.Where(session => session.DeviceName.StartsWith("Active", StringComparison.Ordinal)), session =>
        {
            Assert.Equal(invitation.RevokedAtUtc, session.RevokedAtUtc);
            Assert.Equal(ActorId, session.RevokedByUserId);
            Assert.Equal("Teacher invitation revoked", session.RevocationReason);
        });
        Assert.Equal("Historical", sessions.Single(session => session.DeviceName == "Already revoked").RevocationReason);
        Assert.Null(sessions.Single(session => session.DeviceName == "Deleted").RevokedAtUtc);
        var audit = await db.AuditLogs.AsNoTracking().SingleAsync(item => item.Action == "TeacherInvitationRevoked");
        Assert.Equal(ActorId, audit.ActorUserId);
        Assert.Equal(nameof(TeacherInvitation), audit.EntityType);
        Assert.Equal(invitationId.ToString(), audit.EntityId);
        Assert.Equal("Success", audit.Outcome);
    }

    [Fact]
    public async Task Failed_security_stamp_update_rolls_back_all_prior_identity_writes()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_stamp_fail");
        var validator = new FailStampValidation();
        Guid invitationId;
        Guid teacherId;
        string originalStamp;
        await using (var client = new Client(database.ConnectionString, validator: validator))
        {
            (invitationId, teacherId, originalStamp) = await client.SeedAsync();
            validator.Arm();
            Assert.IsType<ObjectResult>(await client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("Issued in error"), CancellationToken.None));
        }
        Assert.Equal(2, validator.ValidationCount);
        await AssertRolledBackAsync(database, teacherId, originalStamp);
    }

    [Fact]
    public async Task Final_save_failure_rolls_back_identity_invitation_sessions_and_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_save_fail");
        var interceptor = new FailFinalSave();
        Guid invitationId;
        Guid teacherId;
        string originalStamp;
        await using (var client = new Client(database.ConnectionString, interceptor: interceptor))
        {
            (invitationId, teacherId, originalStamp) = await client.SeedAsync();
            await Assert.ThrowsAsync<SimulatedFinalSaveFailure>(() => client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("Issued in error"), CancellationToken.None));
        }
        Assert.True(interceptor.ObservedFrozenTeacherBeforeFailure);
        await AssertRolledBackAsync(database, teacherId, originalStamp);
    }

    [Fact]
    public async Task Expired_issued_invitation_expires_without_revoking_teacher_or_sessions()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_expired");
        Guid teacherId;
        string originalStamp;
        await using (var client = new Client(database.ConnectionString))
        {
            var seeded = await client.SeedAsync(status: TeacherInvitationStatus.Issued, expired: true);
            teacherId = seeded.TeacherId;
            originalStamp = seeded.Stamp;
            Assert.IsType<ConflictObjectResult>(await client.Controller.RevokeTeacherInvitation(
                seeded.InvitationId, new RevokeTeacherInvitationRequest("Issued in error"), CancellationToken.None));
        }
        await using var db = database.CreateContext();
        Assert.Equal(TeacherInvitationStatus.Expired, (await db.TeacherInvitations.AsNoTracking().SingleAsync()).Status);
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "TeacherInvitationExpired"));
        await AssertTeacherUnchangedAsync(db, teacherId, originalStamp);
    }

    [Theory]
    [InlineData(TeacherInvitationStatus.Revoked)]
    [InlineData(TeacherInvitationStatus.Accepted)]
    public async Task Non_issued_invitation_returns_conflict_without_new_mutations(TeacherInvitationStatus status)
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_nonissued");
        Guid teacherId;
        string originalStamp;
        await using (var client = new Client(database.ConnectionString))
        {
            var seeded = await client.SeedAsync(status);
            teacherId = seeded.TeacherId;
            originalStamp = seeded.Stamp;
            Assert.IsType<ConflictObjectResult>(await client.Controller.RevokeTeacherInvitation(
                seeded.InvitationId, new RevokeTeacherInvitationRequest("Issued in error"), CancellationToken.None));
        }
        await using var db = database.CreateContext();
        Assert.Equal(status, (await db.TeacherInvitations.AsNoTracking().SingleAsync()).Status);
        await AssertTeacherUnchangedAsync(db, teacherId, originalStamp);
    }

    [Fact]
    public async Task Second_revocation_returns_conflict_without_duplicate_audit_or_session_change()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_twice");
        Guid invitationId;
        await using (var client = new Client(database.ConnectionString))
        {
            (invitationId, _, _) = await client.SeedAsync();
            Assert.IsType<NoContentResult>(await client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("First reason"), CancellationToken.None));
            Assert.IsType<ConflictObjectResult>(await client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("Second reason"), CancellationToken.None));
        }
        await using var db = database.CreateContext();
        Assert.Equal("First reason", (await db.TeacherInvitations.AsNoTracking().SingleAsync()).RevocationReason);
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "TeacherInvitationRevoked"));
        Assert.All(await db.UserSessions.AsNoTracking().Where(session => session.DeviceName.StartsWith("Active")).ToListAsync(),
            session => Assert.Equal("Teacher invitation revoked", session.RevocationReason));
    }

    [Fact]
    public async Task Concurrent_revocations_have_only_one_success_and_one_audit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_race");
        Guid invitationId;
        await using (var seed = new Client(database.ConnectionString))
            (invitationId, _, _) = await seed.SeedAsync();

        await using var first = new Client(database.ConnectionString);
        await using var second = new Client(database.ConnectionString);
        async Task<bool> RevokeAsync(Client client)
        {
            try
            {
                var result = await client.Controller.RevokeTeacherInvitation(
                    invitationId, new RevokeTeacherInvitationRequest("Issued in error"), CancellationToken.None);
                return result is NoContentResult;
            }
            catch (Exception exception) when (exception.GetBaseException() is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure })
            {
                return false;
            }
        }

        var outcomes = await Task.WhenAll(RevokeAsync(first), RevokeAsync(second));
        Assert.Single(outcomes, succeeded => succeeded);
        await using var db = database.CreateContext();
        Assert.Equal(TeacherInvitationStatus.Revoked, (await db.TeacherInvitations.AsNoTracking().SingleAsync()).Status);
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "TeacherInvitationRevoked"));
        Assert.Equal(2, await db.UserSessions.CountAsync(session => session.DeviceName.StartsWith("Active") && session.RevokedAtUtc != null));
    }

    [Fact]
    public async Task Invitation_can_be_revoked_when_teacher_account_is_missing()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("teacher_revoke_missing");
        await using (var client = new Client(database.ConnectionString))
        {
            var (invitationId, _, _) = await client.SeedAsync(missingTeacher: true);
            Assert.IsType<NoContentResult>(await client.Controller.RevokeTeacherInvitation(
                invitationId, new RevokeTeacherInvitationRequest("Account removed"), CancellationToken.None));
        }
        await using var db = database.CreateContext();
        var invitation = await db.TeacherInvitations.AsNoTracking().SingleAsync();
        Assert.Equal(TeacherInvitationStatus.Revoked, invitation.Status);
        Assert.Equal(ActorId, invitation.RevokedByUserId);
        Assert.Equal("Account removed", invitation.RevocationReason);
        Assert.NotNull(invitation.RevokedAtUtc);
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "TeacherInvitationRevoked"));
        Assert.Empty(await db.Users.ToListAsync());
    }

    private static async Task AssertRolledBackAsync(PostgresTestDatabase database, Guid teacherId, string originalStamp)
    {
        await using var db = database.CreateContext();
        var invitation = await db.TeacherInvitations.AsNoTracking().SingleAsync();
        Assert.Equal(TeacherInvitationStatus.Issued, invitation.Status);
        Assert.Null(invitation.RevokedAtUtc);
        Assert.Null(invitation.RevokedByUserId);
        Assert.Null(invitation.RevocationReason);
        await AssertTeacherUnchangedAsync(db, teacherId, originalStamp);
    }

    private static async Task AssertTeacherUnchangedAsync(BetccoDbContext db, Guid teacherId, string originalStamp)
    {
        var teacher = await db.Users.AsNoTracking().SingleAsync(user => user.Id == teacherId);
        Assert.False(teacher.IsFrozen);
        Assert.Null(teacher.SessionsInvalidBeforeUtc);
        Assert.Equal(originalStamp, teacher.SecurityStamp);
        Assert.Equal(0, await db.AuditLogs.CountAsync(audit => audit.Action == "TeacherInvitationRevoked"));
        var sessions = await db.UserSessions.AsNoTracking().ToListAsync();
        Assert.Equal(2, sessions.Count(session => session.DeviceName.StartsWith("Active", StringComparison.Ordinal) && session.RevokedAtUtc is null));
        Assert.Equal("Historical", sessions.Single(session => session.DeviceName == "Already revoked").RevocationReason);
        Assert.Null(sessions.Single(session => session.DeviceName == "Deleted").RevokedAtUtc);
    }

    private sealed class Client : IAsyncDisposable
    {
        private readonly ServiceProvider services;
        private readonly BetccoDbContext db;
        private readonly UserManager<ApplicationUser> users;

        public Client(string connectionString, IInterceptor? interceptor = null, IUserValidator<ApplicationUser>? validator = null)
        {
            var collection = new ServiceCollection();
            collection.AddLogging();
            collection.AddControllers();
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
            db = services.GetRequiredService<BetccoDbContext>();
            users = services.GetRequiredService<UserManager<ApplicationUser>>();
            Controller = new AdminUsersController(users, db, new NoOpEmailSender(),
                new ConfigurationBuilder().Build(), services.GetRequiredService<IDataProtectionProvider>())
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        RequestServices = services,
                        User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, ActorId)], "Test"))
                    }
                }
            };
        }

        public AdminUsersController Controller { get; }

        public async Task<(Guid InvitationId, Guid TeacherId, string Stamp)> SeedAsync(
            TeacherInvitationStatus status = TeacherInvitationStatus.Issued, bool expired = false, bool missingTeacher = false)
        {
            var teacherId = Guid.NewGuid();
            var stamp = string.Empty;
            if (!missingTeacher)
            {
                var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
                Assert.True((await roleManager.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Teacher))).Succeeded);
                var teacher = new ApplicationUser
                {
                    Id = teacherId,
                    UserName = $"{teacherId:N}@betcco.test",
                    Email = $"{teacherId:N}@betcco.test",
                    DisplayName = "Invited teacher",
                    EmailConfirmed = true,
                    MustChangePassword = true
                };
                Assert.True((await users.CreateAsync(teacher, "T!estPassword123")).Succeeded);
                Assert.True((await users.AddToRoleAsync(teacher, PlatformRoles.Teacher)).Succeeded);
                stamp = (await users.FindByIdAsync(teacherId.ToString()))!.SecurityStamp!;
                var now = DateTimeOffset.UtcNow;
                db.UserSessions.AddRange(
                    new UserSession { UserId = teacherId.ToString(), DeviceName = "Active 1", BrowserName = "Test", LoggedInAtUtc = now, LastActiveAtUtc = now },
                    new UserSession { UserId = teacherId.ToString(), DeviceName = "Active 2", BrowserName = "Test", LoggedInAtUtc = now, LastActiveAtUtc = now },
                    new UserSession { UserId = teacherId.ToString(), DeviceName = "Already revoked", BrowserName = "Test", LoggedInAtUtc = now, LastActiveAtUtc = now, RevokedAtUtc = now.AddMinutes(-1), RevocationReason = "Historical" },
                    new UserSession { UserId = teacherId.ToString(), DeviceName = "Deleted", BrowserName = "Test", LoggedInAtUtc = now, LastActiveAtUtc = now, IsDeleted = true });
            }
            var invitation = new TeacherInvitation
            {
                Email = $"{teacherId:N}@betcco.test",
                DisplayName = "Invited teacher",
                TeacherUserId = teacherId.ToString(),
                InvitedByUserId = ActorId,
                ExpiresAtUtc = expired ? DateTimeOffset.UtcNow.AddMinutes(-1) : DateTimeOffset.UtcNow.AddDays(1),
                Status = status
            };
            db.TeacherInvitations.Add(invitation);
            await db.SaveChangesAsync();
            return (invitation.Id, teacherId, stamp);
        }

        public ValueTask DisposeAsync() => services.DisposeAsync();
    }

    private sealed class FailStampValidation : IUserValidator<ApplicationUser>
    {
        private bool armed;
        public int ValidationCount { get; private set; }
        public void Arm() => armed = true;
        public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user)
        {
            if (!armed) return Task.FromResult(IdentityResult.Success);
            ValidationCount++;
            return Task.FromResult(ValidationCount == 2
                ? IdentityResult.Failed(new IdentityError { Code = "InjectedStampFailure", Description = "Stamp update rejected." })
                : IdentityResult.Success);
        }
    }

    private sealed class FailFinalSave : SaveChangesInterceptor
    {
        public bool ObservedFrozenTeacherBeforeFailure { get; private set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = eventData.Context;
            if (db?.ChangeTracker.Entries<AuditLog>().Any(entry =>
                    entry.State == EntityState.Added && entry.Entity.Action == "TeacherInvitationRevoked") != true) return result;
            ObservedFrozenTeacherBeforeFailure = await db.Set<ApplicationUser>().AsNoTracking()
                .AnyAsync(user => user.IsFrozen, cancellationToken);
            throw new SimulatedFinalSaveFailure();
        }
    }

    private sealed class NoOpEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class SimulatedFinalSaveFailure : Exception;
}
