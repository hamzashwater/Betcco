using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAcademicProgrammeAuthority : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DeliveryPlans_QualificationVersionId_AcademicYearId",
                table: "DeliveryPlans");

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "UnitDefinitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "QualificationVersions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "Qualifications",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "SpecializationId",
                table: "Qualifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GradeId",
                table: "DeliveryPlans",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryPlanId",
                table: "Courses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryPlanEntryId",
                table: "CourseModules",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Qualifications_SpecializationId",
                table: "Qualifications",
                column: "SpecializationId");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPlans_GradeId",
                table: "DeliveryPlans",
                column: "GradeId");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPlans_LegacyVersionYear",
                table: "DeliveryPlans",
                columns: new[] { "QualificationVersionId", "AcademicYearId" },
                unique: true,
                filter: "\"GradeId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPlans_QualificationVersionId_AcademicYearId_GradeId",
                table: "DeliveryPlans",
                columns: new[] { "QualificationVersionId", "AcademicYearId", "GradeId" },
                unique: true,
                filter: "\"GradeId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Courses_DeliveryPlanId",
                table: "Courses",
                column: "DeliveryPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_CourseId_DeliveryPlanEntryId",
                table: "CourseModules",
                columns: new[] { "CourseId", "DeliveryPlanEntryId" },
                unique: true,
                filter: "\"DeliveryPlanEntryId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CourseModules_DeliveryPlanEntryId",
                table: "CourseModules",
                column: "DeliveryPlanEntryId");

            migrationBuilder.AddForeignKey(
                name: "FK_CourseModules_DeliveryPlanEntries_DeliveryPlanEntryId",
                table: "CourseModules",
                column: "DeliveryPlanEntryId",
                principalTable: "DeliveryPlanEntries",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Courses_DeliveryPlans_DeliveryPlanId",
                table: "Courses",
                column: "DeliveryPlanId",
                principalTable: "DeliveryPlans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_DeliveryPlans_Grades_GradeId",
                table: "DeliveryPlans",
                column: "GradeId",
                principalTable: "Grades",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Qualifications_Specializations_SpecializationId",
                table: "Qualifications",
                column: "SpecializationId",
                principalTable: "Specializations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CourseModules_DeliveryPlanEntries_DeliveryPlanEntryId",
                table: "CourseModules");

            migrationBuilder.DropForeignKey(
                name: "FK_Courses_DeliveryPlans_DeliveryPlanId",
                table: "Courses");

            migrationBuilder.DropForeignKey(
                name: "FK_DeliveryPlans_Grades_GradeId",
                table: "DeliveryPlans");

            migrationBuilder.DropForeignKey(
                name: "FK_Qualifications_Specializations_SpecializationId",
                table: "Qualifications");

            migrationBuilder.DropIndex(
                name: "IX_Qualifications_SpecializationId",
                table: "Qualifications");

            migrationBuilder.DropIndex(
                name: "IX_DeliveryPlans_GradeId",
                table: "DeliveryPlans");

            migrationBuilder.DropIndex(
                name: "IX_DeliveryPlans_LegacyVersionYear",
                table: "DeliveryPlans");

            migrationBuilder.DropIndex(
                name: "IX_DeliveryPlans_QualificationVersionId_AcademicYearId_GradeId",
                table: "DeliveryPlans");

            migrationBuilder.DropIndex(
                name: "IX_Courses_DeliveryPlanId",
                table: "Courses");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_CourseId_DeliveryPlanEntryId",
                table: "CourseModules");

            migrationBuilder.DropIndex(
                name: "IX_CourseModules_DeliveryPlanEntryId",
                table: "CourseModules");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "UnitDefinitions");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "QualificationVersions");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "Qualifications");

            migrationBuilder.DropColumn(
                name: "SpecializationId",
                table: "Qualifications");

            migrationBuilder.DropColumn(
                name: "GradeId",
                table: "DeliveryPlans");

            migrationBuilder.DropColumn(
                name: "DeliveryPlanId",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "DeliveryPlanEntryId",
                table: "CourseModules");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPlans_QualificationVersionId_AcademicYearId",
                table: "DeliveryPlans",
                columns: new[] { "QualificationVersionId", "AcademicYearId" },
                unique: true);
        }
    }
}
