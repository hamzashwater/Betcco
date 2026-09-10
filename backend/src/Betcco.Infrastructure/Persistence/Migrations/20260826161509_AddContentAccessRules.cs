using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContentAccessRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContentAccessRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReleaseMode = table.Column<int>(type: "integer", nullable: false),
                    SpecificDateUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DaysAfterEnrollment = table.Column<int>(type: "integer", nullable: true),
                    PreviousContentType = table.Column<int>(type: "integer", nullable: true),
                    PreviousContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentAccessRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentAccessRules_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ContentPrerequisites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequiredContentType = table.Column<int>(type: "integer", nullable: false),
                    RequiredContentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentPrerequisites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentPrerequisites_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContentAccessRules_CourseId_ReleaseMode",
                table: "ContentAccessRules",
                columns: new[] { "CourseId", "ReleaseMode" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentAccessRules_CourseId_TargetType_TargetId",
                table: "ContentAccessRules",
                columns: new[] { "CourseId", "TargetType", "TargetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContentPrerequisites_CourseId_TargetType_TargetId",
                table: "ContentPrerequisites",
                columns: new[] { "CourseId", "TargetType", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentPrerequisites_TargetType_TargetId_RequiredContentTyp~",
                table: "ContentPrerequisites",
                columns: new[] { "TargetType", "TargetId", "RequiredContentType", "RequiredContentId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContentAccessRules");

            migrationBuilder.DropTable(
                name: "ContentPrerequisites");
        }
    }
}
