using Betcco.Application.Common;
using Betcco.Infrastructure.Services;

namespace Betcco.IntegrationTests;

public sealed class LiveSessionProviderCatalogTests
{
    [Fact]
    public void Provider_catalog_canonicalizes_known_aliases_and_rejects_a_mismatched_vendor_domain()
    {
        var catalog = Catalog();

        var accepted = catalog.Validate("google meet", "https://meet.google.com/abc-defg-hij", null);
        var rejected = catalog.Validate("Zoom", "https://meet.google.com/abc-defg-hij", null);

        Assert.True(accepted.IsValid);
        Assert.Equal("GoogleMeet", accepted.ProviderId);
        Assert.False(rejected.IsValid);
        Assert.Null(rejected.ProviderId);
    }

    [Fact]
    public void Manual_provider_accepts_only_a_supplied_https_join_link()
    {
        var catalog = Catalog();

        Assert.True(catalog.Validate("custom", "https://school.example/live/42", "https://school.example/recording/42").IsValid);
        Assert.False(catalog.Validate("manual", "http://school.example/live/42", null).IsValid);
        Assert.False(catalog.Validate("manual", null, null).IsValid);
    }

    private static LiveSessionProviderCatalog Catalog() => new([
        new UrlLiveSessionProvider(new LiveSessionProviderInfo("Manual", "يدوي", "Manual", false, "", ""), ["custom"]),
        new UrlLiveSessionProvider(new LiveSessionProviderInfo("GoogleMeet", "Google Meet", "Google Meet", false, "", ""), ["google meet"], ["meet.google.com"]),
        new UrlLiveSessionProvider(new LiveSessionProviderInfo("Zoom", "Zoom", "Zoom", false, "", ""), ["zoom"], ["zoom.us"])
    ]);
}
