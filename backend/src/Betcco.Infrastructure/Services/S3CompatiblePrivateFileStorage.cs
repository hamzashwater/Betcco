using System.Net;
using System.Runtime.CompilerServices;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.S3.Util;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

public sealed class S3CompatiblePrivateFileStorage(IAmazonS3 client, IConfiguration configuration) : IFileStorage
{
    private const string StagingPrefix = "staging/";
    private readonly string _bucket = configuration["Storage:S3:Bucket"]
        ?? throw new InvalidOperationException("Storage:S3:Bucket is required for S3-compatible storage.");

    public async Task EnsureBucketAvailableAsync(bool createWhenMissing, CancellationToken cancellationToken = default)
    {
        if (await AmazonS3Util.DoesS3BucketExistV2Async(client, _bucket)) return;
        if (!createWhenMissing) throw new InvalidOperationException("The configured private storage bucket is unavailable.");
        await client.PutBucketAsync(new PutBucketRequest { BucketName = _bucket }, cancellationToken);
    }

    public async Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        var staged = await StagePrivateAsync(content, contentType, cancellationToken);
        await FinalizePrivateAsync(staged, cancellationToken);
        return staged.StorageKey;
    }

    public async Task<StagedPrivateFile> StagePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (string.IsNullOrWhiteSpace(contentType)) throw new ArgumentException("A content type is required.", nameof(contentType));

        var createdAtUtc = DateTimeOffset.UtcNow;
        var identifier = Guid.NewGuid().ToString("N");
        var datePath = $"{createdAtUtc:yyyy/MM}/{identifier}";
        var stagingKey = $"{StagingPrefix}{datePath}";
        var storageKey = $"objects/{datePath}";
        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = stagingKey,
            InputStream = content,
            AutoCloseStream = false,
            ContentType = contentType.Trim()
        };
        request.Metadata["betcco-final-key"] = storageKey;
        request.Metadata["betcco-created-at-utc"] = createdAtUtc.ToString("O");
        await client.PutObjectAsync(request, cancellationToken);
        return new StagedPrivateFile(stagingKey, storageKey, contentType.Trim(), content.CanSeek ? content.Length : null, createdAtUtc);
    }

    public async Task FinalizePrivateAsync(StagedPrivateFile file, CancellationToken cancellationToken = default)
    {
        ValidateStagedPair(file);
        if (await ExistsAsync(file.StorageKey, cancellationToken))
        {
            await DeletePrivateAsync(file.StagingKey, cancellationToken);
            return;
        }

        await client.CopyObjectAsync(new CopyObjectRequest
        {
            SourceBucket = _bucket,
            SourceKey = file.StagingKey,
            DestinationBucket = _bucket,
            DestinationKey = file.StorageKey
        }, cancellationToken);
        await DeletePrivateAsync(file.StagingKey, cancellationToken);
    }

    public async Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        ValidateKey(storageKey, allowStaging: false);
        try
        {
            var response = await client.GetObjectAsync(_bucket, storageKey, cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public Task<bool> ExistsPrivateAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        ValidateKey(storageKey, allowStaging: false);
        return ExistsAsync(storageKey, cancellationToken);
    }

    public async Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        ValidateKey(storageKey, allowStaging: true);
        await client.DeleteObjectAsync(_bucket, storageKey, cancellationToken);
    }

    public async IAsyncEnumerable<StagedPrivateFile> ListStagedAsync(
        DateTimeOffset createdBeforeUtc,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        string? continuationToken = null;
        do
        {
            var response = await client.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = _bucket,
                Prefix = StagingPrefix,
                ContinuationToken = continuationToken
            }, cancellationToken);
            foreach (var item in response.S3Objects ?? [])
            {
                if (item.LastModified is not { } lastModified) continue;
                var createdAtUtc = new DateTimeOffset(lastModified.ToUniversalTime());
                if (createdAtUtc > createdBeforeUtc) continue;
                ValidateKey(item.Key, allowStaging: true);
                yield return new StagedPrivateFile(item.Key, ToFinalKey(item.Key), "application/octet-stream", item.Size, createdAtUtc);
            }
            continuationToken = response.IsTruncated == true ? response.NextContinuationToken : null;
        } while (continuationToken is not null);
    }

    private async Task<bool> ExistsAsync(string storageKey, CancellationToken cancellationToken)
    {
        try
        {
            await client.GetObjectMetadataAsync(_bucket, storageKey, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private static void ValidateStagedPair(StagedPrivateFile file)
    {
        ValidateKey(file.StagingKey, allowStaging: true);
        ValidateKey(file.StorageKey, allowStaging: false);
        if (!file.StagingKey.StartsWith(StagingPrefix, StringComparison.Ordinal)
            || !string.Equals(ToFinalKey(file.StagingKey), file.StorageKey, StringComparison.Ordinal))
            throw new ArgumentException("The staged and final storage keys do not form a valid server-owned pair.", nameof(file));
    }

    private static void ValidateKey(string key, bool allowStaging)
    {
        var isStaging = key.StartsWith(StagingPrefix, StringComparison.Ordinal);
        if ((!allowStaging && isStaging) || string.IsNullOrWhiteSpace(key) || key.Length > 512
            || key.Contains('\\') || key.StartsWith('/') || key.EndsWith('/')
            || key.Split('/').Any(segment => segment.Length == 0 || segment is "." or ".."
                || segment.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_' and not '.')))
            throw new ArgumentException("The storage key is invalid.", nameof(key));
    }

    private static string ToFinalKey(string stagingKey) => $"objects/{stagingKey[StagingPrefix.Length..]}";
}
