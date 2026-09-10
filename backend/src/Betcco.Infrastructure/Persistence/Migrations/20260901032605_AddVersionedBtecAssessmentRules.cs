using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVersionedBtecAssessmentRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            const string defaultRuleSetJson = """{"Version":"btec-internal-v1","OutcomeRules":[{"Outcome":"Pass","RequiredBands":["P"]},{"Outcome":"Merit","RequiredBands":["P","M"]},{"Outcome":"Distinction","RequiredBands":["P","M","D"]}]}""";

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetJson",
                table: "RubricTemplates",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetVersion",
                table: "RubricTemplates",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetSnapshotJson",
                table: "EvaluationRequests",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentRuleSetVersion",
                table: "EvaluationRequests",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<decimal>(
                name: "Score",
                table: "CourseAssignmentCriterionResults",
                type: "numeric",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            // The old enum persisted presentation percentages (60/80/100).
            // Convert them to ordered academic outcomes and remove every
            // numeric BTEC outcome score while retaining independent quiz and
            // learning-progress percentages elsewhere in the schema.
            migrationBuilder.Sql($"""
                UPDATE "EvaluationRequests"
                SET "AssessmentRuleSetVersion" = 'btec-internal-v1',
                    "AssessmentRuleSetSnapshotJson" = '{defaultRuleSetJson}',
                    "CalculatedScore" = NULL,
                    "CalculatedGrade" = CASE "CalculatedGrade"
                        WHEN 60 THEN 1
                        WHEN 80 THEN 2
                        WHEN 100 THEN 3
                        ELSE "CalculatedGrade"
                    END;

                UPDATE "RubricTemplates"
                SET "AssessmentRuleSetVersion" = 'btec-internal-v1',
                    "AssessmentRuleSetJson" = '{defaultRuleSetJson}';

                UPDATE "CourseAssignmentSubmissions"
                SET "CalculatedScore" = NULL,
                    "CalculatedGrade" = CASE "CalculatedGrade"
                        WHEN 60 THEN 1
                        WHEN 80 THEN 2
                        WHEN 100 THEN 3
                        ELSE "CalculatedGrade"
                    END;

                UPDATE "CriterionResults" SET "Score" = NULL;
                UPDATE "CourseAssignmentCriterionResults" SET "Score" = NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // A rollback can restore the former storage shape, but its scores
            // are only compatibility values; it cannot recreate old scoring
            // logic from outcome-based decisions.
            migrationBuilder.Sql("""
                UPDATE "EvaluationRequests"
                SET "CalculatedScore" = CASE "CalculatedGrade"
                        WHEN 1 THEN 60
                        WHEN 2 THEN 80
                        WHEN 3 THEN 100
                        ELSE NULL
                    END,
                    "CalculatedGrade" = CASE "CalculatedGrade"
                        WHEN 1 THEN 60
                        WHEN 2 THEN 80
                        WHEN 3 THEN 100
                        ELSE "CalculatedGrade"
                    END;

                UPDATE "CourseAssignmentSubmissions"
                SET "CalculatedScore" = CASE "CalculatedGrade"
                        WHEN 1 THEN 60
                        WHEN 2 THEN 80
                        WHEN 3 THEN 100
                        ELSE NULL
                    END,
                    "CalculatedGrade" = CASE "CalculatedGrade"
                        WHEN 1 THEN 60
                        WHEN 2 THEN 80
                        WHEN 3 THEN 100
                        ELSE "CalculatedGrade"
                    END;

                UPDATE "CourseAssignmentCriterionResults" SET "Score" = 0 WHERE "Score" IS NULL;
                """);

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetJson",
                table: "RubricTemplates");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetVersion",
                table: "RubricTemplates");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetSnapshotJson",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "AssessmentRuleSetVersion",
                table: "EvaluationRequests");

            migrationBuilder.AlterColumn<decimal>(
                name: "Score",
                table: "CourseAssignmentCriterionResults",
                type: "numeric",
                nullable: false,
                defaultValue: 0m,
                oldClrType: typeof(decimal),
                oldType: "numeric",
                oldNullable: true);
        }
    }
}
