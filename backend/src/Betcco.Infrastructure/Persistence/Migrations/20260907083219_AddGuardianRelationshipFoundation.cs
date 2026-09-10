using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGuardianRelationshipFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GuardianInvitations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RecipientEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AcceptedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AcceptedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RevocationReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuardianInvitations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GuardianRelationships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GuardianInvitationId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GuardianUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ActivatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RevocationReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuardianRelationships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuardianRelationships_GuardianInvitations_GuardianInvitatio~",
                        column: x => x.GuardianInvitationId,
                        principalTable: "GuardianInvitations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GuardianConsents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GuardianRelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GuardianUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Capability = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Decision = table.Column<int>(type: "integer", nullable: false),
                    DecidedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ActorUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DecisionReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    LegalDocumentId = table.Column<Guid>(type: "uuid", nullable: true),
                    LegalDocumentVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CaptureMethod = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuardianConsents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuardianConsents_GuardianRelationships_GuardianRelationship~",
                        column: x => x.GuardianRelationshipId,
                        principalTable: "GuardianRelationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GuardianConsents_LegalDocuments_LegalDocumentId",
                        column: x => x.LegalDocumentId,
                        principalTable: "LegalDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuardianConsents_GuardianRelationshipId_Capability_DecidedA~",
                table: "GuardianConsents",
                columns: new[] { "GuardianRelationshipId", "Capability", "DecidedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_GuardianConsents_GuardianUserId_StudentUserId_Capability_De~",
                table: "GuardianConsents",
                columns: new[] { "GuardianUserId", "StudentUserId", "Capability", "DecidedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_GuardianConsents_LegalDocumentId",
                table: "GuardianConsents",
                column: "LegalDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_GuardianInvitations_RecipientEmail_Status_ExpiresAtUtc",
                table: "GuardianInvitations",
                columns: new[] { "RecipientEmail", "Status", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_GuardianInvitations_StudentUserId_Status",
                table: "GuardianInvitations",
                columns: new[] { "StudentUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_GuardianInvitations_TokenHash",
                table: "GuardianInvitations",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuardianRelationships_GuardianInvitationId",
                table: "GuardianRelationships",
                column: "GuardianInvitationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuardianRelationships_GuardianUserId_StudentUserId_Status",
                table: "GuardianRelationships",
                columns: new[] { "GuardianUserId", "StudentUserId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GuardianConsents");

            migrationBuilder.DropTable(
                name: "GuardianRelationships");

            migrationBuilder.DropTable(
                name: "GuardianInvitations");
        }
    }
}
