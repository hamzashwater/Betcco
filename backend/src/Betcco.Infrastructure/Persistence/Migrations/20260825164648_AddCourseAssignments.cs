using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CourseAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseModuleId = table.Column<Guid>(type: "uuid", nullable: true),
                    LessonId = table.Column<Guid>(type: "uuid", nullable: true),
                    BtecLearningAimId = table.Column<Guid>(type: "uuid", nullable: true),
                    ArabicTitle = table.Column<string>(type: "text", nullable: false),
                    EnglishTitle = table.Column<string>(type: "text", nullable: false),
                    ArabicInstructions = table.Column<string>(type: "text", nullable: false),
                    EnglishInstructions = table.Column<string>(type: "text", nullable: false),
                    DueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    MaxSubmissionAttempts = table.Column<int>(type: "integer", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    MaxScore = table.Column<decimal>(type: "numeric", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignments_BtecLearningAims_BtecLearningAimId",
                        column: x => x.BtecLearningAimId,
                        principalTable: "BtecLearningAims",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CourseAssignments_CourseModules_CourseModuleId",
                        column: x => x.CourseModuleId,
                        principalTable: "CourseModules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CourseAssignments_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CourseAssignments_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentCriteria",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    BtecCriterionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Band = table.Column<int>(type: "integer", nullable: false),
                    ArabicDescription = table.Column<string>(type: "text", nullable: false),
                    EnglishDescription = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentCriteria", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentCriteria_BtecCriteria_BtecCriterionId",
                        column: x => x.BtecCriterionId,
                        principalTable: "BtecCriteria",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CourseAssignmentCriteria_CourseAssignments_CourseAssignment~",
                        column: x => x.CourseAssignmentId,
                        principalTable: "CourseAssignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CurrentVersionNumber = table.Column<int>(type: "integer", nullable: false),
                    CalculatedGrade = table.Column<int>(type: "integer", nullable: true),
                    CalculatedScore = table.Column<decimal>(type: "numeric", nullable: true),
                    SubmittedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    GradedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentSubmissions_CourseAssignments_CourseAssignm~",
                        column: x => x.CourseAssignmentId,
                        principalTable: "CourseAssignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentCriterionResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentSubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentCriterionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Achievement = table.Column<int>(type: "integer", nullable: false),
                    Score = table.Column<decimal>(type: "numeric", nullable: false),
                    Feedback = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentCriterionResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentCriterionResults_CourseAssignmentCriteria_C~",
                        column: x => x.CourseAssignmentCriterionId,
                        principalTable: "CourseAssignmentCriteria",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentCriterionResults_CourseAssignmentSubmission~",
                        column: x => x.CourseAssignmentSubmissionId,
                        principalTable: "CourseAssignmentSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentFeedbackItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentSubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorUserId = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    RequestsResubmission = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentFeedbackItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentFeedbackItems_CourseAssignmentSubmissions_C~",
                        column: x => x.CourseAssignmentSubmissionId,
                        principalTable: "CourseAssignmentSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentSubmissionVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentSubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    StudentComment = table.Column<string>(type: "text", nullable: true),
                    SubmittedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseAssignmentSubmissionVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentSubmissionVersions_CourseAssignmentSubmissi~",
                        column: x => x.CourseAssignmentSubmissionId,
                        principalTable: "CourseAssignmentSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CourseAssignmentSubmissionFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseAssignmentSubmissionVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalFileName = table.Column<string>(type: "text", nullable: false),
                    StorageKey = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    LengthBytes = table.Column<long>(type: "bigint", nullable: false),
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
                    table.PrimaryKey("PK_CourseAssignmentSubmissionFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseAssignmentSubmissionFiles_CourseAssignmentSubmissionV~",
                        column: x => x.CourseAssignmentSubmissionVersionId,
                        principalTable: "CourseAssignmentSubmissionVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentCriteria_BtecCriterionId",
                table: "CourseAssignmentCriteria",
                column: "BtecCriterionId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentCriteria_CourseAssignmentId_Code",
                table: "CourseAssignmentCriteria",
                columns: new[] { "CourseAssignmentId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentCriterionResults_CourseAssignmentCriterionId",
                table: "CourseAssignmentCriterionResults",
                column: "CourseAssignmentCriterionId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentCriterionResults_CourseAssignmentSubmission~",
                table: "CourseAssignmentCriterionResults",
                columns: new[] { "CourseAssignmentSubmissionId", "CourseAssignmentCriterionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentFeedbackItems_CourseAssignmentSubmissionId_~",
                table: "CourseAssignmentFeedbackItems",
                columns: new[] { "CourseAssignmentSubmissionId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_BtecLearningAimId",
                table: "CourseAssignments",
                column: "BtecLearningAimId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_CourseId_IsPublished_DueAtUtc",
                table: "CourseAssignments",
                columns: new[] { "CourseId", "IsPublished", "DueAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_CourseModuleId",
                table: "CourseAssignments",
                column: "CourseModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_LessonId",
                table: "CourseAssignments",
                column: "LessonId",
                unique: true,
                filter: "\"LessonId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentSubmissionFiles_CourseAssignmentSubmissionV~",
                table: "CourseAssignmentSubmissionFiles",
                columns: new[] { "CourseAssignmentSubmissionVersionId", "StorageKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentSubmissions_CourseAssignmentId_StudentUserId",
                table: "CourseAssignmentSubmissions",
                columns: new[] { "CourseAssignmentId", "StudentUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentSubmissions_Status_UpdatedAtUtc",
                table: "CourseAssignmentSubmissions",
                columns: new[] { "Status", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignmentSubmissionVersions_CourseAssignmentSubmissi~",
                table: "CourseAssignmentSubmissionVersions",
                columns: new[] { "CourseAssignmentSubmissionId", "VersionNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourseAssignmentCriterionResults");

            migrationBuilder.DropTable(
                name: "CourseAssignmentFeedbackItems");

            migrationBuilder.DropTable(
                name: "CourseAssignmentSubmissionFiles");

            migrationBuilder.DropTable(
                name: "CourseAssignmentCriteria");

            migrationBuilder.DropTable(
                name: "CourseAssignmentSubmissionVersions");

            migrationBuilder.DropTable(
                name: "CourseAssignmentSubmissions");

            migrationBuilder.DropTable(
                name: "CourseAssignments");
        }
    }
}
