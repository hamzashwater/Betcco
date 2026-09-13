using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Betcco.Api.Configuration;

/// <summary>
/// Prevents a staging or production deployment from silently starting with local or
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

        var deploymentEnvironment = environment.IsProduction() || environment.IsStaging();
        if (!deploymentEnvironment)
        {
            if (configuration.GetValue("Deployment:RequireSecureEnvironment", false))
                errors.Add("Deployment:RequireSecureEnvironment requires ASPNETCORE_ENVIRONMENT to be Staging or Production.");
            ThrowIfErrors(errors);
            return;
        }

        RequireHttpsUrl(configuration["APP_PUBLIC_URL"] ?? configuration["NEXT_PUBLIC_APP_URL"], "APP_PUBLIC_URL", errors);

        var origins = configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
        if (origins.Length == 0)
            errors.Add("At least one AllowedOrigins value is required in staging and production.");
        foreach (var origin in origins)
            RequireHttpsUrl(origin, "AllowedOrigins", errors);

        var allowedHosts = (configuration["AllowedHosts"] ?? string.Empty)
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowedHosts.Length == 0 || allowedHosts.Any(host => host == "*"))
            errors.Add("AllowedHosts must explicitly list the deployment host names.");

        if (!configuration.GetValue("ReverseProxy:Enabled", false))
            errors.Add("ReverseProxy:Enabled must be true in staging and production.");
        var knownProxies = configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
        if (knownProxies.Length == 0)
            errors.Add("At least one ReverseProxy:KnownProxies address is required in staging and production.");
        else if (knownProxies.Any(proxy => !IPAddress.TryParse(proxy, out _)))
            errors.Add("Every ReverseProxy:KnownProxies value must be an IP address.");

        if (!string.Equals(configuration["DataProtection:Provider"], "Postgres", StringComparison.OrdinalIgnoreCase))
            errors.Add("DataProtection:Provider must be Postgres in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["DataProtection:CertificatePath"]))
            errors.Add("DataProtection:CertificatePath is required in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["DataProtection:CertificatePassword"]))
            errors.Add("DataProtection:CertificatePassword is required in staging and production.");
        if (!string.Equals(configuration["Storage:Provider"], "S3Compatible", StringComparison.OrdinalIgnoreCase))
            errors.Add("Storage:Provider must be S3Compatible in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["Storage:S3:Bucket"]))
            errors.Add("Storage:S3:Bucket is required in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["Storage:S3:Region"]))
            errors.Add("Storage:S3:Region is required in staging and production.");
        var s3AccessKey = configuration["Storage:S3:AccessKey"];
        var s3SecretKey = configuration["Storage:S3:SecretKey"];
        if (string.IsNullOrWhiteSpace(s3AccessKey) != string.IsNullOrWhiteSpace(s3SecretKey))
            errors.Add("Storage:S3 access key and secret key must either both be configured or both use the provider credential chain.");
        if (!string.Equals(configuration["Storage:ScannerProvider"], "ClamAv", StringComparison.OrdinalIgnoreCase))
            errors.Add("Storage:ScannerProvider must be ClamAv in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["ClamAv:Host"]))
            errors.Add("ClamAv:Host is required in staging and production.");
        if (!int.TryParse(configuration["ClamAv:Port"], out var clamAvPort) || clamAvPort is < 1 or > 65535)
            errors.Add("ClamAv:Port must be a valid TCP port in staging and production.");

        ValidateDeploymentEmail(configuration, errors);
        ValidateDeploymentProviders(configuration, environment, errors);

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
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            || uri.AbsolutePath != "/"
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment))
            errors.Add($"{key} must be an absolute HTTPS URL in staging and production.");
    }

    private static void ValidateDeploymentEmail(IConfiguration configuration, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(configuration["Email:Host"]))
            errors.Add("Email:Host is required in staging and production.");
        if (string.IsNullOrWhiteSpace(configuration["Email:FromAddress"]))
            errors.Add("Email:FromAddress is required in staging and production.");
        if (!int.TryParse(configuration["Email:Port"], out var emailPort) || emailPort is < 1 or > 65535)
            errors.Add("Email:Port must be a valid TCP port in staging and production.");
        if (!configuration.GetValue("Email:UseSsl", false))
            errors.Add("Email:UseSsl must be true in staging and production.");

        var username = configuration["Email:Username"];
        var password = configuration["Email:Password"];
        if (string.IsNullOrWhiteSpace(username) != string.IsNullOrWhiteSpace(password))
            errors.Add("Email username and password must either both be configured or both be omitted.");
    }

    private static void ValidateDeploymentProviders(
        IConfiguration configuration,
        IHostEnvironment environment,
        ICollection<string> errors)
    {
        var paymentProvider = configuration["Payments:Provider"];
        if (paymentProvider is null
            || (!string.Equals(paymentProvider, "Disabled", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(paymentProvider, "PayTabs", StringComparison.OrdinalIgnoreCase)))
            errors.Add("Payments:Provider must explicitly be Disabled or PayTabs in staging and production.");

        if (environment.IsStaging()
            && string.Equals(paymentProvider, "PayTabs", StringComparison.OrdinalIgnoreCase)
            && string.Equals(configuration["PayTabs:Environment"], "Live", StringComparison.Ordinal))
            errors.Add("Staging cannot use the live PayTabs environment.");

        var payoutProvider = configuration["Payouts:Provider"];
        if (payoutProvider is null
            || (!string.Equals(payoutProvider, "Disabled", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(payoutProvider, "Manual", StringComparison.OrdinalIgnoreCase)))
            errors.Add("Payouts:Provider must explicitly be Disabled or Manual in staging and production.");
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
