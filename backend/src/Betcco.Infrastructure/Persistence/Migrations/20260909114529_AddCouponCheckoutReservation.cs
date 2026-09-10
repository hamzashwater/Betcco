using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCouponCheckoutReservation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CouponId",
                table: "Payments",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "Payments" AS payment
                SET "CouponId" = coupon."Id"
                FROM "Coupons" AS coupon
                WHERE payment."CouponId" IS NULL
                  AND payment."CouponCode" IS NOT NULL
                  AND upper(payment."CouponCode") = upper(coupon."Code");

                UPDATE "Coupons" AS coupon
                SET "RedemptionCount" = coupon."RedemptionCount" + reservations."Count"
                FROM (
                    SELECT payment."CouponId", count(*)::integer AS "Count"
                    FROM "Payments" AS payment
                    LEFT JOIN "CouponRedemptions" AS redemption ON redemption."PaymentId" = payment."Id"
                    WHERE payment."CouponId" IS NOT NULL
                      AND payment."Status" = 1
                      AND redemption."Id" IS NULL
                    GROUP BY payment."CouponId"
                ) AS reservations
                WHERE coupon."Id" = reservations."CouponId";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_CouponId",
                table: "Payments",
                column: "CouponId");

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_Coupons_CouponId",
                table: "Payments",
                column: "CouponId",
                principalTable: "Coupons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payments_Coupons_CouponId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_CouponId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "CouponId",
                table: "Payments");
        }
    }
}
