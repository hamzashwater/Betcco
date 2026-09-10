using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubprocessorRegister : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SubprocessorRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ProviderLegalEntityName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ServiceDescription = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ProcessingPurpose = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    PersonalDataCategoriesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    DataSubjectCategoriesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    HostingRegionOrCountry = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    HasInternationalOrThirdPartyTransfer = table.Column<bool>(type: "boolean", nullable: false),
                    TransferConfiguration = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RelatedSystemModule = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    ContractDpaStatusOrReference = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SecurityControlReferences = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RetentionDeletionCommitments = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    HasFurtherSubprocessor = table.Column<bool>(type: "boolean", nullable: false),
                    FurtherSubprocessorConfiguration = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
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
                    table.PrimaryKey("PK_SubprocessorRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubprocessorProcessingActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubprocessorRecordId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProcessingActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubprocessorProcessingActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubprocessorProcessingActivities_ProcessingActivities_Proce~",
                        column: x => x.ProcessingActivityId,
                        principalTable: "ProcessingActivities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SubprocessorProcessingActivities_SubprocessorRecords_Subpro~",
                        column: x => x.SubprocessorRecordId,
                        principalTable: "SubprocessorRecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SubprocessorProcessingActivities_ProcessingActivityId",
                table: "SubprocessorProcessingActivities",
                column: "ProcessingActivityId");

            migrationBuilder.CreateIndex(
                name: "IX_SubprocessorProcessingActivities_SubprocessorRecordId_Proce~",
                table: "SubprocessorProcessingActivities",
                columns: new[] { "SubprocessorRecordId", "ProcessingActivityId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubprocessorRecords_Code",
                table: "SubprocessorRecords",
                column: "Code",
                unique: true,
                filter: "\"IsCurrent\"");

            migrationBuilder.CreateIndex(
                name: "IX_SubprocessorRecords_Code_Version",
                table: "SubprocessorRecords",
                columns: new[] { "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubprocessorRecords_Status_EffectiveAtUtc",
                table: "SubprocessorRecords",
                columns: new[] { "Status", "EffectiveAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SubprocessorProcessingActivities");

            migrationBuilder.DropTable(
                name: "SubprocessorRecords");
        }
    }
}
