using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProviderReconciliationFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProviderReconciliationCases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    CaseType = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    RefundId = table.Column<Guid>(type: "uuid", nullable: true),
                    BusinessIdentity = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    LocalStatus = table.Column<string>(type: "text", nullable: true),
                    ProviderTransactionReference = table.Column<string>(type: "text", nullable: true),
                    ProviderStatusCode = table.Column<string>(type: "text", nullable: true),
                    LocalAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    ObservedProviderAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    Currency = table.Column<string>(type: "text", nullable: true),
                    CorrelationReference = table.Column<string>(type: "text", nullable: true),
                    ResolutionCode = table.Column<string>(type: "text", nullable: true),
                    ResolutionNote = table.Column<string>(type: "text", nullable: true),
                    ResolvedByUserId = table.Column<string>(type: "text", nullable: true),
                    ResolvedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProviderReconciliationCases", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProviderReconciliationCases_BusinessIdentity",
                table: "ProviderReconciliationCases",
                column: "BusinessIdentity",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProviderReconciliationCases_Status_CreatedAtUtc",
                table: "ProviderReconciliationCases",
                columns: new[] { "Status", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProviderReconciliationCases");
        }
    }
}
