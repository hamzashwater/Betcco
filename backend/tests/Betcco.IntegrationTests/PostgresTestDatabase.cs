using System.Text.RegularExpressions;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Betcco.IntegrationTests;

internal sealed partial class PostgresTestDatabase : IAsyncDisposable
{
    private readonly string adminConnectionString;
    private readonly string databaseName;
    private bool disposed;

    private PostgresTestDatabase(string adminConnectionString, string databaseName, string connectionString)
    {
        this.adminConnectionString = adminConnectionString;
        this.databaseName = databaseName;
        ConnectionString = connectionString;
    }

    public string ConnectionString { get; }

    public static async Task<PostgresTestDatabase> CreateAsync(string scope, CancellationToken cancellationToken = default)
    {
        var adminConnectionString = Environment.GetEnvironmentVariable("BETCCO_TEST_POSTGRES_ADMIN");
        if (string.IsNullOrWhiteSpace(adminConnectionString))
        {
            throw new InvalidOperationException(
                "BETCCO_TEST_POSTGRES_ADMIN is required for PostgreSQL finance tests. " +
                "These database-critical tests are CI/release required and are not skipped.");
        }

        var safeScope = UnsafeDatabaseNameCharacters().Replace(scope.ToLowerInvariant(), "_").Trim('_');
        if (string.IsNullOrWhiteSpace(safeScope)) safeScope = "integration";
        var databaseName = $"betcco_se008_{safeScope[..Math.Min(safeScope.Length, 24)]}_{Guid.NewGuid():N}";

        var adminBuilder = new NpgsqlConnectionStringBuilder(adminConnectionString);
        if (LooksLikeProtectedDatabase(adminBuilder.Database))
            throw new InvalidOperationException("BETCCO_TEST_POSTGRES_ADMIN must not target a production or staging database.");

        await using (var admin = new NpgsqlConnection(adminBuilder.ConnectionString))
        {
            await admin.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", admin);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        var testBuilder = new NpgsqlConnectionStringBuilder(adminBuilder.ConnectionString)
        {
            Database = databaseName,
            ApplicationName = "BETCCO SE-008 PostgreSQL tests"
        };
        var database = new PostgresTestDatabase(adminBuilder.ConnectionString, databaseName, testBuilder.ConnectionString);
        try
        {
            await using var setup = database.CreateContext();
            await setup.Database.MigrateAsync(cancellationToken);
            return database;
        }
        catch
        {
            await database.DisposeAsync();
            throw;
        }
    }

    public BetccoDbContext CreateContext(params IInterceptor[] interceptors)
    {
        var options = new DbContextOptionsBuilder<BetccoDbContext>().UseNpgsql(ConnectionString);
        if (interceptors.Length > 0) options.AddInterceptors(interceptors);
        return new BetccoDbContext(options.Options);
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true;
        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(adminConnectionString);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{databaseName}\" WITH (FORCE)", admin);
        await command.ExecuteNonQueryAsync();
    }

    private static bool LooksLikeProtectedDatabase(string? database) =>
        !string.IsNullOrWhiteSpace(database)
        && (database.Contains("production", StringComparison.OrdinalIgnoreCase)
            || database.Contains("staging", StringComparison.OrdinalIgnoreCase)
            || database.Equals("prod", StringComparison.OrdinalIgnoreCase));

    [GeneratedRegex("[^a-z0-9_]+")]
    private static partial Regex UnsafeDatabaseNameCharacters();
}
