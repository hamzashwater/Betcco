using Betcco.Application.Common;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// URL-only live providers intentionally do not invoke a vendor API. They
/// provide a secure, replaceable boundary until credentials and a managed
/// meeting adapter are explicitly configured for a provider.
/// </summary>
public sealed class UrlLiveSessionProvider(
    LiveSessionProviderInfo info,
    IReadOnlyCollection<string> aliases,
    IReadOnlyCollection<string>? allowedHosts = null) : ILiveSessionProvider
{
    private readonly HashSet<string> providerAliases = aliases
        .Append(info.Id)
        .Select(Normalize)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
    private readonly string[] approvedHosts = allowedHosts?.Select(host => host.Trim().TrimStart('.').ToLowerInvariant()).Where(host => host.Length > 0).ToArray() ?? [];

    public LiveSessionProviderInfo Info { get; } = info;

    public bool Matches(string provider) => providerAliases.Contains(Normalize(provider));

    public LiveSessionProviderValidation Validate(string? joinUrl, string? recordingUrl)
    {
        if (!IsAllowedHttpsUrl(joinUrl, requireJoinUrl: true, out var error)
            || !IsAllowedHttpsUrl(recordingUrl, requireJoinUrl: false, out error))
            return new(false, null, error);
        return new(true, Info.Id, null);
    }

    private bool IsAllowedHttpsUrl(string? value, bool requireJoinUrl, out string? error)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            error = requireJoinUrl ? "Provide an HTTPS join link for this live session." : null;
            return !requireJoinUrl;
        }
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            error = "Live-session links must use HTTPS.";
            return false;
        }
        if (approvedHosts.Length > 0 && !approvedHosts.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith($".{host}", StringComparison.OrdinalIgnoreCase)))
        {
            error = $"The selected provider requires a link hosted by its approved domain.";
            return false;
        }
        error = null;
        return true;
    }

    private static string Normalize(string value) => string.Concat(value.Where(char.IsLetterOrDigit)).ToLowerInvariant();
}

public sealed class LiveSessionProviderCatalog(IEnumerable<ILiveSessionProvider> providers) : ILiveSessionProviderCatalog
{
    private readonly ILiveSessionProvider[] providers = providers.ToArray();

    public IReadOnlyCollection<LiveSessionProviderInfo> List() => providers.Select(provider => provider.Info).OrderBy(provider => provider.Id).ToArray();

    public LiveSessionProviderValidation Validate(string? provider, string? joinUrl, string? recordingUrl)
    {
        if (string.IsNullOrWhiteSpace(provider)) return new(false, null, "Choose a supported live-session provider.");
        var matchingProvider = providers.SingleOrDefault(candidate => candidate.Matches(provider));
        return matchingProvider is null
            ? new(false, null, "Choose a supported live-session provider.")
            : matchingProvider.Validate(joinUrl, recordingUrl);
    }
}
