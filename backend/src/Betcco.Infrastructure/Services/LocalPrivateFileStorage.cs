using System.Runtime.CompilerServices;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

public sealed class LocalPrivateFileStorage(IConfiguration configuration) : IFileStorage
{
    private const string StagingPrefix = "staging/";
    private readonly string _root = Path.GetFullPath(configuration["Storage:LocalRoot"] ?? "../storage");

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
        var path = ResolvePath(stagingKey, requireStaging: true);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using (var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan))
        {
            await content.CopyToAsync(target, cancellationToken);
            await target.FlushAsync(cancellationToken);
        }

        return new StagedPrivateFile(stagingKey, storageKey, contentType.Trim(), new FileInfo(path).Length, createdAtUtc);
    }

    public Task FinalizePrivateAsync(StagedPrivateFile file, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ValidateStagedPair(file);
        var stagingPath = ResolvePath(file.StagingKey, requireStaging: true);
        var finalPath = ResolvePath(file.StorageKey, requireStaging: false);
        Directory.CreateDirectory(Path.GetDirectoryName(finalPath)!);

        if (File.Exists(finalPath))
        {
            if (File.Exists(stagingPath)) File.Delete(stagingPath);
            return Task.CompletedTask;
        }

        if (!File.Exists(stagingPath)) throw new FileNotFoundException("The staged private object does not exist.", file.StagingKey);
        File.Move(stagingPath, finalPath);
        return Task.CompletedTask;
    }

    public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = ResolvePath(storageKey, requireStaging: false);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan)
            : null;
        return Task.FromResult(stream);
    }

    public Task<bool> ExistsPrivateAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(File.Exists(ResolvePath(storageKey, requireStaging: false)));
    }

    public Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = ResolvePath(storageKey, requireStaging: storageKey.StartsWith(StagingPrefix, StringComparison.Ordinal));
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public async IAsyncEnumerable<StagedPrivateFile> ListStagedAsync(
        DateTimeOffset createdBeforeUtc,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var stagingRoot = ResolvePath("staging", requireStaging: true);
        if (!Directory.Exists(stagingRoot)) yield break;

        foreach (var path in Directory.EnumerateFiles(stagingRoot, "*", SearchOption.AllDirectories))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var info = new FileInfo(path);
            var createdAtUtc = new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero);
            if (createdAtUtc > createdBeforeUtc) continue;
            var stagingKey = Path.GetRelativePath(_root, path).Replace(Path.DirectorySeparatorChar, '/');
            yield return new StagedPrivateFile(stagingKey, ToFinalKey(stagingKey), "application/octet-stream", info.Length, createdAtUtc);
            await Task.Yield();
        }
    }

    private string ResolvePath(string storageKey, bool requireStaging)
    {
        if (!IsSafeKey(storageKey)) throw new ArgumentException("The storage key is invalid.", nameof(storageKey));
        var isStaging = storageKey.Equals("staging", StringComparison.Ordinal) || storageKey.StartsWith(StagingPrefix, StringComparison.Ordinal);
        if (requireStaging != isStaging) throw new ArgumentException("The storage key is not valid for this operation.", nameof(storageKey));

        var path = Path.GetFullPath(Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        var rootWithSeparator = _root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!path.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The storage key escapes the private storage root.", nameof(storageKey));
        return path;
    }

    private static bool IsSafeKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 512 || key.Contains('\\') || key.StartsWith('/') || key.EndsWith('/')) return false;
        return key.Split('/').All(segment => segment.Length > 0
            && segment is not "." and not ".."
            && segment.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.'));
    }

    private static void ValidateStagedPair(StagedPrivateFile file)
    {
        if (!file.StagingKey.StartsWith(StagingPrefix, StringComparison.Ordinal)
            || !string.Equals(ToFinalKey(file.StagingKey), file.StorageKey, StringComparison.Ordinal))
            throw new ArgumentException("The staged and final storage keys do not form a valid server-owned pair.", nameof(file));
    }

    private static string ToFinalKey(string stagingKey) => $"objects/{stagingKey[StagingPrefix.Length..]}";
}
