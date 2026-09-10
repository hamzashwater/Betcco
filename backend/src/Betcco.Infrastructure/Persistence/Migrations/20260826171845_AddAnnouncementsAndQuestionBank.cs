using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnouncementsAndQuestionBank : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CourseAnnouncements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseModuleId = table.Column<Guid>(type: "uuid", nullable: true),
                    TeacherUserId = table.Column<string>(type: "text", nullable: false),
                    ArabicTitle = table.Column<string>(type: "text", nullable: false),
                    EnglishTitle = table.Column<string>(type: "text", nullable: false),
                    ArabicBody = table.Column<string>(type: "text", nullable: false),
                    EnglishBody = table.Column<string>(type: "text", nullable: false),
                    Audience = table.Column<int>(type: "integer", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    PublishedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAnnouncements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAnnouncements_CourseModules_CourseModuleId",
                        column: x => x.CourseModuleId,
                        principalTable: "CourseModules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CourseAnnouncements_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QuestionBankQuestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeacherUserId = table.Column<string>(type: "text", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    ArabicText = table.Column<string>(type: "text", nullable: false),
                    EnglishText = table.Column<string>(type: "text", nullable: false),
                    OptionsJson = table.Column<string>(type: "text", nullable: false),
                    CorrectAnswersJson = table.Column<string>(type: "text", nullable: false),
                    ImageResourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    Tag = table.Column<string>(type: "text", nullable: true),
                    Difficulty = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuestionBankQuestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuestionBankQuestions_LessonResources_ImageResourceId",
                        column: x => x.ImageResourceId,
                        principalTable: "LessonResources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CourseAnnouncementRecipients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAnnouncementId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAnnouncementRecipients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAnnouncementRecipients_CourseAnnouncements_CourseAnno~",
                        column: x => x.CourseAnnouncementId,
                        principalTable: "CourseAnnouncements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAnnouncementRecipients_CourseAnnouncementId_StudentUs~",
                table: "CourseAnnouncementRecipients",
                columns: new[] { "CourseAnnouncementId", "StudentUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAnnouncements_CourseId_IsPublished_PublishedAtUtc",
                table: "CourseAnnouncements",
                columns: new[] { "CourseId", "IsPublished", "PublishedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAnnouncements_CourseModuleId_PublishedAtUtc",
                table: "CourseAnnouncements",
                columns: new[] { "CourseModuleId", "PublishedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_ImageResourceId",
                table: "QuestionBankQuestions",
                column: "ImageResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_TeacherUserId_CourseId_UpdatedAtUtc",
                table: "QuestionBankQuestions",
                columns: new[] { "TeacherUserId", "CourseId", "UpdatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourseAnnouncementRecipients");

            migrationBuilder.DropTable(
                name: "QuestionBankQuestions");

            migrationBuilder.DropTable(
                name: "CourseAnnouncements");
        }
    }
}
