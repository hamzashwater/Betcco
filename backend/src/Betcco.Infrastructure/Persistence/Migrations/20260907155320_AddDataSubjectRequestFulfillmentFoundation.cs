using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDataSubjectRequestFulfillmentFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DataProcessingRestrictions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DataSubjectRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProcessingScope = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ReleasedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReleasedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ReleaseReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProcessingRestrictions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DataProcessingRestrictions_DataSubjectRequests_DataSubjectR~",
                        column: x => x.DataSubjectRequestId,
                        principalTable: "DataSubjectRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DataSubjectFulfillments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DataSubjectRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestType = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    EvidenceJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    GeneratedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    GeneratedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ReleasedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReleasedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataSubjectFulfillments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DataSubjectFulfillments_DataSubjectRequests_DataSubjectRequ~",
                        column: x => x.DataSubjectRequestId,
                        principalTable: "DataSubjectRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DataProcessingRestrictions_DataSubjectRequestId",
                table: "DataProcessingRestrictions",
                column: "DataSubjectRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DataProcessingRestrictions_SubjectUserId_Status_ProcessingS~",
                table: "DataProcessingRestrictions",
                columns: new[] { "SubjectUserId", "Status", "ProcessingScope" });

            migrationBuilder.CreateIndex(
                name: "IX_DataSubjectFulfillments_DataSubjectRequestId",
                table: "DataSubjectFulfillments",
                column: "DataSubjectRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DataSubjectFulfillments_RequestType_Status_GeneratedAtUtc",
                table: "DataSubjectFulfillments",
                columns: new[] { "RequestType", "Status", "GeneratedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DataProcessingRestrictions");

            migrationBuilder.DropTable(
                name: "DataSubjectFulfillments");
        }
    }
}
