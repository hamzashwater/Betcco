using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformRatings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlatformRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "text", nullable: false),
                    CourseQualityScore = table.Column<byte>(type: "smallint", nullable: false),
                    EaseOfUseScore = table.Column<byte>(type: "smallint", nullable: false),
                    SupportScore = table.Column<byte>(type: "smallint", nullable: false),
                    RecommendationScore = table.Column<byte>(type: "smallint", nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    AllowPublicDisplay = table.Column<bool>(type: "boolean", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    ModeratedByAdminUserId = table.Column<string>(type: "text", nullable: true),
                    ModeratedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ModerationReason = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformRatings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformRatings_IsPublished_AllowPublicDisplay_UpdatedAtUtc",
                table: "PlatformRatings",
                columns: new[] { "IsPublished", "AllowPublicDisplay", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformRatings_StudentUserId",
                table: "PlatformRatings",
                column: "StudentUserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformRatings");
        }
    }
}
