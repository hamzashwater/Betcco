using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCoursePackageAvailability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableFromUtc",
                table: "CoursePackages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableUntilUtc",
                table: "CoursePackages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoursePackages_IsPublished_AvailableFromUtc_AvailableUntilU~",
                table: "CoursePackages",
                columns: new[] { "IsPublished", "AvailableFromUtc", "AvailableUntilUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CoursePackages_IsPublished_AvailableFromUtc_AvailableUntilU~",
                table: "CoursePackages");

            migrationBuilder.DropColumn(
                name: "AvailableFromUtc",
                table: "CoursePackages");

            migrationBuilder.DropColumn(
                name: "AvailableUntilUtc",
                table: "CoursePackages");
        }
    }
}
