using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCartCheckoutLifecycleHardening : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ActiveCartId",
                table: "Payments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClosedAtUtc",
                table: "Carts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ClosedByPaymentId",
                table: "Carts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Carts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ActiveCourseCartReference",
                table: "Payments",
                column: "ActiveCartId",
                unique: true,
                filter: "\"Purpose\" = 'CourseCart' AND \"Status\" = 1 AND \"ActiveCartId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_ActiveCourseCartReference",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ActiveCartId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ClosedAtUtc",
                table: "Carts");

            migrationBuilder.DropColumn(
                name: "ClosedByPaymentId",
                table: "Carts");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Carts");
        }
    }
}
