using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class PaymentLifecycleTests
{
    [Fact]
    public void Payment_workflow_permits_only_the_intended_unpaid_and_refund_transitions()
    {
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Processing, PaymentStatus.Paid));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Processing, PaymentStatus.Failed));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Processing, PaymentStatus.Cancelled));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.Refunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.PartiallyRefunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.PartiallyRefunded, PaymentStatus.PartiallyRefunded));
        Assert.True(PaymentWorkflow.CanTransition(PaymentStatus.PartiallyRefunded, PaymentStatus.Refunded));

        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.Failed));
        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Paid, PaymentStatus.Cancelled));
        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Refunded, PaymentStatus.Failed));
        Assert.False(PaymentWorkflow.CanTransition(PaymentStatus.Refunded, PaymentStatus.Cancelled));
    }

    [Fact]
    public async Task Verified_fake_confirmation_records_one_transition_and_is_idempotent_for_financial_effects()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "transition-fake-key");

        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "fake-transition-succeeded"));
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "fake-transition-succeeded"));

        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Equal(checkout.PaymentId, transition.PaymentId);
        Assert.Equal(PaymentStatus.Processing, transition.PreviousStatus);
        Assert.Equal(PaymentStatus.Paid, transition.NewStatus);
        Assert.Equal(PaymentTransitionSource.DevelopmentFakeConfirmation, transition.Source);
        Assert.Equal("fake-transition-succeeded", transition.ProviderEventReference);
        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
    }

    [Theory]
    [InlineData(PaymentStatus.Paid)]
    [InlineData(PaymentStatus.Failed)]
    [InlineData(PaymentStatus.Cancelled)]
    public async Task Direct_payment_status_change_is_rejected_without_server_transition_evidence(PaymentStatus targetStatus)
    {
        await using var db = CreateDb();
        var payment = await AddProcessingPaymentAsync(db);

        payment.Status = targetStatus;

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
    }

    [Fact]
    public async Task Only_owner_can_cancel_processing_payment_and_replay_is_idempotent_without_economic_effects()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cancel-key");
        Assert.NotNull(checkout);

        Assert.False((await commerce.CancelProcessingPaymentAsync("other", checkout.PaymentId)).IsCancelled);
        var cancelled = await commerce.CancelProcessingPaymentAsync("student", checkout.PaymentId);
        var replay = await commerce.CancelProcessingPaymentAsync("student", checkout.PaymentId);

        Assert.True(cancelled.IsCancelled);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(PaymentStatus.Cancelled, (await db.Payments.SingleAsync()).Status);
        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Equal(PaymentStatus.Processing, transition.PreviousStatus);
        Assert.Equal(PaymentStatus.Cancelled, transition.NewStatus);
        Assert.Equal(PaymentTransitionSource.CustomerCancellation, transition.Source);
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Paid_or_refunded_payment_cannot_be_cancelled()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cannot-cancel-key");
        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "cannot-cancel-paid"));

        var paid = await commerce.CancelProcessingPaymentAsync("student", checkout.PaymentId);
        var payment = await db.Payments.SingleAsync();
        payment.Status = PaymentStatus.Refunded;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition { PaymentId = payment.Id, PreviousStatus = PaymentStatus.Paid, NewStatus = PaymentStatus.Refunded, Source = PaymentTransitionSource.InternalRefundRecorded });
        await db.SaveChangesAsync();
        var refunded = await commerce.CancelProcessingPaymentAsync("student", checkout.PaymentId);

        Assert.Equal("PAYMENT_NOT_CANCELLABLE", paid.FailureCode);
        Assert.Equal("PAYMENT_NOT_CANCELLABLE", refunded.FailureCode);
        Assert.Equal(PaymentStatus.Refunded, (await db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task Payment_transition_history_is_append_only()
    {
        await using var db = CreateDb();
        var payment = await AddProcessingPaymentAsync(db);
        var transition = new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = PaymentStatus.Processing,
            NewStatus = PaymentStatus.Paid,
            Source = PaymentTransitionSource.DevelopmentFakeConfirmation,
            Provider = "Fake",
            ProviderEventReference = "append-only-event"
        };
        db.PaymentStatusTransitions.Add(transition);
        await db.SaveChangesAsync();

        transition.ReasonCode = "rewritten";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.Entry(transition).State = EntityState.Unchanged;
        db.PaymentStatusTransitions.Remove(transition);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Finalized_payment_monetary_snapshot_and_provider_identity_cannot_be_rewritten()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "finalized-snapshot-key");

        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "finalized-snapshot-succeeded"));
        var payment = await db.Payments.SingleAsync();

        payment.Total = 0m;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        await db.Entry(payment).ReloadAsync();
        payment.ProviderPaymentId = "rewritten-provider-reference";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Same_and_different_checkout_keys_reuse_one_active_course_cart_payment_without_extra_provider_sessions()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var provider = new CountingFakePaymentProvider();
        var commerce = new CommerceService(db, provider);

        var first = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cart-first-key");
        var sameKeyReplay = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cart-first-key");
        var differentKeyReplay = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cart-second-key");

        Assert.NotNull(first);
        Assert.NotNull(sameKeyReplay);
        Assert.NotNull(differentKeyReplay);
        Assert.Equal(first.PaymentId, sameKeyReplay.PaymentId);
        Assert.Equal(first.PaymentId, differentKeyReplay.PaymentId);
        Assert.Equal(1, provider.CheckoutRequests);
        Assert.Single(await db.Payments.Where(payment => payment.Status == PaymentStatus.Processing).ToListAsync());
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Concurrent_different_key_checkout_requests_use_one_active_payment_and_one_provider_session()
    {
        var database = Guid.NewGuid().ToString();
        var root = new Microsoft.EntityFrameworkCore.Storage.InMemoryDatabaseRoot();
        Guid cartId;
        string ownerKey;
        await using (var seed = CreateDb(database, root))
        {
            var cart = await AddCourseCartAsync(seed, "student", 100m);
            cartId = cart.Id;
            ownerKey = cart.OwnerKey;
        }

        await using var firstDb = CreateDb(database, root);
        await using var secondDb = CreateDb(database, root);
        var provider = new CountingFakePaymentProvider();
        var firstCommerce = new CommerceService(firstDb, provider);
        var secondCommerce = new CommerceService(secondDb, provider);

        var results = await Task.WhenAll(
            Task.Run(() => firstCommerce.CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "concurrent-cart-a")),
            Task.Run(() => secondCommerce.CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "concurrent-cart-b")));

        Assert.All(results, Assert.NotNull);
        Assert.Equal(results[0]!.PaymentId, results[1]!.PaymentId);
        Assert.Equal(1, provider.CheckoutRequests);
        await using var verify = CreateDb(database, root);
        var payment = Assert.Single(await verify.Payments.Where(item => item.Purpose == "CourseCart" && item.ReferenceId == cartId).ToListAsync());
        Assert.Equal(PaymentStatus.Processing, payment.Status);
    }

    [Fact]
    public async Task Failed_and_cancelled_course_cart_payments_preserve_history_and_allow_a_new_attempt()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var cancelled = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "cancelled-attempt"));
        Assert.True((await commerce.CancelProcessingPaymentAsync("student", cancelled.PaymentId)).IsCancelled);

        var retryAfterCancellation = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "retry-after-cancellation"));
        var retryPayment = await db.Payments.SingleAsync(item => item.Id == retryAfterCancellation.PaymentId);
        retryPayment.Status = PaymentStatus.Failed;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition { PaymentId = retryPayment.Id, PreviousStatus = PaymentStatus.Processing, NewStatus = PaymentStatus.Failed, Source = PaymentTransitionSource.PayTabsVerifiedFailure, Provider = retryPayment.Provider, ProviderEventReference = "test-definite-failure" });
        await db.SaveChangesAsync();

        var retryAfterFailure = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "retry-after-failure"));

        Assert.Equal(3, await db.Payments.CountAsync());
        Assert.Equal(PaymentStatus.Cancelled, (await db.Payments.SingleAsync(item => item.Id == cancelled.PaymentId)).Status);
        Assert.Equal(PaymentStatus.Failed, (await db.Payments.SingleAsync(item => item.Id == retryAfterCancellation.PaymentId)).Status);
        Assert.Equal(PaymentStatus.Processing, (await db.Payments.SingleAsync(item => item.Id == retryAfterFailure.PaymentId)).Status);
    }

    [Fact]
    public async Task Trusted_paid_course_cart_closes_the_cart_and_blocks_another_purchase_or_cart_mutation()
    {
        await using var db = CreateDb();
        var cart = await AddCourseCartAsync(db, "student", 100m);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "paid-cart-key"));

        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "paid-cart-confirmation"));
        await db.Entry(cart).ReloadAsync();
        Assert.Equal(CartStatus.Closed, cart.Status);
        Assert.Equal(checkout.PaymentId, cart.ClosedByPaymentId);
        Assert.NotNull(cart.ClosedAtUtc);

        await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "paid-cart-second-key"));
        var courseId = await db.Courses.Select(course => course.Id).SingleAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.AddCourseAsync(cart.OwnerKey, "student", courseId, "en"));
        Assert.Single(await db.Payments.ToListAsync());
        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
    }

    [Fact]
    public void Active_course_cart_payment_is_protected_by_a_database_filtered_unique_index()
    {
        using var db = CreateDb();
        var index = db.Model.FindEntityType(typeof(Payment))!.GetIndexes().Single(item => item.GetDatabaseName() == "IX_Payments_ActiveCourseCartReference");

        Assert.True(index.IsUnique);
        Assert.Equal("\"Purpose\" = 'CourseCart' AND \"Status\" = 1 AND \"ActiveCartId\" IS NOT NULL", index.GetFilter());
        Assert.Equal(nameof(Payment.ActiveCartId), Assert.Single(index.Properties).Name);
    }
    private static BetccoDbContext CreateDb(string? database = null, Microsoft.EntityFrameworkCore.Storage.InMemoryDatabaseRoot? root = null) => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(database ?? Guid.NewGuid().ToString(), root)
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);
    private sealed class CountingFakePaymentProvider : IPaymentProvider
    {
        private int checkoutRequests;
        public int CheckoutRequests => checkoutRequests;
        public string ProviderName => "Fake";
        public Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref checkoutRequests);
            return Task.FromResult(new PaymentSession("FakeCard", $"fake_card_{request.PaymentId:N}", null, true));
        }
        public Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
        public Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
        public Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
    }
    private static async Task<Cart> AddCourseCartAsync(BetccoDbContext db, string userId, decimal price)
    {
        var track = new LearningTrack { Slug = $"track-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{Guid.NewGuid():N}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = price };
        var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = userId };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart);
        await db.SaveChangesAsync();
        return cart;
    }

    private static async Task<Payment> AddProcessingPaymentAsync(BetccoDbContext db)
    {
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = PaymentStatus.Processing,
            Subtotal = 100m,
            Total = 100m,
            Provider = "Fake",
            ProviderPaymentId = $"fake-{Guid.NewGuid():N}"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }
}
