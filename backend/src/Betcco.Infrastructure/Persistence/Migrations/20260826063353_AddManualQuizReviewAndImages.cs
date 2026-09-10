using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddManualQuizReviewAndImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ImageResourceId",
                table: "QuizQuestions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ManuallyGradedAtUtc",
                table: "QuizAttempts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresManualReview",
                table: "QuizAttempts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "QuizAttemptQuestionGrades",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QuizAttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuizQuestionId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeacherUserId = table.Column<string>(type: "text", nullable: false),
                    ScorePercent = table.Column<decimal>(type: "numeric", nullable: false),
                    StudentFeedback = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuizAttemptQuestionGrades", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuizAttemptQuestionGrades_QuizAttempts_QuizAttemptId",
                        column: x => x.QuizAttemptId,
                        principalTable: "QuizAttempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_QuizAttemptQuestionGrades_QuizQuestions_QuizQuestionId",
                        column: x => x.QuizQuestionId,
                        principalTable: "QuizQuestions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QuizQuestions_ImageResourceId",
                table: "QuizQuestions",
                column: "ImageResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_QuizAttemptQuestionGrades_QuizAttemptId_QuizQuestionId",
                table: "QuizAttemptQuestionGrades",
                columns: new[] { "QuizAttemptId", "QuizQuestionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuizAttemptQuestionGrades_QuizQuestionId",
                table: "QuizAttemptQuestionGrades",
                column: "QuizQuestionId");

            migrationBuilder.AddForeignKey(
                name: "FK_QuizQuestions_LessonResources_ImageResourceId",
                table: "QuizQuestions",
                column: "ImageResourceId",
                principalTable: "LessonResources",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QuizQuestions_LessonResources_ImageResourceId",
                table: "QuizQuestions");

            migrationBuilder.DropTable(
                name: "QuizAttemptQuestionGrades");

            migrationBuilder.DropIndex(
                name: "IX_QuizQuestions_ImageResourceId",
                table: "QuizQuestions");

            migrationBuilder.DropColumn(
                name: "ImageResourceId",
                table: "QuizQuestions");

            migrationBuilder.DropColumn(
                name: "ManuallyGradedAtUtc",
                table: "QuizAttempts");

            migrationBuilder.DropColumn(
                name: "RequiresManualReview",
                table: "QuizAttempts");
        }
    }
}
