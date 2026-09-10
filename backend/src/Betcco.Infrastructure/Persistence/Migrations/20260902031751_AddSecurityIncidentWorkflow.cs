using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSecurityIncidentWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SecurityIncidents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Summary = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ReasonCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Severity = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    DetectedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ContainedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AssignedToUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ClosureSummary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SecurityIncidents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BreachAssessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SecurityIncidentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PotentialPersonalDataImpact = table.Column<bool>(type: "boolean", nullable: false),
                    LegalConfirmationRequired = table.Column<bool>(type: "boolean", nullable: false),
                    LegalNotificationRequired = table.Column<bool>(type: "boolean", nullable: false),
                    LegalConfirmedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LegalConfirmedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    LegalDecisionSummary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BreachAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BreachAssessments_SecurityIncidents_SecurityIncidentId",
                        column: x => x.SecurityIncidentId,
                        principalTable: "SecurityIncidents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BreachNotificationDeadlines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BreachAssessmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Audience = table.Column<int>(type: "integer", nullable: false),
                    DueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RecordedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RecordNote = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BreachNotificationDeadlines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BreachNotificationDeadlines_BreachAssessments_BreachAssessm~",
                        column: x => x.BreachAssessmentId,
                        principalTable: "BreachAssessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BreachAssessments_SecurityIncidentId",
                table: "BreachAssessments",
                column: "SecurityIncidentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BreachNotificationDeadlines_Audience_DueAtUtc",
                table: "BreachNotificationDeadlines",
                columns: new[] { "Audience", "DueAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_BreachNotificationDeadlines_BreachAssessmentId_Audience",
                table: "BreachNotificationDeadlines",
                columns: new[] { "BreachAssessmentId", "Audience" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SecurityIncidents_Status_Severity_DetectedAtUtc",
                table: "SecurityIncidents",
                columns: new[] { "Status", "Severity", "DetectedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BreachNotificationDeadlines");

            migrationBuilder.DropTable(
                name: "BreachAssessments");

            migrationBuilder.DropTable(
                name: "SecurityIncidents");
        }
    }
}
