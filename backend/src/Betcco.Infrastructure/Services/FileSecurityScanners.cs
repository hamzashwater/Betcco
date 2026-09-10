using System.Buffers.Binary;
using System.Net.Sockets;
using System.Text;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

/// <summary>Development/test-only scanner. It deliberately does not represent malware protection in production.</summary>
public sealed class DevelopmentFileSecurityScanner : IFileSecurityScanner
{
    public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
        Task.FromResult(new FileScanResult(FileScanOutcome.Clean, "Development scanner"));
}

/// <summary>Safe production fallback: uploads must not bypass a configured scanner.</summary>
public sealed class UnconfiguredFileSecurityScanner : IFileSecurityScanner
{
    public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
        Task.FromResult(new FileScanResult(FileScanOutcome.Unavailable, "File security scanning is not configured."));
}

/// <summary>ClamAV INSTREAM scanner. It sends content directly to a private ClamAV daemon and never writes an unscanned copy.</summary>
public sealed class ClamAvFileSecurityScanner(IConfiguration configuration) : IFileSecurityScanner
{
    private readonly string _host = configuration["ClamAv:Host"] ?? "localhost";
    private readonly int _port = configuration.GetValue("ClamAv:Port", 3310);

    public async Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default)
    {
        var originalPosition = content.CanSeek ? content.Position : (long?)null;
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(_host, _port, cancellationToken);
            await using var stream = client.GetStream();
            await stream.WriteAsync("zINSTREAM\0"u8.ToArray(), cancellationToken);

            var buffer = new byte[16 * 1024];
            var lengthBuffer = new byte[sizeof(int)];
            int read;
            while ((read = await content.ReadAsync(buffer, cancellationToken)) > 0)
            {
                BinaryPrimitives.WriteInt32BigEndian(lengthBuffer, read);
                await stream.WriteAsync(lengthBuffer, cancellationToken);
                await stream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }

            BinaryPrimitives.WriteInt32BigEndian(lengthBuffer, 0);
            await stream.WriteAsync(lengthBuffer, cancellationToken);
            await stream.FlushAsync(cancellationToken);

            var response = await ReadResponseAsync(stream, cancellationToken);
            if (response.Contains("FOUND", StringComparison.OrdinalIgnoreCase))
                return new FileScanResult(FileScanOutcome.Rejected, response);
            if (response.Contains("OK", StringComparison.OrdinalIgnoreCase))
                return new FileScanResult(FileScanOutcome.Clean, response);
            return new FileScanResult(FileScanOutcome.Unavailable, response);
        }
        catch (Exception exception) when (exception is SocketException or IOException)
        {
            return new FileScanResult(FileScanOutcome.Unavailable, "The malware scanner could not be reached.");
        }
        finally
        {
            if (originalPosition is not null) content.Position = originalPosition.Value;
        }
    }

    private static async Task<string> ReadResponseAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var bytes = new List<byte>();
        var one = new byte[1];
        while (await stream.ReadAsync(one, cancellationToken) == 1)
        {
            if (one[0] == 0) break;
            bytes.Add(one[0]);
        }
        return Encoding.UTF8.GetString(bytes.ToArray());
    }
}
