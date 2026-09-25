using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowIncludedCreditsPerEnrollment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_IncludedEvaluationEntitlements_GrantedByPaymentId_UnitDefin~",
                table: "IncludedEvaluationEntitlements");

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_Payment_Enrollment_Unit",
                table: "IncludedEvaluationEntitlements",
                columns: new[] { "GrantedByPaymentId", "EnrollmentId", "UnitDefinitionId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_IncludedEvaluationEntitlements_Payment_Enrollment_Unit",
                table: "IncludedEvaluationEntitlements");

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_GrantedByPaymentId_UnitDefin~",
                table: "IncludedEvaluationEntitlements",
                columns: new[] { "GrantedByPaymentId", "UnitDefinitionId" },
                unique: true);
        }
    }
}
