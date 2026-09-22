using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssessmentRetakes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RetakeOfEvaluationRequestId",
                table: "EvaluationRequests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsRetakeOnly",
                table: "AssessmentScopes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "RetakeAuthorizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalEvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RetakeAssessmentScopeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RetakeEvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorizedByUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AuthorizedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RetakeAuthorizations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RetakeAuthorizations_AssessmentScopes_RetakeAssessmentScope~",
                        column: x => x.RetakeAssessmentScopeId,
                        principalTable: "AssessmentScopes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RetakeAuthorizations_EvaluationRequests_OriginalEvaluationR~",
                        column: x => x.OriginalEvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RetakeAuthorizations_EvaluationRequests_RetakeEvaluationReq~",
                        column: x => x.RetakeEvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRequests_RetakeOfEvaluationRequestId",
                table: "EvaluationRequests",
                column: "RetakeOfEvaluationRequestId",
                unique: true,
                filter: "\"RetakeOfEvaluationRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RetakeAuthorizations_OriginalEvaluationRequestId",
                table: "RetakeAuthorizations",
                column: "OriginalEvaluationRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RetakeAuthorizations_RetakeAssessmentScopeId",
                table: "RetakeAuthorizations",
                column: "RetakeAssessmentScopeId");

            migrationBuilder.CreateIndex(
                name: "IX_RetakeAuthorizations_RetakeEvaluationRequestId",
                table: "RetakeAuthorizations",
                column: "RetakeEvaluationRequestId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_EvaluationRequests_EvaluationRequests_RetakeOfEvaluationReq~",
                table: "EvaluationRequests",
                column: "RetakeOfEvaluationRequestId",
                principalTable: "EvaluationRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EvaluationRequests_EvaluationRequests_RetakeOfEvaluationReq~",
                table: "EvaluationRequests");

            migrationBuilder.DropTable(
                name: "RetakeAuthorizations");

            migrationBuilder.DropIndex(
                name: "IX_EvaluationRequests_RetakeOfEvaluationRequestId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "RetakeOfEvaluationRequestId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "IsRetakeOnly",
                table: "AssessmentScopes");
        }
    }
}
