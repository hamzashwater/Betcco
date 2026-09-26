using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationRevisionDeadlineAdjustments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RevisionDueAtUtc",
                table: "EvaluationRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EvaluationRevisionDeadlineAdjustments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    BaseDueAtUtcSnapshot = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExtendedDueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevocationReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationRevisionDeadlineAdjustments", x => x.Id);
                    table.CheckConstraint("CK_EvaluationRevisionDeadlineAdjustments_ExtendsBase", "\"ExtendedDueAtUtc\" > \"BaseDueAtUtcSnapshot\"");
                    table.ForeignKey(
                        name: "FK_EvaluationRevisionDeadlineAdjustments_AspNetUsers_GrantedBy~",
                        column: x => x.GrantedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluationRevisionDeadlineAdjustments_AspNetUsers_RevokedBy~",
                        column: x => x.RevokedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluationRevisionDeadlineAdjustments_EvaluationRequests_Ev~",
                        column: x => x.EvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRevisionDeadlineAdjustments_EvaluationRequestId",
                table: "EvaluationRevisionDeadlineAdjustments",
                column: "EvaluationRequestId",
                unique: true,
                filter: "\"RevokedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRevisionDeadlineAdjustments_EvaluationRequestId_G~",
                table: "EvaluationRevisionDeadlineAdjustments",
                columns: new[] { "EvaluationRequestId", "GrantedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRevisionDeadlineAdjustments_GrantedByUserId",
                table: "EvaluationRevisionDeadlineAdjustments",
                column: "GrantedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRevisionDeadlineAdjustments_RevokedByUserId",
                table: "EvaluationRevisionDeadlineAdjustments",
                column: "RevokedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EvaluationRevisionDeadlineAdjustments");

            migrationBuilder.DropColumn(
                name: "RevisionDueAtUtc",
                table: "EvaluationRequests");
        }
    }
}
