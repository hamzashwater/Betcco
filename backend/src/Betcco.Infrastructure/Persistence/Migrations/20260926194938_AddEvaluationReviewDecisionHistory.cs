using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationReviewDecisionHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EvaluationReviewDecisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptNumber = table.Column<int>(type: "integer", nullable: false),
                    ReviewStage = table.Column<int>(type: "integer", nullable: false),
                    ReviewerUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DecidedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CalculatedGrade = table.Column<int>(type: "integer", nullable: false),
                    SectionResultsJson = table.Column<string>(type: "text", nullable: false),
                    Feedback = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    CriterionCount = table.Column<int>(type: "integer", nullable: false),
                    RequestsRevision = table.Column<bool>(type: "boolean", nullable: false),
                    RevisionDueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationReviewDecisions", x => x.Id);
                    table.CheckConstraint("CK_EvaluationReviewDecisions_AttemptStage", "(\"AttemptNumber\" = 1 AND \"ReviewStage\" = 0) OR (\"AttemptNumber\" = 2 AND \"ReviewStage\" = 1)");
                    table.CheckConstraint("CK_EvaluationReviewDecisions_CriterionCount", "\"CriterionCount\" > 0");
                    table.ForeignKey(
                        name: "FK_EvaluationReviewDecisions_EvaluationRequests_EvaluationRequ~",
                        column: x => x.EvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EvaluationReviewCriterionDecisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationReviewDecisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CriterionCode = table.Column<string>(type: "text", nullable: false),
                    Achievement = table.Column<int>(type: "integer", nullable: false),
                    Evidence = table.Column<string>(type: "text", nullable: true),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationReviewCriterionDecisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationReviewCriterionDecisions_EvaluationReviewDecision~",
                        column: x => x.EvaluationReviewDecisionId,
                        principalTable: "EvaluationReviewDecisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationReviewCriterionDecisions_EvaluationReviewDecision~",
                table: "EvaluationReviewCriterionDecisions",
                columns: new[] { "EvaluationReviewDecisionId", "CriterionCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationReviewDecisions_EvaluationRequestId_AttemptNumber",
                table: "EvaluationReviewDecisions",
                columns: new[] { "EvaluationRequestId", "AttemptNumber" },
                unique: true);

            // Protect saved decisions even when a writer bypasses EF.
            migrationBuilder.Sql("""
                CREATE FUNCTION prevent_evaluation_review_decision_changes()
                RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'Completed evaluation review decisions are append-only';
                END;
                $$;
                CREATE TRIGGER evaluation_review_decisions_append_only
                BEFORE UPDATE OR DELETE ON "EvaluationReviewDecisions"
                FOR EACH ROW EXECUTE FUNCTION prevent_evaluation_review_decision_changes();
                CREATE TRIGGER evaluation_review_criterion_decisions_append_only
                BEFORE UPDATE OR DELETE ON "EvaluationReviewCriterionDecisions"
                FOR EACH ROW EXECUTE FUNCTION prevent_evaluation_review_decision_changes();
                """);

            // A deferred count check seals the criterion set at the same commit
            // as its parent decision. Later INSERTs cannot extend that snapshot.
            migrationBuilder.Sql("""
                CREATE FUNCTION verify_evaluation_review_criterion_count()
                RETURNS trigger LANGUAGE plpgsql AS $$
                DECLARE
                    review_id uuid;
                    expected_count integer;
                    actual_count integer;
                BEGIN
                    IF TG_TABLE_NAME = 'EvaluationReviewDecisions' THEN
                        review_id := NEW."Id";
                    ELSE
                        review_id := NEW."EvaluationReviewDecisionId";
                    END IF;
                    SELECT "CriterionCount" INTO expected_count
                    FROM "EvaluationReviewDecisions" WHERE "Id" = review_id;
                    SELECT count(*) INTO actual_count
                    FROM "EvaluationReviewCriterionDecisions"
                    WHERE "EvaluationReviewDecisionId" = review_id;
                    IF expected_count IS DISTINCT FROM actual_count THEN
                        RAISE EXCEPTION 'Evaluation review criterion count does not match the sealed decision';
                    END IF;
                    RETURN NEW;
                END;
                $$;
                CREATE CONSTRAINT TRIGGER evaluation_review_decision_criterion_count
                AFTER INSERT ON "EvaluationReviewDecisions"
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION verify_evaluation_review_criterion_count();
                CREATE CONSTRAINT TRIGGER evaluation_review_criterion_decision_count
                AFTER INSERT ON "EvaluationReviewCriterionDecisions"
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION verify_evaluation_review_criterion_count();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER evaluation_review_criterion_decision_count ON "EvaluationReviewCriterionDecisions";
                DROP TRIGGER evaluation_review_decision_criterion_count ON "EvaluationReviewDecisions";
                DROP FUNCTION verify_evaluation_review_criterion_count();
                DROP TRIGGER evaluation_review_criterion_decisions_append_only ON "EvaluationReviewCriterionDecisions";
                DROP TRIGGER evaluation_review_decisions_append_only ON "EvaluationReviewDecisions";
                DROP FUNCTION prevent_evaluation_review_decision_changes();
                """);

            migrationBuilder.DropTable(
                name: "EvaluationReviewCriterionDecisions");

            migrationBuilder.DropTable(
                name: "EvaluationReviewDecisions");
        }
    }
}
