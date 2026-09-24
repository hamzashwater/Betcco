using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLearningAimPracticeFlow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CourseAssignments_BtecLearningAimId",
                table: "CourseAssignments");

            migrationBuilder.AddColumn<string>(
                name: "TrainingGaps",
                table: "CourseAssignmentSubmissions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingImprovementGuidance",
                table: "CourseAssignmentSubmissions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TrainingOutcome",
                table: "CourseAssignmentSubmissions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingStrengths",
                table: "CourseAssignmentSubmissions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Purpose",
                table: "CourseAssignments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_BtecLearningAimId",
                table: "CourseAssignments",
                column: "BtecLearningAimId",
                unique: true,
                filter: "\"BtecLearningAimId\" IS NOT NULL AND \"Purpose\" = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CourseAssignments_BtecLearningAimId",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "TrainingGaps",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "TrainingImprovementGuidance",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "TrainingOutcome",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "TrainingStrengths",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "Purpose",
                table: "CourseAssignments");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_BtecLearningAimId",
                table: "CourseAssignments",
                column: "BtecLearningAimId");
        }
    }
}
