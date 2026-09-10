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
        Assert.Contains("DataProtection:KeysPath", exception.Message);
        Assert.Contains("Storage:ScannerProvider", exception.Message);
        Assert.Contains("cannot be Fake", exception.Message);
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
