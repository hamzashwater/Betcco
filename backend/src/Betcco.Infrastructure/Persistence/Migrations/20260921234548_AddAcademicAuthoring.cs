using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAcademicAuthoring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PublishedAtUtc",
                table: "UnitDefinitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceReference",
                table: "UnitDefinitions",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PublishedAtUtc",
                table: "AssessmentScopes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PublishedAtUtc",
                table: "AssessmentDefinitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceReference",
                table: "AssessmentDefinitions",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_AssessmentDefinitions_Id_UnitDefinitionId",
                table: "AssessmentDefinitions",
                columns: new[] { "Id", "UnitDefinitionId" });

            migrationBuilder.CreateTable(
                name: "LearningAimDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ArabicTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    EnglishTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ArabicDescription = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    EnglishDescription = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    SourceReference = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningAimDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_LearningAimDefinitions_Id_UnitDefinitionId", x => new { x.Id, x.UnitDefinitionId });
                    table.ForeignKey(
                        name: "FK_LearningAimDefinitions_UnitDefinitions_UnitDefinitionId",
                        column: x => x.UnitDefinitionId,
                        principalTable: "UnitDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentCriterionDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LearningAimDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Band = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ArabicDescription = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    EnglishDescription = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    SourceReference = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentCriterionDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_AssessmentCriterionDefinitions_Id_LearningAimDefinitionId", x => new { x.Id, x.LearningAimDefinitionId });
                    table.CheckConstraint("CK_AssessmentCriterionDefinitions_Band", "\"Band\" IN ('Pass', 'Merit', 'Distinction')");
                    table.ForeignKey(
                        name: "FK_AssessmentCriterionDefinitions_LearningAimDefinitions_Learn~",
                        column: x => x.LearningAimDefinitionId,
                        principalTable: "LearningAimDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentDefinitionAims",
                columns: table => new
                {
                    AssessmentDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LearningAimDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentDefinitionAims", x => new { x.AssessmentDefinitionId, x.LearningAimDefinitionId });
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitionAims_AssessmentDefinitions_AssessmentDe~",
                        columns: x => new { x.AssessmentDefinitionId, x.UnitDefinitionId },
                        principalTable: "AssessmentDefinitions",
                        principalColumns: new[] { "Id", "UnitDefinitionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitionAims_LearningAimDefinitions_LearningAim~",
                        columns: x => new { x.LearningAimDefinitionId, x.UnitDefinitionId },
                        principalTable: "LearningAimDefinitions",
                        principalColumns: new[] { "Id", "UnitDefinitionId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentDefinitionCriteria",
                columns: table => new
                {
                    AssessmentDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentCriterionDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LearningAimDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentDefinitionCriteria", x => new { x.AssessmentDefinitionId, x.AssessmentCriterionDefinitionId });
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitionCriteria_AssessmentCriterionDefinitions~",
                        columns: x => new { x.AssessmentCriterionDefinitionId, x.LearningAimDefinitionId },
                        principalTable: "AssessmentCriterionDefinitions",
                        principalColumns: new[] { "Id", "LearningAimDefinitionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitionCriteria_AssessmentDefinitionAims_Asses~",
                        columns: x => new { x.AssessmentDefinitionId, x.LearningAimDefinitionId },
                        principalTable: "AssessmentDefinitionAims",
                        principalColumns: new[] { "AssessmentDefinitionId", "LearningAimDefinitionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitionCriteria_AssessmentDefinitions_Assessme~",
                        column: x => x.AssessmentDefinitionId,
                        principalTable: "AssessmentDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentCriterionDefinitions_LearningAimDefinitionId_Code",
                table: "AssessmentCriterionDefinitions",
                columns: new[] { "LearningAimDefinitionId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentDefinitionAims_AssessmentDefinitionId_UnitDefinit~",
                table: "AssessmentDefinitionAims",
                columns: new[] { "AssessmentDefinitionId", "UnitDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentDefinitionAims_LearningAimDefinitionId_UnitDefini~",
                table: "AssessmentDefinitionAims",
                columns: new[] { "LearningAimDefinitionId", "UnitDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentDefinitionCriteria_AssessmentCriterionDefinitionI~",
                table: "AssessmentDefinitionCriteria",
                columns: new[] { "AssessmentCriterionDefinitionId", "LearningAimDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentDefinitionCriteria_AssessmentDefinitionId_Learnin~",
                table: "AssessmentDefinitionCriteria",
                columns: new[] { "AssessmentDefinitionId", "LearningAimDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningAimDefinitions_UnitDefinitionId_Code",
                table: "LearningAimDefinitions",
                columns: new[] { "UnitDefinitionId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssessmentDefinitionCriteria");

            migrationBuilder.DropTable(
                name: "AssessmentCriterionDefinitions");

            migrationBuilder.DropTable(
                name: "AssessmentDefinitionAims");

            migrationBuilder.DropTable(
                name: "LearningAimDefinitions");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_AssessmentDefinitions_Id_UnitDefinitionId",
                table: "AssessmentDefinitions");

            migrationBuilder.DropColumn(
                name: "PublishedAtUtc",
                table: "UnitDefinitions");

            migrationBuilder.DropColumn(
                name: "SourceReference",
                table: "UnitDefinitions");

            migrationBuilder.DropColumn(
                name: "PublishedAtUtc",
                table: "AssessmentScopes");

            migrationBuilder.DropColumn(
                name: "PublishedAtUtc",
                table: "AssessmentDefinitions");

            migrationBuilder.DropColumn(
                name: "SourceReference",
                table: "AssessmentDefinitions");
        }
    }
}
