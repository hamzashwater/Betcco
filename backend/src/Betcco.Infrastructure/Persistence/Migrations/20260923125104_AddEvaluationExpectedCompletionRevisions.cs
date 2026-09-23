using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationExpectedCompletionRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EvaluationExpectedCompletionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionNumber = table.Column<int>(type: "integer", nullable: false),
                    ExpectedCompletionAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationExpectedCompletionRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationExpectedCompletionRevisions_AspNetUsers_RecordedB~",
                        column: x => x.RecordedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluationExpectedCompletionRevisions_EvaluationRequests_Ev~",
                        column: x => x.EvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationExpectedCompletionRevisions_EvaluationRequestId_R~",
                table: "EvaluationExpectedCompletionRevisions",
                columns: new[] { "EvaluationRequestId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationExpectedCompletionRevisions_RecordedByUserId",
                table: "EvaluationExpectedCompletionRevisions",
                column: "RecordedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EvaluationExpectedCompletionRevisions");
        }
    }
}
