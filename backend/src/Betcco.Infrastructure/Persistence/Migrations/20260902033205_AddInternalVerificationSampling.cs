using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInternalVerificationSampling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InternalVerificationPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessorUserId = table.Column<string>(type: "text", nullable: true),
                    GradeId = table.Column<Guid>(type: "uuid", nullable: true),
                    SpecializationId = table.Column<Guid>(type: "uuid", nullable: true),
                    TaskTypeId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetOutcome = table.Column<int>(type: "integer", nullable: true),
                    SelectionRationale = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ActiveFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ActiveUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InternalVerificationPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InternalVerificationSamples",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InternalVerificationPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionAttemptNumber = table.Column<int>(type: "integer", nullable: false),
                    SelectedByUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AssignedVerifierUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SelectionRationale = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    SelectedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    DecisionComment = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    DecidedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InternalVerificationSamples", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InternalVerificationSamples_EvaluationRequests_EvaluationRe~",
                        column: x => x.EvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InternalVerificationSamples_InternalVerificationPlans_Inter~",
                        column: x => x.InternalVerificationPlanId,
                        principalTable: "InternalVerificationPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InternalVerificationPlans_AssessorUserId_GradeId_Specializa~",
                table: "InternalVerificationPlans",
                columns: new[] { "AssessorUserId", "GradeId", "SpecializationId", "TaskTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_InternalVerificationPlans_IsActive_ActiveFromUtc_ActiveUnti~",
                table: "InternalVerificationPlans",
                columns: new[] { "IsActive", "ActiveFromUtc", "ActiveUntilUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_InternalVerificationSamples_AssignedVerifierUserId_Status_S~",
                table: "InternalVerificationSamples",
                columns: new[] { "AssignedVerifierUserId", "Status", "SelectedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_InternalVerificationSamples_EvaluationRequestId_SubmissionA~",
                table: "InternalVerificationSamples",
                columns: new[] { "EvaluationRequestId", "SubmissionAttemptNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InternalVerificationSamples_InternalVerificationPlanId",
                table: "InternalVerificationSamples",
                column: "InternalVerificationPlanId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InternalVerificationSamples");

            migrationBuilder.DropTable(
                name: "InternalVerificationPlans");
        }
    }
}
