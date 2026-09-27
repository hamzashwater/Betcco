using System.Data;
using System.Data.Common;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Betcco.Infrastructure.Persistence;

public enum LegacyQuizPreflightState
{
    AlreadyApplied,
    Clear,
    RequiresReview,
    Indeterminate
}

public sealed record LegacyQuizInventory(
    long Quizzes,
    long QuizQuestions,
    long QuizAttempts,
    long QuizAttemptQuestionGrades,
    long QuestionBankQuestions,
    long ContentPrerequisitesToDelete,
    long ContentAccessRulesToDelete)
{
    public bool IsEmpty => Quizzes == 0 && QuizQuestions == 0 && QuizAttempts == 0
        && QuizAttemptQuestionGrades == 0 && QuestionBankQuestions == 0
        && ContentPrerequisitesToDelete == 0 && ContentAccessRulesToDelete == 0;
}

public sealed record LegacyQuizPreflightResult(
    LegacyQuizPreflightState State,
    string Code,
    LegacyQuizInventory? Inventory = null,
    IReadOnlyList<string>? Diagnostics = null)
{
    public bool Succeeded => State is LegacyQuizPreflightState.AlreadyApplied or LegacyQuizPreflightState.Clear;

    public string FormatSummary()
    {
        var lines = new List<string> { "Legacy Quiz migration preflight:" };
        if (Inventory is { } counts)
        {
            lines.Add($"Quizzes: {counts.Quizzes.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"QuizQuestions: {counts.QuizQuestions.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"QuizAttempts: {counts.QuizAttempts.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"QuizAttemptQuestionGrades: {counts.QuizAttemptQuestionGrades.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"QuestionBankQuestions: {counts.QuestionBankQuestions.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"ContentPrerequisitesToDelete: {counts.ContentPrerequisitesToDelete.ToString(CultureInfo.InvariantCulture)}");
            lines.Add($"ContentAccessRulesToDelete: {counts.ContentAccessRulesToDelete.ToString(CultureInfo.InvariantCulture)}");
        }
        if (Diagnostics is { Count: > 0 })
            lines.AddRange(Diagnostics.Select(diagnostic => $"Diagnostic: {diagnostic}"));
        lines.Add("Result:");
        lines.Add(Code);
        return string.Join(Environment.NewLine, lines);
    }
}

public sealed record LegacyQuizMigrationResult(LegacyQuizPreflightResult Preflight, bool MigrationCompleted);

/// <summary>
/// Read-only inventory and a database-authoritative gate for the destructive legacy Quiz migration.
/// The session advisory lock covers both the inventory and EF migration execution.
/// </summary>
public sealed class LegacyQuizMigrationGate(BetccoDbContext db)
{
    public const string RemovalMigrationId = "20260924073104_RemoveLegacyQuizSystem";

    private static readonly string[] RequiredTables =
    [
        "Quizzes",
        "QuizQuestions",
        "QuizAttempts",
        "QuizAttemptQuestionGrades",
        "QuestionBankQuestions",
        "Lessons",
        "ContentPrerequisites",
        "ContentAccessRules"
    ];

    private const int AdvisoryLockNamespace = 1111835715; // BETC
    private const int AdvisoryLockId = 1296658258; // MIGR

    public async Task<LegacyQuizPreflightResult> PreflightAsync(CancellationToken cancellationToken = default)
    {
        await using var advisoryLock = await TryAcquireLockAsync(cancellationToken);
        if (advisoryLock is null)
            return DatabaseFailure();

        return await InspectSafelyAsync(cancellationToken);
    }

    public async Task<LegacyQuizMigrationResult> MigrateAsync(
        bool allowLegacyQuizDataRemoval,
        Action<LegacyQuizPreflightResult>? reportPreflight = null,
        CancellationToken cancellationToken = default)
    {
        await using var advisoryLock = await TryAcquireLockAsync(cancellationToken);
        if (advisoryLock is null)
            return new LegacyQuizMigrationResult(DatabaseFailure(), MigrationCompleted: false);

        var preflight = await InspectSafelyAsync(cancellationToken);
        reportPreflight?.Invoke(preflight);
        if (preflight.State == LegacyQuizPreflightState.Indeterminate
            || (preflight.State == LegacyQuizPreflightState.RequiresReview && !allowLegacyQuizDataRemoval))
            return new LegacyQuizMigrationResult(preflight, MigrationCompleted: false);

        await db.Database.MigrateAsync(cancellationToken);
        return new LegacyQuizMigrationResult(preflight, MigrationCompleted: true);
    }

    private async Task<LegacyQuizPreflightResult> InspectSafelyAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await InspectAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            return DatabaseFailure(exception);
        }
    }

    private async Task<LegacyQuizPreflightResult> InspectAsync(CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", cancellationToken);

        var migrations = db.Database.GetMigrations().ToHashSet(StringComparer.Ordinal);
        if (!migrations.Contains(RemovalMigrationId))
        {
            var missingMigration = Indeterminate("MIGRATION_NOT_IN_ASSEMBLY");
            await transaction.CommitAsync(cancellationToken);
            return missingMigration;
        }

        var historyExists = await HasMigrationHistoryTableAsync(transaction.GetDbTransaction(), cancellationToken);
        var applied = historyExists
            ? (await db.Database.GetAppliedMigrationsAsync(cancellationToken)).ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);
        if (applied.Contains(RemovalMigrationId))
        {
            await transaction.CommitAsync(cancellationToken);
            return new LegacyQuizPreflightResult(
                LegacyQuizPreflightState.AlreadyApplied,
                "LEGACY_QUIZ_MIGRATION_ALREADY_APPLIED");
        }

        if (!migrations.Except(applied, StringComparer.Ordinal).Contains(RemovalMigrationId, StringComparer.Ordinal))
        {
            var unknownState = Indeterminate("MIGRATION_STATE_INCONSISTENT");
            await transaction.CommitAsync(cancellationToken);
            return unknownState;
        }

        var (presentTables, missingTables) = await ReadTablePresenceAsync(transaction.GetDbTransaction(), cancellationToken);
        if (presentTables.Count == 0 && applied.Count == 0 && !await HasUserTablesAsync(transaction.GetDbTransaction(), cancellationToken))
        {
            await transaction.CommitAsync(cancellationToken);
            return new LegacyQuizPreflightResult(
                LegacyQuizPreflightState.Clear,
                "LEGACY_QUIZ_MIGRATION_CLEAR",
                EmptyInventory);
        }

        if (missingTables.Count > 0)
        {
            await transaction.CommitAsync(cancellationToken);
            return Indeterminate("MISSING_SCHEMA_OBJECTS", missingTables);
        }

        var inventory = await ReadInventoryAsync(transaction.GetDbTransaction(), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return inventory.IsEmpty
            ? new LegacyQuizPreflightResult(LegacyQuizPreflightState.Clear, "LEGACY_QUIZ_MIGRATION_CLEAR", inventory)
            : new LegacyQuizPreflightResult(LegacyQuizPreflightState.RequiresReview, "LEGACY_QUIZ_DATA_REQUIRES_REVIEW", inventory);
    }

    private async Task<AdvisoryLock?> TryAcquireLockAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
            var connection = db.Database.GetDbConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = $"SELECT pg_advisory_lock({AdvisoryLockNamespace}, {AdvisoryLockId})";
            await command.ExecuteNonQueryAsync(cancellationToken);
            return new AdvisoryLock(db);
        }
        catch (OperationCanceledException)
        {
            await db.Database.CloseConnectionAsync();
            throw;
        }
        catch
        {
            await db.Database.CloseConnectionAsync();
            return null;
        }
    }

    private static async Task<(HashSet<string> Present, List<string> Missing)> ReadTablePresenceAsync(
        DbTransaction transaction,
        CancellationToken cancellationToken)
    {
        await using var command = transaction.Connection!.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT relation_name, to_regclass('public.' || quote_ident(relation_name)) IS NOT NULL FROM unnest(@relation_names) AS relation_name";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "relation_names";
        parameter.Value = RequiredTables;
        command.Parameters.Add(parameter);

        var present = new HashSet<string>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (reader.GetBoolean(1)) present.Add(reader.GetString(0));
        }
        return (present, RequiredTables.Where(table => !present.Contains(table)).ToList());
    }

    private static async Task<bool> HasUserTablesAsync(DbTransaction transaction, CancellationToken cancellationToken)
    {
        await using var command = transaction.Connection!.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__EFMigrationsHistory')";
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<bool> HasMigrationHistoryTableAsync(DbTransaction transaction, CancellationToken cancellationToken)
    {
        await using var command = transaction.Connection!.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT to_regclass('public.\"__EFMigrationsHistory\"') IS NOT NULL";
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<LegacyQuizInventory> ReadInventoryAsync(DbTransaction transaction, CancellationToken cancellationToken)
    {
        await using var command = transaction.Connection!.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT
                (SELECT count(*) FROM "Quizzes"),
                (SELECT count(*) FROM "QuizQuestions"),
                (SELECT count(*) FROM "QuizAttempts"),
                (SELECT count(*) FROM "QuizAttemptQuestionGrades"),
                (SELECT count(*) FROM "QuestionBankQuestions"),
                (SELECT count(*) FROM "ContentPrerequisites"
                 WHERE "TargetType" = 3 OR "RequiredContentType" = 3
                    OR ("TargetType" = 2 AND "TargetId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2))
                    OR ("RequiredContentType" = 2 AND "RequiredContentId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2))),
                (SELECT count(*) FROM "ContentAccessRules"
                 WHERE "TargetType" = 3 OR "PreviousContentType" = 3
                    OR ("TargetType" = 2 AND "TargetId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2))
                    OR ("PreviousContentType" = 2 AND "PreviousContentId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2)))
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new LegacyQuizInventory(
            reader.GetInt64(0), reader.GetInt64(1), reader.GetInt64(2), reader.GetInt64(3),
            reader.GetInt64(4), reader.GetInt64(5), reader.GetInt64(6));
    }

    private static LegacyQuizPreflightResult DatabaseFailure(Exception? exception = null) =>
        Indeterminate(exception switch
        {
            null => "DATABASE_CONNECTION_FAILED",
            PostgresException postgres => $"DATABASE_INSPECTION_FAILED_POSTGRES_{postgres.SqlState}",
            _ => $"DATABASE_INSPECTION_FAILED_{exception.GetType().Name}"
        });

    private static LegacyQuizPreflightResult Indeterminate(string diagnostic, IReadOnlyList<string>? objects = null) =>
        new(LegacyQuizPreflightState.Indeterminate, "LEGACY_QUIZ_PREFLIGHT_INDETERMINATE", Diagnostics: [diagnostic, .. objects ?? []]);

    private static LegacyQuizInventory EmptyInventory => new(0, 0, 0, 0, 0, 0, 0);

    private sealed class AdvisoryLock(BetccoDbContext db) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                var connection = db.Database.GetDbConnection();
                await using var command = connection.CreateCommand();
                command.CommandText = $"SELECT pg_advisory_unlock({AdvisoryLockNamespace}, {AdvisoryLockId})";
                await command.ExecuteNonQueryAsync();
            }
            finally
            {
                await db.Database.CloseConnectionAsync();
            }
        }
    }
}
