using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPayoutExecutionSettlementFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExecutionFailureCode",
                table: "PayoutRequests",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExecutionInitiatedAtUtc",
                table: "PayoutRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FailedAtUtc",
                table: "PayoutRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderName",
                table: "PayoutRequests",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderResultCode",
                table: "PayoutRequests",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderResultUnknownAtUtc",
                table: "PayoutRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SettledAtUtc",
                table: "PayoutRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PayoutStatusTransitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PayoutRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<int>(type: "integer", nullable: false),
                    NewStatus = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<int>(type: "integer", nullable: false),
                    ActorContext = table.Column<string>(type: "text", nullable: true),
                    Provider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ProviderTransferReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ResultCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CorrelationId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayoutStatusTransitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayoutStatusTransitions_PayoutRequests_PayoutRequestId",
                        column: x => x.PayoutRequestId,
                        principalTable: "PayoutRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PayoutRequests_ProviderName_ProviderPayoutReference",
                table: "PayoutRequests",
                columns: new[] { "ProviderName", "ProviderPayoutReference" },
                unique: true,
                filter: "\"ProviderPayoutReference\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PayoutStatusTransitions_PayoutRequestId_CreatedAtUtc",
                table: "PayoutStatusTransitions",
                columns: new[] { "PayoutRequestId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PayoutStatusTransitions");

            migrationBuilder.DropIndex(
                name: "IX_PayoutRequests_ProviderName_ProviderPayoutReference",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "ExecutionFailureCode",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "ExecutionInitiatedAtUtc",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "FailedAtUtc",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "ProviderName",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "ProviderResultCode",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "ProviderResultUnknownAtUtc",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "SettledAtUtc",
                table: "PayoutRequests");
        }
    }
}
