using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssessmentAcademicIdentity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssessmentScopeId",
                table: "EvaluationRequests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssessmentScopeSnapshotJson",
                table: "EvaluationRequests",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UnitDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QualificationVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EnglishTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ArabicTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
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
                    table.PrimaryKey("PK_UnitDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UnitDefinitions_QualificationVersions_QualificationVersionId",
                        column: x => x.QualificationVersionId,
                        principalTable: "QualificationVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    EnglishTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ArabicTitle = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
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
                    table.PrimaryKey("PK_AssessmentDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentDefinitions_UnitDefinitions_UnitDefinitionId",
                        column: x => x.UnitDefinitionId,
                        principalTable: "UnitDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentScopes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GradeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SpecializationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RubricTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_AssessmentScopes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentScopes_AssessmentDefinitions_AssessmentDefinition~",
                        column: x => x.AssessmentDefinitionId,
                        principalTable: "AssessmentDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentScopes_Grades_GradeId",
                        column: x => x.GradeId,
                        principalTable: "Grades",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentScopes_RubricTemplates_RubricTemplateId",
                        column: x => x.RubricTemplateId,
                        principalTable: "RubricTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssessmentScopes_Specializations_SpecializationId",
                        column: x => x.SpecializationId,
                        principalTable: "Specializations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationRequests_AssessmentScopeId",
                table: "EvaluationRequests",
                column: "AssessmentScopeId");

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentDefinitions_UnitDefinitionId_Code_Version",
                table: "AssessmentDefinitions",
                columns: new[] { "UnitDefinitionId", "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentScopes_AssessmentDefinitionId_GradeId_Specializat~",
                table: "AssessmentScopes",
                columns: new[] { "AssessmentDefinitionId", "GradeId", "SpecializationId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentScopes_GradeId",
                table: "AssessmentScopes",
                column: "GradeId");

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentScopes_RubricTemplateId",
                table: "AssessmentScopes",
                column: "RubricTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentScopes_SpecializationId",
                table: "AssessmentScopes",
                column: "SpecializationId");

            migrationBuilder.CreateIndex(
                name: "IX_UnitDefinitions_QualificationVersionId_Code",
                table: "UnitDefinitions",
                columns: new[] { "QualificationVersionId", "Code" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_EvaluationRequests_AssessmentScopes_AssessmentScopeId",
                table: "EvaluationRequests",
                column: "AssessmentScopeId",
                principalTable: "AssessmentScopes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EvaluationRequests_AssessmentScopes_AssessmentScopeId",
                table: "EvaluationRequests");

            migrationBuilder.DropTable(
                name: "AssessmentScopes");

            migrationBuilder.DropTable(
                name: "AssessmentDefinitions");

            migrationBuilder.DropTable(
                name: "UnitDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_EvaluationRequests_AssessmentScopeId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "AssessmentScopeId",
                table: "EvaluationRequests");

            migrationBuilder.DropColumn(
                name: "AssessmentScopeSnapshotJson",
                table: "EvaluationRequests");
        }
    }
}
