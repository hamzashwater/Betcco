using System.Globalization;
using System.Net;
using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Infrastructure.Services;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

/// <summary>
/// Direct adapter contract tests with scripted HTTP only. Production RefundService
/// still blocks partial PayTabs execution.
/// </summary>
public sealed class PayTabsPartialRefundAdapterTests
{
    private const string ProviderRefundReference = "REFUND-25-123";

    [Fact]
    public async Task Refund_cart_query_uses_server_owned_cart_id_and_parses_candidates()
    {
        var refundId = Guid.NewGuid();
        var cartId = PayTabsPaymentProvider.RefundCartId(refundId);
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(new[]
            {
                Candidate(cartId, "REFUND-ONE", "P"), Candidate(cartId, "REFUND-TWO", "A")
            }))
        }));

        var candidates = await Provider(handler).QueryRefundTransactionsAsync(refundId);

        Assert.Equal("payment/query", Assert.Single(handler.Paths));
        using var request = JsonDocument.Parse(Assert.Single(handler.Bodies));
        Assert.Equal(123456, request.RootElement.GetProperty("profile_id").GetInt32());
        Assert.Equal(cartId, request.RootElement.GetProperty("cart_id").GetString());
        Assert.False(request.RootElement.TryGetProperty("tran_ref", out _));
        Assert.Equal(2, candidates.Count);
        var first = candidates.First();
        Assert.Equal("PayTabs", first.Provider);
        Assert.Equal("123456", first.ProfileId);
        Assert.Equal("REFUND-ONE", first.ProviderRefundReference);
        Assert.Equal("refund", first.TransactionType);
        Assert.Equal(cartId, first.CartId);
        Assert.Equal("JOD", first.Currency);
        Assert.Equal(25.123m, first.Amount);
        Assert.Equal("P", first.Status);
        Assert.Equal("100", first.Code);
        Assert.Equal("SALE-116-000", first.PreviousProviderTransactionReference);
        Assert.True(first.ProfileMatchesConfigured);
        Assert.False(first.IsSuccessful);
        Assert.False(first.IsDefiniteFailure);
        Assert.Equal("REFUND-TWO", candidates.Last().ProviderRefundReference);
        Assert.True(candidates.Last().IsSuccessful);
    }

    [Fact]
    public async Task Empty_refund_cart_query_returns_no_candidates()
    {
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("[]")
        }));

        Assert.Empty(await Provider(handler).QueryRefundTransactionsAsync(Guid.NewGuid()));
    }

    [Theory]
    [InlineData("{}", HttpStatusCode.OK)]
    [InlineData("[null]", HttpStatusCode.OK)]
    [InlineData("[]", HttpStatusCode.ServiceUnavailable)]
    public async Task Invalid_or_unavailable_refund_cart_query_is_not_treated_as_not_found(string payload, HttpStatusCode status)
    {
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(new HttpResponseMessage(status)
        {
            Content = new StringContent(payload)
        }));

        if (status == HttpStatusCode.OK)
            await Assert.ThrowsAsync<InvalidOperationException>(() => Provider(handler).QueryRefundTransactionsAsync(Guid.NewGuid()));
        else
            await Assert.ThrowsAsync<HttpRequestException>(() => Provider(handler).QueryRefundTransactionsAsync(Guid.NewGuid()));
    }

    private static object Candidate(string cartId, string reference, string status) => new
    {
        profile_id = 123456,
        tran_ref = reference,
        previous_tran_ref = "SALE-116-000",
        tran_type = "refund",
        cart_id = cartId,
        cart_currency = "JOD",
        cart_amount = 25.123m,
        payment_result = new { response_status = status, response_code = "100" }
    };

    // PayTabs status contract: https://support.paytabs.com/en/support/solutions/articles/60000711358
    [Theory]
    [InlineData("A", true, false)]
    [InlineData("P", false, false)]
    [InlineData("H", false, false)]
    [InlineData("D", false, true)]
    [InlineData("E", false, true)]
    [InlineData("X", false, true)]
    [InlineData("V", false, false)]
    [InlineData("Z", false, false)]
    public async Task Refund_create_and_query_classify_only_documented_final_outcomes(
        string status, bool successful, bool definiteFailure)
    {
        var refundId = Guid.NewGuid();
        var cartId = PayTabsPaymentProvider.RefundCartId(refundId);
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(Response(25.123m, cartId, responseStatus: status)));
        var provider = Provider(handler);

        var created = await provider.CreateRefundAsync(Request(refundId, 25.123m));
        var queried = await provider.VerifyRefundAsync(ProviderRefundReference);

        foreach (var result in new[] { created, queried })
        {
            Assert.Equal(status, result.Status);
            Assert.Equal(successful, result.IsSuccessful);
            Assert.Equal(definiteFailure, result.IsDefiniteFailure);
            Assert.Equal(25.123m, result.Amount);
            Assert.Equal("JOD", result.Currency);
            Assert.Equal("refund", result.TransactionType);
            Assert.Equal(ProviderRefundReference, result.ProviderRefundReference);
            Assert.Equal(cartId, result.CartId);
            Assert.Equal("100", result.Code);
            Assert.True(result.ProfileMatchesConfigured);
        }
    }

    [Theory]
    [InlineData("D")]
    [InlineData("E")]
    [InlineData("X")]
    public async Task Http_failure_with_final_status_remains_inconclusive(string status)
    {
        var refundId = Guid.NewGuid();
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(Response(
            25.123m, PayTabsPaymentProvider.RefundCartId(refundId), HttpStatusCode.ServiceUnavailable, status)));

        var result = await Provider(handler).CreateRefundAsync(Request(refundId, 25.123m));

        Assert.False(result.IsSuccessful);
        Assert.False(result.IsDefiniteFailure);
        Assert.Equal(status, result.Status);
        Assert.Equal(ProviderRefundReference, result.ProviderRefundReference);
    }

    [Theory]
    [InlineData("0.001")]
    [InlineData("1.234")]
    [InlineData("25.123")]
    [InlineData("115.999")]
    public async Task CreateRefund_serializes_exact_three_decimal_amount(string amountText)
    {
        var amount = decimal.Parse(amountText, CultureInfo.InvariantCulture);
        var refundId = Guid.NewGuid();
        var cartId = PayTabsPaymentProvider.RefundCartId(refundId);
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(
            Response(amount, cartId)));

        var result = await Provider(handler).CreateRefundAsync(Request(refundId, amount));

        Assert.Single(handler.Bodies);
        using var payload = JsonDocument.Parse(handler.Bodies[0]);
        var root = payload.RootElement;
        Assert.Equal(amountText, root.GetProperty("cart_amount").GetRawText());
        Assert.Equal(amount, root.GetProperty("cart_amount").GetDecimal());
        Assert.Equal("refund", root.GetProperty("tran_type").GetString());
        Assert.Equal("ecom", root.GetProperty("tran_class").GetString());
        Assert.Equal("SALE-116-000", root.GetProperty("tran_ref").GetString());
        Assert.Equal(cartId, root.GetProperty("cart_id").GetString());
        Assert.Equal("JOD", root.GetProperty("cart_currency").GetString());
        Assert.False(root.TryGetProperty("idempotency_key", out _));
        Assert.Equal(amount, result.Amount);
        Assert.True(result.IsSuccessful);
    }

    [Fact]
    public async Task VerifyRefund_preserves_exact_partial_query_amount_and_metadata()
    {
        var cartId = PayTabsPaymentProvider.RefundCartId(Guid.NewGuid());
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(
            Response(25.123m, cartId)));

        var result = await Provider(handler).VerifyRefundAsync(ProviderRefundReference);

        Assert.Single(handler.Bodies);
        using var query = JsonDocument.Parse(handler.Bodies[0]);
        Assert.Equal("payment/query", handler.Paths[0]);
        Assert.Equal(ProviderRefundReference, query.RootElement.GetProperty("tran_ref").GetString());
        Assert.False(query.RootElement.TryGetProperty("cart_amount", out _));
        Assert.Equal(25.123m, result.Amount);
        Assert.Equal("JOD", result.Currency);
        Assert.Equal(ProviderRefundReference, result.ProviderRefundReference);
        Assert.Equal(cartId, result.CartId);
        Assert.Equal("refund", result.TransactionType);
        Assert.Equal("A", result.Status);
        Assert.Equal("100", result.Code);
        Assert.True(result.IsSuccessful);
        Assert.True(result.ProfileMatchesConfigured);
    }

    [Fact]
    public async Task CreateRefund_preserves_provider_amount_mismatch()
    {
        var refundId = Guid.NewGuid();
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(
            Response(25.122m, PayTabsPaymentProvider.RefundCartId(refundId))));

        var result = await Provider(handler).CreateRefundAsync(Request(refundId, 25.123m));

        using var sent = JsonDocument.Parse(Assert.Single(handler.Bodies));
        Assert.Equal(25.123m, sent.RootElement.GetProperty("cart_amount").GetDecimal());
        Assert.Equal(25.122m, result.Amount);
        Assert.NotEqual(25.123m, result.Amount);
    }

    [Fact]
    public async Task VerifyRefund_returns_provider_truth_when_query_amount_differs_from_expected()
    {
        const decimal expectedAmount = 25.123m;
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(
            Response(25.122m, PayTabsPaymentProvider.RefundCartId(Guid.NewGuid()))));

        var result = await Provider(handler).VerifyRefundAsync(ProviderRefundReference);

        Assert.Equal(25.122m, result.Amount);
        Assert.NotEqual(expectedAmount, result.Amount);
        Assert.Equal(ProviderRefundReference, result.ProviderRefundReference);
    }

    [Fact]
    public async Task CreateRefund_sends_extra_precision_unchanged_without_scale_validation()
    {
        var refundId = Guid.NewGuid();
        var handler = new ScriptedHandler((_, _, _) => Task.FromResult(
            Response(1.2345m, PayTabsPaymentProvider.RefundCartId(refundId))));

        var result = await Provider(handler).CreateRefundAsync(Request(refundId, 1.2345m));

        using var sent = JsonDocument.Parse(Assert.Single(handler.Bodies));
        Assert.Equal("1.2345", sent.RootElement.GetProperty("cart_amount").GetRawText());
        Assert.Equal(1.2345m, result.Amount);
    }

    [Fact]
    public async Task Create_timeout_does_not_retry_and_known_reference_can_be_queried_later()
    {
        var refundId = Guid.NewGuid();
        var cartId = PayTabsPaymentProvider.RefundCartId(refundId);
        var handler = new ScriptedHandler((_, _, call) =>
            call == 1
                ? throw new HttpRequestException("Simulated unknown create result.")
                : Task.FromResult(Response(25.123m, cartId)));
        var provider = Provider(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            provider.CreateRefundAsync(Request(refundId, 25.123m)));
        Assert.Single(handler.Bodies);

        var recovered = await provider.VerifyRefundAsync(ProviderRefundReference);
        Assert.Equal(2, handler.Bodies.Count);
        Assert.Equal("payment/request", handler.Paths[0]);
        Assert.Equal("payment/query", handler.Paths[1]);
        Assert.Equal(25.123m, recovered.Amount);
        Assert.Equal(ProviderRefundReference, recovered.ProviderRefundReference);
    }

    [Fact]
    public async Task Unknown_http_response_and_unavailable_or_mismatched_query_remain_distinct()
    {
        var cartId = PayTabsPaymentProvider.RefundCartId(Guid.NewGuid());
        var handler = new ScriptedHandler((_, _, call) => call switch
        {
            1 => Task.FromResult(Response(25.123m, cartId, HttpStatusCode.ServiceUnavailable)),
            2 => throw new HttpRequestException("Simulated unavailable query."),
            _ => Task.FromResult(Response(25.122m, cartId))
        });
        var provider = Provider(handler);

        var unknown = await provider.CreateRefundAsync(Request(Guid.NewGuid(), 25.123m));
        Assert.False(unknown.IsSuccessful);
        Assert.False(unknown.IsDefiniteFailure);
        Assert.Equal(25.123m, unknown.Amount);

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            provider.VerifyRefundAsync(ProviderRefundReference));
        var mismatched = await provider.VerifyRefundAsync(ProviderRefundReference);
        Assert.Equal(25.122m, mismatched.Amount);
        Assert.Equal(3, handler.Bodies.Count);
        Assert.Single(handler.Paths, path => path == "payment/request");
    }

    private static PaymentProviderRefundRequest Request(Guid refundId, decimal amount) =>
        new(refundId, PayTabsPaymentProvider.RefundCartId(refundId),
            "JOD", amount, "Partial refund adapter test", "SALE-116-000");

    private static PayTabsPaymentProvider Provider(HttpMessageHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("https://paytabs.test/") },
            Options.Create(new PayTabsOptions
            {
                ProfileId = 123456,
                ServerKey = "test-only-key",
                Environment = PayTabsEnvironment.Test
            }));

    private static HttpResponseMessage Response(
        decimal amount, string cartId, HttpStatusCode status = HttpStatusCode.OK, string responseStatus = "A") =>
        new(status)
        {
            Content = new StringContent(JsonSerializer.Serialize(new
            {
                profile_id = 123456,
                tran_ref = ProviderRefundReference,
                tran_type = "refund",
                cart_id = cartId,
                cart_currency = "JOD",
                cart_amount = amount,
                payment_result = new { response_status = responseStatus, response_code = "100" }
            }))
        };

    private sealed class ScriptedHandler(
        Func<HttpRequestMessage, string, int, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        public List<string> Paths { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = await request.Content!.ReadAsStringAsync(cancellationToken);
            Bodies.Add(body);
            Paths.Add(request.RequestUri!.AbsolutePath.TrimStart('/'));
            return await respond(request, body, Bodies.Count);
        }
    }
}
