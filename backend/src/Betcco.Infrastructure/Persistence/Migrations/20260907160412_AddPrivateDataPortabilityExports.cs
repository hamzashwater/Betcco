using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPrivateDataPortabilityExports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DataPortabilityExports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DataSubjectRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    DataSubjectFulfillmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubjectUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    RequestedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RequestedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GeneratedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    GeneratedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ExportFormat = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ExportVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReleasedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReleasedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DownloadedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DownloadedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DownloadCount = table.Column<int>(type: "integer", nullable: false),
                    FailureReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataPortabilityExports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DataPortabilityExports_DataSubjectFulfillments_DataSubjectF~",
                        column: x => x.DataSubjectFulfillmentId,
                        principalTable: "DataSubjectFulfillments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DataPortabilityExports_DataSubjectRequests_DataSubjectReque~",
                        column: x => x.DataSubjectRequestId,
                        principalTable: "DataSubjectRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DataPortabilityExports_DataSubjectFulfillmentId",
                table: "DataPortabilityExports",
                column: "DataSubjectFulfillmentId");

            migrationBuilder.CreateIndex(
                name: "IX_DataPortabilityExports_DataSubjectRequestId",
                table: "DataPortabilityExports",
                column: "DataSubjectRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DataPortabilityExports_SubjectUserId_ExpiresAtUtc",
                table: "DataPortabilityExports",
                columns: new[] { "SubjectUserId", "ExpiresAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DataPortabilityExports");
        }
    }
}
