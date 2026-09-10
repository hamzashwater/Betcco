using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Betcco.Api.Configuration;

/// <summary>
/// Prevents a production deployment from silently starting with local or
/// incomplete security configuration. Values themselves are never logged.
/// </summary>
public static class StartupConfigurationValidator
{
    public static void ThrowIfInvalid(IConfiguration configuration, IHostEnvironment environment)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(configuration.GetConnectionString("Postgres") ?? configuration["ConnectionStrings__Postgres"]))
            errors.Add("ConnectionStrings:Postgres is required.");
        ValidatePayTabs(configuration, errors);
        ValidateJoFotara(configuration, errors);

        if (!environment.IsProduction())
        {
            ThrowIfErrors(errors);
            return;
        }

        RequireHttpsUrl(configuration["APP_PUBLIC_URL"] ?? configuration["NEXT_PUBLIC_APP_URL"], "APP_PUBLIC_URL", errors);

        var origins = configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
        if (origins.Length == 0)
            errors.Add("At least one AllowedOrigins value is required in production.");
        foreach (var origin in origins)
            RequireHttpsUrl(origin, "AllowedOrigins", errors);

        if (string.IsNullOrWhiteSpace(configuration["DataProtection:KeysPath"]))
            errors.Add("DataProtection:KeysPath is required in production.");
        if (!string.Equals(configuration["Storage:ScannerProvider"], "ClamAv", StringComparison.OrdinalIgnoreCase))
            errors.Add("Storage:ScannerProvider must be ClamAv in production.");
        if (string.Equals(configuration["Payments:Provider"], "Fake", StringComparison.OrdinalIgnoreCase))
            errors.Add("Payments:Provider cannot be Fake in production.");
        if (string.Equals(configuration["Payouts:Provider"], "Fake", StringComparison.OrdinalIgnoreCase))
            errors.Add("Payouts:Provider cannot be Fake in production.");

        if (string.Equals(configuration["AssessmentReports:PdfProvider"], "QuestPdf", StringComparison.OrdinalIgnoreCase))
        {
            var license = configuration["AssessmentReports:QuestPdfLicense"];
            if (license is not ("Community" or "Professional" or "Enterprise"))
                errors.Add("AssessmentReports:QuestPdfLicense must be a confirmed QuestPDF tier when PDF reporting is enabled.");
            if (string.IsNullOrWhiteSpace(configuration["AssessmentReports:FontDirectory"])
                || string.IsNullOrWhiteSpace(configuration["AssessmentReports:FontFamily"]))
                errors.Add("AssessmentReports:FontDirectory and AssessmentReports:FontFamily are required when PDF reporting is enabled.");
        }

        if (bool.TryParse(configuration["Ai:Enabled"], out var aiEnabled) && aiEnabled)
        {
            if (string.IsNullOrWhiteSpace(configuration["Ai:Provider"])) errors.Add("Ai:Provider is required when AI is enabled.");
            if (string.IsNullOrWhiteSpace(configuration["Ai:ApiKey"])) errors.Add("Ai:ApiKey is required when AI is enabled.");
        }

        ThrowIfErrors(errors);
    }

    private static void RequireHttpsUrl(string? value, string key, ICollection<string> errors)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            errors.Add($"{key} must be an absolute HTTPS URL in production.");
    }

    private static void ValidatePayTabs(IConfiguration configuration, ICollection<string> errors)
    {
        if (!string.Equals(configuration["Payments:Provider"], "PayTabs", StringComparison.OrdinalIgnoreCase)) return;
        if (!long.TryParse(configuration["PayTabs:ProfileId"], out var profileId) || profileId <= 0) errors.Add("PayTabs:ProfileId must be a positive identifier when Payments:Provider is PayTabs.");
        if (string.IsNullOrWhiteSpace(configuration["PayTabs:ServerKey"])) errors.Add("PayTabs:ServerKey is required when Payments:Provider is PayTabs.");
        if (!Uri.TryCreate(configuration["PayTabs:BaseUrl"], UriKind.Absolute, out var payTabsBaseUrl)
            || !string.Equals(payTabsBaseUrl.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            errors.Add("PayTabs:BaseUrl must be an absolute HTTPS URL when Payments:Provider is PayTabs.");
        if (configuration["PayTabs:Environment"] is not ("Test" or "Live")) errors.Add("PayTabs:Environment must be explicitly Test or Live.");
        RequireHttpsUrl(configuration["APP_PUBLIC_URL"] ?? configuration["NEXT_PUBLIC_APP_URL"], "APP_PUBLIC_URL", errors);
    }

    private static void ValidateJoFotara(IConfiguration configuration, ICollection<string> errors)
    {
        if (!bool.TryParse(configuration["JoFotara:Enabled"], out var enabled) || !enabled) return;
        if (!string.Equals(configuration["JoFotara:Environment"], "Production", StringComparison.Ordinal)) errors.Add("JoFotara:Environment must be Production when JoFotara is enabled.");
        if (!string.Equals(configuration["JoFotara:BaseUrl"]?.TrimEnd('/'), "https://backend.jofotara.gov.jo", StringComparison.OrdinalIgnoreCase)) errors.Add("JoFotara:BaseUrl must be the official HTTPS backend when JoFotara is enabled.");
        if (string.IsNullOrWhiteSpace(configuration["JoFotara:ClientId"])) errors.Add("JoFotara:ClientId is required when JoFotara is enabled.");
        if (string.IsNullOrWhiteSpace(configuration["JoFotara:SecretKey"])) errors.Add("JoFotara:SecretKey is required when JoFotara is enabled.");
    }

    private static void ThrowIfErrors(IReadOnlyCollection<string> errors)
    {
        if (errors.Count > 0)
            throw new InvalidOperationException($"BETCCO startup configuration is invalid: {string.Join(" ", errors)}");
    }
}
