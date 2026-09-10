using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPayTabsRefundProviderWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProviderFailureCode",
                table: "Refunds",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderInitiatedAtUtc",
                table: "Refunds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderName",
                table: "Refunds",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderResultUnknownAtUtc",
                table: "Refunds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderStatusCode",
                table: "Refunds",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProviderVerifiedAtUtc",
                table: "Refunds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RefundStatusTransitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RefundId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<int>(type: "integer", nullable: false),
                    NewStatus = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<int>(type: "integer", nullable: false),
                    ActorContext = table.Column<string>(type: "text", nullable: true),
                    ProviderReference = table.Column<string>(type: "text", nullable: true),
                    ReasonCode = table.Column<string>(type: "text", nullable: true),
                    CorrelationId = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefundStatusTransitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefundStatusTransitions_Refunds_RefundId",
                        column: x => x.RefundId,
                        principalTable: "Refunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RefundStatusTransitions_RefundId_CreatedAtUtc",
                table: "RefundStatusTransitions",
                columns: new[] { "RefundId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RefundStatusTransitions");

            migrationBuilder.DropColumn(
                name: "ProviderFailureCode",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "ProviderInitiatedAtUtc",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "ProviderName",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "ProviderResultUnknownAtUtc",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "ProviderStatusCode",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "ProviderVerifiedAtUtc",
                table: "Refunds");
        }
    }
}
