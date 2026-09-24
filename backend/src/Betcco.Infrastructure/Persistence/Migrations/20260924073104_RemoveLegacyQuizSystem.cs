using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLegacyQuizSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Persisted LessonType.Quiz (2) is retained as LegacyArchived (2).
            // Preserve lesson identities and all lesson-linked learner history.
            migrationBuilder.Sql("""
                UPDATE "Lessons"
                SET "IsPublished" = FALSE, "PublicationStatus" = 2
                WHERE "Type" = 2;
                """);

            // LearningContentType.Quiz was 3. A Lesson node pointing to a
            // historical quiz lesson is also obsolete as a release target or prerequisite.
            migrationBuilder.Sql("""
                DELETE FROM "ContentPrerequisites"
                WHERE "TargetType" = 3 OR "RequiredContentType" = 3
                   OR ("TargetType" = 2 AND "TargetId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2))
                   OR ("RequiredContentType" = 2 AND "RequiredContentId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2));
                DELETE FROM "ContentAccessRules"
                WHERE "TargetType" = 3 OR "PreviousContentType" = 3
                   OR ("TargetType" = 2 AND "TargetId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2))
                   OR ("PreviousContentType" = 2 AND "PreviousContentId" IN (SELECT "Id" FROM "Lessons" WHERE "Type" = 2));
                """);

            migrationBuilder.DropTable(
                name: "QuestionBankQuestions");

            migrationBuilder.DropTable(
                name: "QuizAttemptQuestionGrades");

            migrationBuilder.DropTable(
                name: "QuizAttempts");

            migrationBuilder.DropTable(
                name: "QuizQuestions");

            migrationBuilder.DropTable(
                name: "Quizzes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QuestionBankQuestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BtecLearningAimId = table.Column<Guid>(type: "uuid", nullable: true),
                    CourseModuleId = table.Column<Guid>(type: "uuid", nullable: true),
                    ImageResourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    ArabicText = table.Column<string>(type: "text", nullable: false),
                    CorrectAnswersJson = table.Column<string>(type: "text", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    Difficulty = table.Column<int>(type: "integer", nullable: false),
                    EnglishText = table.Column<string>(type: "text", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    OptionsJson = table.Column<string>(type: "text", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true),
                    Tag = table.Column<string>(type: "text", nullable: true),
                    TeacherUserId = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuestionBankQuestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuestionBankQuestions_BtecLearningAims_BtecLearningAimId",
                        column: x => x.BtecLearningAimId,
                        principalTable: "BtecLearningAims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QuestionBankQuestions_CourseModules_CourseModuleId",
                        column: x => x.CourseModuleId,
                        principalTable: "CourseModules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QuestionBankQuestions_LessonResources_ImageResourceId",
                        column: x => x.ImageResourceId,
                        principalTable: "LessonResources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QuestionBankQuestions_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "QuizAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AnswersJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    ManuallyGradedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Passed = table.Column<bool>(type: "boolean", nullable: false),
                    QuizId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequiresManualReview = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true),
                    ScorePercent = table.Column<decimal>(type: "numeric", nullable: false),
                    StartedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    StudentUserId = table.Column<string>(type: "text", nullable: false),
                    SubmittedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    WasLate = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuizAttempts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Quizzes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AllowLateAttempts = table.Column<bool>(type: "boolean", nullable: false),
                    ArabicTitle = table.Column<string>(type: "text", nullable: false),
                    AttemptLimit = table.Column<int>(type: "integer", nullable: true),
                    AvailableFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AvailableUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    EnglishTitle = table.Column<string>(type: "text", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    LessonId = table.Column<Guid>(type: "uuid", nullable: true),
                    PassMark = table.Column<decimal>(type: "numeric", nullable: false),
                    PublicationStatus = table.Column<int>(type: "integer", nullable: false),
                    RandomizeAnswers = table.Column<bool>(type: "boolean", nullable: false),
                    RandomizeQuestions = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true),
                    ShowAnswers = table.Column<bool>(type: "boolean", nullable: false),
                    ShowScore = table.Column<bool>(type: "boolean", nullable: false),
                    TimeLimitMinutes = table.Column<int>(type: "integer", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Quizzes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QuizQuestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImageResourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    QuizId = table.Column<Guid>(type: "uuid", nullable: false),
                    ArabicText = table.Column<string>(type: "text", nullable: false),
                    CorrectAnswersJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    EnglishText = table.Column<string>(type: "text", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    OptionsJson = table.Column<string>(type: "text", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuizQuestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuizQuestions_LessonResources_ImageResourceId",
                        column: x => x.ImageResourceId,
                        principalTable: "LessonResources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QuizQuestions_Quizzes_QuizId",
                        column: x => x.QuizId,
                        principalTable: "Quizzes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QuizAttemptQuestionGrades",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QuizAttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuizQuestionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true),
                    ScorePercent = table.Column<decimal>(type: "numeric", nullable: false),
                    StudentFeedback = table.Column<string>(type: "text", nullable: true),
                    TeacherUserId = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true)
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
                name: "IX_QuestionBankQuestions_BtecLearningAimId",
                table: "QuestionBankQuestions",
                column: "BtecLearningAimId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_CourseModuleId",
                table: "QuestionBankQuestions",
                column: "CourseModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_ImageResourceId",
                table: "QuestionBankQuestions",
                column: "ImageResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_SubjectId",
                table: "QuestionBankQuestions",
                column: "SubjectId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_TeacherUserId_CourseId_SubjectId_Cour~",
                table: "QuestionBankQuestions",
                columns: new[] { "TeacherUserId", "CourseId", "SubjectId", "CourseModuleId", "BtecLearningAimId" });

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_TeacherUserId_CourseId_UpdatedAtUtc",
                table: "QuestionBankQuestions",
                columns: new[] { "TeacherUserId", "CourseId", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_QuizAttemptQuestionGrades_QuizAttemptId_QuizQuestionId",
                table: "QuizAttemptQuestionGrades",
                columns: new[] { "QuizAttemptId", "QuizQuestionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuizAttemptQuestionGrades_QuizQuestionId",
                table: "QuizAttemptQuestionGrades",
                column: "QuizQuestionId");

            migrationBuilder.CreateIndex(
                name: "IX_QuizAttempts_StudentUserId_QuizId_CreatedAtUtc",
                table: "QuizAttempts",
                columns: new[] { "StudentUserId", "QuizId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_QuizQuestions_ImageResourceId",
                table: "QuizQuestions",
                column: "ImageResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_QuizQuestions_QuizId",
                table: "QuizQuestions",
                column: "QuizId");

            migrationBuilder.CreateIndex(
                name: "IX_Quizzes_CourseId_PublicationStatus_AvailableFromUtc",
                table: "Quizzes",
                columns: new[] { "CourseId", "PublicationStatus", "AvailableFromUtc" });
        }
    }
}
