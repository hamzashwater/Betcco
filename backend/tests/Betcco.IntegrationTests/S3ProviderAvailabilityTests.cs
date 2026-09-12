using Amazon.Runtime;
using Amazon.S3;
using Betcco.Infrastructure.Services;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

public sealed class S3ProviderAvailabilityTests
{
    [Fact]
    public async Task Unavailable_provider_fails_readiness_check()
    {
        using var client = new AmazonS3Client(new BasicAWSCredentials("test-access", "test-secret"), new AmazonS3Config
        {
            ServiceURL = "http://127.0.0.1:1",
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-1",
            MaxErrorRetry = 0,
            Timeout = TimeSpan.FromSeconds(1)
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:S3:Bucket"] = "betcco-unavailable"
        }).Build();
        var storage = new S3CompatiblePrivateFileStorage(client, configuration);

        await Assert.ThrowsAnyAsync<Exception>(() => storage.EnsureBucketAvailableAsync(createWhenMissing: false));
    }
}
