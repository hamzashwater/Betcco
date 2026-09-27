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
        decimal amount, string cartId, HttpStatusCode status = HttpStatusCode.OK) =>
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
                payment_result = new { response_status = "A", response_code = "100" }
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
