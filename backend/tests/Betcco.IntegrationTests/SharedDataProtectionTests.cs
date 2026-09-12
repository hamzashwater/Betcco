using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace Betcco.IntegrationTests;

public sealed class SharedDataProtectionTests
{
    [Fact]
    public async Task Separate_instances_share_encrypted_database_backed_keys()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=BETCCO test data protection", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));
        var databaseRoot = new InMemoryDatabaseRoot();
        var databaseName = Guid.NewGuid().ToString("N");

        await using var first = Provider(databaseName, databaseRoot, certificate);
        await using (var scope = first.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<BetccoDbContext>().Database.EnsureCreatedAsync();
        var protectedValue = first.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("shared-instance-contract")
            .Protect("instance-a-value");

        await using (var scope = first.CreateAsyncScope())
        {
            var keys = await scope.ServiceProvider.GetRequiredService<BetccoDbContext>().DataProtectionKeys.AsNoTracking().ToListAsync();
            Assert.Single(keys);
            Assert.Contains("encryptedSecret", keys[0].Xml, StringComparison.Ordinal);
            Assert.DoesNotContain("instance-a-value", keys[0].Xml, StringComparison.Ordinal);
        }

        await using var second = Provider(databaseName, databaseRoot, certificate);
        var unprotectedValue = second.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("shared-instance-contract")
            .Unprotect(protectedValue);

        Assert.Equal("instance-a-value", unprotectedValue);
    }

    [Fact]
    [Trait("Category", "PostgreSQLStorage")]
    public async Task Separate_instances_share_encrypted_postgres_backed_keys()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("data_protection");
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=BETCCO PostgreSQL data protection", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));

        await using var first = PostgresProvider(database.ConnectionString, certificate);
        var protectedValue = first.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("postgres-shared-instance-contract")
            .Protect("instance-a-postgres-value");
        await using (var scope = first.CreateAsyncScope())
        {
            var keys = await scope.ServiceProvider.GetRequiredService<BetccoDbContext>().DataProtectionKeys.AsNoTracking().ToListAsync();
            Assert.Single(keys);
            Assert.Contains("encryptedSecret", keys[0].Xml, StringComparison.Ordinal);
        }

        await using var second = PostgresProvider(database.ConnectionString, certificate);
        var unprotectedValue = second.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("postgres-shared-instance-contract")
            .Unprotect(protectedValue);

        Assert.Equal("instance-a-postgres-value", unprotectedValue);
    }

    private static ServiceProvider Provider(string databaseName, InMemoryDatabaseRoot databaseRoot, X509Certificate2 certificate)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseInMemoryDatabase(databaseName, databaseRoot));
        services.AddDataProtection()
            .SetApplicationName("BETCCO-storage-contract")
            .PersistKeysToDbContext<BetccoDbContext>()
            .ProtectKeysWithCertificate(certificate);
        return services.BuildServiceProvider();
    }

    private static ServiceProvider PostgresProvider(string connectionString, X509Certificate2 certificate)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(connectionString));
        services.AddDataProtection()
            .SetApplicationName("BETCCO-postgres-storage-contract")
            .PersistKeysToDbContext<BetccoDbContext>()
            .ProtectKeysWithCertificate(certificate);
        return services.BuildServiceProvider();
    }
}
