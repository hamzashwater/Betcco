using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Identity;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class RegistrationAtomicityPostgresTests
{
    [PostgresFact]
    public async Task Committed_registration_dispatches_durable_email_intent_after_transaction()
    {
        await using var database = await PostgresRegistrationDatabase.CreateAsync();
        await using var client = database.CreateClient();

        Assert.IsType<AcceptedResult>(await client.Controller.Register(Request("postgres-outbox@betcco.test"), CancellationToken.None));
        Assert.Empty(client.Email.AttemptedHtmlBodies);
        Assert.Equal(RegistrationEmailDeliveryStatus.Pending, (await client.Db.RegistrationEmailOutboxMessages.SingleAsync()).Status);

        Assert.Equal(1, await client.EmailDispatcher.DispatchPendingAsync());
        var sent = await client.Db.RegistrationEmailOutboxMessages.SingleAsync();
        Assert.Equal(RegistrationEmailDeliveryStatus.Sent, sent.Status);
        Assert.Null(sent.ProtectedConfirmationToken);
        Assert.Single(client.Email.AttemptedHtmlBodies);
    }

    [PostgresFact]
    public async Task Missing_required_role_rolls_back_created_identity_user()
    {
        await using var database = await PostgresRegistrationDatabase.CreateAsync(createStudentRole: false);
        await using var client = database.CreateClient();

        var outcome = await CaptureAsync(() => client.Controller.Register(Request("missing-role@betcco.test"), CancellationToken.None));

        Assert.False(outcome.Result is AcceptedResult);
        client.Db.ChangeTracker.Clear();
        Assert.Null(await client.Users.FindByEmailAsync("missing-role@betcco.test"));
        Assert.Empty(await client.Db.LegalAcceptances.ToListAsync());
        Assert.Empty(await client.Db.AuditLogs.Where(item => item.Action == "StudentRegistered").ToListAsync());
        Assert.Empty(await client.Db.RegistrationEmailOutboxMessages.ToListAsync());
    }

    [PostgresFact]
    public async Task Legal_acceptance_persistence_failure_rolls_back_identity_role_and_evidence()
    {
        await using var database = await PostgresRegistrationDatabase.CreateAsync();
        await using var client = database.CreateClient(typeof(LegalAcceptance));

        var outcome = await CaptureAsync(() => client.Controller.Register(Request("legal-failure@betcco.test"), CancellationToken.None));

        Assert.IsType<SimulatedRegistrationPersistenceException>(outcome.Exception);
        await AssertNoRegistrationStateAsync(client, "legal-failure@betcco.test");
    }

    [PostgresFact]
    public async Task Registration_audit_persistence_failure_rolls_back_identity_role_and_evidence()
    {
        await using var database = await PostgresRegistrationDatabase.CreateAsync();
        await using var client = database.CreateClient(typeof(AuditLog));

        var outcome = await CaptureAsync(() => client.Controller.Register(Request("audit-failure@betcco.test"), CancellationToken.None));

        Assert.IsType<SimulatedRegistrationPersistenceException>(outcome.Exception);
        await AssertNoRegistrationStateAsync(client, "audit-failure@betcco.test");
    }

    [PostgresFact]
    public async Task Concurrent_same_email_registration_commits_exactly_one_complete_account()
    {
        await using var database = await PostgresRegistrationDatabase.CreateAsync();
        await using var first = database.CreateClient();
        await using var second = database.CreateClient();
        var email = "concurrent@betcco.test";

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => first.Controller.Register(Request(email), CancellationToken.None)),
            CaptureAsync(() => second.Controller.Register(Request(email), CancellationToken.None)));

        Assert.Single(outcomes, outcome => outcome.Result is AcceptedResult);
        await using var verification = database.CreateClient();
        var user = await verification.Db.Users.AsNoTracking().SingleAsync(item => item.NormalizedEmail == email.ToUpperInvariant());
        Assert.Single(await verification.Db.UserRoles.AsNoTracking().Where(item => item.UserId == user.Id).ToListAsync());
        Assert.Equal(2, await verification.Db.LegalAcceptances.AsNoTracking().CountAsync(item => item.UserId == user.Id.ToString()));
        Assert.Single(await verification.Db.ConsentRecords.AsNoTracking().Where(item => item.UserId == user.Id.ToString()).ToListAsync());
        Assert.Single(await verification.Db.AuditLogs.AsNoTracking().Where(item => item.Action == "StudentRegistered" && item.EntityId == user.Id.ToString()).ToListAsync());
        Assert.Single(await verification.Db.RegistrationEmailOutboxMessages.AsNoTracking().Where(item => item.UserId == user.Id).ToListAsync());
    }

    private static async Task AssertNoRegistrationStateAsync(RegistrationClient client, string email)
    {
        client.Db.ChangeTracker.Clear();
        Assert.Null(await client.Users.FindByEmailAsync(email));
        Assert.Empty(await client.Db.Users.AsNoTracking().Where(item => item.NormalizedEmail == email.ToUpperInvariant()).ToListAsync());
        Assert.Empty(await client.Db.LegalAcceptances.AsNoTracking().ToListAsync());
        Assert.Empty(await client.Db.ConsentRecords.AsNoTracking().ToListAsync());
        Assert.Empty(await client.Db.AuditLogs.AsNoTracking().Where(item => item.Action == "StudentRegistered").ToListAsync());
        Assert.Empty(await client.Db.RegistrationEmailOutboxMessages.AsNoTracking().ToListAsync());
    }

    private static async Task<RegistrationOutcome> CaptureAsync(Func<Task<IActionResult>> action)
    {
        try
        {
            return new RegistrationOutcome(await action(), null);
        }
        catch (Exception exception)
        {
            return new RegistrationOutcome(null, exception);
        }
    }

    private static RegisterRequest Request(string email) => new(
        "Atomic learner",
        email,
        "T!estPassword123",
        "+962790000000",
        "JO",
        "PreferNotToSay",
        new DateOnly(2000, 1, 1),
        true,
        "1.0",
        "1.0",
        true);

    private sealed record RegistrationOutcome(IActionResult? Result, Exception? Exception);

    private sealed class PostgresRegistrationDatabase : IAsyncDisposable
    {
        private readonly string adminConnectionString;
        private readonly string databaseName;
        private readonly List<RegistrationClient> clients = [];
        private readonly string connectionString;

        private PostgresRegistrationDatabase(string adminConnectionString, string databaseName, string connectionString)
        {
            this.adminConnectionString = adminConnectionString;
            this.databaseName = databaseName;
            this.connectionString = connectionString;
        }

        public static async Task<PostgresRegistrationDatabase> CreateAsync(bool createStudentRole = true)
        {
            var adminConnectionString = Environment.GetEnvironmentVariable("BETCCO_TEST_POSTGRES_ADMIN")
                ?? throw new InvalidOperationException("BETCCO_TEST_POSTGRES_ADMIN is required for PostgreSQL registration tests.");
            var databaseName = $"betcco_se006_{Guid.NewGuid():N}";
            await using (var admin = new NpgsqlConnection(adminConnectionString))
            {
                await admin.OpenAsync();
                await using var command = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", admin);
                await command.ExecuteNonQueryAsync();
            }

            var builder = new NpgsqlConnectionStringBuilder(adminConnectionString) { Database = databaseName };
            var database = new PostgresRegistrationDatabase(adminConnectionString, databaseName, builder.ConnectionString);
            await using var setup = database.CreateClient();
            await setup.Db.Database.EnsureCreatedAsync();
            setup.Db.LegalDocuments.AddRange(
                LegalDocument("terms", "Terms"),
                LegalDocument("privacy", "Privacy"));
            await setup.Db.SaveChangesAsync();
            if (createStudentRole)
            {
                var roles = setup.Services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
                Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);
            }

            return database;
        }

        public RegistrationClient CreateClient(Type? failWhenAddingEntity = null)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDbContext<BetccoDbContext>(options =>
            {
                options.UseNpgsql(connectionString);
                if (failWhenAddingEntity is not null)
                    options.AddInterceptors(new FailWhenAddingEntityInterceptor(failWhenAddingEntity));
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

            var provider = services.BuildServiceProvider();
            var db = provider.GetRequiredService<BetccoDbContext>();
            var users = provider.GetRequiredService<UserManager<ApplicationUser>>();
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APP_PUBLIC_URL"] = "http://frontend.betcco.test"
                })
                .Build();
            var email = new CapturingEmailSender();
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
            var dispatcher = new RegistrationEmailOutboxDispatcher(
                db,
                users,
                email,
                provider.GetRequiredService<IDataProtectionProvider>(),
                configuration,
                new TestWebHostEnvironment(),
                NullLogger<RegistrationEmailOutboxDispatcher>.Instance);
            var client = new RegistrationClient(provider, controller, users, db, email, dispatcher);
            clients.Add(client);
            return client;
        }

        public async ValueTask DisposeAsync()
        {
            foreach (var client in clients.ToArray()) await client.DisposeAsync();
            NpgsqlConnection.ClearAllPools();
            await using var admin = new NpgsqlConnection(adminConnectionString);
            await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{databaseName}\" WITH (FORCE)", admin);
            await command.ExecuteNonQueryAsync();
        }

        private static LegalDocument LegalDocument(string slug, string title) => new()
        {
            Slug = slug,
            Version = "1.0",
            ArabicTitle = title,
            EnglishTitle = title,
            ArabicContent = "Test",
            EnglishContent = "Test",
            IsPublished = true,
            IsCurrent = true
        };
    }

    private sealed class RegistrationClient(
        ServiceProvider services,
        AuthController controller,
        UserManager<ApplicationUser> users,
        BetccoDbContext db,
        CapturingEmailSender email,
        RegistrationEmailOutboxDispatcher emailDispatcher) : IAsyncDisposable
    {
        private bool disposed;
        public ServiceProvider Services { get; } = services;
        public AuthController Controller { get; } = controller;
        public UserManager<ApplicationUser> Users { get; } = users;
        public BetccoDbContext Db { get; } = db;
        public CapturingEmailSender Email { get; } = email;
        public RegistrationEmailOutboxDispatcher EmailDispatcher { get; } = emailDispatcher;

        public async ValueTask DisposeAsync()
        {
            if (disposed) return;
            disposed = true;
            await Services.DisposeAsync();
        }
    }

    private sealed class FailWhenAddingEntityInterceptor(Type entityType) : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (eventData.Context?.ChangeTracker.Entries()
                    .Any(entry => entry.State == EntityState.Added && entityType.IsInstanceOfType(entry.Entity)) == true)
                throw new SimulatedRegistrationPersistenceException(entityType.Name);
            return ValueTask.FromResult(result);
        }
    }

    private sealed class SimulatedRegistrationPersistenceException(string entityName)
        : Exception($"Simulated persistence failure for {entityName}.");

    private sealed class CapturingEmailSender : IEmailSender
    {
        public List<string> AttemptedHtmlBodies { get; } = [];

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            AttemptedHtmlBodies.Add(htmlBody);
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

    private sealed class PostgresFactAttribute : FactAttribute
    {
        public PostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BETCCO_TEST_POSTGRES_ADMIN")))
                Skip = "Set BETCCO_TEST_POSTGRES_ADMIN to run the PostgreSQL registration atomicity tests.";
        }
    }
}
