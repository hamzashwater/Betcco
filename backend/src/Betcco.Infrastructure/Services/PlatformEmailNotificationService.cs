using System.Net;
using Betcco.Application.Common;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Wraps the replaceable SMTP sender with a small, escaped BETCCO template.
/// It intentionally treats email as a best-effort notification channel: state
/// changes are never contingent on a third-party delivery provider.
/// </summary>
public sealed class PlatformEmailNotificationService(
    IEmailSender sender,
    ILogger<PlatformEmailNotificationService> logger) : IEmailNotificationService
{
    public async Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(notification.RecipientEmail)) return;
        try
        {
            var heading = WebUtility.HtmlEncode(notification.Heading);
            var body = WebUtility.HtmlEncode(notification.Body).Replace("\n", "<br />", StringComparison.Ordinal);
            var html = $"<main style=\"font-family:Arial,sans-serif;line-height:1.6\"><h1>BETCCO</h1><h2>{heading}</h2><p>{body}</p></main>";
            await sender.SendAsync(notification.RecipientEmail, notification.Subject, html, cancellationToken);
        }
        catch (Exception exception)
        {
            // Do not log a recipient address, subject, body, or external error
            // details because they may contain personal or academic information.
            logger.LogError(exception, "BETCCO email notification event {EventName} could not be delivered.", notification.EventName);
        }
    }
}
