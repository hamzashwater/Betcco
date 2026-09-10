using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class HardenWalletPayoutIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "PayoutRequests",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_PayoutRequestId_Type",
                table: "WalletTransactions",
                columns: new[] { "PayoutRequestId", "Type" },
                unique: true,
                filter: "\"PayoutRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PayoutRequests_TeacherUserId_IdempotencyKey",
                table: "PayoutRequests",
                columns: new[] { "TeacherUserId", "IdempotencyKey" },
                unique: true,
                filter: "\"IdempotencyKey\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WalletTransactions_PayoutRequestId_Type",
                table: "WalletTransactions");

            migrationBuilder.DropIndex(
                name: "IX_PayoutRequests_TeacherUserId_IdempotencyKey",
                table: "PayoutRequests");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "PayoutRequests");
        }
    }
}
