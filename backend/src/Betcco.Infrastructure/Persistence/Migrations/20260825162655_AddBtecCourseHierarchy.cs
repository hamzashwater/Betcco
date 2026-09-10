using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBtecCourseHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CourseModules_CourseId",
                table: "CourseModules");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableFromUtc",
                table: "Lessons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BtecLearningAimId",
                table: "Lessons",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BtecTopicId",
                table: "Lessons",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PublicationStatus",
                table: "Lessons",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ScheduledPublishAtUtc",
                table: "Courses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ArabicDescription",
                table: "CourseModules",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableFromUtc",
                table: "CourseModules",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Credits",
                table: "CourseModules",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnglishDescription",
                table: "CourseModules",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GuidedLearningHours",
                table: "CourseModules",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PublicationStatus",
                table: "CourseModules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "QualificationLevel",
                table: "CourseModules",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UnitCode",
                table: "CourseModules",
                type: "text",
                nullable: true);

            // Existing published modules and lessons must keep their visibility
            // when the new publication-state column is introduced.
            migrationBuilder.Sql("UPDATE \"CourseModules\" SET \"PublicationStatus\" = 1 WHERE \"IsPublished\" = TRUE;");
            migrationBuilder.Sql("UPDATE \"Lessons\" SET \"PublicationStatus\" = 1 WHERE \"IsPublished\" = TRUE;");

            migrationBuilder.CreateTable(
                name: "BtecLearningAims",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseModuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    ArabicTitle = table.Column<string>(type: "text", nullable: false),
                    EnglishTitle = table.Column<string>(type: "text", nullable: false),
                    ArabicDescription = table.Column<string>(type: "text", nullable: true),
                    EnglishDescription = table.Column<string>(type: "text", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    PublicationStatus = table.Column<int>(type: "integer", nullable: false),
                    AvailableFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BtecLearningAims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BtecLearningAims_CourseModules_CourseModuleId",
                        column: x => x.CourseModuleId,
                        principalTable: "CourseModules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BtecCriteria",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseModuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    BtecLearningAimId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Band = table.Column<int>(type: "integer", nullable: false),
                    ArabicDescription = table.Column<string>(type: "text", nullable: false),
                    EnglishDescription = table.Column<string>(type: "text", nullable: false),
                    ArabicEvidenceGuidance = table.Column<string>(type: "text", nullable: true),
                    EnglishEvidenceGuidance = table.Column<string>(type: "text", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    PublicationStatus = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BtecCriteria", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BtecCriteria_BtecLearningAims_BtecLearningAimId",
                        column: x => x.BtecLearningAimId,
                        principalTable: "BtecLearningAims",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BtecCriteria_CourseModules_CourseModuleId",
                        column: x => x.CourseModuleId,
                        principalTable: "CourseModules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BtecTopics",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BtecLearningAimId = table.Column<Guid>(type: "uuid", nullable: false),
                    ArabicTitle = table.Column<string>(type: "text", nullable: false),
                    EnglishTitle = table.Column<string>(type: "text", nullable: false),
                    ArabicDescription = table.Column<string>(type: "text", nullable: true),
                    EnglishDescription = table.Column<string>(type: "text", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    PublicationStatus = table.Column<int>(type: "integer", nullable: false),
                    AvailableFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BtecTopics", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BtecTopics_BtecLearningAims_BtecLearningAimId",
                        column: x => x.BtecLearningAimId,
                        principalTable: "BtecLearningAims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Lessons_BtecLearningAimId",
                table: "Lessons",
                column: "BtecLearningAimId");

            migrationBuilder.CreateIndex(
                name: "IX_Lessons_BtecTopicId",
                table: "Lessons",
                column: "BtecTopicId");

            migrationBuilder.CreateIndex(
                name: "IX_Courses_Status_ScheduledPublishAtUtc",
                table: "Courses",
                columns: new[] { "Status", "ScheduledPublishAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_CourseId_SortOrder",
                table: "CourseModules",
                columns: new[] { "CourseId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_CourseId_UnitCode",
                table: "CourseModules",
                columns: new[] { "CourseId", "UnitCode" },
                unique: true,
                filter: "\"UnitCode\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BtecCriteria_BtecLearningAimId_SortOrder",
                table: "BtecCriteria",
                columns: new[] { "BtecLearningAimId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_BtecCriteria_CourseModuleId_Code",
                table: "BtecCriteria",
                columns: new[] { "CourseModuleId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BtecLearningAims_CourseModuleId_Code",
                table: "BtecLearningAims",
                columns: new[] { "CourseModuleId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BtecLearningAims_CourseModuleId_SortOrder",
                table: "BtecLearningAims",
                columns: new[] { "CourseModuleId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_BtecTopics_BtecLearningAimId_SortOrder",
                table: "BtecTopics",
                columns: new[] { "BtecLearningAimId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Lessons_BtecLearningAims_BtecLearningAimId",
                table: "Lessons",
                column: "BtecLearningAimId",
                principalTable: "BtecLearningAims",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Lessons_BtecTopics_BtecTopicId",
                table: "Lessons",
                column: "BtecTopicId",
                principalTable: "BtecTopics",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Lessons_BtecLearningAims_BtecLearningAimId",
                table: "Lessons");

            migrationBuilder.DropForeignKey(
                name: "FK_Lessons_BtecTopics_BtecTopicId",
                table: "Lessons");

            migrationBuilder.DropTable(
                name: "BtecCriteria");

            migrationBuilder.DropTable(
                name: "BtecTopics");

            migrationBuilder.DropTable(
                name: "BtecLearningAims");

            migrationBuilder.DropIndex(
                name: "IX_Lessons_BtecLearningAimId",
                table: "Lessons");

            migrationBuilder.DropIndex(
                name: "IX_Lessons_BtecTopicId",
                table: "Lessons");

            migrationBuilder.DropIndex(
                name: "IX_Courses_Status_ScheduledPublishAtUtc",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_CourseId_SortOrder",
                table: "CourseModules");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_CourseId_UnitCode",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "AvailableFromUtc",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "BtecLearningAimId",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "BtecTopicId",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "PublicationStatus",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ScheduledPublishAtUtc",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "ArabicDescription",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "AvailableFromUtc",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "Credits",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "EnglishDescription",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "GuidedLearningHours",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "PublicationStatus",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "QualificationLevel",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "UnitCode",
                table: "CourseModules");

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_CourseId",
                table: "CourseModules",
                column: "CourseId");
        }
    }
}
