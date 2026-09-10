using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace Betcco.IntegrationTests;

public sealed class PostgresFinanceConcurrencyTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_checkouts_cannot_exceed_the_global_coupon_limit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("coupon_global");
        var scenario = await SeedCourseCartsAsync(database, ["student-a", "student-b"],
            new Coupon { Code = "PGGLOBAL", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true });
        var provider = new CountingPaymentProvider();
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => CreateCommerce(firstDb, provider).CreateCourseCheckoutAsync("student-a", scenario.Carts[0].OwnerKey, "PGGLOBAL", "Card", "pg-global-a")),
            CaptureAsync(() => CreateCommerce(secondDb, provider).CreateCourseCheckoutAsync("student-b", scenario.Carts[1].OwnerKey, "PGGLOBAL", "Card", "pg-global-b")));

        await using var verify = database.CreateContext();
        Assert.Single(outcomes, outcome => outcome.Value is not null);
        Assert.Single(outcomes, outcome => outcome.Error is not null);
        Assert.Equal(1, await verify.Coupons.Select(item => item.RedemptionCount).SingleAsync());
        Assert.Equal(1, await verify.Payments.CountAsync(item => item.Status == PaymentStatus.Processing && item.CouponId != null));
        Assert.Empty(await verify.CouponRedemptions.ToListAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_same_user_checkouts_cannot_bypass_the_per_user_coupon_limit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("coupon_user");
        var scenario = await SeedCourseCartsAsync(database, ["student", "student"],
            new Coupon { Code = "PGUSER", PercentageOff = 25m, MaxRedemptions = 5, MaxRedemptionsPerUser = 1, IsActive = true });
        var provider = new CountingPaymentProvider();
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => CreateCommerce(firstDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, "PGUSER", "Card", "pg-user-a")),
            CaptureAsync(() => CreateCommerce(secondDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[1].OwnerKey, "PGUSER", "Card", "pg-user-b")));

        await using var verify = database.CreateContext();
        Assert.Single(outcomes, outcome => outcome.Value is not null);
        Assert.Single(outcomes, outcome => outcome.Error is not null);
        Assert.Equal(1, await verify.Coupons.Select(item => item.RedemptionCount).SingleAsync());
        Assert.Equal(1, await verify.Payments.CountAsync(item => item.UserId == "student" && item.Status == PaymentStatus.Processing && item.CouponId != null));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Reserved_coupon_snapshots_survive_expiration_and_disablement()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("coupon_snapshot");
        var expiring = await SeedCourseCartsAsync(database, ["expiry-student"],
            new Coupon { Code = "PGEXPIRY", FixedAmountOff = 20m, EndsAtUtc = DateTimeOffset.UtcNow.AddHours(1), IsActive = true });
        var disabled = await SeedCourseCartsAsync(database, ["disabled-student"],
            new Coupon { Code = "PGDISABLED", FixedAmountOff = 15m, IsActive = true });
        var provider = new CountingPaymentProvider();

        Guid expiringPaymentId;
        Guid disabledPaymentId;
        await using (var checkoutDb = database.CreateContext())
        {
            expiringPaymentId = Assert.IsType<CheckoutResult>(await CreateCommerce(checkoutDb, provider)
                .CreateCourseCheckoutAsync("expiry-student", expiring.Carts[0].OwnerKey, "PGEXPIRY", "Card", "pg-expiry")).PaymentId;
            disabledPaymentId = Assert.IsType<CheckoutResult>(await CreateCommerce(checkoutDb, provider)
                .CreateCourseCheckoutAsync("disabled-student", disabled.Carts[0].OwnerKey, "PGDISABLED", "Card", "pg-disabled")).PaymentId;
        }

        await using (var mutate = database.CreateContext())
        {
            (await mutate.Coupons.SingleAsync(item => item.Code == "PGEXPIRY")).EndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
            (await mutate.Coupons.SingleAsync(item => item.Code == "PGDISABLED")).IsActive = false;
            await mutate.SaveChangesAsync();
        }

        await using (var expiryDb = database.CreateContext())
            Assert.True(await CreateCommerce(expiryDb, provider).ConfirmFakeWebhookAsync(expiringPaymentId, "pg-expiry-confirm"));
        await using (var disabledDb = database.CreateContext())
            Assert.True(await CreateCommerce(disabledDb, provider).ConfirmFakeWebhookAsync(disabledPaymentId, "pg-disabled-confirm"));

        await using var verify = database.CreateContext();
        Assert.Equal(2, await verify.Payments.CountAsync(item => item.Status == PaymentStatus.Paid));
        Assert.Equal(2, await verify.CouponRedemptions.CountAsync());
        Assert.Equal(2, await verify.Enrollments.CountAsync());
        Assert.Equal(2, await verify.LedgerTransactions.CountAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_duplicate_confirmations_create_one_economic_effect_set()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("confirmation");
        var scenario = await SeedCourseCartsAsync(database, ["student"],
            new Coupon { Code = "PGCONFIRM", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true });
        var provider = new CountingPaymentProvider();
        Guid paymentId;
        await using (var checkoutDb = database.CreateContext())
        {
            paymentId = Assert.IsType<CheckoutResult>(await CreateCommerce(checkoutDb, provider)
                .CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, "PGCONFIRM", "Card", "pg-confirm")).PaymentId;
        }

        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        var results = await Task.WhenAll(
            CreateCommerce(firstDb, provider).ConfirmFakeWebhookAsync(paymentId, "pg-provider-event"),
            CreateCommerce(secondDb, provider).ConfirmFakeWebhookAsync(paymentId, "pg-provider-event"));

        Assert.All(results, Assert.True);
        await using var verify = database.CreateContext();
        Assert.Equal(PaymentStatus.Paid, await verify.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync());
        Assert.Equal(1, await verify.WebhookEvents.CountAsync(item => item.ProviderEventId == "pg-provider-event"));
        Assert.Equal(1, await verify.PaymentStatusTransitions.CountAsync(item => item.PaymentId == paymentId && item.NewStatus == PaymentStatus.Paid));
        Assert.Equal(1, await verify.Enrollments.CountAsync(item => item.PaymentId == paymentId));
        Assert.Equal(1, await verify.CourseSaleAllocations.CountAsync(item => item.PaymentId == paymentId));
        Assert.Equal(1, await verify.LedgerTransactions.CountAsync(item => item.PaymentId == paymentId));
        Assert.Equal(1, await verify.CouponRedemptions.CountAsync(item => item.PaymentId == paymentId));
        Assert.Equal(2, await verify.WalletTransactions.CountAsync(item => item.PaymentId == paymentId));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_same_key_checkout_creates_one_payment_and_one_provider_session()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("session_same_key");
        var scenario = await SeedCourseCartsAsync(database, ["student"]);
        var provider = new CountingPaymentProvider(delay: TimeSpan.FromMilliseconds(100));
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();

        var results = await Task.WhenAll(
            CreateCommerce(firstDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, null, "Card", "pg-same-key"),
            CreateCommerce(secondDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, null, "Card", "pg-same-key"));

        Assert.All(results, Assert.NotNull);
        Assert.Equal(results[0]!.PaymentId, results[1]!.PaymentId);
        Assert.Equal(1, provider.CreateCalls);
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.Payments.CountAsync());
        Assert.Equal(ProviderSessionStatus.Ready, await verify.Payments.Select(item => item.ProviderSessionStatus).SingleAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_unknown_session_recovery_preserves_coupon_reservation_and_reference_ownership()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("session_recovery");
        var scenario = await SeedCourseCartsAsync(database, ["student"],
            new Coupon { Code = "PGRECOVERY", FixedAmountOff = 10m, MaxRedemptions = 1, IsActive = true });
        var provider = new CountingPaymentProvider(createUnknown: true);
        Guid paymentId;
        await using (var firstAttempt = database.CreateContext())
        {
            paymentId = Assert.IsType<CheckoutResult>(await CreateCommerce(firstAttempt, provider)
                .CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, "PGRECOVERY", "Card", "pg-recovery")).PaymentId;
        }

        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        var recoveries = await Task.WhenAll(
            CaptureAsync(() => CreateCommerce(firstDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, "PGRECOVERY", "Card", "pg-recovery")),
            CaptureAsync(() => CreateCommerce(secondDb, provider).CreateCourseCheckoutAsync("student", scenario.Carts[0].OwnerKey, "PGRECOVERY", "Card", "pg-recovery")));

        Assert.All(recoveries, outcome => Assert.Null(outcome.Error));
        await using var verify = database.CreateContext();
        var payment = await verify.Payments.SingleAsync(item => item.Id == paymentId);
        Assert.Equal(PaymentStatus.Processing, payment.Status);
        Assert.Equal(ProviderSessionStatus.RequiresReconciliation, payment.ProviderSessionStatus);
        Assert.Null(payment.ProviderPaymentId);
        Assert.Equal(1, await verify.Coupons.Select(item => item.RedemptionCount).SingleAsync());
        Assert.Empty(await verify.CouponRedemptions.ToListAsync());
        Assert.Equal(1, await verify.ProviderReconciliationCases.CountAsync());
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Recovery_cannot_replace_an_existing_provider_reference_with_a_conflicting_reference()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("session_reference");
        var payment = Payment("student", "pg-reference-key", "pg-original-reference");
        payment.Provider = "FakePostgres";
        payment.ProviderSessionStatus = ProviderSessionStatus.Unknown;
        payment.ProviderSessionAttemptedAtUtc = DateTimeOffset.UtcNow;
        await using (var seed = database.CreateContext())
        {
            seed.Payments.Add(payment);
            await seed.SaveChangesAsync();
        }
        var provider = new CountingPaymentProvider(recoveries: id =>
        [
            new PaymentCheckoutRecovery("FakePostgres", "unused", "pg-conflicting-reference", PayTabsPaymentProvider.CartId(id), "JOD", 100m, null, false, false, null, null)
        ]);

        await using var db = database.CreateContext();
        var result = Assert.IsType<CheckoutResult>(await CreateCommerce(db, provider)
            .CreateCourseCheckoutAsync("student", "unused", null, "Card", "pg-reference-key"));

        await using var verify = database.CreateContext();
        var stored = await verify.Payments.SingleAsync();
        Assert.Equal("pg-original-reference", stored.ProviderPaymentId);
        Assert.Equal("RequiresReconciliation", result.ProviderSessionStatus);
        Assert.Equal(1, await verify.ProviderReconciliationCases.CountAsync(item => item.CaseType == ProviderReconciliationCaseType.ProviderReferenceMismatch));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_full_refunds_create_one_refund_one_reversal_and_a_valid_final_payment_state()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("refund");
        var paid = await CreatePaidCoursePaymentAsync(database, "refund-student");
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        var sameKey = new RecordInternalRefund(paid.PaymentId, paid.Total, "JOD", "CustomerRequest", null, "pg-refund-key");

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => new RefundService(firstDb).RecordInternalRefundAsync("finance", sameKey)),
            CaptureAsync(() => new RefundService(secondDb).RecordInternalRefundAsync("finance", sameKey)));

        Assert.All(outcomes, outcome => Assert.Null(outcome.Error));
        await using var replayDb = database.CreateContext();
        var replay = await new RefundService(replayDb).RecordInternalRefundAsync("finance", sameKey);
        Assert.True(replay.IsIdempotentReplay);

        await using var verify = database.CreateContext();
        Assert.Equal(PaymentStatus.Refunded, await verify.Payments.Where(item => item.Id == paid.PaymentId).Select(item => item.Status).SingleAsync());
        Assert.Equal(1, await verify.Refunds.CountAsync());
        Assert.Equal(1, await verify.LedgerTransactions.CountAsync(item => item.RefundId != null));
        Assert.Equal(1, await verify.PaymentStatusTransitions.CountAsync(item => item.PaymentId == paid.PaymentId && item.NewStatus == PaymentStatus.Refunded));
        Assert.Equal(2, await verify.WalletTransactions.CountAsync(item => item.RefundId != null));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Competing_full_refund_keys_cannot_double_refund_the_same_payment()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("refund_competing");
        var paid = await CreatePaidCoursePaymentAsync(database, "refund-competing-student");
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => new RefundService(firstDb).RecordInternalRefundAsync("finance", new(paid.PaymentId, paid.Total, "JOD", "CustomerRequest", null, "pg-refund-a"))),
            CaptureAsync(() => new RefundService(secondDb).RecordInternalRefundAsync("finance", new(paid.PaymentId, paid.Total, "JOD", "CustomerRequest", null, "pg-refund-b"))));

        Assert.All(outcomes, outcome => Assert.Null(outcome.Error));
        Assert.Single(outcomes, outcome => outcome.Value?.Refund is not null);
        Assert.Single(outcomes, outcome => outcome.Value?.FailureCode == "REFUND_PAYMENT_NOT_PAID");
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.Refunds.CountAsync());
        Assert.Equal(1, await verify.LedgerTransactions.CountAsync(item => item.RefundId != null));
        Assert.Equal(2, await verify.WalletTransactions.CountAsync(item => item.RefundId != null));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Ledger_effects_balance_and_database_constraints_reject_duplicate_or_invalid_persistence()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("ledger");
        var paid = await CreatePaidCoursePaymentAsync(database, "ledger-student");
        await using var verify = database.CreateContext();
        var ledger = await verify.LedgerTransactions.Include(item => item.Entries).SingleAsync(item => item.PaymentId == paid.PaymentId);
        Assert.Equal(ledger.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount),
            ledger.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount));

        var accounts = await verify.LedgerAccounts.ToDictionaryAsync(item => item.Code, item => item.Id);
        await using var duplicateDb = database.CreateContext();
        var duplicateTransaction = new LedgerTransaction
        {
            EventType = LedgerEventType.PaidCourseSale,
            Currency = "JOD",
            PaymentId = paid.PaymentId,
            BusinessEventReference = $"duplicate:{Guid.NewGuid():N}"
        };
        duplicateTransaction.Entries.Add(new LedgerEntry { LedgerAccountId = accounts[LedgerAccountCode.CourseSaleClearing], Side = LedgerEntrySide.Debit, Amount = 1m, Currency = "JOD" });
        duplicateTransaction.Entries.Add(new LedgerEntry { LedgerAccountId = accounts[LedgerAccountCode.PlatformCommission], Side = LedgerEntrySide.Credit, Amount = 1m, Currency = "JOD" });
        duplicateDb.LedgerTransactions.Add(duplicateTransaction);
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => duplicateDb.SaveChangesAsync());
        AssertPostgresCode(duplicate, PostgresErrorCodes.UniqueViolation);

        var accountId = await verify.LedgerAccounts.Select(item => item.Id).FirstAsync();
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "INSERT INTO \"LedgerEntries\" (\"Id\", \"LedgerTransactionId\", \"LedgerAccountId\", \"Side\", \"Amount\", \"Currency\", \"CreatedAtUtc\", \"UpdatedAtUtc\", \"IsDeleted\") " +
            "VALUES (@id, @transactionId, @accountId, 0, 0, 'JOD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)", connection);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("transactionId", ledger.Id);
        command.Parameters.AddWithValue("accountId", accountId);
        var invalid = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.CheckViolation, invalid.SqlState);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_payout_requests_and_execution_preserve_one_reservation_and_one_provider_transfer()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("payout");
        await using (var seed = database.CreateContext())
        {
            seed.WalletTransactions.Add(new WalletTransaction { UserId = "teacher", Type = "TeacherCourseEarning", Amount = 100m, Currency = "JOD", Description = "PostgreSQL verified earning" });
            await seed.SaveChangesAsync();
        }

        var protection = new EphemeralDataProtectionProvider();
        var provider = new BlockingPayoutProvider();
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        var request = new CreatePayoutRequest(50m, "BankTransfer", "JO00TESTACCOUNT1234", "pg-payout-key");
        var requests = await Task.WhenAll(
            CreateWallet(firstDb, protection, provider).CreatePayoutRequestAsync("teacher", request),
            CreateWallet(secondDb, protection, provider).CreatePayoutRequestAsync("teacher", request));

        Assert.All(requests, Assert.NotNull);
        Assert.Equal(requests[0]!.Id, requests[1]!.Id);
        await using (var approveDb = database.CreateContext())
            Assert.True(await CreateWallet(approveDb, protection, provider).ApprovePayoutAsync("finance", requests[0]!.Id, "Approved"));

        await using var executeDb = database.CreateContext();
        await using var competingDb = database.CreateContext();
        var execution = CreateWallet(executeDb, protection, provider).ExecutePayoutAsync("finance", requests[0]!.Id);
        await provider.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var competing = await CreateWallet(competingDb, protection, provider).ExecutePayoutAsync("finance", requests[0]!.Id);
        provider.Complete();
        var completed = await execution;

        Assert.Equal("Processing", competing!.Status);
        Assert.Equal("Paid", completed!.Status);
        Assert.Equal(1, provider.Calls);
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.PayoutRequests.CountAsync());
        Assert.Equal(1, await verify.WalletTransactions.CountAsync(item => item.PayoutRequestId == requests[0]!.Id && item.Type == "PayoutReserved"));
        Assert.Equal(1, await verify.PayoutStatusTransitions.CountAsync(item => item.PayoutRequestId == requests[0]!.Id && item.NewStatus == PayoutStatus.Processing));
        Assert.Equal(1, await verify.PayoutStatusTransitions.CountAsync(item => item.PayoutRequestId == requests[0]!.Id && item.NewStatus == PayoutStatus.Paid));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_different_payout_requests_cannot_overreserve_the_wallet_balance()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("payout_balance");
        await using (var seed = database.CreateContext())
        {
            seed.WalletTransactions.Add(new WalletTransaction { UserId = "teacher", Type = "TeacherCourseEarning", Amount = 100m, Currency = "JOD", Description = "PostgreSQL verified earning" });
            await seed.SaveChangesAsync();
        }
        var protection = new EphemeralDataProtectionProvider();
        var provider = new BlockingPayoutProvider();
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();

        var outcomes = await Task.WhenAll(
            CaptureAsync(() => CreateWallet(firstDb, protection, provider).CreatePayoutRequestAsync("teacher", new(75m, "BankTransfer", "JO00TESTACCOUNT1234", "pg-balance-a"))),
            CaptureAsync(() => CreateWallet(secondDb, protection, provider).CreatePayoutRequestAsync("teacher", new(75m, "BankTransfer", "JO00TESTACCOUNT1234", "pg-balance-b"))));

        Assert.Single(outcomes, outcome => outcome.Value is not null);
        Assert.Single(outcomes, outcome => outcome.Error is InvalidOperationException { Message: "Withdrawal amount exceeds the available wallet balance." });
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.PayoutRequests.CountAsync());
        Assert.Equal(1, await verify.WalletTransactions.CountAsync(item => item.Type == "PayoutReserved"));
        Assert.Equal(25m, await verify.WalletTransactions.Where(item => item.UserId == "teacher").SumAsync(item => item.Amount));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Webhook_event_and_provider_transaction_ownership_are_enforced_by_unique_constraints()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("uniqueness");
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        firstDb.WebhookEvents.Add(new WebhookEvent { Provider = "PayTabs", ProviderEventId = "pg-event", EventType = "payment.succeeded" });
        secondDb.WebhookEvents.Add(new WebhookEvent { Provider = "PayTabs", ProviderEventId = "pg-event", EventType = "payment.succeeded" });

        var webhookOutcomes = await Task.WhenAll(CaptureSaveAsync(firstDb), CaptureSaveAsync(secondDb));
        Assert.Single(webhookOutcomes, error => error is null);
        Assert.Single(webhookOutcomes, error => HasPostgresCode(error, PostgresErrorCodes.UniqueViolation));

        await using var paymentOneDb = database.CreateContext();
        await using var paymentTwoDb = database.CreateContext();
        paymentOneDb.Payments.Add(Payment("owner-a", "key-a", "provider-transaction"));
        paymentTwoDb.Payments.Add(Payment("owner-b", "key-b", "provider-transaction"));
        var ownershipOutcomes = await Task.WhenAll(CaptureSaveAsync(paymentOneDb), CaptureSaveAsync(paymentTwoDb));
        Assert.Single(ownershipOutcomes, error => error is null);
        Assert.Single(ownershipOutcomes, error => HasPostgresCode(error, PostgresErrorCodes.UniqueViolation));
    }

    private static CommerceService CreateCommerce(BetccoDbContext db, IPaymentProvider provider) =>
        new(db, provider, null, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PayTabs:ProfileId"] = "123456",
            ["APP_PUBLIC_URL"] = "https://betcco.test"
        }).Build());

    private static WalletService CreateWallet(BetccoDbContext db, IDataProtectionProvider protection, IPayoutProvider provider) =>
        new(db, protection, provider);

    private static async Task<CourseScenario> SeedCourseCartsAsync(PostgresTestDatabase database, IReadOnlyList<string> users, Coupon? coupon = null)
    {
        await using var db = database.CreateContext();
        var token = Guid.NewGuid().ToString("N");
        var track = new LearningTrack { Slug = $"track-{token}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{token}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var carts = users.Select(user =>
        {
            var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = user };
            cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
            return cart;
        }).ToArray();
        db.AddRange(track, course);
        db.Carts.AddRange(carts);
        if (coupon is not null) db.Coupons.Add(coupon);
        await db.SaveChangesAsync();
        return new(course.Id, carts.Select(item => new CartIdentity(item.Id, item.OwnerKey)).ToArray());
    }

    private static async Task<PaidPayment> CreatePaidCoursePaymentAsync(PostgresTestDatabase database, string userId)
    {
        var scenario = await SeedCourseCartsAsync(database, [userId]);
        var provider = new CountingPaymentProvider();
        await using var db = database.CreateContext();
        var checkout = Assert.IsType<CheckoutResult>(await CreateCommerce(db, provider)
            .CreateCourseCheckoutAsync(userId, scenario.Carts[0].OwnerKey, null, "Card", $"paid-{Guid.NewGuid():N}"));
        Assert.True(await CreateCommerce(db, provider).ConfirmFakeWebhookAsync(checkout.PaymentId, $"confirm-{Guid.NewGuid():N}"));
        return new(checkout.PaymentId, checkout.Total);
    }

    private static Payment Payment(string userId, string idempotencyKey, string providerPaymentId) => new()
    {
        UserId = userId,
        Purpose = "CourseCart",
        ReferenceId = Guid.NewGuid(),
        Status = PaymentStatus.Processing,
        Subtotal = 100m,
        Total = 100m,
        Currency = "JOD",
        Provider = "PayTabs",
        ProviderPaymentId = providerPaymentId,
        ProviderSessionStatus = ProviderSessionStatus.Ready,
        IdempotencyKey = idempotencyKey
    };

    private static async Task<Outcome<T>> CaptureAsync<T>(Func<Task<T>> action)
    {
        try { return new(await action(), null); }
        catch (Exception exception) { return new(default, exception); }
    }

    private static async Task<Exception?> CaptureSaveAsync(BetccoDbContext db)
    {
        try { await db.SaveChangesAsync(); return null; }
        catch (Exception exception) { return exception; }
    }

    private static bool HasPostgresCode(Exception? exception, string code)
    {
        for (var current = exception; current is not null; current = current.InnerException)
            if (current is PostgresException postgres && postgres.SqlState == code) return true;
        return false;
    }

    private static void AssertPostgresCode(Exception exception, string code) =>
        Assert.True(HasPostgresCode(exception, code), $"Expected PostgreSQL code {code}, got {exception.GetType().Name}: {exception.Message}");

    private sealed record Outcome<T>(T? Value, Exception? Error);
    private sealed record CourseScenario(Guid CourseId, IReadOnlyList<CartIdentity> Carts);
    private sealed record CartIdentity(Guid Id, string OwnerKey);
    private sealed record PaidPayment(Guid PaymentId, decimal Total);

    private sealed class CountingPaymentProvider(
        TimeSpan? delay = null,
        bool createUnknown = false,
        Func<Guid, IReadOnlyCollection<PaymentCheckoutRecovery>>? recoveries = null) : IPaymentProvider
    {
        private int createCalls;
        public string ProviderName => "FakePostgres";
        public TimeSpan? CheckoutSessionUncertaintyWindow => TimeSpan.FromMinutes(30);
        public int CreateCalls => createCalls;

        public async Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref createCalls);
            if (delay is not null) await Task.Delay(delay.Value, cancellationToken);
            if (createUnknown) throw new PaymentSessionResultUnknownException("Simulated unknown provider result.");
            return new(ProviderName, $"pg_{request.PaymentId:N}", "https://betcco.test/checkout", true);
        }

        public Task<IReadOnlyCollection<PaymentCheckoutRecovery>> QueryCheckoutSessionsAsync(Guid paymentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(recoveries?.Invoke(paymentId) ?? []);

        public Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class BlockingPayoutProvider : IPayoutProvider
    {
        private readonly TaskCompletionSource<PayoutTransferResult> completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int calls;
        public TaskCompletionSource<bool> Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public string ProviderName => "FakePostgresPayout";
        public bool IsAvailable => true;
        public int Calls => calls;

        public Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref calls);
            Started.TrySetResult(true);
            return completion.Task;
        }

        public void Complete() => completion.TrySetResult(new(ProviderName, "pg-payout-reference", "CONFIRMED", true, false));
    }
}
