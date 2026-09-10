using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseAssignmentRuleSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            const string defaultRuleSetJson = """{"Version":"btec-internal-v1","OutcomeRules":[{"Outcome":"Pass","RequiredBands":["P"]},{"Outcome":"Merit","RequiredBands":["P","M"]},{"Outcome":"Distinction","RequiredBands":["P","M","D"]}]}""";

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetSnapshotJson",
                table: "CourseAssignmentSubmissions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetVersion",
                table: "CourseAssignmentSubmissions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetJson",
                table: "CourseAssignments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetVersion",
                table: "CourseAssignments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql($"""
                UPDATE "CourseAssignments"
                SET "AssessmentRuleSetVersion" = 'btec-internal-v1',
                    "AssessmentRuleSetJson" = '{defaultRuleSetJson}';

                UPDATE "CourseAssignmentSubmissions"
                SET "AssessmentRuleSetVersion" = 'btec-internal-v1',
                    "AssessmentRuleSetSnapshotJson" = '{defaultRuleSetJson}';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetSnapshotJson",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetVersion",
                table: "CourseAssignmentSubmissions");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetJson",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetVersion",
                table: "CourseAssignments");
        }
    }
}
