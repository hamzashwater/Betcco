using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInternalRefundFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "RefundId", table: "WalletTransactions", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "RefundId", table: "LedgerTransactions", type: "uuid", nullable: true);

            migrationBuilder.CreateTable(
                name: "Refunds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ReasonCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RequestedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RequestedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    InternallyRecordedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    InternallyRecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ProviderRefundReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CorrelationReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FailureCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EntitlementDisposition = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Refunds", x => x.Id);
                    table.ForeignKey(name: "FK_Refunds_Payments_PaymentId", column: x => x.PaymentId, principalTable: "Payments", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(name: "IX_WalletTransactions_RefundId_UserId_Type", table: "WalletTransactions", columns: new[] { "RefundId", "UserId", "Type" }, unique: true, filter: "\"RefundId\" IS NOT NULL");
            migrationBuilder.CreateIndex(name: "IX_LedgerTransactions_RefundId", table: "LedgerTransactions", column: "RefundId", unique: true, filter: "\"RefundId\" IS NOT NULL");
            migrationBuilder.CreateIndex(name: "IX_Refunds_PaymentId_IdempotencyKey", table: "Refunds", columns: new[] { "PaymentId", "IdempotencyKey" }, unique: true);
            migrationBuilder.CreateIndex(name: "IX_Refunds_PaymentId_Status_CreatedAtUtc", table: "Refunds", columns: new[] { "PaymentId", "Status", "CreatedAtUtc" });
            migrationBuilder.AddForeignKey(name: "FK_LedgerTransactions_Refunds_RefundId", table: "LedgerTransactions", column: "RefundId", principalTable: "Refunds", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            migrationBuilder.AddForeignKey(name: "FK_WalletTransactions_Refunds_RefundId", table: "WalletTransactions", column: "RefundId", principalTable: "Refunds", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(name: "FK_LedgerTransactions_Refunds_RefundId", table: "LedgerTransactions");
            migrationBuilder.DropForeignKey(name: "FK_WalletTransactions_Refunds_RefundId", table: "WalletTransactions");
            migrationBuilder.DropTable(name: "Refunds");
            migrationBuilder.DropIndex(name: "IX_WalletTransactions_RefundId_UserId_Type", table: "WalletTransactions");
            migrationBuilder.DropIndex(name: "IX_LedgerTransactions_RefundId", table: "LedgerTransactions");
            migrationBuilder.DropColumn(name: "RefundId", table: "WalletTransactions");
            migrationBuilder.DropColumn(name: "RefundId", table: "LedgerTransactions");
        }
    }
}
