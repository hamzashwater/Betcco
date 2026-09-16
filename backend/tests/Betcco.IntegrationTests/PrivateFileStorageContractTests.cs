using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Betcco.Application.Common;
using Betcco.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Xunit.Sdk;

namespace Betcco.IntegrationTests;

public abstract class PrivateFileStorageContractTests
{
    protected abstract Task<StorageFixture> CreateStorageAsync();

    [Fact]
    public async Task Write_read_and_content_length_are_preserved()
    {
        await using var fixture = await CreateStorageAsync();
        var expected = Enumerable.Range(0, 1024).Select(index => (byte)(index % 251)).ToArray();
        await using var source = new MemoryStream(expected, writable: false);

        var staged = await fixture.Storage.StagePrivateAsync(source, "application/octet-stream");
        Assert.Equal(expected.Length, staged.ContentLength);
        Assert.False(await fixture.Storage.ExistsPrivateAsync(staged.StorageKey));
        await fixture.Storage.FinalizePrivateAsync(staged);

        Assert.True(await fixture.Storage.ExistsPrivateAsync(staged.StorageKey));
        await using var stored = await fixture.Storage.OpenPrivateReadAsync(staged.StorageKey);
        Assert.NotNull(stored);
        Assert.True(stored.CanSeek);
        Assert.Equal(expected.Length, stored.Length);
        stored.Seek(512, SeekOrigin.Begin);
        var middle = new byte[16];
        Assert.Equal(middle.Length, await stored.ReadAsync(middle));
        Assert.Equal(expected.Skip(512).Take(16), middle);
        stored.Seek(0, SeekOrigin.Begin);
        await using var copy = new MemoryStream();
        await stored.CopyToAsync(copy);
        Assert.Equal(expected, copy.ToArray());
    }

    [Fact]
    public async Task Generated_keys_are_unique_and_opaque()
    {
        await using var fixture = await CreateStorageAsync();
        await using var firstSource = new MemoryStream([1]);
        await using var secondSource = new MemoryStream([2]);
        var first = await fixture.Storage.StagePrivateAsync(firstSource, "application/octet-stream");
        var second = await fixture.Storage.StagePrivateAsync(secondSource, "application/octet-stream");

        Assert.NotEqual(first.StorageKey, second.StorageKey);
        Assert.StartsWith("objects/", first.StorageKey);
        Assert.DoesNotContain("..", first.StorageKey, StringComparison.Ordinal);
        await fixture.Storage.DeletePrivateAsync(first.StagingKey);
        await fixture.Storage.DeletePrivateAsync(second.StagingKey);
    }

    [Fact]
    public async Task Delete_is_idempotent_and_missing_read_returns_null()
    {
        await using var fixture = await CreateStorageAsync();
        await using var source = new MemoryStream([3, 4, 5]);
        var staged = await fixture.Storage.StagePrivateAsync(source, "application/octet-stream");
        await fixture.Storage.FinalizePrivateAsync(staged);

        await fixture.Storage.DeletePrivateAsync(staged.StorageKey);
        await fixture.Storage.DeletePrivateAsync(staged.StorageKey);

        Assert.False(await fixture.Storage.ExistsPrivateAsync(staged.StorageKey));
        Assert.Null(await fixture.Storage.OpenPrivateReadAsync(staged.StorageKey));
    }

    [Theory]
    [InlineData("../outside")]
    [InlineData("/absolute/path")]
    [InlineData("objects\\escaped")]
    [InlineData("objects//ambiguous")]
    public async Task Unsafe_keys_are_rejected(string key)
    {
        await using var fixture = await CreateStorageAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Storage.OpenPrivateReadAsync(key));
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Storage.DeletePrivateAsync(key));
    }

    [Fact]
    public async Task Cancelled_write_does_not_complete()
    {
        await using var fixture = await CreateStorageAsync();
        await using var source = new MemoryStream(new byte[1024]);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            fixture.Storage.StagePrivateAsync(source, "application/octet-stream", cancellation.Token));
    }

    protected sealed class StorageFixture(IFileStorage storage, Func<Task> cleanup) : IAsyncDisposable
    {
        public IFileStorage Storage { get; } = storage;
        public async ValueTask DisposeAsync() => await cleanup();
    }
}

public sealed class LocalPrivateFileStorageContractTests : PrivateFileStorageContractTests
{
    [Fact]
    public async Task Legacy_local_key_remains_readable()
    {
        var root = Path.Combine(Path.GetTempPath(), "betcco-storage-tests", Guid.NewGuid().ToString("N"));
        var legacyKey = "2026/09/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        var legacyPath = Path.Combine(root, "2026", "09", "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
        Directory.CreateDirectory(Path.GetDirectoryName(legacyPath)!);
        await File.WriteAllBytesAsync(legacyPath, [7, 8, 9]);
        try
        {
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:LocalRoot"] = root
            }).Build();
            var storage = new LocalPrivateFileStorage(configuration);

            await using var content = await storage.OpenPrivateReadAsync(legacyKey);
            Assert.NotNull(content);
            await using var copy = new MemoryStream();
            await content.CopyToAsync(copy);
            Assert.Equal([7, 8, 9], copy.ToArray());
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    protected override Task<StorageFixture> CreateStorageAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "betcco-storage-tests", Guid.NewGuid().ToString("N"));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:LocalRoot"] = root
        }).Build();
        var storage = new LocalPrivateFileStorage(configuration);
        return Task.FromResult(new StorageFixture(storage, () =>
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            return Task.CompletedTask;
        }));
    }
}

[Trait("Category", "S3Compatible")]
public sealed class S3CompatiblePrivateFileStorageContractTests : PrivateFileStorageContractTests
{
    [Fact]
    public async Task Separate_adapters_share_private_objects_and_anonymous_http_is_rejected()
    {
        var endpoint = RequiredEnvironment("BETCCO_TEST_S3_ENDPOINT");
        var accessKey = RequiredEnvironment("BETCCO_TEST_S3_ACCESS_KEY");
        var secretKey = RequiredEnvironment("BETCCO_TEST_S3_SECRET_KEY");
        var bucket = $"betcco-multi-{Guid.NewGuid():N}";
        using var firstClient = Client(endpoint, accessKey, secretKey);
        using var secondClient = Client(endpoint, accessKey, secretKey);
        await firstClient.PutBucketAsync(new PutBucketRequest { BucketName = bucket });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:S3:Bucket"] = bucket
        }).Build();
        var first = new S3CompatiblePrivateFileStorage(firstClient, configuration);
        var second = new S3CompatiblePrivateFileStorage(secondClient, configuration);
        StagedPrivateFile? staged = null;
        try
        {
            await using var source = new MemoryStream([10, 11, 12]);
            staged = await first.StagePrivateAsync(source, "application/octet-stream");
            await first.FinalizePrivateAsync(staged);

            await using var content = await second.OpenPrivateReadAsync(staged.StorageKey);
            Assert.NotNull(content);
            await using var copy = new MemoryStream();
            await content.CopyToAsync(copy);
            Assert.Equal([10, 11, 12], copy.ToArray());

            using var anonymousClient = new HttpClient();
            var anonymousResponse = await anonymousClient.GetAsync($"{endpoint.TrimEnd('/')}/{bucket}/{staged.StorageKey}");
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, anonymousResponse.StatusCode);
        }
        finally
        {
            if (staged is not null) await first.DeletePrivateAsync(staged.StorageKey);
            await firstClient.DeleteBucketAsync(bucket);
        }
    }

    protected override async Task<StorageFixture> CreateStorageAsync()
    {
        var endpoint = RequiredEnvironment("BETCCO_TEST_S3_ENDPOINT");
        var accessKey = RequiredEnvironment("BETCCO_TEST_S3_ACCESS_KEY");
        var secretKey = RequiredEnvironment("BETCCO_TEST_S3_SECRET_KEY");

        var bucketPrefix = Environment.GetEnvironmentVariable("BETCCO_TEST_S3_BUCKET") ?? "betcco-contract";
        var bucket = $"{bucketPrefix}-{Guid.NewGuid():N}"[..Math.Min(63, bucketPrefix.Length + 33)].TrimEnd('-');
        var client = Client(endpoint, accessKey, secretKey);
        await client.PutBucketAsync(new PutBucketRequest { BucketName = bucket });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:S3:Bucket"] = bucket
        }).Build();
        var storage = new S3CompatiblePrivateFileStorage(client, configuration);
        return new StorageFixture(storage, async () =>
        {
            string? continuationToken = null;
            do
            {
                var listed = await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, ContinuationToken = continuationToken });
                foreach (var item in listed.S3Objects ?? []) await client.DeleteObjectAsync(bucket, item.Key);
                continuationToken = listed.IsTruncated == true ? listed.NextContinuationToken : null;
            } while (continuationToken is not null);
            await client.DeleteBucketAsync(bucket);
            client.Dispose();
        });
    }

    private static string RequiredEnvironment(string key) =>
        Environment.GetEnvironmentVariable(key) is { Length: > 0 } value
            ? value
            : throw SkipException.ForSkip("Set the BETCCO_TEST_S3_* variables to run the S3-compatible contract.");

    private static AmazonS3Client Client(string endpoint, string accessKey, string secretKey) =>
        new(new BasicAWSCredentials(accessKey, secretKey), new AmazonS3Config
        {
            ServiceURL = endpoint.TrimEnd('/'),
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-1",
            MaxErrorRetry = 1,
            Timeout = TimeSpan.FromSeconds(15)
        });
}
