using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLiveAttendanceStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "MarkedAtUtc",
                table: "LiveSessionAttendances",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MarkedByUserId",
                table: "LiveSessionAttendances",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "LiveSessionAttendances",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MarkedAtUtc",
                table: "LiveSessionAttendances");

            migrationBuilder.DropColumn(
                name: "MarkedByUserId",
                table: "LiveSessionAttendances");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "LiveSessionAttendances");
        }
    }
}
