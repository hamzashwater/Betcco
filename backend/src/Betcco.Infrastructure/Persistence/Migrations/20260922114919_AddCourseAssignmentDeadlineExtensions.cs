using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseAssignmentDeadlineExtensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CourseAssignmentDeadlineExtensions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BaseDueAtUtcSnapshot = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExtendedDueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    GrantedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GrantedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
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
                    table.PrimaryKey("PK_CourseAssignmentDeadlineExtensions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentDeadlineExtensions_CourseAssignments_Course~",
                        column: x => x.CourseAssignmentId,
                        principalTable: "CourseAssignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentDeadlineExtensions_CourseAssignmentId_Stude~",
                table: "CourseAssignmentDeadlineExtensions",
                columns: new[] { "CourseAssignmentId", "StudentUserId" },
                unique: true,
                filter: "\"RevokedAtUtc\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourseAssignmentDeadlineExtensions");
        }
    }
}
