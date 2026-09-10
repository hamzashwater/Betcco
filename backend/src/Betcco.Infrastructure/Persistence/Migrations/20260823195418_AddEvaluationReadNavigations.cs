using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationReadNavigations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CriterionResults_EvaluationRequestId",
                table: "CriterionResults",
                column: "EvaluationRequestId");

            migrationBuilder.AddForeignKey(
                name: "FK_CriterionResults_EvaluationRequests_EvaluationRequestId",
                table: "CriterionResults",
                column: "EvaluationRequestId",
                principalTable: "EvaluationRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CriterionResults_EvaluationRequests_EvaluationRequestId",
                table: "CriterionResults");

            migrationBuilder.DropIndex(
                name: "IX_CriterionResults_EvaluationRequestId",
                table: "CriterionResults");
        }
    }
}
