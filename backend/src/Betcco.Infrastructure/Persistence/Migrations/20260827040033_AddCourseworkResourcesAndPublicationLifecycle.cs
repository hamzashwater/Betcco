using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseworkResourcesAndPublicationLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PublicationStatus",
                table: "Quizzes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PublicationStatus",
                table: "CourseAssignments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Preserve the visibility of existing production content. New rows
            // use Draft (0); rows previously made visible through IsPublished
            // are migrated to Published (1).
            migrationBuilder.Sql("UPDATE \"Quizzes\" SET \"PublicationStatus\" = 1 WHERE \"IsPublished\" = TRUE;");
            migrationBuilder.Sql("UPDATE \"CourseAssignments\" SET \"PublicationStatus\" = 1 WHERE \"IsPublished\" = TRUE;");

            migrationBuilder.AddColumn<bool>(
                name: "IsPrivate",
                table: "CourseAssignmentFeedbackItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "CourseAssignmentResources",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    StorageKey = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    ScanStatus = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentResources", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentResources_CourseAssignments_CourseAssignmen~",
                        column: x => x.CourseAssignmentId,
                        principalTable: "CourseAssignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Quizzes_CourseId_PublicationStatus_AvailableFromUtc",
                table: "Quizzes",
                columns: new[] { "CourseId", "PublicationStatus", "AvailableFromUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_CourseId_PublicationStatus_AvailableFromU~",
                table: "CourseAssignments",
                columns: new[] { "CourseId", "PublicationStatus", "AvailableFromUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentResources_CourseAssignmentId_DisplayName",
                table: "CourseAssignmentResources",
                columns: new[] { "CourseAssignmentId", "DisplayName" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourseAssignmentResources");

            migrationBuilder.DropIndex(
                name: "IX_Quizzes_CourseId_PublicationStatus_AvailableFromUtc",
                table: "Quizzes");

            migrationBuilder.DropIndex(
                name: "IX_CourseAssignments_CourseId_PublicationStatus_AvailableFromU~",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "PublicationStatus",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "PublicationStatus",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "IsPrivate",
                table: "CourseAssignmentFeedbackItems");
        }
    }
}
