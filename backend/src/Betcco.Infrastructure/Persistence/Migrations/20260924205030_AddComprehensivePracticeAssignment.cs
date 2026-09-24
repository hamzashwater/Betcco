using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddComprehensivePracticeAssignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CourseAssignments_CourseModuleId_ComprehensivePractice",
                table: "CourseAssignments",
                column: "CourseModuleId",
                unique: true,
                filter: "\"CourseModuleId\" IS NOT NULL AND \"Purpose\" = 2");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CourseAssignments_CourseModuleId_ComprehensivePractice",
                table: "CourseAssignments");
        }
    }
}
