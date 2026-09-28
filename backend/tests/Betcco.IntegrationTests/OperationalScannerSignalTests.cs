using System.Net;
using System.Net.Sockets;
using System.Text;
using Betcco.Application.Common;
using Betcco.Infrastructure.Services;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

public sealed class OperationalScannerSignalTests
{
    [Fact]
    public async Task Clamav_protocol_failure_emits_stable_signal_without_response_or_upload_contents()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var responseTask = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var stream = client.GetStream();
            await stream.WriteAsync(Encoding.UTF8.GetBytes("private scanner diagnostic: invalid\0"));
        });
        var logger = new OperationalSignalTestLogger<ClamAvFileSecurityScanner>();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ClamAv:Host"] = IPAddress.Loopback.ToString(),
                ["ClamAv:Port"] = port.ToString()
            })
            .Build();
        var scanner = new ClamAvFileSecurityScanner(configuration, logger);

        try
        {
            var result = await scanner.ScanAsync(new MemoryStream(Encoding.UTF8.GetBytes("private uploaded content")));
            await responseTask;

            Assert.Equal(FileScanOutcome.Unavailable, result.Outcome);
            Assert.Equal(OperationalEventIds.ScannerUnavailable, Assert.Single(logger.Entries).EventId);
            Assert.DoesNotContain("private scanner diagnostic", logger.Entries[0].Message);
            Assert.DoesNotContain("private uploaded content", logger.Entries[0].Message);
            Assert.DoesNotContain("private scanner diagnostic", result.Detail);
        }
        finally
        {
            listener.Stop();
        }
    }
}
