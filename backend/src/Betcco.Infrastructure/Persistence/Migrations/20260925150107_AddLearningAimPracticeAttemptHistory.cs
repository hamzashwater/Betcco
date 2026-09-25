using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLearningAimPracticeAttemptHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReviewedAtUtc",
                table: "CourseAssignmentSubmissionVersions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedByUserId",
                table: "CourseAssignmentSubmissionVersions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingGaps",
                table: "CourseAssignmentSubmissionVersions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingImprovementGuidance",
                table: "CourseAssignmentSubmissionVersions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TrainingOutcome",
                table: "CourseAssignmentSubmissionVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingStrengths",
                table: "CourseAssignmentSubmissionVersions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            // Existing Learning Aim Practice stored its formative review only on the
            // submission aggregate. Preserve that historical result on the current
            // version without inventing a reviewer identity that was never recorded.
            migrationBuilder.Sql(
                """
                UPDATE "CourseAssignmentSubmissionVersions" AS version
                SET "TrainingOutcome" = submission."TrainingOutcome",
                    "TrainingStrengths" = submission."TrainingStrengths",
                    "TrainingGaps" = submission."TrainingGaps",
                    "TrainingImprovementGuidance" = submission."TrainingImprovementGuidance",
                    "ReviewedAtUtc" = submission."GradedAtUtc"
                FROM "CourseAssignmentSubmissions" AS submission
                INNER JOIN "CourseAssignments" AS assignment
                    ON assignment."Id" = submission."CourseAssignmentId"
                WHERE version."CourseAssignmentSubmissionId" = submission."Id"
                  AND version."VersionNumber" = submission."CurrentVersionNumber"
                  AND assignment."Purpose" = 1
                  AND submission."TrainingOutcome" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReviewedAtUtc",
                table: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropColumn(
                name: "ReviewedByUserId",
                table: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropColumn(
                name: "TrainingGaps",
                table: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropColumn(
                name: "TrainingImprovementGuidance",
                table: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropColumn(
                name: "TrainingOutcome",
                table: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropColumn(
                name: "TrainingStrengths",
                table: "CourseAssignmentSubmissionVersions");
        }
    }
}
