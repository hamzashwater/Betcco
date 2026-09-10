using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations;

/// <summary>
/// Repairs the safe defaults assigned to coursework that existed before the
/// submission-policy columns were introduced. Existing teacher choices made
/// after the first migration are preserved unless the value is invalid.
/// </summary>
[DbContext(typeof(BetccoDbContext))]
[Migration("20260825220100_BackfillCourseAssignmentSubmissionPolicies")]
public partial class BackfillCourseAssignmentSubmissionPolicies : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE "CourseAssignments"
            SET "AllowResubmission" = TRUE
            WHERE "AllowResubmission" = FALSE;

            UPDATE "CourseAssignments"
            SET "MaxFileSizeBytes" = 104857600
            WHERE "MaxFileSizeBytes" IS NULL OR "MaxFileSizeBytes" <= 0;

            UPDATE "CourseAssignments"
            SET "AllowedFileExtensionsJson" = '[".pdf",".docx",".xlsx",".pptx",".png",".jpg",".jpeg",".zip",".txt"]'
            WHERE "AllowedFileExtensionsJson" IS NULL OR btrim("AllowedFileExtensionsJson") = '';

            ALTER TABLE "CourseAssignments"
                ALTER COLUMN "AllowResubmission" SET DEFAULT TRUE;
            ALTER TABLE "CourseAssignments"
                ALTER COLUMN "MaxFileSizeBytes" SET DEFAULT 104857600;
            ALTER TABLE "CourseAssignments"
                ALTER COLUMN "AllowedFileExtensionsJson" SET DEFAULT '[".pdf",".docx",".xlsx",".pptx",".png",".jpg",".jpeg",".zip",".txt"]';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "CourseAssignments" ALTER COLUMN "AllowResubmission" SET DEFAULT FALSE;
            ALTER TABLE "CourseAssignments" ALTER COLUMN "MaxFileSizeBytes" SET DEFAULT 0;
            ALTER TABLE "CourseAssignments" ALTER COLUMN "AllowedFileExtensionsJson" SET DEFAULT '';
            """);
    }
}
