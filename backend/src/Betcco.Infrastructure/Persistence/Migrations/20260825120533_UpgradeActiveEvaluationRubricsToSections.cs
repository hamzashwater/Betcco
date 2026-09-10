using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UpgradeActiveEvaluationRubricsToSections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Existing teacher decisions are deliberately left untouched. Only
            // draft/assigned requests with no results are moved to the expanded
            // A/B/C rubric and their plan is reset for the assessor to choose.
            migrationBuilder.Sql("""
                UPDATE "EvaluationRequests"
                SET "CriteriaSnapshotJson" = '["A.P1","A.P2","A.P3","A.P4","A.M1","A.M2","A.M3","A.D1","A.D2","A.D3","B.P1","B.P2","B.P3","B.P4","B.M1","B.M2","B.M3","B.D1","B.D2","B.D3","C.P1","C.P2","C.P3","C.P4","C.M1","C.M2","C.M3","C.D1","C.D2","C.D3"]',
                    "EvaluatorCriteriaPlanJson" = '[]',
                    "CalculatedGrade" = NULL,
                    "CalculatedScore" = NULL,
                    "SectionResultsJson" = '[]'
                WHERE "Status" IN (0, 4)
                  AND "CriteriaSnapshotJson" NOT LIKE '%A.P1%'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "CriterionResults"
                      WHERE "CriterionResults"."EvaluationRequestId" = "EvaluationRequests"."Id"
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
