using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseAssignmentSubmissionPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowResubmission",
                table: "CourseAssignments",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "AllowedFileExtensionsJson",
                table: "CourseAssignments",
                type: "text",
                nullable: false,
                defaultValue: "[\".pdf\",\".docx\",\".xlsx\",\".pptx\",\".png\",\".jpg\",\".jpeg\",\".zip\",\".txt\"]");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableFromUtc",
                table: "CourseAssignments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxFileSizeBytes",
                table: "CourseAssignments",
                type: "integer",
                nullable: false,
                defaultValue: 104857600);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AllowResubmission",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "AllowedFileExtensionsJson",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "AvailableFromUtc",
                table: "CourseAssignments");

            migrationBuilder.DropColumn(
                name: "MaxFileSizeBytes",
                table: "CourseAssignments");
        }
    }
}
