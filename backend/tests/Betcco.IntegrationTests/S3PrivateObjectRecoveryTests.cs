using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Xunit.Sdk;

namespace Betcco.IntegrationTests;

[Trait("Category", "S3Compatible")]
public sealed class S3PrivateObjectRecoveryTests
{
    [Fact]
    public async Task Private_objects_recover_through_an_isolated_bucket_with_verified_manifest()
    {
        var endpoint = RequiredEnvironment("BETCCO_TEST_S3_ENDPOINT");
        var accessKey = RequiredEnvironment("BETCCO_TEST_S3_ACCESS_KEY");
        var secretKey = RequiredEnvironment("BETCCO_TEST_S3_SECRET_KEY");
        var suffix = Guid.NewGuid().ToString("N");
        var source = $"betcco-recovery-source-{suffix}";
        var backup = $"betcco-recovery-copy-{suffix}";
        var target = $"betcco-recovery-target-{suffix}";
        var nonEmptyTarget = $"betcco-recovery-guard-{suffix}";
        var failedTarget = $"betcco-recovery-failure-{suffix}";
        using var client = Client(endpoint, accessKey, secretKey);
        var createdBuckets = new List<string>();

        try
        {
            await CreatePrivateBucketAsync(client, source, createdBuckets);
            await CreatePrivateBucketAsync(client, backup, createdBuckets);
            await CreatePrivateBucketAsync(client, target, createdBuckets);
            await CreatePrivateBucketAsync(client, nonEmptyTarget, createdBuckets);

            var objects = new[]
            {
                SyntheticObject.Create("objects/2026/09/11111111111111111111111111111111", "application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37], "assessment-proof"),
                SyntheticObject.Create("objects/2026/09/22222222222222222222222222222222", "image/png", Enumerable.Range(0, 257).Select(value => (byte)(value % 251)).ToArray(), "profile-image"),
                SyntheticObject.Create("objects/2026/09/33333333333333333333333333333333", "application/octet-stream", Enumerable.Range(0, 8193).Select(value => (byte)((value * 31) % 251)).ToArray(), "private-evidence")
            };
            var transientStagingBytes = new byte[] { 8, 7, 6, 5 };
            foreach (var item in objects)
                await PutSyntheticObjectAsync(client, source, item);
            await PutAsync(client, source, "staging/2026/09/44444444444444444444444444444444", transientStagingBytes, "application/octet-stream", "transient-upload");

            var manifest = CreateManifest(objects);
            var manifestBytes = JsonSerializer.SerializeToUtf8Bytes(manifest);
            var manifestSha256 = Convert.ToHexString(SHA256.HashData(manifestBytes));
            await using var manifestStream = new MemoryStream(manifestBytes, writable: false);
            await client.PutObjectAsync(new PutObjectRequest
            {
                BucketName = backup,
                Key = "recovery-manifest.json",
                InputStream = manifestStream,
                ContentType = "application/json"
            });
            await using (var manifestDigestStream = new MemoryStream(System.Text.Encoding.ASCII.GetBytes(manifestSha256), writable: false))
            {
                await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = backup,
                    Key = "recovery-manifest.sha256",
                    InputStream = manifestDigestStream,
                    ContentType = "text/plain"
                });
            }
            using (var savedManifest = await client.GetObjectAsync(backup, "recovery-manifest.json"))
            await using (var recoveredManifest = new MemoryStream())
            {
                await savedManifest.ResponseStream.CopyToAsync(recoveredManifest);
                var savedManifestHash = Convert.ToHexString(SHA256.HashData(recoveredManifest.ToArray()));
                using var savedDigest = await client.GetObjectAsync(backup, "recovery-manifest.sha256");
                using var reader = new StreamReader(savedDigest.ResponseStream);
                Assert.Equal(await reader.ReadToEndAsync(), savedManifestHash);
                var altered = recoveredManifest.ToArray();
                altered[^1] ^= 1;
                Assert.NotEqual(savedManifestHash, Convert.ToHexString(SHA256.HashData(altered)));
            }

            await CopyObjectsAsync(client, source, backup, objects.Select(item => item.Key));
            await VerifyManifestAsync(client, backup, manifest);
            await ValidateTargetIsNewAndEmptyAsync(client, source, target);
            await CopyObjectsAsync(client, backup, target, objects.Select(item => item.Key));
            await VerifyManifestAsync(client, source, manifest);
            await VerifyManifestAsync(client, target, manifest);
            await VerifyManifestAsync(client, source, manifest); // Source fingerprint is unchanged after recovery.
            await Assert.ThrowsAsync<AmazonS3Exception>(() => client.GetObjectMetadataAsync(target, "staging/2026/09/44444444444444444444444444444444"));

            Assert.Throws<InvalidOperationException>(() => ValidateDistinctBuckets(source, source));
            await PutAsync(client, nonEmptyTarget, "objects/sentinel", [1], "application/octet-stream", "sentinel");
            await Assert.ThrowsAsync<InvalidOperationException>(() => ValidateTargetIsNewAndEmptyAsync(client, source, nonEmptyTarget));
            await Assert.ThrowsAnyAsync<AmazonS3Exception>(() => CopyObjectsAsync(client, $"betcco-missing-{suffix}", target, objects.Select(item => item.Key)));

            var corruptedManifest = manifest with { Objects = [manifest.Objects[0] with { Sha256 = new string('0', 64) }, .. manifest.Objects.Skip(1)] };
            await Assert.ThrowsAsync<InvalidDataException>(() => VerifyManifestAsync(client, target, corruptedManifest));
            var incompleteManifest = manifest with { Objects = manifest.Objects[..^1] };
            await Assert.ThrowsAsync<InvalidDataException>(() => VerifyManifestAsync(client, target, incompleteManifest));

            await SimulateFailedRestoreCleanupAsync(client, failedTarget, createdBuckets, objects[0]);

            using var anonymousClient = new HttpClient();
            foreach (var bucket in new[] { source, backup, target })
            {
                var bucketResponse = await anonymousClient.GetAsync($"{endpoint.TrimEnd('/')}/{bucket}");
                Assert.Equal(HttpStatusCode.Forbidden, bucketResponse.StatusCode);
                var objectResponse = await anonymousClient.GetAsync($"{endpoint.TrimEnd('/')}/{bucket}/{objects[0].Key}");
                Assert.Equal(HttpStatusCode.Forbidden, objectResponse.StatusCode);
            }
        }
        finally
        {
            foreach (var bucket in createdBuckets.AsEnumerable().Reverse())
                await DeleteCreatedBucketAsync(client, bucket);
        }
    }

    private static async Task CreatePrivateBucketAsync(IAmazonS3 client, string bucket, ICollection<string> createdBuckets)
    {
        await client.PutBucketAsync(new PutBucketRequest { BucketName = bucket });
        createdBuckets.Add(bucket);
        await AssertBucketEmptyAsync(client, bucket);
    }

    private static async Task ValidateTargetIsNewAndEmptyAsync(IAmazonS3 client, string source, string target)
    {
        ValidateDistinctBuckets(source, target);
        await AssertBucketEmptyAsync(client, target);
    }

    private static void ValidateDistinctBuckets(string source, string target)
    {
        if (string.Equals(source, target, StringComparison.Ordinal))
            throw new InvalidOperationException("S3 recovery source and target buckets must be different.");
    }

    private static async Task AssertBucketEmptyAsync(IAmazonS3 client, string bucket)
    {
        var result = await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, MaxKeys = 1 });
        if (result.KeyCount > 0 || result.S3Objects?.Count > 0)
            throw new InvalidOperationException("S3 recovery target must be empty; refusing to overwrite existing data.");
    }

    private static async Task CopyObjectsAsync(IAmazonS3 client, string source, string target, IEnumerable<string> keys)
    {
        foreach (var key in keys)
        {
            await client.CopyObjectAsync(new CopyObjectRequest
            {
                SourceBucket = source,
                SourceKey = key,
                DestinationBucket = target,
                DestinationKey = key,
                MetadataDirective = S3MetadataDirective.COPY
            });
        }
    }

    private static async Task VerifyManifestAsync(IAmazonS3 client, string bucket, RecoveryManifest manifest)
    {
        var listed = await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, Prefix = "objects/" });
        var actualKeys = (listed.S3Objects ?? []).Select(item => item.Key).Order(StringComparer.Ordinal).ToArray();
        var expectedKeys = manifest.Objects.Select(item => item.Key).Order(StringComparer.Ordinal).ToArray();
        if (!actualKeys.SequenceEqual(expectedKeys, StringComparer.Ordinal))
            throw new InvalidDataException($"Recovery object set differs in bucket {bucket}.");

        foreach (var expected in manifest.Objects)
        {
            var metadata = await client.GetObjectMetadataAsync(bucket, expected.Key);
            if (metadata.Headers.ContentLength != expected.Size
                || !string.Equals(metadata.Headers.ContentType, expected.ContentType, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(metadata.Metadata["x-amz-meta-betcco-purpose"], expected.Purpose, StringComparison.Ordinal))
                throw new InvalidDataException($"Recovery metadata mismatch for {expected.Key}.");

            using var response = await client.GetObjectAsync(bucket, expected.Key);
            await using var content = new MemoryStream();
            await response.ResponseStream.CopyToAsync(content);
            var bytes = content.ToArray();
            var digest = Convert.ToHexString(SHA256.HashData(bytes));
            if (bytes.LongLength != expected.Size || !string.Equals(digest, expected.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Recovery content fingerprint mismatch for {expected.Key}.");
        }
    }

    private static RecoveryManifest CreateManifest(IEnumerable<SyntheticObject> objects) =>
        new(objects.Select(item => new ManifestObject(item.Key, item.Bytes.LongLength, item.ContentType,
            Convert.ToHexString(SHA256.HashData(item.Bytes)), item.Purpose)).ToArray());

    private static async Task PutSyntheticObjectAsync(IAmazonS3 client, string bucket, SyntheticObject item) =>
        await PutAsync(client, bucket, item.Key, item.Bytes, item.ContentType, item.Purpose);

    private static async Task PutAsync(IAmazonS3 client, string bucket, string key, byte[] bytes, string contentType, string purpose)
    {
        await using var content = new MemoryStream(bytes, writable: false);
        var request = new PutObjectRequest
        {
            BucketName = bucket,
            Key = key,
            InputStream = content,
            ContentType = contentType
        };
        request.Metadata["betcco-purpose"] = purpose;
        await client.PutObjectAsync(request);
    }

    private static async Task DeleteCreatedBucketAsync(IAmazonS3 client, string bucket)
    {
        string? continuationToken = null;
        do
        {
            var listed = await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, ContinuationToken = continuationToken });
            foreach (var item in listed.S3Objects ?? []) await client.DeleteObjectAsync(bucket, item.Key);
            continuationToken = listed.IsTruncated == true ? listed.NextContinuationToken : null;
        } while (continuationToken is not null);
        await client.DeleteBucketAsync(bucket);
    }

    private static async Task SimulateFailedRestoreCleanupAsync(
        IAmazonS3 client,
        string target,
        ICollection<string> createdBuckets,
        SyntheticObject firstObject)
    {
        await CreatePrivateBucketAsync(client, target, createdBuckets);
        try
        {
            await PutSyntheticObjectAsync(client, target, firstObject);
            throw new SimulatedRestoreFailureException();
        }
        catch (SimulatedRestoreFailureException)
        {
            await DeleteCreatedBucketAsync(client, target);
            createdBuckets.Remove(target);
        }

        await Assert.ThrowsAnyAsync<AmazonS3Exception>(() => client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = target }));
    }

    private sealed class SimulatedRestoreFailureException : Exception { }

    private static string RequiredEnvironment(string key) =>
        Environment.GetEnvironmentVariable(key) is { Length: > 0 } value
            ? value
            : throw SkipException.ForSkip("Set the BETCCO_TEST_S3_* variables to run the S3-compatible recovery drill.");

    private static AmazonS3Client Client(string endpoint, string accessKey, string secretKey) =>
        new(new BasicAWSCredentials(accessKey, secretKey), new AmazonS3Config
        {
            ServiceURL = endpoint.TrimEnd('/'),
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-1",
            MaxErrorRetry = 1,
            Timeout = TimeSpan.FromSeconds(15)
        });

    private sealed record SyntheticObject(string Key, string ContentType, byte[] Bytes, string Purpose)
    {
        public static SyntheticObject Create(string key, string contentType, byte[] bytes, string purpose) => new(key, contentType, bytes, purpose);
    }

    private sealed record RecoveryManifest(ManifestObject[] Objects);
    private sealed record ManifestObject(string Key, long Size, string ContentType, string Sha256, string Purpose);
}
