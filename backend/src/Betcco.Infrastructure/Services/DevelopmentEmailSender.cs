using Betcco.Application.Common;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

public sealed class DevelopmentEmailSender(ILogger<DevelopmentEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("A BETCCO development email event was received.");
        return Task.CompletedTask;
    }
}
