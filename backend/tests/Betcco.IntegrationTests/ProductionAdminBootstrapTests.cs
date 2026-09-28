using System.Diagnostics;
using Betcco.Api.Configuration;
using Betcco.Api.Authorization;
using Betcco.Application.Common;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class ProductionAdminBootstrapTests
{
    private const string ValidPassword = "Temporary!Administrator2026";

    [Fact]
    public void Operation_arguments_are_exclusive_and_do_not_route_normal_startup_or_migration_to_bootstrap()
    {
        Assert.Equal(OperationalCommand.Serve, OperationalCommandParser.Parse([]).Command);
        Assert.Equal(OperationalCommand.Migrate, OperationalCommandParser.Parse(["--migrate"]).Command);
        Assert.Equal(OperationalCommand.BootstrapAdmin, OperationalCommandParser.Parse(["--bootstrap-admin"]).Command);
        var preflight = OperationalCommandParser.Parse(["--migration-preflight"]);
        Assert.Equal(OperationalCommand.MigrationPreflight, preflight.Command);
        Assert.Empty(preflight.ApplicationArguments);
        var approvedMigration = OperationalCommandParser.Parse(["--migrate", "--allow-legacy-quiz-data-removal"]);
        Assert.Equal(OperationalCommand.Migrate, approvedMigration.Command);
        Assert.True(approvedMigration.AllowLegacyQuizDataRemoval);
        Assert.False(OperationalCommandParser.Parse(["--migrate"]).AllowLegacyQuizDataRemoval);
        Assert.Throws<InvalidOperationException>(() => OperationalCommandParser.Parse(["--migrate", "--bootstrap-admin"]));
        Assert.Throws<InvalidOperationException>(() => OperationalCommandParser.Parse(["--bootstrap-admin", "--bootstrap-admin"]));
        Assert.Throws<InvalidOperationException>(() => OperationalCommandParser.Parse(["--bootstrap-admin", "--migration-preflight"]));
        Assert.Throws<InvalidOperationException>(() => OperationalCommandParser.Parse(["--migration-preflight", "--allow-legacy-quiz-data-removal"]));
        Assert.Throws<InvalidOperationException>(() => OperationalCommandParser.Parse(["--allow-legacy-quiz-data-removal"]));
    }

    [Fact]
    public void Bootstrap_requires_both_secrets_without_requiring_unrelated_runtime_dependencies()
    {
        var values = new Dictionary<string, string?> { ["ConnectionStrings:Postgres"] = "Host=localhost;Database=test" };
        var host = new BootstrapHostEnvironment();
        Assert.Contains("EMAIL_REQUIRED", Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalidBootstrap(Config(values), host)).Message);
        values["BootstrapAdmin:Email"] = "first@example.test";
        Assert.Contains("PASSWORD_REQUIRED", Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalidBootstrap(Config(values), host)).Message);
        values["BootstrapAdmin:Password"] = ValidPassword;
        StartupConfigurationValidator.ThrowIfInvalidBootstrap(Config(values), host);
        Assert.DoesNotContain(ValidPassword, Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalidBootstrap(Config(new Dictionary<string, string?>()), host)).Message);
    }

    [Fact]
    public async Task First_bootstrap_creates_confirmed_forced_change_admin_and_replay_changes_nothing()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_first");
        await using var services = Services(database.ConnectionString);
        await using var scope = services.CreateAsyncScope();
        var bootstrap = scope.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>();
        Assert.Equal(AdminBootstrapResult.Created, await bootstrap.BootstrapAsync("first@example.test", ValidPassword));
        Assert.Equal(AdminBootstrapResult.AlreadyCompleted, await bootstrap.BootstrapAsync("other@example.test", ValidPassword));
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        var admin = await db.Users.SingleAsync();
        Assert.Equal("first@example.test", admin.Email);
        Assert.Equal(admin.Email, admin.UserName);
        Assert.True(admin.EmailConfirmed);
        Assert.True(admin.MustChangePassword);
        Assert.False(admin.TwoFactorEnabled);
        Assert.True(await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().IsInRoleAsync(admin, PlatformRoles.Admin));
        Assert.True(StaffMfaPolicy.RequiresStaffMfa([PlatformRoles.Admin]));
        Assert.Single(await db.AuditLogs.Where(log => log.Action == "ProductionAdminBootstrapped").ToListAsync());
        Assert.Equal(4, await db.Roles.CountAsync());
    }

    [Fact]
    public async Task Production_command_bootstraps_and_exits_without_exposing_password()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_command");
        var start = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        start.ArgumentList.Add(typeof(Program).Assembly.Location);
        start.ArgumentList.Add("--bootstrap-admin");
        start.Environment["ASPNETCORE_ENVIRONMENT"] = Environments.Production;
        start.Environment["ConnectionStrings__Postgres"] = database.ConnectionString;
        start.Environment["BootstrapAdmin__Email"] = "command@example.test";
        start.Environment["BootstrapAdmin__Password"] = ValidPassword;
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        Assert.Equal(0, process.ExitCode);
        Assert.Contains("ADMIN_BOOTSTRAP_CREATED", await output);
        Assert.DoesNotContain(ValidPassword, await error);
        Assert.DoesNotContain(ValidPassword, await output);
        await using var db = database.CreateContext();
        Assert.Single(await db.Users.ToListAsync());
    }

    [Fact]
    public async Task Pending_migration_prevents_any_provisioning()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_pending");
        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand("DELETE FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" = (SELECT MAX(\"MigrationId\") FROM \"__EFMigrationsHistory\")", connection);
            await command.ExecuteNonQueryAsync();
        }
        await using var services = Services(database.ConnectionString);
        await using var scope = services.CreateAsyncScope();
        Assert.Contains("PENDING_MIGRATIONS", (await Assert.ThrowsAsync<InvalidOperationException>(() =>
            scope.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>().BootstrapAsync("first@example.test", ValidPassword))).Message);
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Empty(await db.Roles.ToListAsync());
    }

    [Fact]
    public async Task Existing_non_admin_email_is_never_elevated_and_invalid_password_rolls_back_roles()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_invalid");
        await using var services = Services(database.ConnectionString);
        await using var scope = services.CreateAsyncScope();
        var bootstrap = scope.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>();
        var invalid = await Assert.ThrowsAsync<InvalidOperationException>(() => bootstrap.BootstrapAsync("first@example.test", "weak"));
        Assert.Contains("IDENTITY_VALIDATION_FAILED", invalid.Message);
        Assert.DoesNotContain("weak", invalid.Message);
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        db.ChangeTracker.Clear();
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Empty(await db.Roles.ToListAsync());
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var learner = new ApplicationUser { UserName = "learner@example.test", Email = "learner@example.test", DisplayName = "Learner" };
        Assert.True((await users.CreateAsync(learner, ValidPassword)).Succeeded);
        Assert.Contains("EMAIL_ALREADY_IN_USE", (await Assert.ThrowsAsync<InvalidOperationException>(() =>
            bootstrap.BootstrapAsync("learner@example.test", ValidPassword))).Message);
        db.ChangeTracker.Clear();
        Assert.Empty(await db.UserRoles.ToListAsync());
    }

    [Fact]
    public async Task Role_assignment_failure_rolls_back_user_and_roles()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_rollback");
        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand("CREATE FUNCTION reject_bootstrap_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'role insert blocked'; END $$; CREATE TRIGGER reject_bootstrap_role BEFORE INSERT ON \"AspNetUserRoles\" FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_role()", connection);
            await command.ExecuteNonQueryAsync();
        }
        await using var services = Services(database.ConnectionString);
        await using var scope = services.CreateAsyncScope();
        await Assert.ThrowsAnyAsync<Exception>(() => scope.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>()
            .BootstrapAsync("first@example.test", ValidPassword));
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        db.ChangeTracker.Clear();
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Empty(await db.Roles.ToListAsync());
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Concurrent_bootstraps_create_exactly_one_admin()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("admin_bootstrap_concurrent");
        await using var services = Services(database.ConnectionString);
        await using var first = services.CreateAsyncScope();
        await using var second = services.CreateAsyncScope();
        var results = await Task.WhenAll(
            first.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>().BootstrapAsync("first@example.test", ValidPassword),
            second.ServiceProvider.GetRequiredService<ProductionAdminBootstrapper>().BootstrapAsync("second@example.test", ValidPassword));
        Assert.Single(results, result => result == AdminBootstrapResult.Created);
        Assert.Single(results, result => result == AdminBootstrapResult.AlreadyCompleted);
        var db = first.ServiceProvider.GetRequiredService<BetccoDbContext>();
        db.ChangeTracker.Clear();
        Assert.Single(await db.Users.ToListAsync());
        Assert.Single(await db.UserRoles.ToListAsync());
        Assert.Single(await db.AuditLogs.Where(log => log.Action == "ProductionAdminBootstrapped").ToListAsync());
    }

    private static ServiceProvider Services(string connectionString)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(connectionString));
        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(PlatformIdentityOptions.Configure)
            .AddEntityFrameworkStores<BetccoDbContext>();
        services.AddScoped<ProductionAdminBootstrapper>();
        return services.BuildServiceProvider();
    }

    private static IConfiguration Config(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private sealed class BootstrapHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Betcco.Tests";
        public string ContentRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
