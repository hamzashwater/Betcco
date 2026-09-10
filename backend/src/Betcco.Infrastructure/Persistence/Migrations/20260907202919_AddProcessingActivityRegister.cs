using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProcessingActivityRegister : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProcessingActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ProcessingPurpose = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    DataSubjectCategoriesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    PersonalDataCategoriesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    HasSpecialCategoryData = table.Column<bool>(type: "boolean", nullable: false),
                    SpecialCategoryClassification = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LegalOrProcessingBasis = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    DataSourcesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RecipientCategoriesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RelatedSystemModule = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    RetentionPolicyId = table.Column<Guid>(type: "uuid", nullable: true),
                    ApplicableConsentPurpose = table.Column<int>(type: "integer", nullable: true),
                    HasInternationalOrThirdPartyTransfer = table.Column<bool>(type: "boolean", nullable: false),
                    TransferConfiguration = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SecurityControlReferences = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OwnerRole = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    IsCurrent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    EffectiveAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReviewDueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessingActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProcessingActivities_RetentionPolicies_RetentionPolicyId",
                        column: x => x.RetentionPolicyId,
                        principalTable: "RetentionPolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingActivities_Code",
                table: "ProcessingActivities",
                column: "Code",
                unique: true,
                filter: "\"IsCurrent\"");

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingActivities_Code_Version",
                table: "ProcessingActivities",
                columns: new[] { "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingActivities_RetentionPolicyId",
                table: "ProcessingActivities",
                column: "RetentionPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingActivities_Status_EffectiveAtUtc",
                table: "ProcessingActivities",
                columns: new[] { "Status", "EffectiveAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProcessingActivities");
        }
    }
}
