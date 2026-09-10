using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSectionAwareEvaluationResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CalculatedGrade",
                table: "EvaluationRequests",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CalculatedScore",
                table: "EvaluationRequests",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SectionResultsJson",
                table: "EvaluationRequests",
                type: "text",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CalculatedGrade",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "CalculatedScore",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "SectionResultsJson",
                table: "EvaluationRequests");
        }
    }
}
