using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

public sealed class LocalPrivateFileStorage(IConfiguration configuration) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(configuration["Storage:LocalRoot"] ?? "../storage");

    public async Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(_root);
        var key = $"{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}";
        var path = Path.Combine(_root, key.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var target = File.Create(path);
        await content.CopyToAsync(target, cancellationToken);
        return key;
    }

    public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        if (storageKey.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(storageKey)) return Task.FromResult<Stream?>(null);
        var path = Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar));
        Stream? stream = File.Exists(path) ? File.OpenRead(path) : null;
        return Task.FromResult(stream);
    }
}
