using System.Net.Http.Headers;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

public sealed class DisabledSchoolIntegrationProvider : ISchoolIntegrationProvider
{
    public Task<SchoolIntegrationStatus> GetStatusAsync(bool testConnection, CancellationToken cancellationToken = default) =>
        Task.FromResult(new SchoolIntegrationStatus("None", false, false, "No school integration is configured."));
}

/// <summary>Optional OneRoster 1.2 connectivity adapter. Import/sync remains deliberately off until a school deployment authorizes its data mapping.</summary>
public sealed class OneRosterSchoolIntegrationProvider(HttpClient client, IConfiguration configuration) : ISchoolIntegrationProvider
{
    private readonly string? _token = configuration["SchoolIntegration:OneRoster:AccessToken"];
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_token);

    public async Task<SchoolIntegrationStatus> GetStatusAsync(bool testConnection, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured) return new SchoolIntegrationStatus("OneRoster", false, false, "OneRoster endpoint and access token are required.");
        if (!testConnection) return new SchoolIntegrationStatus("OneRoster", true, false, "Configured. Test connectivity before enabling a school data mapping.");
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "academicSessions?limit=1");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var response = await client.SendAsync(request, cancellationToken);
            return response.IsSuccessStatusCode
                ? new SchoolIntegrationStatus("OneRoster", true, true, "Connection succeeded. No roster data was imported.")
                : new SchoolIntegrationStatus("OneRoster", true, false, "The school endpoint rejected the connection test.");
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return new SchoolIntegrationStatus("OneRoster", true, false, "The school endpoint could not be reached.");
        }
    }
}
