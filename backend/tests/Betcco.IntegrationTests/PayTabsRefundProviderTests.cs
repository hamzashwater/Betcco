using System.Net;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

public sealed class PayTabsRefundProviderTests
{
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
        var service = new RefundService(db, CreateProvider(handler));
        var request = new InitiatePayTabsRefund(payment.Id, "CustomerRequest", null, "timeout-key");

        var first = await service.InitiatePayTabsRefundAsync("finance", request);
        var replay = await service.InitiatePayTabsRefundAsync("finance", request);

        Assert.Equal(nameof(RefundStatus.ProviderResultUnknown), first.Refund!.Status);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Single(handler.RequestBodies);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
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

    private static async Task<Payment> AddPaidCourseSaleAsync(BetccoDbContext db)
    {
        var payment = new Payment { UserId = "student", Purpose = "CourseCart", ReferenceId = Guid.NewGuid(), Status = PaymentStatus.Paid, Subtotal = 100m, Total = 100m, Currency = "JOD", Provider = "PayTabs", ProviderPaymentId = "SALE-TRUSTED-REF" };
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

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options);

    public enum RefundResponseMode { Success, Declined, AmountMismatch, CurrencyMismatch, CartMismatch, ReferenceMismatch, Timeout, QueryTimeout }

    private sealed class RefundHandler(RefundResponseMode mode = RefundResponseMode.Success) : HttpMessageHandler
    {
        public List<string> RequestBodies { get; } = [];
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
                payment_result = new { response_status = mode == RefundResponseMode.Declined ? "D" : "A", response_code = mode == RefundResponseMode.Declined ? "500" : "100" }
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response)) };
        }
    }
}
