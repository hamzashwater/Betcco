using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

public sealed class PaymentSessionRecoveryTests
{
    [Fact]
    public async Task Normal_creation_becomes_ready_and_same_key_reuses_the_session()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db);
        var provider = new ControlledProvider
        {
            Create = request => Task.FromResult(new PaymentSession("PayTabs", $"TST-{request.PaymentId:N}", "https://secure-jordan.paytabs.com/payment/page/ready", false))
        };
        var commerce = CreateCommerce(db, provider);

        var first = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "ready-key"));
        var replay = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "ready-key"));

        Assert.Equal(first.PaymentId, replay.PaymentId);
        Assert.Equal("Ready", replay.ProviderSessionStatus);
        Assert.Equal(first.CheckoutReference, replay.CheckoutReference);
        Assert.Equal(first.RedirectUrl, replay.RedirectUrl);
        Assert.Equal(1, provider.CreateCalls);
        Assert.Equal(0, provider.QueryCalls);
    }

    [Fact]
    public async Task Provider_success_followed_by_reference_persistence_failure_is_recovered_by_cart_id()
    {
        var root = new InMemoryDatabaseRoot();
        var database = Guid.NewGuid().ToString();
        string ownerKey;
        await using (var seed = CreateDb(database, root))
        {
            var (cart, _) = await AddCourseCartAsync(seed);
            ownerKey = cart.OwnerKey;
        }

        var provider = new ControlledProvider
        {
            Create = request => Task.FromResult(new PaymentSession("PayTabs", $"TST-{request.PaymentId:N}", "https://secure-jordan.paytabs.com/payment/page/recovered", false)),
            Query = paymentId =>
            [
                Recovery(paymentId, $"TST-{paymentId:N}", "https://secure-jordan.paytabs.com/payment/page/recovered")
            ]
        };
        await using (var interrupted = CreateDb(database, root, new FailReadySessionSaveOnceInterceptor()))
        {
            await Assert.ThrowsAsync<SimulatedPersistenceException>(() =>
                CreateCommerce(interrupted, provider).CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "persist-failure-key"));
        }

        await using var retryDb = CreateDb(database, root);
        var recovered = Assert.IsType<CheckoutResult>(await CreateCommerce(retryDb, provider).CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "persist-failure-key"));
        var payment = await retryDb.Payments.SingleAsync();

        Assert.Equal(ProviderSessionStatus.Ready, payment.ProviderSessionStatus);
        Assert.Equal($"TST-{payment.Id:N}", payment.ProviderPaymentId);
        Assert.Equal("https://secure-jordan.paytabs.com/payment/page/recovered", recovered.RedirectUrl);
        Assert.Equal(1, provider.CreateCalls);
        Assert.Equal(1, provider.QueryCalls);
    }

    [Fact]
    public async Task Concurrent_same_key_requests_create_one_local_payment_and_one_provider_session()
    {
        var root = new InMemoryDatabaseRoot();
        var database = Guid.NewGuid().ToString();
        string ownerKey;
        await using (var seed = CreateDb(database, root))
        {
            var (cart, _) = await AddCourseCartAsync(seed);
            ownerKey = cart.OwnerKey;
        }
        var provider = new ControlledProvider
        {
            Create = async request =>
            {
                await Task.Delay(25);
                return new PaymentSession("PayTabs", $"TST-{request.PaymentId:N}", "https://secure-jordan.paytabs.com/payment/page/concurrent", false);
            }
        };
        await using var firstDb = CreateDb(database, root);
        await using var secondDb = CreateDb(database, root);

        var results = await Task.WhenAll(
            CreateCommerce(firstDb, provider).CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "same-concurrent-key"),
            CreateCommerce(secondDb, provider).CreateCourseCheckoutAsync("student", ownerKey, null, "Card", "same-concurrent-key"));

        Assert.All(results, Assert.NotNull);
        Assert.Equal(results[0]!.PaymentId, results[1]!.PaymentId);
        Assert.Equal(1, provider.CreateCalls);
        await using var verify = CreateDb(database, root);
        Assert.Single(await verify.Payments.ToListAsync());
        Assert.Equal(ProviderSessionStatus.Ready, (await verify.Payments.SingleAsync()).ProviderSessionStatus);
    }

    [Fact]
    public async Task Timeout_is_unknown_and_retry_does_not_recreate_or_release_coupon_reservation()
    {
        await using var db = CreateDb();
        var coupon = new Coupon { Code = "RECOVERY", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true };
        var (cart, _) = await AddCourseCartAsync(db, coupon);
        var provider = new ControlledProvider
        {
            Create = _ => throw new PaymentSessionResultUnknownException("simulated timeout"),
            Query = _ => []
        };
        var commerce = CreateCommerce(db, provider);

        var first = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "unknown-key"));
        var retry = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "unknown-key"));
        var cancellation = await commerce.CancelProcessingPaymentAsync("student", first.PaymentId);
        var payment = await db.Payments.SingleAsync();

        Assert.Equal("Unknown", first.ProviderSessionStatus);
        Assert.Equal("RequiresReconciliation", retry.ProviderSessionStatus);
        Assert.Equal(ProviderSessionStatus.RequiresReconciliation, payment.ProviderSessionStatus);
        Assert.Equal(PaymentStatus.Processing, payment.Status);
        Assert.False(cancellation.IsCancelled);
        Assert.Equal(1, coupon.RedemptionCount);
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        Assert.Single(await db.ProviderReconciliationCases.Where(item => item.CaseType == ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown).ToListAsync());
        Assert.Equal(1, provider.CreateCalls);
        Assert.Equal(1, provider.QueryCalls);
    }

    [Fact]
    public async Task Empty_query_after_verified_provider_uncertainty_window_can_start_a_new_session()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db);
        var firstAttempt = true;
        var provider = new ControlledProvider
        {
            Create = request =>
            {
                if (firstAttempt)
                {
                    firstAttempt = false;
                    throw new PaymentSessionResultUnknownException("simulated interruption");
                }
                return Task.FromResult(new PaymentSession("PayTabs", $"TST-{request.PaymentId:N}-RETRY", "https://secure-jordan.paytabs.com/payment/page/retry", false));
            },
            Query = _ => []
        };
        var commerce = CreateCommerce(db, provider);
        var first = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "expired-uncertainty-key"));
        var payment = await db.Payments.SingleAsync();
        payment.ProviderSessionAttemptedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-22);
        await db.SaveChangesAsync();

        var retry = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "expired-uncertainty-key"));

        Assert.Equal("Unknown", first.ProviderSessionStatus);
        Assert.Equal("Ready", retry.ProviderSessionStatus);
        Assert.Equal(2, provider.CreateCalls);
        Assert.Equal(1, provider.QueryCalls);
        Assert.Equal(ProviderReconciliationCaseStatus.Resolved, (await db.ProviderReconciliationCases.SingleAsync()).Status);
    }

    [Fact]
    public async Task Multiple_cart_id_matches_require_reconciliation_without_choosing_a_reference()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db);
        var provider = new ControlledProvider
        {
            Create = _ => throw new PaymentSessionResultUnknownException("simulated interruption"),
            Query = id =>
            [
                Recovery(id, "TST-FIRST", null),
                Recovery(id, "TST-SECOND", null)
            ]
        };
        var commerce = CreateCommerce(db, provider);
        await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "multiple-key");

        var retry = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "multiple-key"));
        var payment = await db.Payments.SingleAsync();

        Assert.Equal("RequiresReconciliation", retry.ProviderSessionStatus);
        Assert.Null(payment.ProviderPaymentId);
        Assert.Single(await db.ProviderReconciliationCases.Where(item => item.CaseType == ProviderReconciliationCaseType.DuplicateProviderSessions).ToListAsync());
    }

    [Fact]
    public async Task Definite_creation_rejection_fails_payment_and_releases_coupon_reservation()
    {
        await using var db = CreateDb();
        var coupon = new Coupon { Code = "DECLINE", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true };
        var (cart, _) = await AddCourseCartAsync(db, coupon);
        var provider = new ControlledProvider
        {
            Create = _ => throw new PaymentSessionCreationRejectedException("PAYTABS_101", "definite rejection")
        };

        var result = Assert.IsType<CheckoutResult>(await CreateCommerce(db, provider).CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "decline-key"));
        var payment = await db.Payments.SingleAsync();
        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());

        Assert.Equal("Failed", result.ProviderSessionStatus);
        Assert.Equal(PaymentStatus.Failed, payment.Status);
        Assert.Equal(ProviderSessionStatus.Failed, payment.ProviderSessionStatus);
        Assert.Equal("PAYTABS_101", payment.ProviderSessionFailureCode);
        Assert.Equal(PaymentTransitionSource.ProviderSessionCreationRejected, transition.Source);
        Assert.Equal(0, coupon.RedemptionCount);
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
    }

    [Fact]
    public async Task Recovery_never_overwrites_a_different_existing_provider_reference()
    {
        await using var db = CreateDb();
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = PaymentStatus.Processing,
            Subtotal = 100m,
            Total = 100m,
            Currency = "JOD",
            Provider = "PayTabs",
            ProviderPaymentId = "TST-ORIGINAL",
            ProviderSessionStatus = ProviderSessionStatus.Unknown,
            ProviderSessionAttemptedAtUtc = DateTimeOffset.UtcNow,
            IdempotencyKey = "reference-conflict-key"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        var provider = new ControlledProvider { Query = id => [Recovery(id, "TST-DIFFERENT", null)] };

        var result = Assert.IsType<CheckoutResult>(await CreateCommerce(db, provider).CreateCourseCheckoutAsync("student", "unused", null, "Card", payment.IdempotencyKey));

        Assert.Equal("TST-ORIGINAL", payment.ProviderPaymentId);
        Assert.Equal("RequiresReconciliation", result.ProviderSessionStatus);
        Assert.Single(await db.ProviderReconciliationCases.Where(item => item.CaseType == ProviderReconciliationCaseType.ProviderReferenceMismatch).ToListAsync());
    }

    [Fact]
    public async Task Recovered_accepted_session_confirms_once_without_duplicate_financial_effects()
    {
        await using var db = CreateDb();
        var coupon = new Coupon { Code = "ACCEPTED", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true };
        var (cart, _) = await AddCourseCartAsync(db, coupon);
        var provider = new ControlledProvider
        {
            Create = _ => throw new PaymentSessionResultUnknownException("simulated lost response"),
            Query = id => [Recovery(id, $"TST-{id:N}", null, successful: true, amount: 90m)]
        };
        var commerce = CreateCommerce(db, provider);
        var interrupted = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "accepted-recovery-key"));

        var recovered = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "accepted-recovery-key"));
        var replay = Assert.IsType<CheckoutResult>(await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, coupon.Code, "Card", "accepted-recovery-key"));

        Assert.Equal("Unknown", interrupted.ProviderSessionStatus);
        Assert.Equal("Paid", recovered.Status);
        Assert.Equal(recovered.PaymentId, replay.PaymentId);
        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Single(await db.CouponRedemptions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
        Assert.Equal(1, coupon.RedemptionCount);
        Assert.Equal(1, provider.CreateCalls);
        Assert.Equal(1, provider.QueryCalls);
        Assert.Equal(ProviderReconciliationCaseStatus.Resolved, (await db.ProviderReconciliationCases.SingleAsync()).Status);
    }

    private static CommerceService CreateCommerce(BetccoDbContext db, IPaymentProvider provider) =>
        new(db, provider, null, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PayTabs:ProfileId"] = "123456",
            ["APP_PUBLIC_URL"] = "https://betcco.test"
        }).Build());

    private static PaymentCheckoutRecovery Recovery(Guid paymentId, string providerPaymentId, string? redirectUrl, bool successful = false, decimal amount = 100m) =>
        new("PayTabs", "123456", providerPaymentId, PayTabsPaymentProvider.CartId(paymentId), "JOD", amount, redirectUrl, successful, false, successful ? "A" : null, successful ? "100" : null);

    private static async Task<(Cart Cart, Course Course)> AddCourseCartAsync(BetccoDbContext db, Coupon? coupon = null)
    {
        var track = new LearningTrack { Slug = $"track-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{Guid.NewGuid():N}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart);
        if (coupon is not null) db.Coupons.Add(coupon);
        await db.SaveChangesAsync();
        return (cart, course);
    }

    private static BetccoDbContext CreateDb(string? database = null, InMemoryDatabaseRoot? root = null, IInterceptor? interceptor = null)
    {
        var options = new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(database ?? Guid.NewGuid().ToString(), root)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning));
        if (interceptor is not null) options.AddInterceptors(interceptor);
        return new BetccoDbContext(options.Options);
    }

    private sealed class ControlledProvider : IPaymentProvider
    {
        private int createCalls;
        private int queryCalls;
        public string ProviderName => "PayTabs";
        public TimeSpan? CheckoutSessionUncertaintyWindow => TimeSpan.FromMinutes(21);
        public int CreateCalls => createCalls;
        public int QueryCalls => queryCalls;
        public Func<PaymentCheckoutRequest, Task<PaymentSession>> Create { get; init; } = _ => throw new InvalidOperationException();
        public Func<Guid, IReadOnlyCollection<PaymentCheckoutRecovery>> Query { get; init; } = _ => [];
        public async Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref createCalls);
            return await Create(request);
        }
        public Task<IReadOnlyCollection<PaymentCheckoutRecovery>> QueryCheckoutSessionsAsync(Guid paymentId, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref queryCalls);
            return Task.FromResult(Query(paymentId));
        }
        public Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
        public Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
        public Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new InvalidOperationException();
    }

    private sealed class FailReadySessionSaveOnceInterceptor : SaveChangesInterceptor
    {
        private bool failed;
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (!failed && eventData.Context!.ChangeTracker.Entries<Payment>().Any(entry =>
                    entry.State == EntityState.Modified
                    && entry.Entity.ProviderSessionStatus == ProviderSessionStatus.Ready
                    && !string.IsNullOrWhiteSpace(entry.Entity.ProviderPaymentId)))
            {
                failed = true;
                throw new SimulatedPersistenceException();
            }
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private sealed class SimulatedPersistenceException : Exception { }
}
