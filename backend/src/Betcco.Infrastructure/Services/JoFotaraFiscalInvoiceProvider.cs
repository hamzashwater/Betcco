using System.Net.Http.Json;
using Betcco.Application.Commerce;
using Microsoft.Extensions.Options;

namespace Betcco.Infrastructure.Services;

public sealed class JoFotaraOptions
{
    public bool Enabled { get; init; }
    public string? Environment { get; init; }
    public string? BaseUrl { get; init; }
    public string? ClientId { get; init; }
    public string? SecretKey { get; init; }
}

/// <summary>
/// Official ISTD material confirms the endpoint, headers and encoded-invoice
/// envelope. It does not establish BETCCO's required UBL/tax mapping or safe
/// response semantics, so normal service calls deliberately fail closed.
/// </summary>
public sealed class JoFotaraFiscalInvoiceProvider(HttpClient client, IOptions<JoFotaraOptions> options) : IFiscalInvoiceProvider
{
    private readonly JoFotaraOptions options = options.Value;
    public string ProviderName => "JoFotara";

    public Task<FiscalProviderSubmissionResult> SubmitInvoiceAsync(FiscalInvoiceSubmissionRequest request, CancellationToken cancellationToken = default)
    {
        if (!options.Enabled) return Task.FromResult(Blocked("JOFOtARA_DISABLED"));
        if (!HasValidProductionConfiguration()) return Task.FromResult(Blocked("JOFOtARA_CONFIGURATION_INVALID"));
        if (string.IsNullOrWhiteSpace(request.EncodedUblInvoice)) return Task.FromResult(Blocked("JOFOtARA_UBL_MAPPING_REQUIRES_APPROVED_BUSINESS_DATA"));
        return SubmitEncodedInvoiceAsync(request.EncodedUblInvoice, cancellationToken);
    }

    /// <summary>Transport-only operation for a future approved UBL mapper; never exposed by an API route.</summary>
    public async Task<FiscalProviderSubmissionResult> SubmitEncodedInvoiceAsync(string encodedInvoice, CancellationToken cancellationToken = default)
    {
        if (!HasValidProductionConfiguration()) return Blocked("JOFOtARA_CONFIGURATION_INVALID");
        using var message = new HttpRequestMessage(HttpMethod.Post, "core/invoices/") { Content = JsonContent.Create(new { invoice = encodedInvoice }) };
        message.Headers.TryAddWithoutValidation("Client-Id", options.ClientId);
        message.Headers.TryAddWithoutValidation("Secret-Key", options.SecretKey);
        try
        {
            using var response = await client.SendAsync(message, cancellationToken);
            // The official guide available to this task does not confirm a safe
            // structured acceptance/rejection response contract. Never infer it.
            return new(ProviderName, null, ((int)response.StatusCode).ToString(), false, false, true, "JOFOtARA_RESPONSE_ACCEPTANCE_UNCONFIRMED");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new FiscalProviderResultUnknownException("JoFotara submission result is unknown after transport timeout.");
        }
        catch (HttpRequestException)
        {
            throw new FiscalProviderResultUnknownException("JoFotara submission result is unknown after transport failure.");
        }
    }

    private bool HasValidProductionConfiguration() => options.Enabled
        && string.Equals(options.Environment, "Production", StringComparison.Ordinal)
        && string.Equals(options.BaseUrl?.TrimEnd('/'), "https://backend.jofotara.gov.jo", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrWhiteSpace(options.ClientId)
        && !string.IsNullOrWhiteSpace(options.SecretKey);
    private FiscalProviderSubmissionResult Blocked(string code) => new(ProviderName, null, null, false, false, true, code);
}

public sealed class FiscalProviderResultUnknownException(string message) : Exception(message);
