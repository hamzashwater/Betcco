using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCanonicalLearnUnitLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "QualificationVersionId",
                table: "Courses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UnitDefinitionId",
                table: "CourseModules",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LearningAimDefinitionId",
                table: "BtecLearningAims",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssessmentCriterionDefinitionId",
                table: "BtecCriteria",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Courses_QualificationVersionId",
                table: "Courses",
                column: "QualificationVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_CourseId_UnitDefinitionId",
                table: "CourseModules",
                columns: new[] { "CourseId", "UnitDefinitionId" },
                unique: true,
                filter: "\"UnitDefinitionId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_UnitDefinitionId",
                table: "CourseModules",
                column: "UnitDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_BtecLearningAims_CourseModuleId_LearningAimDefinitionId",
                table: "BtecLearningAims",
                columns: new[] { "CourseModuleId", "LearningAimDefinitionId" },
                unique: true,
                filter: "\"LearningAimDefinitionId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BtecLearningAims_LearningAimDefinitionId",
                table: "BtecLearningAims",
                column: "LearningAimDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_BtecCriteria_AssessmentCriterionDefinitionId",
                table: "BtecCriteria",
                column: "AssessmentCriterionDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_BtecCriteria_CourseModuleId_AssessmentCriterionDefinitionId",
                table: "BtecCriteria",
                columns: new[] { "CourseModuleId", "AssessmentCriterionDefinitionId" },
                unique: true,
                filter: "\"AssessmentCriterionDefinitionId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_BtecCriteria_AssessmentCriterionDefinitions_AssessmentCrite~",
                table: "BtecCriteria",
                column: "AssessmentCriterionDefinitionId",
                principalTable: "AssessmentCriterionDefinitions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_BtecLearningAims_LearningAimDefinitions_LearningAimDefiniti~",
                table: "BtecLearningAims",
                column: "LearningAimDefinitionId",
                principalTable: "LearningAimDefinitions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CourseModules_UnitDefinitions_UnitDefinitionId",
                table: "CourseModules",
                column: "UnitDefinitionId",
                principalTable: "UnitDefinitions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Courses_QualificationVersions_QualificationVersionId",
                table: "Courses",
                column: "QualificationVersionId",
                principalTable: "QualificationVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BtecCriteria_AssessmentCriterionDefinitions_AssessmentCrite~",
                table: "BtecCriteria");

            migrationBuilder.DropForeignKey(
                name: "FK_BtecLearningAims_LearningAimDefinitions_LearningAimDefiniti~",
                table: "BtecLearningAims");

            migrationBuilder.DropForeignKey(
                name: "FK_CourseModules_UnitDefinitions_UnitDefinitionId",
                table: "CourseModules");

            migrationBuilder.DropForeignKey(
                name: "FK_Courses_QualificationVersions_QualificationVersionId",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_Courses_QualificationVersionId",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_CourseId_UnitDefinitionId",
                table: "CourseModules");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_UnitDefinitionId",
                table: "CourseModules");

            migrationBuilder.DropIndex(
                name: "IX_BtecLearningAims_CourseModuleId_LearningAimDefinitionId",
                table: "BtecLearningAims");

            migrationBuilder.DropIndex(
                name: "IX_BtecLearningAims_LearningAimDefinitionId",
                table: "BtecLearningAims");

            migrationBuilder.DropIndex(
                name: "IX_BtecCriteria_AssessmentCriterionDefinitionId",
                table: "BtecCriteria");

            migrationBuilder.DropIndex(
                name: "IX_BtecCriteria_CourseModuleId_AssessmentCriterionDefinitionId",
                table: "BtecCriteria");

            migrationBuilder.DropColumn(
                name: "QualificationVersionId",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "UnitDefinitionId",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "LearningAimDefinitionId",
                table: "BtecLearningAims");

            migrationBuilder.DropColumn(
                name: "AssessmentCriterionDefinitionId",
                table: "BtecCriteria");
        }
    }
}
