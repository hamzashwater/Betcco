using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQuestionBankBtecContext : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BtecLearningAimId",
                table: "QuestionBankQuestions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CourseModuleId",
                table: "QuestionBankQuestions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubjectId",
                table: "QuestionBankQuestions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_BtecLearningAimId",
                table: "QuestionBankQuestions",
                column: "BtecLearningAimId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_CourseModuleId",
                table: "QuestionBankQuestions",
                column: "CourseModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_SubjectId",
                table: "QuestionBankQuestions",
                column: "SubjectId");

            migrationBuilder.CreateIndex(
                name: "IX_QuestionBankQuestions_TeacherUserId_CourseId_SubjectId_Cour~",
                table: "QuestionBankQuestions",
                columns: new[] { "TeacherUserId", "CourseId", "SubjectId", "CourseModuleId", "BtecLearningAimId" });

            migrationBuilder.AddForeignKey(
                name: "FK_QuestionBankQuestions_BtecLearningAims_BtecLearningAimId",
                table: "QuestionBankQuestions",
                column: "BtecLearningAimId",
                principalTable: "BtecLearningAims",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QuestionBankQuestions_CourseModules_CourseModuleId",
                table: "QuestionBankQuestions",
                column: "CourseModuleId",
                principalTable: "CourseModules",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QuestionBankQuestions_Subjects_SubjectId",
                table: "QuestionBankQuestions",
                column: "SubjectId",
                principalTable: "Subjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QuestionBankQuestions_BtecLearningAims_BtecLearningAimId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropForeignKey(
                name: "FK_QuestionBankQuestions_CourseModules_CourseModuleId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropForeignKey(
                name: "FK_QuestionBankQuestions_Subjects_SubjectId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropIndex(
                name: "IX_QuestionBankQuestions_BtecLearningAimId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropIndex(
                name: "IX_QuestionBankQuestions_CourseModuleId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropIndex(
                name: "IX_QuestionBankQuestions_SubjectId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropIndex(
                name: "IX_QuestionBankQuestions_TeacherUserId_CourseId_SubjectId_Cour~",
                table: "QuestionBankQuestions");

            migrationBuilder.DropColumn(
                name: "BtecLearningAimId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropColumn(
                name: "CourseModuleId",
                table: "QuestionBankQuestions");

            migrationBuilder.DropColumn(
                name: "SubjectId",
                table: "QuestionBankQuestions");
        }
    }
}
