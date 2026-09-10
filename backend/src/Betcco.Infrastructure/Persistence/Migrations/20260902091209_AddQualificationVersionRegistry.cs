using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQualificationVersionRegistry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "QualificationVersionId",
                table: "RubricTemplates",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QualificationVersionId",
                table: "EvaluationRequests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QualificationVersionSnapshotJson",
                table: "EvaluationRequests",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Qualifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ArabicName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    EnglishName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Qualifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QualificationVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QualificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SourceReference = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    EffectiveFromUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EffectiveUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualificationVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualificationVersions_Qualifications_QualificationId",
                        column: x => x.QualificationId,
                        principalTable: "Qualifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RubricTemplates_QualificationVersionId",
                table: "RubricTemplates",
                column: "QualificationVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRequests_QualificationVersionId",
                table: "EvaluationRequests",
                column: "QualificationVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_Qualifications_Code",
                table: "Qualifications",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QualificationVersions_QualificationId_VersionCode",
                table: "QualificationVersions",
                columns: new[] { "QualificationId", "VersionCode" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RubricTemplates_QualificationVersions_QualificationVersionId",
                table: "RubricTemplates",
                column: "QualificationVersionId",
                principalTable: "QualificationVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RubricTemplates_QualificationVersions_QualificationVersionId",
                table: "RubricTemplates");

            migrationBuilder.DropTable(
                name: "QualificationVersions");

            migrationBuilder.DropTable(
                name: "Qualifications");

            migrationBuilder.DropIndex(
                name: "IX_RubricTemplates_QualificationVersionId",
                table: "RubricTemplates");

            migrationBuilder.DropIndex(
                name: "IX_EvaluationRequests_QualificationVersionId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "QualificationVersionId",
                table: "RubricTemplates");

            migrationBuilder.DropColumn(
                name: "QualificationVersionId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "QualificationVersionSnapshotJson",
                table: "EvaluationRequests");
        }
    }
}
