using System.Security.Cryptography.X509Certificates;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Betcco.Api.Configuration;

/// <summary>Registers the application Data Protection persistence and key encryption.</summary>
public static class DataProtectionConfiguration
{
    public static void Configure(IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var dataProtection = services.AddDataProtection().SetApplicationName("BETCCO");
        var provider = configuration["DataProtection:Provider"]
            ?? (environment.IsProduction() ? null : "FileSystem");
        if (string.Equals(provider, "Postgres", StringComparison.OrdinalIgnoreCase))
        {
            dataProtection.PersistKeysToDbContext<BetccoDbContext>();
        }
        else
        {
            var keysPath = configuration["DataProtection:KeysPath"] ?? "../keys";
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }

        var certificatePath = configuration["DataProtection:CertificatePath"];
        if (!string.IsNullOrWhiteSpace(certificatePath))
        {
            var certificate = X509CertificateLoader.LoadPkcs12FromFile(
                certificatePath,
                configuration["DataProtection:CertificatePassword"]);
            dataProtection.ProtectKeysWithCertificate(certificate);
        }
    }
}
