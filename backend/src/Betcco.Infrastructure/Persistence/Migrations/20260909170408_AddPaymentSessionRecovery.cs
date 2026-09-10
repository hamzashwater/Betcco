using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentSessionRecovery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProviderSessionAttemptCount",
                table: "Payments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderSessionAttemptedAtUtc",
                table: "Payments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderSessionFailureCode",
                table: "Payments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderSessionResolvedAtUtc",
                table: "Payments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProviderSessionStatus",
                table: "Payments",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ProviderSessionStatus_ProviderSessionAttemptedAtUtc",
                table: "Payments",
                columns: new[] { "ProviderSessionStatus", "ProviderSessionAttemptedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_ProviderSessionStatus_ProviderSessionAttemptedAtUtc",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ProviderSessionAttemptCount",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ProviderSessionAttemptedAtUtc",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ProviderSessionFailureCode",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ProviderSessionResolvedAtUtc",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ProviderSessionStatus",
                table: "Payments");
        }
    }
}
