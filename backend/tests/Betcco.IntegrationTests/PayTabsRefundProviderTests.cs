using System.Data.Common;
using System.Net;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit.Abstractions;

namespace Betcco.IntegrationTests;

public sealed class PayTabsRefundProviderTests(ITestOutputHelper output)
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Verified_PayTabs_full_refund_of_taxed_course_finalizes_accounting()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_taxed_refund");
        Guid paymentId;
        Guid entitlementId;
        await using (var purchaseDb = database.CreateContext())
        {
            var cart = await AddTaxedCourseCartAsync(purchaseDb);
            var saleHandler = new PaidCourseSaleHandler();
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PayTabs:ProfileId"] = "123456",
                ["APP_PUBLIC_URL"] = "https://betcco.test"
            }).Build();
            var commerce = new CommerceService(purchaseDb, CreateProvider(saleHandler), null, configuration);
            var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "taxed-course-checkout");
            Assert.NotNull(checkout);
            paymentId = checkout.PaymentId;
            Assert.True(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(paymentId), PaidCourseSaleHandler.SaleReference));
            Assert.Equal(2, saleHandler.RequestCount);

            var payment = await purchaseDb.Payments.SingleAsync(item => item.Id == paymentId);
            Assert.Equal(PaymentStatus.Paid, payment.Status);
            Assert.Equal(100m, payment.Subtotal);
            Assert.Equal(16m, payment.Tax);
            Assert.Equal(116m, payment.Total);
            var allocation = Assert.Single(await purchaseDb.CourseSaleAllocations.Where(item => item.PaymentId == paymentId).ToListAsync());
            Assert.Equal(100m, allocation.NetAmount);
            var sale = Assert.Single(await purchaseDb.LedgerTransactions.Include(item => item.Entries).Where(item => item.PaymentId == paymentId).ToListAsync());
            Assert.Equal(sale.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount),
                sale.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount));
            Assert.Equal(2, await purchaseDb.WalletTransactions.CountAsync(item => item.PaymentId == paymentId));
            var entitlement = Assert.Single(await purchaseDb.IncludedEvaluationEntitlements.Where(item => item.GrantedByPaymentId == paymentId).ToListAsync());
            entitlementId = entitlement.Id;
            Assert.Null(entitlement.ConsumedAtUtc);
            Assert.Null(entitlement.RevokedAtUtc);
        }

        await using var refundDb = database.CreateContext();
        var refundHandler = new RefundHandler();
        var result = await new RefundService(refundDb, CreateProvider(refundHandler))
            .InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "taxed-full-refund"));

        await using var observed = database.CreateContext();
        var persistedPayment = await observed.Payments.SingleAsync(item => item.Id == paymentId);
        var persistedRefund = await observed.Refunds.SingleAsync(item => item.PaymentId == paymentId);
        var persistedEntitlement = await observed.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId);
        var allocationNetTotal = await observed.CourseSaleAllocations.Where(item => item.PaymentId == paymentId).SumAsync(item => item.NetAmount);
        var ledgerReversals = await observed.LedgerTransactions.CountAsync(item => item.RefundId == persistedRefund.Id);
        var walletReversals = await observed.WalletTransactions.CountAsync(item => item.RefundId == persistedRefund.Id);
        await using var replayDb = database.CreateContext();
        var replay = await new RefundService(replayDb, CreateProvider(refundHandler)).VerifyPayTabsRefundAsync("finance", persistedRefund.Id);
        output.WriteLine($"Payment: Subtotal={persistedPayment.Subtotal}, Tax={persistedPayment.Tax}, Total={persistedPayment.Total}, Status={persistedPayment.Status}; AllocationNetTotal={allocationNetTotal}; Refund: Amount={persistedRefund.Amount}, Status={persistedRefund.Status}, ProviderReferenceRetained={persistedRefund.ProviderRefundReference is not null}; ResultFailureCode={result.FailureCode}; ReplayFailureCode={replay.FailureCode}; ProviderRequests={refundHandler.RequestBodies.Count}; LedgerReversals={ledgerReversals}; WalletReversals={walletReversals}; CreditRevoked={persistedEntitlement.RevokedAtUtc is not null}");

        Assert.Equal(100m, allocationNetTotal);
        Assert.Equal(116m, persistedRefund.Amount);
        Assert.Equal(2, refundHandler.RequestBodies.Count);
        Assert.NotNull(persistedRefund.ProviderRefundReference);
        Assert.Single(await observed.RefundStatusTransitions.Where(item => item.RefundId == persistedRefund.Id && item.NewStatus == RefundStatus.ProviderVerified).ToListAsync());
        Assert.Null(result.FailureCode);
        Assert.Equal(RefundStatus.InternallyRecorded, persistedRefund.Status);
        Assert.Equal(PaymentStatus.Refunded, persistedPayment.Status);
        Assert.Equal(1, ledgerReversals);
        Assert.Equal(2, walletReversals);
        Assert.Equal(persistedRefund.Id, persistedEntitlement.RevokedByRefundId);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Verified_PayTabs_full_refund_with_unused_included_credit_finalizes_accounting_and_revokes_credit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_unused_credit");
        await using var seed = database.CreateContext();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed);
        await using var db = database.CreateContext();
        var handler = new RefundHandler();
        var service = new RefundService(db, CreateProvider(handler));

        try
        {
            var result = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "paytabs-unused-credit"));
            var refund = Assert.IsType<RefundView>(result.Refund);
            Assert.Equal(nameof(RefundStatus.InternallyRecorded), refund.Status);
            Assert.Equal(nameof(RefundEntitlementDisposition.UnusedIncludedEvaluationCreditsRevoked), refund.EntitlementDisposition);
            Assert.Equal(2, handler.RequestBodies.Count);

            await using var verify = database.CreateContext();
            Assert.Equal(PaymentStatus.Refunded, await verify.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync());
            var credit = await verify.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId);
            Assert.Equal(refund.Id, credit.RevokedByRefundId);
            Assert.NotNull(credit.RevokedAtUtc);
            Assert.Null(credit.ConsumedByEvaluationRequestId);
            Assert.Equal(RefundEntitlementDisposition.UnusedIncludedEvaluationCreditsRevoked,
                await verify.Refunds.Where(item => item.Id == refund.Id).Select(item => item.EntitlementDisposition).SingleAsync());
            Assert.Single(await verify.LedgerTransactions.Where(item => item.RefundId == refund.Id).ToListAsync());
            Assert.Equal(2, await verify.WalletTransactions.CountAsync(item => item.RefundId == refund.Id));
            Assert.Single(await verify.PaymentStatusTransitions.Where(item => item.PaymentId == paymentId && item.NewStatus == PaymentStatus.Refunded).ToListAsync());

            await using var replayDb = database.CreateContext();
            var replay = await new RefundService(replayDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refund.Id);
            Assert.True(replay.IsIdempotentReplay);
            Assert.Equal(2, handler.RequestBodies.Count);
            Assert.Single(await replayDb.LedgerTransactions.Where(item => item.RefundId == refund.Id).ToListAsync());
            Assert.Equal(2, await replayDb.WalletTransactions.CountAsync(item => item.RefundId == refund.Id));
            Assert.Single(await replayDb.AuditLogs.Where(item => item.Action == "IncludedEvaluationCreditRevokedByRefund" && item.EntityId == entitlementId.ToString()).ToListAsync());
            Assert.Equal(credit.RevokedAtUtc,
                await replayDb.IncludedEvaluationEntitlements.Where(item => item.Id == entitlementId).Select(item => item.RevokedAtUtc).SingleAsync());

            await using var mutationDb = database.CreateContext();
            var recordedRefund = await mutationDb.Refunds.SingleAsync(item => item.Id == refund.Id);
            recordedRefund.EntitlementDisposition = RefundEntitlementDisposition.NotChangedPendingBusinessPolicy;
            await Assert.ThrowsAsync<InvalidOperationException>(() => mutationDb.SaveChangesAsync());
        }
        catch (Exception exception)
        {
            await using var verify = database.CreateContext();
            var paymentStatus = await verify.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync();
            var persistedRefund = await verify.Refunds.SingleOrDefaultAsync(item => item.PaymentId == paymentId);
            var credit = await verify.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId);
            var reversals = await verify.LedgerTransactions.CountAsync(item => item.RefundId != null);
            var modifiedRefundProperties = db.ChangeTracker.Entries<Refund>()
                .SelectMany(entry => entry.Properties.Where(property => property.IsModified).Select(property => property.Metadata.Name))
                .Distinct()
                .OrderBy(name => name)
                .ToArray();
            output.WriteLine($"Failure: {exception.GetType().Name}: {exception.Message}");
            output.WriteLine($"Tracked Refund changes: {string.Join(", ", modifiedRefundProperties)}");
            output.WriteLine($"Provider requests: {handler.RequestBodies.Count}; Provider reference retained: {persistedRefund?.ProviderRefundReference is not null}; Payment: {paymentStatus}; Refund: {persistedRefund?.Status}; Disposition: {persistedRefund?.EntitlementDisposition}; Credit revoked: {credit.RevokedAtUtc is not null}; Ledger reversals: {reversals}");
            throw;
        }
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Persisted_provider_verified_taxed_refund_recovers_locally_and_replay_has_no_new_effects()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_verified_recovery");
        Guid paymentId;
        Guid entitlementId;
        Guid refundId;
        await using (var seed = database.CreateContext())
        {
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, 16m, 116m);
            refundId = await AddProviderVerifiedRefundAsync(seed, paymentId);
        }

        var handler = new RefundHandler();
        await using (var recoveryDb = database.CreateContext())
        {
            var result = await new RefundService(recoveryDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.Null(result.FailureCode);
            Assert.Equal(nameof(RefundStatus.InternallyRecorded), result.Refund!.Status);
            Assert.False(result.IsIdempotentReplay);
        }

        await using (var replayDb = database.CreateContext())
        {
            var replay = await new RefundService(replayDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.True(replay.IsIdempotentReplay);
            Assert.Null(replay.FailureCode);
        }

        await using var verify = database.CreateContext();
        await AssertRecoveredOnceAsync(verify, paymentId, refundId, entitlementId);
        Assert.Empty(handler.RequestBodies);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Invalid_stored_provider_verification_requires_review_without_financial_mutation(bool includeVerificationTransition, bool mismatchReference)
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_invalid_evidence");
        Guid paymentId;
        Guid entitlementId;
        Guid refundId;
        await using (var seed = database.CreateContext())
        {
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, 16m, 116m);
            refundId = await AddProviderVerifiedRefundAsync(seed, paymentId, includeVerificationTransition, mismatchReference);
        }

        var handler = new RefundHandler();
        await using (var recoveryDb = database.CreateContext())
        {
            var result = await new RefundService(recoveryDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.Equal("PAYTABS_REFUND_REQUIRES_REVIEW", result.FailureCode);
            Assert.Equal(nameof(RefundStatus.ProviderVerified), result.Refund!.Status);
        }

        await using var verify = database.CreateContext();
        Assert.Equal(PaymentStatus.Paid, await verify.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync());
        Assert.Equal(RefundStatus.ProviderVerified, await verify.Refunds.Where(item => item.Id == refundId).Select(item => item.Status).SingleAsync());
        Assert.Empty(await verify.LedgerTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Empty(await verify.WalletTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Empty(await verify.PaymentStatusTransitions.Where(item => item.PaymentId == paymentId && item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Empty(await verify.RefundStatusTransitions.Where(item => item.RefundId == refundId && item.NewStatus == RefundStatus.InternallyRecorded).ToListAsync());
        Assert.Null(await verify.IncludedEvaluationEntitlements.Where(item => item.Id == entitlementId).Select(item => item.RevokedAtUtc).SingleAsync());
        Assert.Empty(handler.RequestBodies);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Provider_verified_recovery_with_invalid_revenue_allocation_stays_verified()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_recovery_allocation");
        Guid paymentId;
        Guid entitlementId;
        Guid refundId;
        await using (var seed = database.CreateContext())
        {
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, 15m, 116m);
            refundId = await AddProviderVerifiedRefundAsync(seed, paymentId);
        }

        var handler = new RefundHandler();
        await using (var recoveryDb = database.CreateContext())
        {
            var result = await new RefundService(recoveryDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.Equal("REFUND_ALLOCATION_POLICY_REQUIRED", result.FailureCode);
            Assert.Equal(nameof(RefundStatus.ProviderVerified), result.Refund!.Status);
        }

        await using var verify = database.CreateContext();
        Assert.Equal(PaymentStatus.Paid, await verify.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync());
        Assert.Empty(await verify.LedgerTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Empty(await verify.WalletTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Null(await verify.IncludedEvaluationEntitlements.Where(item => item.Id == entitlementId).Select(item => item.RevokedAtUtc).SingleAsync());
        Assert.Empty(handler.RequestBodies);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Concurrent_provider_verified_recovery_commits_one_set_of_financial_effects()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("paytabs_concurrent_recovery");
        Guid paymentId;
        Guid entitlementId;
        Guid refundId;
        await using (var seed = database.CreateContext())
        {
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, 16m, 116m);
            refundId = await AddProviderVerifiedRefundAsync(seed, paymentId);
        }

        var barrier = new RefundUpdateBarrier();
        var handler = new RefundHandler();
        await using var firstDb = database.CreateContext(barrier);
        await using var secondDb = database.CreateContext(barrier);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var first = new RefundService(firstDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance-one", refundId, timeout.Token);
        var second = new RefundService(secondDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance-two", refundId, timeout.Token);
        var results = await Task.WhenAll(first, second);

        Assert.Equal(2, barrier.Arrivals);
        Assert.All(results, result => Assert.Null(result.FailureCode));
        Assert.Single(results, result => result.IsIdempotentReplay);
        await using var verify = database.CreateContext();
        await AssertRecoveredOnceAsync(verify, paymentId, refundId, entitlementId);
        Assert.Empty(handler.RequestBodies);
    }

    [Fact]
    public async Task Verified_full_refund_uses_trusted_sale_data_and_finalizes_accounting_once()
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db);
        var originalLedger = await db.LedgerTransactions.Include(item => item.Entries).SingleAsync();
        var originalEntryIds = originalLedger.Entries.Select(item => item.Id).ToArray();
        var handler = new RefundHandler();
        var service = new RefundService(db, CreateProvider(handler));

        var initiated = await service.InitiatePayTabsRefundAsync("finance", new(payment.Id, "CustomerRequest", "client supplied note", "refund-key"));

        var refund = Assert.IsType<RefundView>(initiated.Refund);
        Assert.Equal(nameof(RefundStatus.InternallyRecorded), refund.Status);
        using (var request = JsonDocument.Parse(handler.RequestBodies.First()))
        {
            Assert.Equal(123456L, request.RootElement.GetProperty("profile_id").GetInt64());
            Assert.Equal("refund", request.RootElement.GetProperty("tran_type").GetString());
            Assert.Equal("ecom", request.RootElement.GetProperty("tran_class").GetString());
            Assert.Equal("SALE-TRUSTED-REF", request.RootElement.GetProperty("tran_ref").GetString());
            Assert.Equal("JOD", request.RootElement.GetProperty("cart_currency").GetString());
            Assert.Equal(100m, request.RootElement.GetProperty("cart_amount").GetDecimal());
            Assert.Equal(PayTabsPaymentProvider.RefundCartId(refund.Id), request.RootElement.GetProperty("cart_id").GetString());
        }
        Assert.DoesNotContain("server-key-test", JsonSerializer.Serialize(refund));

        var replay = await service.VerifyPayTabsRefundAsync("finance", refund.Id);

        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(PaymentStatus.Refunded, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        var reversal = Assert.Single(await db.LedgerTransactions.Include(item => item.Entries).Where(item => item.RefundId == refund.Id).ToListAsync());
        Assert.Equal(reversal.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount), reversal.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount));
        Assert.Equal(2, await db.LedgerTransactions.CountAsync());
        Assert.Equal(originalEntryIds, (await db.LedgerTransactions.Include(item => item.Entries).SingleAsync(item => item.Id == originalLedger.Id)).Entries.Select(item => item.Id).ToArray());
        Assert.Equal(2, await db.WalletTransactions.CountAsync(item => item.RefundId == refund.Id));
        Assert.Equal(2, handler.RequestBodies.Count);
    }

    [Theory]
    [InlineData(-1, 100)]
    [InlineData(101, 100)]
    public async Task Invalid_paid_payment_tax_snapshot_never_finalizes_internal_accounting(int tax, int total)
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db, tax, total);
        var service = new RefundService(db, CreateProvider(new RefundHandler()));

        var result = await service.InitiatePayTabsRefundAsync("finance", new(payment.Id, "CustomerRequest", null, $"invalid-tax-{tax}"));

        Assert.Equal("REFUND_ALLOCATION_POLICY_REQUIRED", result.FailureCode);
        Assert.Equal(nameof(RefundStatus.ProviderVerified), result.Refund!.Status);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Empty(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Empty(await db.LedgerTransactions.Where(item => item.RefundId == result.Refund.Id).ToListAsync());
        Assert.Empty(await db.WalletTransactions.Where(item => item.RefundId == result.Refund.Id).ToListAsync());
    }

    [Theory]
    [InlineData(RefundResponseMode.Declined, "ProviderFailed")]
    [InlineData(RefundResponseMode.AmountMismatch, "ProviderResultUnknown")]
    [InlineData(RefundResponseMode.CurrencyMismatch, "ProviderResultUnknown")]
    [InlineData(RefundResponseMode.CartMismatch, "ProviderResultUnknown")]
    [InlineData(RefundResponseMode.ReferenceMismatch, "ProviderResultUnknown")]
    public async Task Declined_or_mismatched_provider_response_never_finalizes_internal_accounting(RefundResponseMode mode, string expectedStatus)
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db);
        var service = new RefundService(db, CreateProvider(new RefundHandler(mode)));

        var result = await service.InitiatePayTabsRefundAsync("finance", new(payment.Id, "CustomerRequest", null, $"{mode}"));

        Assert.Equal(expectedStatus, result.Refund!.Status);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
    }

    [Fact]
    public async Task Timeout_becomes_requires_review_and_same_idempotency_key_does_not_retry_provider()
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db);
        var handler = new RefundHandler(RefundResponseMode.Timeout);
        var operationalLogger = new OperationalSignalTestLogger<RefundService>();
        var service = new RefundService(db, CreateProvider(handler), operationalLogger);
        var request = new InitiatePayTabsRefund(payment.Id, "CustomerRequest", null, "timeout-key");

        var first = await service.InitiatePayTabsRefundAsync("finance", request);
        var replay = await service.InitiatePayTabsRefundAsync("finance", request);

        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), first.Refund!.Status);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Single(handler.RequestBodies);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
        var signal = Assert.Single(operationalLogger.Entries);
        Assert.Equal(OperationalEventIds.RefundResultUnknown, signal.EventId);
        Assert.Contains(payment.Id.ToString(), signal.Message);
        Assert.DoesNotContain("secret", signal.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Accepted_immediate_response_without_query_confirmation_does_not_finalize_accounting()
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db);
        var handler = new RefundHandler(RefundResponseMode.QueryTimeout);
        var service = new RefundService(db, CreateProvider(handler));

        var result = await service.InitiatePayTabsRefundAsync("finance", new(payment.Id, "CustomerRequest", null, "query-timeout"));

        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), result.Refund!.Status);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
        Assert.Equal(2, handler.RequestBodies.Count);
    }

    [Theory]
    [InlineData("P")]
    [InlineData("H")]
    [InlineData("Z")]
    public async Task Nonfinal_create_response_retains_reference_without_financial_effects_or_retry(string status)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RefundHandler(createStatus: status);
        var service = new RefundService(db, CreateProvider(handler));
        var request = new InitiatePayTabsRefund(paymentId, "CustomerRequest", null, $"nonfinal-{status}");

        var result = await service.InitiatePayTabsRefundAsync("finance", request);
        var replay = await service.InitiatePayTabsRefundAsync("finance", request);

        var refund = Assert.IsType<RefundView>(result.Refund);
        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), refund.Status);
        Assert.Equal("REFUND-TRUSTED-REF", (await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Single(await db.Refunds.ToListAsync());
        Assert.Single(handler.RequestBodies);
        await AssertNoRefundEffectsAsync(db, paymentId, refund.Id, entitlementId);
    }

    [Theory]
    [InlineData("P")]
    [InlineData("H")]
    [InlineData("Z")]
    public async Task Nonfinal_refund_query_stays_recoverable_then_authorized_query_finalizes_once(string queryStatus)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RefundHandler(createStatus: "P", queryStatus: queryStatus);
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "pending-then-authorized"));
        var refundId = created.Refund!.Id;
        var pending = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), pending.Refund!.Status);
        Assert.Equal("REFUND-TRUSTED-REF", (await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(2, handler.RequestBodies.Count);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);

        handler.QueryStatus = "A";
        var authorized = await service.VerifyPayTabsRefundAsync("finance", refundId);
        var replay = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal(nameof(RefundStatus.InternallyRecorded), authorized.Refund!.Status);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(3, handler.RequestBodies.Count);
        Assert.Equal(PaymentStatus.Refunded, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.LedgerTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync(item => item.RefundId == refundId));
        Assert.Single(await db.RefundStatusTransitions.Where(item => item.RefundId == refundId && item.NewStatus == RefundStatus.ProviderVerified).ToListAsync());
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.PaymentId == paymentId && item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Equal(refundId, (await db.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId)).RevokedByRefundId);
    }

    [Theory]
    [InlineData("D")]
    [InlineData("E")]
    public async Task Pending_refund_then_final_query_failure_has_no_accounting(string finalStatus)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RefundHandler(createStatus: "P", queryStatus: finalStatus);
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, $"pending-then-{finalStatus}"));
        var refundId = created.Refund!.Id;
        var failed = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal(nameof(RefundStatus.ProviderFailed), failed.Refund!.Status);
        Assert.Equal("REFUND-TRUSTED-REF", (await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(2, handler.RequestBodies.Count);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    private static async Task AssertNoRefundEffectsAsync(BetccoDbContext db, Guid paymentId, Guid refundId, Guid entitlementId)
    {
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync(item => item.Id == paymentId)).Status);
        Assert.Empty(await db.PaymentStatusTransitions.Where(item => item.PaymentId == paymentId && item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Empty(await db.LedgerTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Empty(await db.WalletTransactions.Where(item => item.RefundId == refundId).ToListAsync());
        Assert.Equal(RefundEntitlementDisposition.NotChangedPendingBusinessPolicy, (await db.Refunds.SingleAsync(item => item.Id == refundId)).EntitlementDisposition);
        var credit = await db.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId);
        Assert.Null(credit.RevokedAtUtc);
        Assert.Null(credit.RevokedByRefundId);
        Assert.Null((await db.Enrollments.SingleAsync(item => item.PaymentId == paymentId)).AccessEndsAtUtc);
    }

    [Fact]
    public async Task Create_timeout_then_empty_cart_query_stays_unknown_without_resending()
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler();
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-empty"));
        var refundId = created.Refund!.Id;
        var first = await service.VerifyPayTabsRefundAsync("finance", refundId);
        var second = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_RECOVERY_NOT_FOUND", first.FailureCode);
        Assert.Equal("PAYTABS_REFUND_RECOVERY_NOT_FOUND", second.FailureCode);
        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), second.Refund!.Status);
        Assert.Null((await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(2, handler.CartQueries);
        Assert.Equal(0, handler.ReferenceQueries);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Theory]
    [InlineData("P")]
    [InlineData("H")]
    [InlineData("V")]
    [InlineData("Z")]
    public async Task Recovered_reference_with_nonfinal_query_remains_unknown(string status)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { Candidates = [new()], ReferenceStatus = status };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, $"recover-{status}"));
        var refundId = created.Refund!.Id;
        var recovered = await service.VerifyPayTabsRefundAsync("finance", refundId);
        var repeated = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), recovered.Refund!.Status);
        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), repeated.Refund!.Status);
        Assert.Equal("REFUND-RECOVERED", (await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(1, handler.CartQueries);
        Assert.Equal(2, handler.ReferenceQueries);
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "PayTabsRefundReferenceRecovered" && item.EntityId == refundId.ToString()).ToListAsync());
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Theory]
    [InlineData("D")]
    [InlineData("E")]
    [InlineData("X")]
    public async Task Recovered_reference_with_final_failure_has_no_financial_effects(string status)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { Candidates = [new()], ReferenceStatus = status };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, $"recover-failed-{status}"));
        var refundId = created.Refund!.Id;
        var failed = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal(nameof(RefundStatus.ProviderFailed), failed.Refund!.Status);
        Assert.Equal("REFUND-RECOVERED", (await db.Refunds.SingleAsync(item => item.Id == refundId)).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(1, handler.CartQueries);
        Assert.Equal(1, handler.ReferenceQueries);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Fact]
    public async Task Two_trusted_cart_candidates_are_ambiguous_even_if_one_is_authorized()
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { Candidates = [new(), new RecoveryCandidate(Reference: "REFUND-SECOND", Status: "A")] };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-ambiguous"));
        var refundId = created.Refund!.Id;
        var result = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_RECOVERY_AMBIGUOUS", result.FailureCode);
        Assert.Null((await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(0, handler.ReferenceQueries);
        Assert.Equal(1, handler.CreateCalls);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Fact]
    public async Task One_trusted_candidate_can_be_recovered_among_untrusted_results()
    {
        await using var db = CreateDb();
        var (paymentId, _) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { Candidates = [new RecoveryCandidate(Reference: "OTHER-REFUND", Amount: 99m), new()] };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-one-match"));
        var result = await service.VerifyPayTabsRefundAsync("finance", created.Refund!.Id);

        Assert.Equal(nameof(RefundStatus.InternallyRecorded), result.Refund!.Status);
        Assert.Equal("REFUND-RECOVERED", (await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(1, handler.CartQueries);
        Assert.Equal(1, handler.ReferenceQueries);
    }

    [Theory]
    [InlineData("amount")]
    [InlineData("currency")]
    [InlineData("cart")]
    [InlineData("profile")]
    [InlineData("type")]
    [InlineData("previous")]
    [InlineData("missing-previous")]
    [InlineData("missing-reference")]
    public async Task Mismatched_cart_candidate_cannot_bind_reference(string mismatch)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var candidate = mismatch switch
        {
            "amount" => new RecoveryCandidate(Amount: 99m),
            "currency" => new RecoveryCandidate(Currency: "USD"),
            "cart" => new RecoveryCandidate(CartId: "WRONG-CART"),
            "profile" => new RecoveryCandidate(ProfileId: 99),
            "type" => new RecoveryCandidate(TransactionType: "sale"),
            "previous" => new RecoveryCandidate(PreviousReference: "WRONG-SALE"),
            "missing-previous" => new RecoveryCandidate(PreviousReference: null),
            "missing-reference" => new RecoveryCandidate(Reference: null),
            _ => throw new InvalidOperationException()
        };
        var handler = new RecoveryHandler { Candidates = [candidate] };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, $"recover-mismatch-{mismatch}"));
        var refundId = created.Refund!.Id;
        var result = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_RECOVERY_UNVERIFIED", result.FailureCode);
        Assert.Null((await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(0, handler.ReferenceQueries);
        Assert.Equal(1, handler.CreateCalls);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Fact]
    public async Task Recovered_reference_already_bound_to_another_refund_requires_review()
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { Candidates = [new()] };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-conflict"));
        var refundId = created.Refund!.Id;
        db.Refunds.Add(new Refund { PaymentId = paymentId, Amount = 100m, Currency = "JOD", ReasonCode = "Existing", RequestedByUserId = "finance", IdempotencyKey = "other", ProviderName = "PayTabs", ProviderRefundReference = "REFUND-RECOVERED", CorrelationReference = "refund:other", CreatedByUserId = "finance" });
        await db.SaveChangesAsync();

        var result = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_REFERENCE_CONFLICT", result.FailureCode);
        Assert.Null((await db.Refunds.SingleAsync(item => item.Id == refundId)).ProviderRefundReference);
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "PayTabsRefundReferenceConflict" && item.EntityId == refundId.ToString()).ToListAsync());
        Assert.Equal(0, handler.ReferenceQueries);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task Unavailable_cart_query_stays_unknown(HttpStatusCode status)
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { DiscoveryStatus = status };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, $"recover-http-{status}"));
        var refundId = created.Refund!.Id;
        var result = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_RECOVERY_RESULT_UNKNOWN", result.FailureCode);
        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), result.Refund!.Status);
        Assert.Null((await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Fact]
    public async Task Invalid_cart_query_shape_stays_unknown()
    {
        await using var db = CreateDb();
        var (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(db);
        var handler = new RecoveryHandler { DiscoveryPayloadOverride = "{}" };
        var service = new RefundService(db, CreateProvider(handler));

        var created = await service.InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-invalid-shape"));
        var refundId = created.Refund!.Id;
        var result = await service.VerifyPayTabsRefundAsync("finance", refundId);

        Assert.Equal("PAYTABS_REFUND_RECOVERY_RESULT_UNKNOWN", result.FailureCode);
        Assert.Null((await db.Refunds.SingleAsync()).ProviderRefundReference);
        Assert.Equal(1, handler.CreateCalls);
        await AssertNoRefundEffectsAsync(db, paymentId, refundId, entitlementId);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Timed_out_taxed_full_refund_recovers_reference_and_finalizes_once()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("refund_cart_recovery");
        Guid paymentId;
        Guid entitlementId;
        await using (var seed = database.CreateContext())
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, tax: 16m, total: 116m);
        var handler = new RecoveryHandler { Candidates = [new()] };
        Guid refundId;
        await using (var createDb = database.CreateContext())
        {
            var created = await new RefundService(createDb, CreateProvider(handler))
                .InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-taxed-full"));
            refundId = created.Refund!.Id;
            Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), created.Refund.Status);
            Assert.Null(created.Refund.ProviderRefundReference);
        }

        await using (var verifyDb = database.CreateContext())
        {
            var recovered = await new RefundService(verifyDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.Equal(nameof(RefundStatus.InternallyRecorded), recovered.Refund!.Status);
        }
        await using (var replayDb = database.CreateContext())
        {
            var replay = await new RefundService(replayDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance", refundId);
            Assert.True(replay.IsIdempotentReplay);
        }

        await using var observed = database.CreateContext();
        await AssertRecoveredOnceAsync(observed, paymentId, refundId, entitlementId);
        Assert.Equal("REFUND-RECOVERED", (await observed.Refunds.SingleAsync(item => item.Id == refundId)).ProviderRefundReference);
        Assert.Null((await observed.Enrollments.SingleAsync(item => item.PaymentId == paymentId)).AccessEndsAtUtc);
        Assert.Single(await observed.AuditLogs.Where(item => item.Action == "PayTabsRefundReferenceRecovered" && item.EntityId == refundId.ToString()).ToListAsync());
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(1, handler.CartQueries);
        Assert.Equal(1, handler.ReferenceQueries);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Competing_reference_recoveries_bind_and_finalize_taxed_refund_once()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("refund_cart_race");
        Guid paymentId;
        Guid entitlementId;
        await using (var seed = database.CreateContext())
            (paymentId, entitlementId) = await AddPaidCourseSaleWithUnusedCreditAsync(seed, tax: 16m, total: 116m);
        var handler = new RecoveryHandler { Candidates = [new()] };
        Guid refundId;
        await using (var createDb = database.CreateContext())
            refundId = (await new RefundService(createDb, CreateProvider(handler))
                .InitiatePayTabsRefundAsync("finance", new(paymentId, "CustomerRequest", null, "recover-race"))).Refund!.Id;

        var barrier = new RefundUpdateBarrier();
        await using var firstDb = database.CreateContext(barrier);
        await using var secondDb = database.CreateContext(barrier);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        var first = new RefundService(firstDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance-one", refundId, timeout.Token);
        var second = new RefundService(secondDb, CreateProvider(handler)).VerifyPayTabsRefundAsync("finance-two", refundId, timeout.Token);
        var results = await Task.WhenAll(first, second).WaitAsync(timeout.Token);

        Assert.True(barrier.Arrivals >= 2);
        Assert.All(results, result => Assert.Equal(nameof(RefundStatus.InternallyRecorded), result.Refund!.Status));
        await using var observed = database.CreateContext();
        await AssertRecoveredOnceAsync(observed, paymentId, refundId, entitlementId);
        Assert.Single(await observed.AuditLogs.Where(item => item.Action == "PayTabsRefundReferenceRecovered" && item.EntityId == refundId.ToString()).ToListAsync());
        Assert.Equal(1, handler.CreateCalls);
        Assert.Equal(2, handler.CartQueries);
        Assert.InRange(handler.ReferenceQueries, 1, 2);
    }

    [Fact]
    public async Task Existing_partial_refund_evidence_cannot_be_sent_to_paytabs()
    {
        await using var db = CreateDb();
        var payment = await AddPaidCourseSaleAsync(db);
        db.Refunds.Add(new Refund { PaymentId = payment.Id, Amount = 25m, Currency = "JOD", ReasonCode = "CustomerRequest", RequestedByUserId = "finance", IdempotencyKey = "partial-evidence", CorrelationReference = "refund:partial", CreatedByUserId = "finance" });
        await db.SaveChangesAsync();
        var handler = new RefundHandler();
        var service = new RefundService(db, CreateProvider(handler));

        var result = await service.InitiatePayTabsRefundAsync("finance", new(payment.Id, "CustomerRequest", null, "provider-full"));

        Assert.Equal("PARTIAL_REFUND_PROVIDER_EXECUTION_DISABLED", result.FailureCode);
        Assert.Empty(handler.RequestBodies);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
    }

    private static PayTabsPaymentProvider CreateProvider(HttpMessageHandler handler) => new(new HttpClient(handler) { BaseAddress = new Uri("https://secure-jordan.paytabs.com/") }, Options.Create(new PayTabsOptions { ProfileId = 123456, ServerKey = "server-key-test", BaseUrl = "https://secure-jordan.paytabs.com", Environment = PayTabsEnvironment.Test }));

    private static async Task<Cart> AddTaxedCourseCartAsync(BetccoDbContext db)
    {
        var token = Guid.NewGuid().ToString("N");
        var track = new LearningTrack { Slug = $"taxed-refund-track-{token}", ArabicName = "مسار", EnglishName = "Track" };
        var qualification = new Qualification { Code = $"TAXED-REFUND-{token}", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "integration test" };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit", IsActive = true };
        var course = new Course { Slug = $"taxed-refund-course-{token}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        course.Modules.Add(new CourseModule { Course = course, UnitDefinition = unit, ArabicTitle = "وحدة", EnglishTitle = "Unit", UnitCode = unit.Code, IsPublished = true });
        var cart = new Cart { OwnerKey = $"taxed-refund-cart-{token}", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        var taxSetting = await db.SiteSettings.SingleOrDefaultAsync(item => item.Key == "SalesTaxPercent");
        if (taxSetting is null)
            db.SiteSettings.Add(new SiteSetting { Key = "SalesTaxPercent", ArabicValue = "16", EnglishValue = "16" });
        else
            taxSetting.EnglishValue = "16";
        db.AddRange(track, qualification, version, unit, course, cart);
        await db.SaveChangesAsync();
        return cart;
    }

    private sealed class PaidCourseSaleHandler : HttpMessageHandler
    {
        public const string SaleReference = "SALE-TAXED-REF";
        public int RequestCount { get; private set; }
        private string? cartId;
        private decimal amount;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            if (request.RequestUri!.AbsolutePath.EndsWith("/payment/request", StringComparison.Ordinal))
            {
                cartId = body.RootElement.GetProperty("cart_id").GetString();
                amount = body.RootElement.GetProperty("cart_amount").GetDecimal();
                return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { tran_ref = SaleReference, redirect_url = "https://secure-jordan.paytabs.com/payment/page/test" })) };
            }

            return new(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    profile_id = 123456,
                    tran_ref = SaleReference,
                    cart_id = cartId,
                    cart_currency = "JOD",
                    cart_amount = amount,
                    payment_result = new { response_status = "A", response_code = "100" }
                }))
            };
        }
    }

    private static async Task<Payment> AddPaidCourseSaleAsync(BetccoDbContext db, decimal tax = 0m, decimal total = 100m)
    {
        var payment = new Payment { UserId = "student", Purpose = "CourseCart", ReferenceId = Guid.NewGuid(), Status = PaymentStatus.Paid, Subtotal = 100m, Tax = tax, Total = total, Currency = "JOD", Provider = "PayTabs", ProviderPaymentId = "SALE-TRUSTED-REF" };
        var allocation = new CourseSaleAllocation { PaymentId = payment.Id, CourseId = Guid.NewGuid(), TeacherUserId = "teacher", GrossAmount = 100m, NetAmount = 100m, PlatformCommission = 30m, TeacherEarning = 70m, Currency = "JOD" };
        var clearing = new LedgerAccount { Code = LedgerAccountCode.CourseSaleClearing, Currency = "JOD" };
        var commission = new LedgerAccount { Code = LedgerAccountCode.PlatformCommission, Currency = "JOD" };
        var teacher = new LedgerAccount { Code = LedgerAccountCode.TeacherEarningsPayable, Currency = "JOD" };
        var sale = new LedgerTransaction { EventType = LedgerEventType.PaidCourseSale, Currency = "JOD", Payment = payment, IdempotencyKey = "sale", BusinessEventReference = "sale:original" };
        sale.Entries.Add(new LedgerEntry { LedgerAccount = clearing, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = 100m, Currency = "JOD" });
        sale.Entries.Add(new LedgerEntry { LedgerAccount = commission, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = 30m, Currency = "JOD" });
        sale.Entries.Add(new LedgerEntry { LedgerAccount = teacher, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = 70m, Currency = "JOD" });
        db.AddRange(payment, allocation, clearing, commission, teacher, sale,
            new WalletTransaction { UserId = "platform", Type = "PlatformCommission", Amount = 30m, Currency = "JOD", PaymentId = payment.Id, Description = "sale" },
            new WalletTransaction { UserId = "teacher", Type = "TeacherCourseEarning", Amount = 70m, Currency = "JOD", PaymentId = payment.Id, Description = "sale" });
        await db.SaveChangesAsync();
        return payment;
    }

    private static async Task<(Guid PaymentId, Guid EntitlementId)> AddPaidCourseSaleWithUnusedCreditAsync(BetccoDbContext db, decimal tax = 0m, decimal total = 100m)
    {
        var token = Guid.NewGuid().ToString("N");
        var track = new LearningTrack { Slug = $"refund-track-{token}", ArabicName = "مسار", EnglishName = "Track" };
        var qualification = new Qualification { Code = $"REFUND-{token}", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "integration test" };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit", IsActive = true };
        var course = new Course { Slug = $"refund-course-{token}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        course.Modules.Add(new CourseModule { Course = course, UnitDefinition = unit, ArabicTitle = "وحدة", EnglishTitle = "Unit", UnitCode = unit.Code, IsPublished = true });
        var payment = new Payment { UserId = "student", Purpose = "CourseCart", ReferenceId = Guid.NewGuid(), Status = PaymentStatus.Paid, Subtotal = 100m, Tax = tax, Total = total, Currency = "JOD", Provider = "PayTabs", ProviderPaymentId = "SALE-TRUSTED-REF" };
        var enrollment = new Enrollment { StudentUserId = "student", Course = course, PaymentId = payment.Id };
        var entitlement = new IncludedEvaluationEntitlement { StudentUserId = "student", Enrollment = enrollment, UnitDefinition = unit, GrantedByPayment = payment };
        var allocation = new CourseSaleAllocation { PaymentId = payment.Id, CourseId = course.Id, TeacherUserId = "teacher", GrossAmount = 100m, NetAmount = 100m, PlatformCommission = 30m, TeacherEarning = 70m, Currency = "JOD" };
        var clearing = new LedgerAccount { Code = LedgerAccountCode.CourseSaleClearing, Currency = "JOD" };
        var commission = new LedgerAccount { Code = LedgerAccountCode.PlatformCommission, Currency = "JOD" };
        var teacher = new LedgerAccount { Code = LedgerAccountCode.TeacherEarningsPayable, Currency = "JOD" };
        var sale = new LedgerTransaction { EventType = LedgerEventType.PaidCourseSale, Currency = "JOD", Payment = payment, IdempotencyKey = "sale", BusinessEventReference = $"sale:{token}" };
        sale.Entries.Add(new LedgerEntry { LedgerAccount = clearing, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Debit, Amount = 100m, Currency = "JOD" });
        sale.Entries.Add(new LedgerEntry { LedgerAccount = commission, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = 30m, Currency = "JOD" });
        sale.Entries.Add(new LedgerEntry { LedgerAccount = teacher, CourseSaleAllocation = allocation, Side = LedgerEntrySide.Credit, Amount = 70m, Currency = "JOD" });
        db.AddRange(track, qualification, version, unit, course, payment, enrollment, entitlement, allocation, clearing, commission, teacher, sale,
            new WalletTransaction { UserId = "platform", Type = "PlatformCommission", Amount = 30m, Currency = "JOD", PaymentId = payment.Id, Description = "sale" },
            new WalletTransaction { UserId = "teacher", Type = "TeacherCourseEarning", Amount = 70m, Currency = "JOD", PaymentId = payment.Id, Description = "sale" });
        await db.SaveChangesAsync();
        return (payment.Id, entitlement.Id);
    }

    private static async Task<Guid> AddProviderVerifiedRefundAsync(BetccoDbContext db, Guid paymentId, bool includeVerificationTransition = true, bool mismatchReference = false)
    {
        var refund = new Refund
        {
            PaymentId = paymentId,
            Amount = 116m,
            Currency = "JOD",
            Status = RefundStatus.ProviderVerified,
            ReasonCode = "CustomerRequest",
            RequestedByUserId = "finance",
            IdempotencyKey = $"verified-{Guid.NewGuid():N}",
            ProviderName = "PayTabs",
            ProviderRefundReference = $"REFUND-{Guid.NewGuid():N}",
            ProviderInitiatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-2),
            ProviderVerifiedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
            CorrelationReference = $"refund:{Guid.NewGuid():N}",
            CreatedByUserId = "finance"
        };
        db.Refunds.Add(refund);
        db.RefundStatusTransitions.Add(new RefundStatusTransition
        {
            RefundId = refund.Id,
            PreviousStatus = RefundStatus.Requested,
            NewStatus = RefundStatus.ProviderProcessing,
            Source = RefundTransitionSource.PayTabsProviderInitiation,
            ActorContext = "finance",
            CorrelationId = refund.CorrelationReference
        });
        if (includeVerificationTransition)
            db.RefundStatusTransitions.Add(new RefundStatusTransition
            {
                RefundId = refund.Id,
                PreviousStatus = RefundStatus.ProviderProcessing,
                NewStatus = RefundStatus.ProviderVerified,
                Source = RefundTransitionSource.PayTabsProviderVerification,
                ActorContext = "finance",
                ProviderReference = mismatchReference ? "DIFFERENT-REFUND-REFERENCE" : refund.ProviderRefundReference,
                CorrelationId = refund.CorrelationReference
            });
        await db.SaveChangesAsync();
        return refund.Id;
    }

    private static async Task AssertRecoveredOnceAsync(BetccoDbContext db, Guid paymentId, Guid refundId, Guid entitlementId)
    {
        Assert.Equal(PaymentStatus.Refunded, await db.Payments.Where(item => item.Id == paymentId).Select(item => item.Status).SingleAsync());
        var refund = await db.Refunds.SingleAsync(item => item.Id == refundId);
        Assert.Equal(RefundStatus.InternallyRecorded, refund.Status);
        Assert.Equal(116m, refund.Amount);
        Assert.NotNull(refund.ProviderVerifiedAtUtc);
        Assert.Equal(RefundEntitlementDisposition.UnusedIncludedEvaluationCreditsRevoked, refund.EntitlementDisposition);
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.PaymentId == paymentId && item.PreviousStatus == PaymentStatus.Paid && item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Single(await db.RefundStatusTransitions.Where(item => item.RefundId == refundId && item.Source == RefundTransitionSource.PayTabsProviderVerification).ToListAsync());
        Assert.Single(await db.RefundStatusTransitions.Where(item => item.RefundId == refundId && item.PreviousStatus == RefundStatus.ProviderVerified && item.NewStatus == RefundStatus.InternallyRecorded).ToListAsync());
        var reversal = Assert.Single(await db.LedgerTransactions.Include(item => item.Entries).Where(item => item.RefundId == refundId && item.EventType == LedgerEventType.PaidCourseSaleRefund).ToListAsync());
        Assert.Equal(100m, reversal.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount));
        Assert.Equal(100m, reversal.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount));
        var walletReversals = await db.WalletTransactions.Where(item => item.RefundId == refundId).ToListAsync();
        Assert.Equal(2, walletReversals.Count);
        Assert.Contains(walletReversals, item => item.Type == "PlatformCommissionRefundReversal" && item.Amount == -30m);
        Assert.Contains(walletReversals, item => item.Type == "TeacherCourseEarningRefundReversal" && item.Amount == -70m);
        var credit = await db.IncludedEvaluationEntitlements.SingleAsync(item => item.Id == entitlementId);
        Assert.Equal(refundId, credit.RevokedByRefundId);
        Assert.NotNull(credit.RevokedAtUtc);
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "IncludedEvaluationCreditRevokedByRefund" && item.EntityId == entitlementId.ToString()).ToListAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "RefundInternallyRecorded" && item.EntityId == refundId.ToString()).ToListAsync());
    }

    private sealed class RefundUpdateBarrier : DbCommandInterceptor
    {
        private readonly TaskCompletionSource bothArrived = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int arrivals;

        public int Arrivals => arrivals;

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("UPDATE \"Refunds\"", StringComparison.Ordinal))
            {
                if (Interlocked.Increment(ref arrivals) == 2) bothArrived.TrySetResult();
                await bothArrived.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options);

    public enum RefundResponseMode { Success, Declined, AmountMismatch, CurrencyMismatch, CartMismatch, ReferenceMismatch, Timeout, QueryTimeout }

    private sealed record RecoveryCandidate(
        string? Reference = "REFUND-RECOVERED",
        long ProfileId = 123456,
        string? CartId = null,
        string Currency = "JOD",
        decimal? Amount = null,
        string TransactionType = "refund",
        string? PreviousReference = "SALE-TRUSTED-REF",
        string Status = "P");

    private sealed class RecoveryHandler : HttpMessageHandler
    {
        private int createCalls;
        private int cartQueries;
        private int referenceQueries;
        private string? originalCartId;
        private decimal originalAmount;

        public int CreateCalls => Volatile.Read(ref createCalls);
        public int CartQueries => Volatile.Read(ref cartQueries);
        public int ReferenceQueries => Volatile.Read(ref referenceQueries);
        public IReadOnlyList<RecoveryCandidate> Candidates { get; init; } = [];
        public string ReferenceStatus { get; init; } = "A";
        public HttpStatusCode DiscoveryStatus { get; init; } = HttpStatusCode.OK;
        public string? DiscoveryPayloadOverride { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            var root = body.RootElement;
            if (request.RequestUri!.AbsolutePath.EndsWith("/payment/request", StringComparison.Ordinal))
            {
                Interlocked.Increment(ref createCalls);
                originalCartId = root.GetProperty("cart_id").GetString();
                originalAmount = root.GetProperty("cart_amount").GetDecimal();
                throw new HttpRequestException("Simulated ambiguous refund create result.");
            }

            if (root.TryGetProperty("cart_id", out var cartId))
            {
                Interlocked.Increment(ref cartQueries);
                Assert.Equal(originalCartId, cartId.GetString());
                return new(DiscoveryStatus)
                {
                    Content = new StringContent(DiscoveryPayloadOverride ?? JsonSerializer.Serialize(Candidates.Select(candidate => Payload(candidate, candidate.Status))))
                };
            }

            Interlocked.Increment(ref referenceQueries);
            var reference = root.GetProperty("tran_ref").GetString();
            var match = Assert.Single(Candidates, candidate => candidate.Reference == reference);
            return new(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(Payload(match, ReferenceStatus)))
            };
        }

        private object Payload(RecoveryCandidate candidate, string status) => new
        {
            profile_id = candidate.ProfileId,
            tran_ref = candidate.Reference,
            previous_tran_ref = candidate.PreviousReference,
            tran_type = candidate.TransactionType,
            cart_id = candidate.CartId ?? originalCartId,
            cart_currency = candidate.Currency,
            cart_amount = candidate.Amount ?? originalAmount,
            payment_result = new { response_status = status, response_code = "100" }
        };
    }

    private sealed class RefundHandler(RefundResponseMode mode = RefundResponseMode.Success, string createStatus = "A", string queryStatus = "A") : HttpMessageHandler
    {
        public List<string> RequestBodies { get; } = [];
        public string QueryStatus { get; set; } = queryStatus;
        private string? refundCart;
        private decimal refundAmount;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            RequestBodies.Add(body);
            if (mode == RefundResponseMode.Timeout) throw new HttpRequestException("simulated timeout");
            if (mode == RefundResponseMode.QueryTimeout && RequestBodies.Count == 2) throw new HttpRequestException("simulated query timeout");
            using var payload = JsonDocument.Parse(body);
            var root = payload.RootElement;
            if (root.TryGetProperty("cart_id", out var cartValue)) refundCart = cartValue.GetString();
            if (root.TryGetProperty("cart_amount", out var amountValue)) refundAmount = amountValue.GetDecimal();
            var cart = refundCart ?? "";
            var amount = refundAmount;
            var response = new
            {
                profile_id = 123456,
                tran_ref = mode == RefundResponseMode.ReferenceMismatch && RequestBodies.Count == 2 ? "UNKNOWN-REF" : "REFUND-TRUSTED-REF",
                tran_type = "refund",
                cart_id = mode == RefundResponseMode.CartMismatch ? $"{cart}-unexpected" : cart,
                cart_currency = mode == RefundResponseMode.CurrencyMismatch ? "USD" : "JOD",
                cart_amount = mode == RefundResponseMode.AmountMismatch ? amount - 1m : amount,
                payment_result = new { response_status = mode == RefundResponseMode.Declined ? "D" : RequestBodies.Count == 1 ? createStatus : QueryStatus, response_code = mode == RefundResponseMode.Declined ? "500" : "100" }
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response)) };
        }
    }
}
