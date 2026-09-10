using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJoFotaraFiscalAdapterFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FiscalDocumentSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreditNoteId = table.Column<Guid>(type: "uuid", nullable: true),
                    Provider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DocumentType = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    BusinessIdentity = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    CorrelationReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AttemptedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConfirmedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ProviderReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ProviderStatusCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FailureCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalDocumentSubmissions", x => x.Id);
                    table.CheckConstraint("CK_FiscalDocumentSubmissions_ExactlyOneSource", "(\"InvoiceId\" IS NOT NULL AND \"CreditNoteId\" IS NULL) OR (\"InvoiceId\" IS NULL AND \"CreditNoteId\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_FiscalDocumentSubmissions_CreditNotes_CreditNoteId",
                        column: x => x.CreditNoteId,
                        principalTable: "CreditNotes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FiscalDocumentSubmissions_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FiscalDocumentSubmissionTransitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalDocumentSubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<int>(type: "integer", nullable: false),
                    NewStatus = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<int>(type: "integer", nullable: false),
                    ActorContext = table.Column<string>(type: "text", nullable: true),
                    ProviderReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ResultCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CorrelationReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalDocumentSubmissionTransitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FiscalDocumentSubmissionTransitions_FiscalDocumentSubmissio~",
                        column: x => x.FiscalDocumentSubmissionId,
                        principalTable: "FiscalDocumentSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FiscalDocumentSubmissions_BusinessIdentity",
                table: "FiscalDocumentSubmissions",
                column: "BusinessIdentity",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FiscalDocumentSubmissions_CreditNoteId",
                table: "FiscalDocumentSubmissions",
                column: "CreditNoteId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalDocumentSubmissions_InvoiceId",
                table: "FiscalDocumentSubmissions",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalDocumentSubmissions_Status_AttemptedAtUtc",
                table: "FiscalDocumentSubmissions",
                columns: new[] { "Status", "AttemptedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_FiscalDocumentSubmissionTransitions_FiscalDocumentSubmissio~",
                table: "FiscalDocumentSubmissionTransitions",
                columns: new[] { "FiscalDocumentSubmissionId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FiscalDocumentSubmissionTransitions");

            migrationBuilder.DropTable(
                name: "FiscalDocumentSubmissions");
        }
    }
}
