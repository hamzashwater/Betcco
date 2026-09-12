using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Betcco.Infrastructure.Services;

/// <summary>Fails startup when the selected shared object store is unavailable.</summary>
public sealed class StorageProviderStartupService(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!string.Equals(configuration["Storage:Provider"], "S3Compatible", StringComparison.OrdinalIgnoreCase)) return;
        using var scope = scopeFactory.CreateScope();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();
        if (storage is not S3CompatiblePrivateFileStorage s3Storage)
            throw new InvalidOperationException("S3-compatible storage was selected but its adapter is not registered.");
        var autoCreate = !environment.IsProduction() && configuration.GetValue("Storage:S3:AutoCreateBucket", false);
        await s3Storage.EnsureBucketAvailableAsync(autoCreate, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
