using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseAccessGrantProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CourseAccessGrants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "text", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceType = table.Column<int>(type: "integer", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    GrantedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ValidFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ValidUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevocationReason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RevokedByRefundId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAccessGrants", x => x.Id);
                    table.CheckConstraint("CK_CourseAccessGrants_Revocation", "(\"RevokedAtUtc\" IS NULL AND \"RevocationReason\" IS NULL AND \"RevokedByRefundId\" IS NULL) OR (\"RevokedAtUtc\" IS NOT NULL AND \"RevocationReason\" IS NOT NULL)");
                    table.CheckConstraint("CK_CourseAccessGrants_SourcePayment", "(\"SourceType\" IN (3, 4) AND \"PaymentId\" IS NULL) OR (\"SourceType\" IN (0, 1, 2) AND \"PaymentId\" IS NOT NULL)");
                    table.CheckConstraint("CK_CourseAccessGrants_Validity", "\"SourceType\" = 3 OR \"ValidUntilUtc\" IS NULL OR \"ValidUntilUtc\" > \"ValidFromUtc\"");
                    table.ForeignKey(
                        name: "FK_CourseAccessGrants_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CourseAccessGrants_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CourseAccessGrants_Refunds_RevokedByRefundId",
                        column: x => x.RevokedByRefundId,
                        principalTable: "Refunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAccessGrants_CourseId",
                table: "CourseAccessGrants",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAccessGrants_PaymentId_RevokedAtUtc",
                table: "CourseAccessGrants",
                columns: new[] { "PaymentId", "RevokedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAccessGrants_RevokedByRefundId",
                table: "CourseAccessGrants",
                column: "RevokedByRefundId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAccessGrants_SourceType_SourceId_CourseId",
                table: "CourseAccessGrants",
                columns: new[] { "SourceType", "SourceId", "CourseId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAccessGrants_StudentUserId_CourseId_RevokedAtUtc_Vali~",
                table: "CourseAccessGrants",
                columns: new[] { "StudentUserId", "CourseId", "RevokedAtUtc", "ValidUntilUtc" });

            // Historical Enrollment.PaymentId is mutable and cannot prove sole
            // ownership. Preserve each pre-migration enrollment as an unassigned
            // Legacy source; reconciliation may later establish a stronger source.
            migrationBuilder.Sql("""
                INSERT INTO "CourseAccessGrants"
                    ("Id", "StudentUserId", "CourseId", "SourceType", "SourceId",
                     "GrantedAtUtc", "ValidFromUtc", "ValidUntilUtc", "CreatedAtUtc",
                     "UpdatedAtUtc", "IsDeleted")
                SELECT gen_random_uuid(), "StudentUserId", "CourseId", 3, "Id",
                       "EnrolledAtUtc", "EnrolledAtUtc", "AccessEndsAtUtc", now(), now(), false
                FROM "Enrollments"
                WHERE "IsDeleted" = false
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException("Course access provenance must be reconciled and exported before any rollback that would discard grants.");
        }
    }
}
