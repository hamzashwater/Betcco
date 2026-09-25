using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIncludedEvaluationEntitlements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IncludedEvaluationEntitlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EnrollmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedByPaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedByEvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByRefundId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IncludedEvaluationEntitlements", x => x.Id);
                    table.CheckConstraint("CK_IncludedEvaluationEntitlements_ConsumedOrRevoked", "NOT (\"ConsumedAtUtc\" IS NOT NULL AND \"RevokedAtUtc\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_IncludedEvaluationEntitlements_Enrollments_EnrollmentId",
                        column: x => x.EnrollmentId,
                        principalTable: "Enrollments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_IncludedEvaluationEntitlements_EvaluationRequests_ConsumedB~",
                        column: x => x.ConsumedByEvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_IncludedEvaluationEntitlements_Payments_GrantedByPaymentId",
                        column: x => x.GrantedByPaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_IncludedEvaluationEntitlements_Refunds_RevokedByRefundId",
                        column: x => x.RevokedByRefundId,
                        principalTable: "Refunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_IncludedEvaluationEntitlements_UnitDefinitions_UnitDefiniti~",
                        column: x => x.UnitDefinitionId,
                        principalTable: "UnitDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_ConsumedByEvaluationRequestId",
                table: "IncludedEvaluationEntitlements",
                column: "ConsumedByEvaluationRequestId",
                unique: true,
                filter: "\"ConsumedByEvaluationRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_EnrollmentId",
                table: "IncludedEvaluationEntitlements",
                column: "EnrollmentId");

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_GrantedByPaymentId_UnitDefin~",
                table: "IncludedEvaluationEntitlements",
                columns: new[] { "GrantedByPaymentId", "UnitDefinitionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_RevokedByRefundId",
                table: "IncludedEvaluationEntitlements",
                column: "RevokedByRefundId");

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_StudentUserId_UnitDefinition~",
                table: "IncludedEvaluationEntitlements",
                columns: new[] { "StudentUserId", "UnitDefinitionId", "ConsumedAtUtc", "RevokedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_IncludedEvaluationEntitlements_UnitDefinitionId",
                table: "IncludedEvaluationEntitlements",
                column: "UnitDefinitionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IncludedEvaluationEntitlements");
        }
    }
}
