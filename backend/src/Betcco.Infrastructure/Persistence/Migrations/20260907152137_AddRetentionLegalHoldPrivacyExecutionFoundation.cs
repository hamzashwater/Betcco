using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRetentionLegalHoldPrivacyExecutionFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LegalHolds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ScopePolicyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
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
                    table.PrimaryKey("PK_LegalHolds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RetentionPolicies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PolicyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DataCategoryOrPurpose = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    RetentionRule = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    LegalOrBusinessBasis = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ActionAfterExpiry = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsCurrent = table.Column<bool>(type: "boolean", nullable: false),
                    EffectiveAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RetentionPolicies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PrivacyExecutionJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DataSubjectRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RetentionPolicyId = table.Column<Guid>(type: "uuid", nullable: false),
                    RetentionPolicyVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RetentionRuleSnapshot = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ActionAfterExpiry = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    EligibilityReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    EvaluatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EvaluatedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BlockingLegalHoldId = table.Column<Guid>(type: "uuid", nullable: true),
                    FailureDetail = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrivacyExecutionJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrivacyExecutionJobs_DataSubjectRequests_DataSubjectRequest~",
                        column: x => x.DataSubjectRequestId,
                        principalTable: "DataSubjectRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PrivacyExecutionJobs_LegalHolds_BlockingLegalHoldId",
                        column: x => x.BlockingLegalHoldId,
                        principalTable: "LegalHolds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PrivacyExecutionJobs_RetentionPolicies_RetentionPolicyId",
                        column: x => x.RetentionPolicyId,
                        principalTable: "RetentionPolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LegalHolds_SubjectUserId_Status_ScopePolicyKey",
                table: "LegalHolds",
                columns: new[] { "SubjectUserId", "Status", "ScopePolicyKey" });

            migrationBuilder.CreateIndex(
                name: "IX_PrivacyExecutionJobs_BlockingLegalHoldId",
                table: "PrivacyExecutionJobs",
                column: "BlockingLegalHoldId");

            migrationBuilder.CreateIndex(
                name: "IX_PrivacyExecutionJobs_DataSubjectRequestId_RetentionPolicyId",
                table: "PrivacyExecutionJobs",
                columns: new[] { "DataSubjectRequestId", "RetentionPolicyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrivacyExecutionJobs_RetentionPolicyId",
                table: "PrivacyExecutionJobs",
                column: "RetentionPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_PrivacyExecutionJobs_SubjectUserId_Status_UpdatedAtUtc",
                table: "PrivacyExecutionJobs",
                columns: new[] { "SubjectUserId", "Status", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_RetentionPolicies_IsEnabled_IsCurrent_EffectiveAtUtc",
                table: "RetentionPolicies",
                columns: new[] { "IsEnabled", "IsCurrent", "EffectiveAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_RetentionPolicies_PolicyKey",
                table: "RetentionPolicies",
                column: "PolicyKey",
                unique: true,
                filter: "\"IsCurrent\"");

            migrationBuilder.CreateIndex(
                name: "IX_RetentionPolicies_PolicyKey_Version",
                table: "RetentionPolicies",
                columns: new[] { "PolicyKey", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrivacyExecutionJobs");

            migrationBuilder.DropTable(
                name: "LegalHolds");

            migrationBuilder.DropTable(
                name: "RetentionPolicies");
        }
    }
}
