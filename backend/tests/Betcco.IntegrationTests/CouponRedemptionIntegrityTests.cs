using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace Betcco.IntegrationTests;

public sealed class CouponRedemptionIntegrityTests
{
    [Fact]
    public async Task Concurrent_checkouts_cannot_exceed_global_coupon_limit()
    {
        var root = new InMemoryDatabaseRoot();
        var database = Guid.NewGuid().ToString();
        await SeedAsync(CreateDb(database, root), new Coupon { Code = "ONE", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true }, ["student-a", "student-b"]);
        await using var first = CreateDb(database, root);
        await using var second = CreateDb(database, root);
        var outcomes = await Task.WhenAll(
            TryCheckoutAsync(first, "student-a", "ONE", "global-a"),
            TryCheckoutAsync(second, "student-b", "ONE", "global-b"));

        await using var verify = CreateDb(database, root);
        Assert.Single(outcomes, result => result is not null);
        Assert.Single(outcomes, result => result is null);
        Assert.Equal(1, (await verify.Coupons.SingleAsync()).RedemptionCount);
        Assert.Empty(await verify.CouponRedemptions.ToListAsync());
        Assert.Single(await verify.Payments.Where(item => item.Status == PaymentStatus.Processing && item.CouponId != null).ToListAsync());
    }

    [Fact]
    public async Task Concurrent_same_user_checkouts_cannot_bypass_per_user_coupon_limit()
    {
        var root = new InMemoryDatabaseRoot();
        var database = Guid.NewGuid().ToString();
        await SeedAsync(CreateDb(database, root), new Coupon { Code = "USERONE", PercentageOff = 25m, MaxRedemptions = 5, MaxRedemptionsPerUser = 1, IsActive = true }, ["student", "student"]);
        await using var first = CreateDb(database, root);
        await using var second = CreateDb(database, root);
        var outcomes = await Task.WhenAll(
            TryCheckoutAsync(first, "student", "USERONE", "user-a", 0),
            TryCheckoutAsync(second, "student", "USERONE", "user-b", 1));

        await using var verify = CreateDb(database, root);
        Assert.Single(outcomes, result => result is not null);
        Assert.Single(outcomes, result => result is null);
        Assert.Equal(1, (await verify.Coupons.SingleAsync()).RedemptionCount);
        Assert.Empty(await verify.CouponRedemptions.Where(item => item.UserId == "student").ToListAsync());
        Assert.Single(await verify.Payments.Where(item => item.Status == PaymentStatus.Processing && item.CouponId != null).ToListAsync());
    }

    [Fact]
    public async Task Coupon_is_reserved_by_server_at_checkout_and_consumed_only_after_trusted_confirmation()
    {
        await using var db = CreateDb();
        var coupon = new Coupon { Code = "SAVE25", PercentageOff = 25m, IsActive = true };
        await SeedAsync(db, coupon, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "SAVE25", "timing");

        Assert.Equal(25m, checkout.Discount);
        Assert.Equal(75m, checkout.Total);
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        var reservedCoupon = await db.Coupons.SingleAsync();
        var reservedPayment = await db.Payments.SingleAsync(item => item.Id == checkout.PaymentId);
        Assert.Equal(1, reservedCoupon.RedemptionCount);
        Assert.Equal(reservedCoupon.Id, reservedPayment.CouponId);
        Assert.Equal(reservedCoupon.Code, reservedPayment.CouponCode);

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "timing-confirm"));
        Assert.Single(await db.CouponRedemptions.ToListAsync());
        Assert.Equal(1, (await db.Coupons.SingleAsync()).RedemptionCount);

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "timing-confirm"));
        Assert.Single(await db.CouponRedemptions.ToListAsync());
    }

    [Fact]
    public async Task Coupon_expiring_after_checkout_does_not_invalidate_the_authoritative_payment_snapshot()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "LATEEXPIRY", FixedAmountOff = 20m, EndsAtUtc = DateTimeOffset.UtcNow.AddHours(1), IsActive = true }, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "LATEEXPIRY", "late-expiry");
        var coupon = await db.Coupons.SingleAsync();
        coupon.EndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "late-expiry-confirm"));
        await AssertConfirmedCommercialEffectsAsync(db, checkout.PaymentId);
    }

    [Fact]
    public async Task Coupon_disabled_after_checkout_does_not_invalidate_the_authoritative_payment_snapshot()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "LATEDISABLE", FixedAmountOff = 20m, IsActive = true }, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "LATEDISABLE", "late-disable");
        var coupon = await db.Coupons.SingleAsync();
        coupon.IsActive = false;
        await db.SaveChangesAsync();

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "late-disable-confirm"));
        await AssertConfirmedCommercialEffectsAsync(db, checkout.PaymentId);
    }

    [Fact]
    public async Task Coupon_usage_state_changing_after_checkout_does_not_invalidate_the_authoritative_payment_snapshot()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "LATEUSAGE", FixedAmountOff = 20m, MaxRedemptions = 1, IsActive = true }, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "LATEUSAGE", "late-usage");
        var coupon = await db.Coupons.SingleAsync();
        coupon.RedemptionCount = coupon.MaxRedemptions!.Value;
        await db.SaveChangesAsync();

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "late-usage-confirm"));
        await AssertConfirmedCommercialEffectsAsync(db, checkout.PaymentId);
    }

    [Fact]
    public async Task Coupon_code_changing_after_checkout_does_not_break_the_immutable_coupon_identity()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "ORIGINAL", FixedAmountOff = 20m, IsActive = true }, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "ORIGINAL", "renamed-code");
        var coupon = await db.Coupons.SingleAsync();
        coupon.Code = "RENAMED";
        await db.SaveChangesAsync();

        Assert.True(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(checkout.PaymentId, "renamed-code-confirm"));
        await AssertConfirmedCommercialEffectsAsync(db, checkout.PaymentId);
        Assert.Equal(coupon.Id, (await db.CouponRedemptions.SingleAsync()).CouponId);
        var payment = await db.Payments.SingleAsync();
        Assert.Equal("ORIGINAL", payment.CouponCode);

        payment.CouponCode = "FORGED";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        await db.Entry(payment).ReloadAsync();
        payment.CouponId = null;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Another_user_cannot_create_a_coupon_payment_from_someone_elses_cart()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "OWNERONLY", PercentageOff = 50m, IsActive = true }, ["owner"]);
        var ownerCart = await db.Carts.SingleAsync();

        var checkout = await new CommerceService(db, new FakePaymentProvider()).CreateCourseCheckoutAsync("other", ownerCart.OwnerKey, "OWNERONLY", "Card", "other-owner-key");

        Assert.Null(checkout);
        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        Assert.Equal(0, (await db.Coupons.SingleAsync()).RedemptionCount);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public async Task Disabled_or_expired_coupon_is_rejected_before_checkout(bool active, bool expired)
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "INVALID", PercentageOff = 50m, IsActive = active, EndsAtUtc = expired ? DateTimeOffset.UtcNow.AddMinutes(-1) : null }, ["student"]);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => CheckoutAsync(db, "student", "INVALID", $"invalid-{active}-{expired}"));

        Assert.Equal("The coupon is invalid or unavailable.", exception.Message);
        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
    }

    [Fact]
    public async Task Cancelled_payment_does_not_consume_coupon_and_paid_snapshot_survives_later_coupon_edit()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "SNAPSHOT", FixedAmountOff = 20m, MaxRedemptions = 2, IsActive = true }, ["cancelled", "paid"]);
        var cancelled = await CheckoutAsync(db, "cancelled", "SNAPSHOT", "cancelled");
        var commerce = new CommerceService(db, new FakePaymentProvider());
        Assert.True((await commerce.CancelProcessingPaymentAsync("cancelled", cancelled.PaymentId)).IsCancelled);
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        Assert.Equal(0, (await db.Coupons.SingleAsync()).RedemptionCount);

        var paid = await CheckoutAsync(db, "paid", "SNAPSHOT", "paid");
        Assert.True(await commerce.ConfirmFakeWebhookAsync(paid.PaymentId, "snapshot-confirm"));
        var coupon = await db.Coupons.SingleAsync();
        coupon.FixedAmountOff = 1m;
        coupon.IsActive = false;
        await db.SaveChangesAsync();

        var payment = await db.Payments.SingleAsync(item => item.Id == paid.PaymentId);
        Assert.Equal(20m, payment.Discount);
        Assert.Equal(80m, payment.Total);
        Assert.Equal(1, (await db.Coupons.SingleAsync()).RedemptionCount);
    }

    [Fact]
    public async Task Refund_does_not_restore_historical_coupon_redemption_without_business_policy()
    {
        await using var db = CreateDb();
        await SeedAsync(db, new Coupon { Code = "NORESTORE", FixedAmountOff = 10m, IsActive = true }, ["student"]);
        var checkout = await CheckoutAsync(db, "student", "NORESTORE", "refund");
        var commerce = new CommerceService(db, new FakePaymentProvider());
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "refund-confirm"));

        var refund = await new RefundService(db).RecordInternalRefundAsync("finance", new RecordInternalRefund(checkout.PaymentId, 90m, "JOD", "CustomerRequest", null, "refund-coupon"));

        Assert.NotNull(refund.Refund);
        Assert.Equal(1, (await db.Coupons.SingleAsync()).RedemptionCount);
        Assert.Single(await db.CouponRedemptions.ToListAsync());
    }

    private static async Task SeedAsync(BetccoDbContext db, Coupon coupon, IReadOnlyList<string> users)
    {
        var track = new LearningTrack { Slug = $"track-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{Guid.NewGuid():N}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        db.AddRange(track, course, coupon);
        foreach (var user in users)
        {
            var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = user };
            cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
            db.Carts.Add(cart);
        }
        await db.SaveChangesAsync();
    }

    private static async Task<CheckoutResult> CheckoutAsync(BetccoDbContext db, string userId, string coupon, string key, int cartIndex = 0)
    {
        var cart = (await db.Carts.Where(item => item.UserId == userId).OrderBy(item => item.CreatedAtUtc).ToListAsync())[cartIndex];
        return Assert.IsType<CheckoutResult>(await new CommerceService(db, new FakePaymentProvider()).CreateCourseCheckoutAsync(userId, cart.OwnerKey, coupon, "Card", key));
    }

    private static async Task<CheckoutResult?> TryCheckoutAsync(BetccoDbContext db, string userId, string coupon, string key, int cartIndex = 0)
    {
        try
        {
            return await CheckoutAsync(db, userId, coupon, key, cartIndex);
        }
        catch (InvalidOperationException exception) when (exception.Message == "The coupon is invalid or unavailable.")
        {
            return null;
        }
    }

    private static async Task AssertConfirmedCommercialEffectsAsync(BetccoDbContext db, Guid paymentId)
    {
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync(item => item.Id == paymentId)).Status);
        Assert.Single(await db.CouponRedemptions.Where(item => item.PaymentId == paymentId).ToListAsync());
        Assert.Single(await db.Enrollments.Where(item => item.PaymentId == paymentId).ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.Where(item => item.PaymentId == paymentId).ToListAsync());
        Assert.Single(await db.LedgerTransactions.Where(item => item.PaymentId == paymentId).ToListAsync());
    }

    private static BetccoDbContext CreateDb(string? database = null, InMemoryDatabaseRoot? root = null) => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(database ?? Guid.NewGuid().ToString(), root)
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);
}
