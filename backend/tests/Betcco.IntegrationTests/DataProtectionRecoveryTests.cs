using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Betcco.Api.Configuration;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Betcco.IntegrationTests;

public sealed class DataProtectionRecoveryTests
{
    [Fact]
    [Trait("Category", "PostgreSQLStorage")]
    public async Task Restored_postgres_key_ring_requires_the_original_certificate_and_BETCCO_application_name()
    {
        await using var sourceDatabase = await PostgresTestDatabase.CreateAsync("data_protection_source");
        await using var recoveredDatabase = await PostgresTestDatabase.CreateAsync("data_protection_recovered");
        var tempDirectory = Path.Combine(Path.GetTempPath(), "betcco-data-protection-recovery", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDirectory);
        var certificateAPath = Path.Combine(tempDirectory, "recovery-a.pfx");
        var certificateBPath = Path.Combine(tempDirectory, "recovery-b.pfx");
        var certificateAPassword = CreateEphemeralPassword();
        var certificateBPassword = CreateEphemeralPassword();

        try
        {
            WriteTestCertificate(certificateAPath, certificateAPassword, "CN=BETCCO ephemeral recovery A");
            WriteTestCertificate(certificateBPath, certificateBPassword, "CN=BETCCO ephemeral recovery B");
            using var certificateA = LoadAndVerifyCertificate(certificateAPath, certificateAPassword);
            Assert.True(certificateA.HasPrivateKey);
            Assert.Equal(64, Convert.ToHexString(SHA256.HashData(certificateA.RawData)).Length);

            var payload = "BETCCO synthetic data-protection recovery payload";
            string protectedPayload;
            await using (var first = CreateProvider(sourceDatabase.ConnectionString, certificateAPath, certificateAPassword))
            {
                protectedPayload = first.GetRequiredService<IDataProtectionProvider>()
                    .CreateProtector("ASUS-10E1B-recovery-contract")
                    .Protect(payload);

                await using var scope = first.CreateAsyncScope();
                var keys = await scope.ServiceProvider.GetRequiredService<BetccoDbContext>()
                    .DataProtectionKeys.AsNoTracking()
                    .Select(key => new { key.FriendlyName, key.Xml })
                    .ToListAsync();
                Assert.NotEmpty(keys);
                Assert.All(keys, key => Assert.Contains("encryptedSecret", key.Xml, StringComparison.Ordinal));
                Assert.DoesNotContain(payload, string.Join('\n', keys.Select(key => key.Xml)), StringComparison.Ordinal);

                // PR #111 separately proves PostgreSQL backup/restore for the whole migrated database.
                // This focused recovery contract copies the persisted encrypted key-ring rows into a
                // separate migrated PostgreSQL database so certificate recovery is not accidentally
                // proven by reopening the original source database.
                await using var recoveredContext = recoveredDatabase.CreateContext();
                recoveredContext.DataProtectionKeys.AddRange(keys.Select(key => new DataProtectionKey
                {
                    FriendlyName = key.FriendlyName,
                    Xml = key.Xml
                }));
                await recoveredContext.SaveChangesAsync();
                Assert.Equal(keys.Count, await recoveredContext.DataProtectionKeys.CountAsync());
            }

            // A newly built container models a restarted application after restoring the same database
            // and recovering the original PFX from its external custody location.
            await using (var recovered = CreateProvider(recoveredDatabase.ConnectionString, certificateAPath, certificateAPassword))
            {
                var unprotected = recovered.GetRequiredService<IDataProtectionProvider>()
                    .CreateProtector("ASUS-10E1B-recovery-contract")
                    .Unprotect(protectedPayload);
                Assert.Equal(payload, unprotected);
            }

            await using (var wrongCertificate = CreateProvider(recoveredDatabase.ConnectionString, certificateBPath, certificateBPassword))
            {
                Assert.ThrowsAny<CryptographicException>(() => wrongCertificate.GetRequiredService<IDataProtectionProvider>()
                    .CreateProtector("ASUS-10E1B-recovery-contract")
                    .Unprotect(protectedPayload));
            }

            var missingCertificateConfiguration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Postgres"] = "Host=localhost;Database=betcco_test;Username=ci",
                ["DataProtection:Provider"] = "Postgres"
            }).Build();
            var validation = Assert.Throws<InvalidOperationException>(() => StartupConfigurationValidator.ThrowIfInvalid(
                missingCertificateConfiguration,
                new RecoveryTestEnvironment()));
            Assert.Contains("DataProtection:CertificatePath is required", validation.Message, StringComparison.Ordinal);
            Assert.Contains("DataProtection:CertificatePassword is required", validation.Message, StringComparison.Ordinal);
        }
        finally
        {
            Environment.SetEnvironmentVariable("BETCCO_TEST_DP_CERT_PASSWORD", null);
            if (Directory.Exists(tempDirectory)) Directory.Delete(tempDirectory, recursive: true);
        }
    }

    private static ServiceProvider CreateProvider(string connectionString, string certificatePath, string password)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DataProtection:Provider"] = "Postgres",
            ["DataProtection:CertificatePath"] = certificatePath,
            ["DataProtection:CertificatePassword"] = password
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(connectionString));
        DataProtectionConfiguration.Configure(services, configuration, new RecoveryTestEnvironment());
        return services.BuildServiceProvider();
    }

    private static void WriteTestCertificate(string path, string password, string subject)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));
        File.WriteAllBytes(path, certificate.Export(X509ContentType.Pfx, password));
    }

    private static X509Certificate2 LoadAndVerifyCertificate(string path, string password) =>
        X509CertificateLoader.LoadPkcs12FromFile(path, password);

    private static string CreateEphemeralPassword()
    {
        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        Environment.SetEnvironmentVariable("BETCCO_TEST_DP_CERT_PASSWORD", password);
        return Environment.GetEnvironmentVariable("BETCCO_TEST_DP_CERT_PASSWORD")!;
    }

    private sealed class RecoveryTestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "BETCCO";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
