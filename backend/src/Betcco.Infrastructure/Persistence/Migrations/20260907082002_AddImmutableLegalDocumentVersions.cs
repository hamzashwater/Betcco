using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddImmutableLegalDocumentVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LegalDocuments_Slug",
                table: "LegalDocuments");

            migrationBuilder.AddColumn<bool>(
                name: "IsCurrent",
                table: "LegalDocuments",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresReacceptance",
                table: "LegalDocuments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_LegalDocuments_Slug",
                table: "LegalDocuments",
                column: "Slug",
                unique: true,
                filter: "\"IsCurrent\"");

            migrationBuilder.CreateIndex(
                name: "IX_LegalDocuments_Slug_Version",
                table: "LegalDocuments",
                columns: new[] { "Slug", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LegalDocuments_Slug",
                table: "LegalDocuments");

            migrationBuilder.DropIndex(
                name: "IX_LegalDocuments_Slug_Version",
                table: "LegalDocuments");

            migrationBuilder.DropColumn(
                name: "IsCurrent",
                table: "LegalDocuments");

            migrationBuilder.DropColumn(
                name: "RequiresReacceptance",
                table: "LegalDocuments");

            migrationBuilder.CreateIndex(
                name: "IX_LegalDocuments_Slug",
                table: "LegalDocuments",
                column: "Slug",
                unique: true);
        }
    }
}
