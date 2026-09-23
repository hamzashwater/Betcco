using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluatorUnitSpecialisms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "EvaluatorUnitSpecialismId",
                table: "EvaluatorAssignments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EvaluatorUnitSpecialisms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluatorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokeReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluatorUnitSpecialisms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluatorUnitSpecialisms_AspNetUsers_EvaluatorUserId",
                        column: x => x.EvaluatorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluatorUnitSpecialisms_AspNetUsers_GrantedByUserId",
                        column: x => x.GrantedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluatorUnitSpecialisms_AspNetUsers_RevokedByUserId",
                        column: x => x.RevokedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvaluatorUnitSpecialisms_UnitDefinitions_UnitDefinitionId",
                        column: x => x.UnitDefinitionId,
                        principalTable: "UnitDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluatorAssignments_EvaluatorUnitSpecialismId",
                table: "EvaluatorAssignments",
                column: "EvaluatorUnitSpecialismId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluatorUnitSpecialisms_EvaluatorUserId_UnitDefinitionId",
                table: "EvaluatorUnitSpecialisms",
                columns: new[] { "EvaluatorUserId", "UnitDefinitionId" },
                unique: true,
                filter: "\"RevokedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluatorUnitSpecialisms_GrantedByUserId",
                table: "EvaluatorUnitSpecialisms",
                column: "GrantedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluatorUnitSpecialisms_RevokedByUserId",
                table: "EvaluatorUnitSpecialisms",
                column: "RevokedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluatorUnitSpecialisms_UnitDefinitionId_RevokedAtUtc_Eval~",
                table: "EvaluatorUnitSpecialisms",
                columns: new[] { "UnitDefinitionId", "RevokedAtUtc", "EvaluatorUserId" });

            migrationBuilder.AddForeignKey(
                name: "FK_EvaluatorAssignments_EvaluatorUnitSpecialisms_EvaluatorUnit~",
                table: "EvaluatorAssignments",
                column: "EvaluatorUnitSpecialismId",
                principalTable: "EvaluatorUnitSpecialisms",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EvaluatorAssignments_EvaluatorUnitSpecialisms_EvaluatorUnit~",
                table: "EvaluatorAssignments");

            migrationBuilder.DropTable(
                name: "EvaluatorUnitSpecialisms");

            migrationBuilder.DropIndex(
                name: "IX_EvaluatorAssignments_EvaluatorUnitSpecialismId",
                table: "EvaluatorAssignments");

            migrationBuilder.DropColumn(
                name: "EvaluatorUnitSpecialismId",
                table: "EvaluatorAssignments");
        }
    }
}
