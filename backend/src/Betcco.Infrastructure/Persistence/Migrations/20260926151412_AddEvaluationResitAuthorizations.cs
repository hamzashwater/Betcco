using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEvaluationResitAuthorizations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ResitAuthorizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalEvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResitEvaluationRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    AuthorizedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorizedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ActivatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevocationReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResitAuthorizations", x => x.Id);
                    table.CheckConstraint("CK_ResitAuthorizations_ActivationPair", "((\"ResitEvaluationRequestId\" IS NULL AND \"ActivatedAtUtc\" IS NULL) OR (\"ResitEvaluationRequestId\" IS NOT NULL AND \"ActivatedAtUtc\" IS NOT NULL))");
                    table.CheckConstraint("CK_ResitAuthorizations_NotActivatedAndRevoked", "NOT (\"ActivatedAtUtc\" IS NOT NULL AND \"RevokedAtUtc\" IS NOT NULL)");
                    table.CheckConstraint("CK_ResitAuthorizations_NotSelfLinked", "\"ResitEvaluationRequestId\" IS NULL OR \"ResitEvaluationRequestId\" <> \"OriginalEvaluationRequestId\"");
                    table.ForeignKey(
                        name: "FK_ResitAuthorizations_AspNetUsers_AuthorizedByUserId",
                        column: x => x.AuthorizedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ResitAuthorizations_AspNetUsers_RevokedByUserId",
                        column: x => x.RevokedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ResitAuthorizations_EvaluationRequests_OriginalEvaluationRe~",
                        column: x => x.OriginalEvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ResitAuthorizations_EvaluationRequests_ResitEvaluationReque~",
                        column: x => x.ResitEvaluationRequestId,
                        principalTable: "EvaluationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ResitAuthorizations_AuthorizedByUserId",
                table: "ResitAuthorizations",
                column: "AuthorizedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ResitAuthorizations_OriginalEvaluationRequestId",
                table: "ResitAuthorizations",
                column: "OriginalEvaluationRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ResitAuthorizations_ResitEvaluationRequestId",
                table: "ResitAuthorizations",
                column: "ResitEvaluationRequestId",
                unique: true,
                filter: "\"ResitEvaluationRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ResitAuthorizations_RevokedByUserId",
                table: "ResitAuthorizations",
                column: "RevokedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ResitAuthorizations");
        }
    }
}
