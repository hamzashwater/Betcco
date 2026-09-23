using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Betcco.IntegrationTests;

public sealed class PostgresMigrationTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Complete_migration_chain_creates_the_current_model_and_idempotent_script()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("migrations");
        await using var db = database.CreateContext();

        var migrations = db.Database.GetMigrations().ToArray();
        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();

        Assert.NotEmpty(migrations);
        Assert.Equal(migrations, applied);
        Assert.Contains(migrations, migration => migration.EndsWith("_AddCouponCheckoutReservation", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddPaymentSessionRecovery", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddRegistrationEmailOutbox", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddDurablePrivateStorageFoundation", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddAcademicDeliveryPlanning", StringComparison.Ordinal));
        Assert.Contains(migrations, migration => migration.EndsWith("_AddCanonicalLearnUnitLinks", StringComparison.Ordinal));
        Assert.False(db.Database.HasPendingModelChanges());

        var script = db.GetService<IMigrator>().GenerateScript(
            options: MigrationsSqlGenerationOptions.Idempotent);
        Assert.Contains("__EFMigrationsHistory", script, StringComparison.Ordinal);
        Assert.Contains("AddCouponCheckoutReservation", script, StringComparison.Ordinal);
        Assert.Contains("AddPaymentSessionRecovery", script, StringComparison.Ordinal);
        Assert.Contains("AddRegistrationEmailOutbox", script, StringComparison.Ordinal);
        Assert.Contains("AddDurablePrivateStorageFoundation", script, StringComparison.Ordinal);
        Assert.Contains("AddAcademicDeliveryPlanning", script, StringComparison.Ordinal);
        Assert.Contains("AddCanonicalLearnUnitLinks", script, StringComparison.Ordinal);
        Assert.Contains("IX_CourseModules_CourseId_UnitDefinitionId", script, StringComparison.Ordinal);
        Assert.Contains("FK_CourseModules_UnitDefinitions_UnitDefinitionId", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"AcademicYears\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"AcademicTerms\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"DeliveryPlans\"", script, StringComparison.Ordinal);
        Assert.Contains("CREATE TABLE \"DeliveryPlanEntries\"", script, StringComparison.Ordinal);

        var connection = db.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var indexCheck = connection.CreateCommand();
        indexCheck.CommandText = "SELECT count(*) FROM pg_indexes WHERE tablename = 'CourseModules' AND indexname = 'IX_CourseModules_CourseId_UnitDefinitionId' AND indexdef LIKE '%UNIQUE%'";
        Assert.Equal(1L, Convert.ToInt64(await indexCheck.ExecuteScalarAsync()));
        await using var foreignKeyCheck = connection.CreateCommand();
        foreignKeyCheck.CommandText = "SELECT count(*) FROM information_schema.table_constraints WHERE table_name = 'CourseModules' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'FK_CourseModules_UnitDefinitions_UnitDefinitionId'";
        Assert.Equal(1L, Convert.ToInt64(await foreignKeyCheck.ExecuteScalarAsync()));
    }
}
