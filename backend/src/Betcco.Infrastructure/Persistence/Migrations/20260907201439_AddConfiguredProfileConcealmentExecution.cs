using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddConfiguredProfileConcealmentExecution : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ExecutionCategory",
                table: "RetentionPolicies",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ExecutionCategory",
                table: "PrivacyExecutionJobs",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExecutionCategory",
                table: "RetentionPolicies");

            migrationBuilder.DropColumn(
                name: "ExecutionCategory",
                table: "PrivacyExecutionJobs");
        }
    }
}
