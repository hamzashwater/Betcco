using System.Net;
using System.Net.Mail;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

/// <summary>SMTP adapter. Development uses local Mailpit; production requires explicit SMTP configuration.</summary>
public sealed class SmtpEmailSender(IConfiguration configuration, IHostEnvironment environment, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        var host = configuration["Email:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            if (environment.IsDevelopment())
            {
                logger.LogInformation("Development email was not sent because SMTP is not configured.");
                return;
            }
            throw new InvalidOperationException("Email delivery is not configured. Set Email__Host and Email__FromAddress.");
        }
        var port = configuration.GetValue("Email:Port", 587);
        using var client = new SmtpClient(host, port)
        {
            EnableSsl = configuration.GetValue("Email:UseSsl", true),
            Credentials = string.IsNullOrWhiteSpace(configuration["Email:Username"])
                ? CredentialCache.DefaultNetworkCredentials
                : new NetworkCredential(configuration["Email:Username"], configuration["Email:Password"])
        };
        using var message = new MailMessage(
            configuration["Email:FromAddress"] ?? "noreply@betcco.local",
            to,
            subject,
            htmlBody)
        {
            IsBodyHtml = true
        };
        await client.SendMailAsync(message, cancellationToken);
    }
}
