using Betcco.Api.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Betcco.IntegrationTests;

public sealed class StartupConfigurationValidatorTests
{
    [Fact]
    public void Production_rejects_missing_secure_configuration()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Postgres"] = "Host=db;Database=betcco;Username=betcco;Password=not-logged",
            ["APP_PUBLIC_URL"] = "http://localhost:3000",
            ["AllowedOrigins:0"] = "http://localhost:3000",
            ["Payments:Provider"] = "Fake",
            ["Payouts:Provider"] = "Fake"
        });

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalid(configuration, new TestHostEnvironment(Environments.Production)));

        Assert.Contains("APP_PUBLIC_URL", exception.Message);
        Assert.Contains("DataProtection:Provider", exception.Message);
        Assert.Contains("DataProtection:CertificatePath", exception.Message);
        Assert.Contains("Storage:Provider", exception.Message);
        Assert.Contains("Storage:S3:Bucket", exception.Message);
        Assert.Contains("Storage:ScannerProvider", exception.Message);
        Assert.Contains("AllowedHosts", exception.Message);
        Assert.Contains("ReverseProxy:Enabled", exception.Message);
        Assert.Contains("ClamAv:Host", exception.Message);
        Assert.Contains("Email:Host", exception.Message);
        Assert.Contains("Payments:Provider", exception.Message);
    }

    [Fact]
    public void Production_accepts_provider_neutral_secure_deployment_configuration()
    {
        var configuration = Configuration(SecureDeploymentValues());

        StartupConfigurationValidator.ThrowIfInvalid(configuration, new TestHostEnvironment(Environments.Production));
    }

    [Fact]
    public void Staging_rejects_live_paytabs_configuration()
    {
        var values = SecureDeploymentValues();
        values["Payments:Provider"] = "PayTabs";
        values["PayTabs:ProfileId"] = "123";
        values["PayTabs:ServerKey"] = "not-logged";
        values["PayTabs:BaseUrl"] = "https://secure-jordan.paytabs.com";
        values["PayTabs:Environment"] = "Live";

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalid(Configuration(values), new TestHostEnvironment(Environments.Staging)));

        Assert.Contains("Staging cannot use the live PayTabs environment", exception.Message);
        Assert.DoesNotContain("not-logged", exception.Message);
    }

    [Fact]
    public void Production_rejects_node_local_storage_when_other_storage_security_is_configured()
    {
        var values = SecureDeploymentValues();
        values["Storage:Provider"] = "Local";
        values["Storage:LocalRoot"] = "/data/private";
        var configuration = Configuration(values);

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalid(configuration, new TestHostEnvironment(Environments.Production)));

        Assert.Contains("Storage:Provider must be S3Compatible", exception.Message);
        Assert.DoesNotContain("/data/private", exception.Message);
    }

    [Fact]
    public void Development_requires_a_connection_but_permits_local_configuration()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Postgres"] = "Host=localhost;Database=betcco;Username=betcco;Password=not-logged",
            ["AllowedOrigins:0"] = "http://localhost:3000"
        });

        StartupConfigurationValidator.ThrowIfInvalid(configuration, new TestHostEnvironment(Environments.Development));
    }

    [Fact]
    public void Deployment_contract_cannot_start_with_a_development_environment()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Postgres"] = "Host=localhost;Database=betcco;Username=betcco;Password=not-logged",
            ["Deployment:RequireSecureEnvironment"] = "true"
        });

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalid(configuration, new TestHostEnvironment(Environments.Development)));

        Assert.Contains("ASPNETCORE_ENVIRONMENT", exception.Message);
    }

    [Theory]
    [InlineData("PayTabs:ProfileId")]
    [InlineData("PayTabs:ServerKey")]
    public void PayTabs_requires_profile_and_server_key(string missingKey)
    {
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Postgres"] = "Host=localhost;Database=betcco;Username=betcco;Password=not-logged",
            ["APP_PUBLIC_URL"] = "https://betcco.test",
            ["Payments:Provider"] = "PayTabs",
            ["PayTabs:ProfileId"] = "123456",
            ["PayTabs:ServerKey"] = "server-key-test",
            ["PayTabs:BaseUrl"] = "https://secure-jordan.paytabs.com",
            ["PayTabs:Environment"] = "Test"
        };
        values[missingKey] = string.Empty;

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupConfigurationValidator.ThrowIfInvalid(Configuration(values), new TestHostEnvironment(Environments.Development)));

        Assert.Contains(missingKey, exception.Message);
        Assert.DoesNotContain("server-key-test", exception.Message);
    }

    private static Dictionary<string, string?> SecureDeploymentValues() => new()
    {
        ["ConnectionStrings:Postgres"] = "Host=db;Database=betcco;Username=betcco;Password=not-logged",
        ["APP_PUBLIC_URL"] = "https://betcco.test",
        ["AllowedOrigins:0"] = "https://betcco.test",
        ["AllowedHosts"] = "betcco.test",
        ["ReverseProxy:Enabled"] = "true",
        ["ReverseProxy:KnownProxies:0"] = "10.30.0.10",
        ["DataProtection:Provider"] = "Postgres",
        ["DataProtection:CertificatePath"] = "/run/secrets/data-protection.pfx",
        ["DataProtection:CertificatePassword"] = "not-logged",
        ["Storage:Provider"] = "S3Compatible",
        ["Storage:S3:Bucket"] = "betcco-private",
        ["Storage:S3:Region"] = "me-south-1",
        ["Storage:ScannerProvider"] = "ClamAv",
        ["ClamAv:Host"] = "clamav.internal",
        ["ClamAv:Port"] = "3310",
        ["Email:Host"] = "smtp.internal",
        ["Email:Port"] = "587",
        ["Email:UseSsl"] = "true",
        ["Email:FromAddress"] = "noreply@betcco.test",
        ["Payments:Provider"] = "Disabled",
        ["Payouts:Provider"] = "Disabled"
    };

    private static IConfiguration Configuration(IReadOnlyDictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Betcco.Tests";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
