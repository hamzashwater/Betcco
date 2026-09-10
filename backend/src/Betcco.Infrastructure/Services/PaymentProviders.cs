using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Microsoft.Extensions.Options;
using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;

namespace Betcco.Infrastructure.Services;

public enum PayTabsEnvironment { Test, Live }

public sealed class PayTabsOptions
{
    public long? ProfileId { get; init; }
    public string? ServerKey { get; init; }
    public string? BaseUrl { get; init; }
    public PayTabsEnvironment? Environment { get; init; }
}

/// <summary>Development-only provider; an enrollment is created only after its webhook endpoint confirms payment.</summary>
public sealed class FakePaymentProvider : IPaymentProvider
{
    public string ProviderName => "Fake";
    public TimeSpan? CheckoutSessionUncertaintyWindow => TimeSpan.Zero;

    public Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<PaymentMethod>(request.PaymentMethod, true, out var method)) throw new InvalidOperationException("Unsupported payment method.");
        return Task.FromResult(new PaymentSession($"Fake{method}", $"fake_{method.ToString().ToLowerInvariant()}_{request.PaymentId:N}", null, true));
    }

    public Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("Fake payments are confirmed only through the development confirmation flow.");

    public Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("Fake payments do not support provider refunds.");

    public Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("Fake payments do not support provider refunds.");
}

/// <summary>Safe production fallback until a real provider adapter and credentials are configured.</summary>
public sealed class UnconfiguredPaymentProvider : IPaymentProvider
{
    public string ProviderName => "Unconfigured";
    public Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default) => throw new PaymentSessionCreationRejectedException("PAYMENT_PROVIDER_NOT_CONFIGURED", "Payment provider is not configured. Configure a verified payment adapter before accepting production payments.");
    public Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new InvalidOperationException("Payment provider is not configured.");
    public Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new InvalidOperationException("Payment provider is not configured.");
    public Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new InvalidOperationException("Payment provider is not configured.");
}

public sealed class PayTabsPaymentProvider(HttpClient client, IOptions<PayTabsOptions> options) : IPaymentProvider
{
    private readonly PayTabsOptions options = options.Value;
    public string ProviderName => "PayTabs";
    public TimeSpan? CheckoutSessionUncertaintyWindow => TimeSpan.FromMinutes(21);

    public async Task<PaymentSession> CreateCheckoutSessionAsync(PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
    {
        EnsureTestMode();
        using var message = CreateRequest("payment/request", new
        {
            profile_id = options.ProfileId,
            tran_type = "sale",
            tran_class = "ecom",
            cart_id = CartId(request.PaymentId),
            cart_currency = request.Currency,
            cart_amount = request.Amount,
            cart_description = request.Description,
            callback = request.CallbackUrl,
            @return = request.ReturnUrl
        });
        using var response = await client.SendAsync(message, cancellationToken);
        var payload = await ReadPayloadAsync(response, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var code = OptionalString(payload.RootElement, "code");
            if (string.Equals(code, "4", StringComparison.Ordinal))
                throw new PaymentSessionResultUnknownException("PayTabs reported a duplicate request; the existing session must be recovered by cart ID.");
            if ((int)response.StatusCode is >= 400 and < 500)
                throw new PaymentSessionCreationRejectedException($"PAYTABS_{code ?? ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture)}", "PayTabs rejected the hosted payment page request.");
            throw new PaymentSessionResultUnknownException("PayTabs did not return a conclusive hosted payment page result.");
        }

        var transactionReference = RequiredString(payload.RootElement, "tran_ref");
        var redirectUrl = RequiredAbsoluteUrl(payload.RootElement, "redirect_url");
        return new PaymentSession(ProviderName, transactionReference, redirectUrl, false);
    }

    public async Task<IReadOnlyCollection<PaymentCheckoutRecovery>> QueryCheckoutSessionsAsync(Guid paymentId, CancellationToken cancellationToken = default)
    {
        EnsureTestMode();
        var cartId = CartId(paymentId);
        using var message = CreateRequest("payment/query", new { profile_id = options.ProfileId, cart_id = cartId });
        using var response = await client.SendAsync(message, cancellationToken);
        var payload = await ReadPayloadAsync(response, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            if (string.Equals(OptionalString(payload.RootElement, "code"), "113", StringComparison.Ordinal)) return [];
            throw new HttpRequestException("PayTabs checkout-session recovery query was unavailable.");
        }

        if (payload.RootElement.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("PayTabs cart query returned an invalid response shape.");
        return payload.RootElement.EnumerateArray().Select(ToCheckoutRecovery).ToArray();
    }

    public async Task<PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default)
    {
        EnsureTestMode();
        using var message = CreateRequest("payment/query", new { profile_id = options.ProfileId, tran_ref = providerPaymentId });
        using var response = await client.SendAsync(message, cancellationToken);
        var payload = await ReadPayloadAsync(response, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("PayTabs transaction verification was unavailable.");

        var root = payload.RootElement;
        var paymentResult = root.TryGetProperty("payment_result", out var result) && result.ValueKind == JsonValueKind.Object ? result : default;
        var responseStatus = paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_status") : null;
        return new PaymentTransactionVerification(
            ProviderName,
            OptionalString(root, "profile_id") ?? OptionalString(root, "profileId") ?? string.Empty,
            RequiredString(root, "tran_ref"),
            RequiredString(root, "cart_id"),
            RequiredString(root, "cart_currency"),
            DecimalValue(root, "cart_amount"),
            string.Equals(responseStatus, "A", StringComparison.OrdinalIgnoreCase),
            responseStatus,
            paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_code") : null,
            !string.IsNullOrWhiteSpace(responseStatus) && !string.Equals(responseStatus, "A", StringComparison.OrdinalIgnoreCase));
    }

    public async Task<PaymentProviderRefundTransaction> CreateRefundAsync(PaymentProviderRefundRequest request, CancellationToken cancellationToken = default)
    {
        EnsureTestMode();
        using var message = CreateRequest("payment/request", new
        {
            profile_id = options.ProfileId,
            tran_type = "refund",
            tran_class = "ecom",
            cart_id = request.RefundReference,
            cart_currency = request.Currency,
            cart_amount = request.Amount,
            cart_description = request.Description,
            tran_ref = request.OriginalProviderPaymentReference
        });
        using var response = await client.SendAsync(message, cancellationToken);
        var payload = await ReadPayloadAsync(response, cancellationToken);
        return ToRefundTransaction(payload.RootElement, response.IsSuccessStatusCode);
    }

    public async Task<PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default)
    {
        EnsureTestMode();
        using var message = CreateRequest("payment/query", new { profile_id = options.ProfileId, tran_ref = providerRefundReference });
        using var response = await client.SendAsync(message, cancellationToken);
        var payload = await ReadPayloadAsync(response, cancellationToken);
        return ToRefundTransaction(payload.RootElement, response.IsSuccessStatusCode);
    }

    public static string CartId(Guid paymentId) => $"BETCCO-{paymentId:N}";
    public static string RefundCartId(Guid refundId) => $"BETCCO-REFUND-{refundId:N}";

    private void EnsureTestMode()
    {
        if (options.Environment != PayTabsEnvironment.Test)
            throw new PaymentSessionCreationRejectedException("PAYTABS_ENVIRONMENT_DISABLED", "Only the PayTabs Test environment is enabled in this release.");
    }

    private HttpRequestMessage CreateRequest(string path, object payload)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload)
        };
        message.Headers.TryAddWithoutValidation("authorization", options.ServerKey);
        return message;
    }

    private static async Task<JsonDocument> ReadPayloadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private static string RequiredString(JsonElement value, string property) => OptionalString(value, property) ?? throw new InvalidOperationException($"PayTabs response omitted {property}.");
    private static string? OptionalString(JsonElement value, string property) => value.TryGetProperty(property, out var result) && result.ValueKind is JsonValueKind.String or JsonValueKind.Number ? result.ToString() : null;
    private static string RequiredAbsoluteUrl(JsonElement value, string property)
    {
        var result = RequiredString(value, property);
        if (!Uri.TryCreate(result, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new InvalidOperationException("PayTabs returned an invalid hosted payment URL.");
        return uri.AbsoluteUri;
    }
    private static string? OptionalAbsoluteUrl(JsonElement value, string property)
    {
        var result = OptionalString(value, property);
        return Uri.TryCreate(result, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps ? uri.AbsoluteUri : null;
    }
    private static decimal DecimalValue(JsonElement value, string property)
    {
        var raw = RequiredString(value, property);
        if (!decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) throw new InvalidOperationException($"PayTabs response contained an invalid {property}.");
        return amount;
    }

    private PaymentProviderRefundTransaction ToRefundTransaction(JsonElement root, bool httpSucceeded)
    {
        var paymentResult = root.TryGetProperty("payment_result", out var result) && result.ValueKind == JsonValueKind.Object ? result : default;
        var status = paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_status") : null;
        var code = paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_code") : null;
        var profile = OptionalString(root, "profile_id") ?? OptionalString(root, "profileId");
        var amountText = OptionalString(root, "cart_amount");
        var hasAmount = decimal.TryParse(amountText, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount);
        var successful = httpSucceeded && string.Equals(status, "A", StringComparison.OrdinalIgnoreCase);
        var definiteFailure = !successful && !string.IsNullOrWhiteSpace(status) && !string.Equals(status, "A", StringComparison.OrdinalIgnoreCase);
        return new PaymentProviderRefundTransaction(
            ProviderName,
            profile,
            OptionalString(root, "tran_ref"),
            OptionalString(root, "tran_type"),
            OptionalString(root, "cart_id"),
            OptionalString(root, "cart_currency"),
            hasAmount ? amount : null,
            status,
            code,
            successful,
            definiteFailure,
            options.ProfileId.HasValue && string.Equals(profile, options.ProfileId.Value.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal));
    }

    private PaymentCheckoutRecovery ToCheckoutRecovery(JsonElement root)
    {
        var paymentResult = root.TryGetProperty("payment_result", out var result) && result.ValueKind == JsonValueKind.Object ? result : default;
        var status = paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_status") : null;
        return new PaymentCheckoutRecovery(
            ProviderName,
            OptionalString(root, "profile_id") ?? OptionalString(root, "profileId") ?? string.Empty,
            RequiredString(root, "tran_ref"),
            RequiredString(root, "cart_id"),
            RequiredString(root, "cart_currency"),
            DecimalValue(root, "cart_amount"),
            OptionalAbsoluteUrl(root, "redirect_url"),
            string.Equals(status, "A", StringComparison.OrdinalIgnoreCase),
            !string.IsNullOrWhiteSpace(status) && !string.Equals(status, "A", StringComparison.OrdinalIgnoreCase),
            status,
            paymentResult.ValueKind == JsonValueKind.Object ? OptionalString(paymentResult, "response_code") : null);
    }
}

/// <summary>Development-only payout adapter. It creates a traceable test transfer reference and never sends money.</summary>
public sealed class FakePayoutProvider : IPayoutProvider
{
    public string ProviderName => "FakePayout";
    public bool IsAvailable => true;

    public Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default) =>
        Task.FromResult(new PayoutTransferResult(ProviderName, $"fake_payout_{idempotencyReference}_{Guid.NewGuid():N}", "TEST_CONFIRMED", true, false));
}

/// <summary>Safe production fallback until a bank or wallet payout adapter and credentials are configured.</summary>
public sealed class UnconfiguredPayoutProvider : IPayoutProvider
{
    public string ProviderName => "Unconfigured";
    public bool IsAvailable => false;

    public Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default) =>
        throw new PayoutProviderUnavailableException("Payout provider is not configured. Configure a verified payout adapter before sending funds.");
}
