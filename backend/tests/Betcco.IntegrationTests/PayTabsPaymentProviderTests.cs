using System.Net;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

public sealed class PayTabsPaymentProviderTests
{
    [Fact]
    public async Task Hosted_request_uses_the_trusted_payment_snapshot_and_returns_only_a_safe_redirect()
    {
        await using var db = CreateDb();
        var (cart, course) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(CreateResponse("TST-REQUEST", "https://secure-jordan.paytabs.com/payment/page/test"));
        var commerce = CreateCommerce(db, handler);

        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "paytabs-request-key");

        Assert.NotNull(checkout);
        Assert.Equal(100m, checkout.Total);
        Assert.Equal("JOD", checkout.Currency);
        Assert.Equal("https://secure-jordan.paytabs.com/payment/page/test", checkout.RedirectUrl);
        using var request = JsonDocument.Parse(handler.RequestBodies.Single());
        Assert.Equal(123456L, request.RootElement.GetProperty("profile_id").GetInt64());
        Assert.Equal("sale", request.RootElement.GetProperty("tran_type").GetString());
        Assert.Equal("ecom", request.RootElement.GetProperty("tran_class").GetString());
        Assert.Equal("JOD", request.RootElement.GetProperty("cart_currency").GetString());
        Assert.Equal(100m, request.RootElement.GetProperty("cart_amount").GetDecimal());
        Assert.Equal(PayTabsPaymentProvider.CartId(checkout.PaymentId), request.RootElement.GetProperty("cart_id").GetString());
        Assert.DoesNotContain("server-key-test", JsonSerializer.Serialize(checkout));
        var payment = await db.Payments.SingleAsync();
        Assert.Equal(PaymentStatus.Processing, payment.Status);
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Equal(course.Id, JsonSerializer.Deserialize<JsonElement>(payment.LineItemsJson).GetProperty("Lines")[0].GetProperty("CourseId").GetGuid());
    }

    [Fact]
    public async Task Cart_id_query_returns_all_provider_candidates_for_safe_recovery()
    {
        var paymentId = Guid.NewGuid();
        var handler = new PayTabsHandler(JsonSerializer.Serialize(new[]
        {
            new
            {
                profile_id = 123456,
                tran_ref = "TST-RECOVERY",
                cart_id = PayTabsPaymentProvider.CartId(paymentId),
                cart_currency = "JOD",
                cart_amount = 100m,
                redirect_url = "https://secure-jordan.paytabs.com/payment/page/recovery",
                payment_result = new { response_status = (string?)null, response_code = (string?)null }
            }
        }));
        var provider = CreateProvider(handler);

        var recovered = Assert.Single(await provider.QueryCheckoutSessionsAsync(paymentId));

        Assert.Equal("TST-RECOVERY", recovered.ProviderPaymentId);
        Assert.Equal(PayTabsPaymentProvider.CartId(paymentId), recovered.CartId);
        Assert.Equal("https://secure-jordan.paytabs.com/payment/page/recovery", recovered.RedirectUrl);
        using var request = JsonDocument.Parse(handler.RequestBodies.Single());
        Assert.Equal(PayTabsPaymentProvider.CartId(paymentId), request.RootElement.GetProperty("cart_id").GetString());
        Assert.False(request.RootElement.TryGetProperty("tran_ref", out _));
    }

    [Theory]
    [InlineData(101, typeof(PaymentSessionCreationRejectedException))]
    [InlineData(4, typeof(PaymentSessionResultUnknownException))]
    public async Task PayTabs_creation_errors_distinguish_definite_rejection_from_duplicate_result_unknown(int code, Type exceptionType)
    {
        var provider = CreateProvider(new StatusHandler(HttpStatusCode.BadRequest, JsonSerializer.Serialize(new { code, message = "provider error" })));
        var request = new PaymentCheckoutRequest(Guid.NewGuid(), "JOD", 100m, "test", "https://betcco.test/callback", "https://betcco.test/return", "Card");

        var exception = await Assert.ThrowsAsync(exceptionType, () => provider.CreateCheckoutSessionAsync(request));

        if (exception is PaymentSessionCreationRejectedException rejected)
            Assert.Equal("PAYTABS_101", rejected.FailureCode);
    }

    [Fact]
    public async Task A_user_cannot_initiate_a_PayTabs_checkout_for_another_users_cart()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "owner", 100m);
        var commerce = CreateCommerce(db, new PayTabsHandler(CreateResponse("TST-UNUSED", "https://secure-jordan.paytabs.com/payment/page/test")));

        var checkout = await commerce.CreateCourseCheckoutAsync("other-user", cart.OwnerKey, null, "Card", "other-user-key");

        Assert.Null(checkout);
        Assert.Empty(await db.Payments.ToListAsync());
    }

    [Fact]
    public async Task Callback_requires_a_verified_accepted_transaction_before_confirming_the_payment()
    {
        await using var db = CreateDb();
        var (cart, course) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-VERIFY", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-VERIFY", "BETCCO-{paymentId}", "JOD", 100m, "A"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "verify-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        var confirmed = await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-VERIFY");

        Assert.True(confirmed);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Equal(PaymentStatus.Processing, transition.PreviousStatus);
        Assert.Equal(PaymentStatus.Paid, transition.NewStatus);
        Assert.Equal(PaymentTransitionSource.PayTabsVerifiedTransaction, transition.Source);
        Assert.Equal("PayTabs", transition.Provider);
        Assert.Equal("TST-VERIFY", transition.ProviderEventReference);
        Assert.Equal(2, handler.RequestBodies.Count);
        Assert.Equal(course.Id, (await db.Enrollments.SingleAsync()).CourseId);
        Assert.Single(await db.WebhookEvents.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
    }

    [Fact]
    public async Task Verified_legacy_coupon_payment_without_resolved_coupon_identity_requires_reconciliation()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-LEGACY-COUPON", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-LEGACY-COUPON", "BETCCO-{paymentId}", "JOD", 100m, "A"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "legacy-coupon-key");
        Assert.NotNull(checkout);
        var payment = await db.Payments.SingleAsync();
        payment.CouponCode = "UNRESOLVED-LEGACY-COUPON";
        await db.SaveChangesAsync();
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-LEGACY-COUPON"));

        Assert.Equal(PaymentStatus.Processing, payment.Status);
        Assert.Single(await db.ProviderReconciliationCases.Where(item => item.CaseType == ProviderReconciliationCaseType.CouponSnapshotIdentityMismatch).ToListAsync());
        Assert.Single(await db.WebhookEvents.Where(item => item.EventType == "payment.succeeded.reconciliation_required").ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "PaymentCouponSnapshotIdentityRequiresReconciliation");
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.CouponRedemptions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Theory]
    [InlineData("JOD", 99d, "A", PaymentStatus.Processing)]
    [InlineData("USD", 100d, "A", PaymentStatus.Processing)]
    [InlineData("JOD", 100d, "D", PaymentStatus.Failed)]
    public async Task Mismatched_transactions_stay_processing_and_definite_declines_fail(string currency, double amount, string responseStatus, PaymentStatus expectedStatus)
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-REJECT", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-REJECT", "BETCCO-{paymentId}", currency, (decimal)amount, responseStatus));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", $"reject-{currency}-{amount}-{responseStatus}");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-REJECT"));
        Assert.Equal(expectedStatus, (await db.Payments.SingleAsync()).Status);
        if (expectedStatus == PaymentStatus.Failed)
        {
            var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
            Assert.Equal(PaymentTransitionSource.PayTabsVerifiedFailure, transition.Source);
            Assert.Equal(PaymentStatus.Processing, transition.PreviousStatus);
            Assert.Equal(PaymentStatus.Failed, transition.NewStatus);
        }
        else Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Equal(2, handler.RequestBodies.Count);
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
    }

    [Fact]
    public async Task Ambiguous_paytabs_result_stays_processing_without_paid_effects()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-UNKNOWN", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-UNKNOWN", "BETCCO-{paymentId}", "JOD", 100m, null));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "unknown-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-UNKNOWN"));
        Assert.Equal(PaymentStatus.Processing, (await db.Payments.SingleAsync()).Status);
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task PayTabs_network_timeout_stays_processing_and_records_safe_unknown_audit()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var commerce = CreateCommerce(db, new TimeoutAfterCheckoutHandler(CreateResponse("TST-TIMEOUT", "https://secure-jordan.paytabs.com/payment/page/test")));
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "timeout-key");
        Assert.NotNull(checkout);

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-TIMEOUT"));
        Assert.Equal(PaymentStatus.Processing, (await db.Payments.SingleAsync()).Status);
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "PayTabsTransactionResultUnknown");
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Duplicate_definite_paytabs_failure_creates_one_transition_and_no_paid_effects()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-DECLINED", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-DECLINED", "BETCCO-{paymentId}", "JOD", 100m, "D"),
            CreateVerification("TST-DECLINED", "BETCCO-{paymentId}", "JOD", 100m, "D"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "declined-duplicate-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-DECLINED"));
        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-DECLINED"));

        Assert.Equal(PaymentStatus.Failed, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Failed).ToListAsync());
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task PayTabs_session_cannot_be_cancelled_while_provider_success_is_still_possible()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-LATE", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-LATE", "BETCCO-{paymentId}", "JOD", 100m, "A"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "late-success-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        var cancellation = await commerce.CancelProcessingPaymentAsync("student", checkout.PaymentId);
        Assert.False(cancellation.IsCancelled);
        Assert.Equal("PAYMENT_PROVIDER_SESSION_REQUIRES_RECONCILIATION", cancellation.FailureCode);
        Assert.True(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-LATE"));

        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Paid).ToListAsync());
        Assert.Empty(await db.ProviderReconciliationCases.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "PaymentCancellationRejectedProviderSessionUnresolved");
        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Late_verified_paytabs_success_after_failure_requires_reconciliation_without_automatic_refund()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-FAILED-LATE", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-FAILED-LATE", "BETCCO-{paymentId}", "JOD", 100m, "D"),
            CreateVerification("TST-FAILED-LATE", "BETCCO-{paymentId}", "JOD", 100m, "A"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "failed-late-success-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-FAILED-LATE"));
        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-FAILED-LATE"));

        Assert.Equal(PaymentStatus.Failed, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Failed).ToListAsync());
        Assert.Single(await db.ProviderReconciliationCases.Where(item => item.CaseType == ProviderReconciliationCaseType.LateProviderSuccess).ToListAsync());
        Assert.Empty(await db.Refunds.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "PayTabsLateSuccessReconciliationRequired");
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Duplicate_verified_callback_is_idempotent_for_entitlement_and_financial_effects()
    {
        await using var db = CreateDb();
        var (cart, _) = await AddCourseCartAsync(db, "student", 100m);
        var handler = new PayTabsHandler(
            CreateResponse("TST-DUPLICATE", "https://secure-jordan.paytabs.com/payment/page/test"),
            CreateVerification("TST-DUPLICATE", "BETCCO-{paymentId}", "JOD", 100m, "A"),
            CreateVerification("TST-DUPLICATE", "BETCCO-{paymentId}", "JOD", 100m, "A"));
        var commerce = CreateCommerce(db, handler);
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "duplicate-key");
        Assert.NotNull(checkout);
        handler.ReplaceToken("{paymentId}", checkout.PaymentId.ToString("N"));

        Assert.True(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-DUPLICATE"));
        Assert.True(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), "TST-DUPLICATE"));

        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Single(await db.WebhookEvents.ToListAsync());
        Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
    }

    [Fact]
    public async Task Unknown_transaction_reference_is_rejected_without_mutating_a_payment()
    {
        await using var db = CreateDb();
        var commerce = CreateCommerce(db, new PayTabsHandler());

        Assert.False(await commerce.ConfirmPayTabsCallbackAsync("BETCCO-unknown", "TST-UNKNOWN"));
        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Empty(await db.WebhookEvents.ToListAsync());
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);

    private static async Task<(Cart Cart, Course Course)> AddCourseCartAsync(BetccoDbContext db, string userId, decimal price)
    {
        var track = new LearningTrack { Slug = $"track-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{Guid.NewGuid():N}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = price };
        var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = userId };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart);
        await db.SaveChangesAsync();
        return (cart, course);
    }

    private static CommerceService CreateCommerce(BetccoDbContext db, HttpMessageHandler handler)
    {
        var provider = CreateProvider(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PayTabs:ProfileId"] = "123456",
            ["APP_PUBLIC_URL"] = "https://betcco.test"
        }).Build();
        return new CommerceService(db, provider, null, configuration);
    }

    private static PayTabsPaymentProvider CreateProvider(HttpMessageHandler handler)
    {
        var options = Options.Create(new PayTabsOptions { ProfileId = 123456, ServerKey = "server-key-test", BaseUrl = "https://secure-jordan.paytabs.com", Environment = PayTabsEnvironment.Test });
        return new PayTabsPaymentProvider(new HttpClient(handler) { BaseAddress = new Uri("https://secure-jordan.paytabs.com/") }, options);
    }

    private static string CreateResponse(string transactionReference, string redirectUrl) => JsonSerializer.Serialize(new { tran_ref = transactionReference, redirect_url = redirectUrl });
    private static string CreateVerification(string transactionReference, string cartId, string currency, decimal amount, string? responseStatus) => JsonSerializer.Serialize(new { profile_id = 123456, tran_ref = transactionReference, cart_id = cartId, cart_currency = currency, cart_amount = amount, payment_result = new { response_status = responseStatus, response_code = responseStatus == "D" ? "500" : "100" } });

    private sealed class PayTabsHandler(params string[] responses) : HttpMessageHandler
    {
        private readonly Queue<string> responses = new(responses);
        public List<string> RequestBodies { get; } = [];

        public void ReplaceToken(string token, string value)
        {
            var values = responses.Select(item => item.Replace(token, value, StringComparison.Ordinal)).ToArray();
            responses.Clear();
            foreach (var item in values) responses.Enqueue(item);
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestBodies.Add(request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responses.Count == 0 ? "{}" : responses.Dequeue())
            };
        }
    }

    private sealed class TimeoutAfterCheckoutHandler(string checkoutResponse) : HttpMessageHandler
    {
        private int requestCount;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            requestCount++;
            if (requestCount == 1)
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(checkoutResponse) });
            throw new HttpRequestException("simulated PayTabs network interruption");
        }
    }

    private sealed class StatusHandler(HttpStatusCode statusCode, string payload) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(statusCode) { Content = new StringContent(payload) });
    }
}
