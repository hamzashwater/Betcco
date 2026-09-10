using Betcco.Application.Common;
using Betcco.Domain.Identity;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

public sealed class RegistrationEmailOutboxDispatcher(
    BetccoDbContext db,
    UserManager<ApplicationUser> userManager,
    IEmailSender emailSender,
    IDataProtectionProvider dataProtectionProvider,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<RegistrationEmailOutboxDispatcher> logger)
{
    private static readonly TimeSpan ProcessingLease = TimeSpan.FromMinutes(5);
    private const int MaximumRecordedAttempts = 1_000_000;
    private readonly IDataProtector confirmationTokenProtector = dataProtectionProvider.CreateProtector(
        "BETCCO.RegistrationEmailOutbox.ConfirmationToken.v1");

    public async Task<int> DispatchPendingAsync(int batchSize = 20, CancellationToken cancellationToken = default)
    {
        batchSize = Math.Clamp(batchSize, 1, 100);
        var now = DateTimeOffset.UtcNow;
        var candidateIds = await db.RegistrationEmailOutboxMessages.AsNoTracking()
            .Where(message =>
                ((message.Status == RegistrationEmailDeliveryStatus.Pending || message.Status == RegistrationEmailDeliveryStatus.Failed)
                    && message.NextAttemptAtUtc <= now)
                || (message.Status == RegistrationEmailDeliveryStatus.Processing
                    && message.ProcessingStartedAtUtc <= now - ProcessingLease))
            .OrderBy(message => message.NextAttemptAtUtc)
            .ThenBy(message => message.CreatedAtUtc)
            .Select(message => message.Id)
            .Take(batchSize)
            .ToListAsync(cancellationToken);

        var sent = 0;
        foreach (var candidateId in candidateIds)
        {
            if (!await TryClaimAsync(candidateId, now, cancellationToken)) continue;
            if (await DeliverAsync(candidateId, cancellationToken)) sent++;
        }

        return sent;
    }

    private async Task<bool> TryClaimAsync(Guid messageId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (db.Database.IsRelational())
        {
            var claimed = await db.RegistrationEmailOutboxMessages
                .Where(message => message.Id == messageId
                    && (((message.Status == RegistrationEmailDeliveryStatus.Pending || message.Status == RegistrationEmailDeliveryStatus.Failed)
                            && message.NextAttemptAtUtc <= now)
                        || (message.Status == RegistrationEmailDeliveryStatus.Processing
                            && message.ProcessingStartedAtUtc <= now - ProcessingLease)))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(message => message.Status, RegistrationEmailDeliveryStatus.Processing)
                    .SetProperty(message => message.ProcessingStartedAtUtc, now)
                    .SetProperty(message => message.LastAttemptAtUtc, now)
                    .SetProperty(
                        message => message.AttemptCount,
                        message => message.AttemptCount >= MaximumRecordedAttempts
                            ? MaximumRecordedAttempts
                            : message.AttemptCount + 1), cancellationToken);
            return claimed == 1;
        }

        var message = await db.RegistrationEmailOutboxMessages.SingleOrDefaultAsync(item => item.Id == messageId, cancellationToken);
        if (message is null) return false;
        message.Status = RegistrationEmailDeliveryStatus.Processing;
        message.ProcessingStartedAtUtc = now;
        message.LastAttemptAtUtc = now;
        message.AttemptCount = message.AttemptCount >= MaximumRecordedAttempts
            ? MaximumRecordedAttempts
            : message.AttemptCount + 1;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<bool> DeliverAsync(Guid messageId, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        var message = await db.RegistrationEmailOutboxMessages.SingleAsync(item => item.Id == messageId, cancellationToken);
        try
        {
            var user = await userManager.FindByIdAsync(message.UserId.ToString())
                ?? throw new InvalidOperationException("Registration account no longer exists.");
            if (user.EmailConfirmed)
            {
                MarkSent(message);
                await db.SaveChangesAsync(cancellationToken);
                return true;
            }

            var token = message.ProtectedConfirmationToken is null
                ? await CreateAndPersistProtectedTokenAsync(message, user, cancellationToken)
                : confirmationTokenProtector.Unprotect(message.ProtectedConfirmationToken);
            var brandName = await BrandNameAsync(cancellationToken);
            var publicAppUrl = PublicAppUrl();
            var url = $"{publicAppUrl}/ar/confirm-email?userId={user.Id}&token={Uri.EscapeDataString(token)}";
            await emailSender.SendAsync(
                message.RecipientEmail,
                $"Verify your {brandName} account",
                $"<p>Verify your {brandName} account: <a href=\"{url}\">Verify email</a></p>",
                cancellationToken);

            MarkSent(message);
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            message.Status = RegistrationEmailDeliveryStatus.Failed;
            message.ProcessingStartedAtUtc = null;
            message.LastFailureCode = Bounded(exception.GetType().Name, 120);
            message.NextAttemptAtUtc = DateTimeOffset.UtcNow.Add(RetryDelay(message.AttemptCount));
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogWarning(
                "Registration confirmation email delivery failed for outbox message {OutboxMessageId} with {FailureCode}.",
                message.Id,
                message.LastFailureCode);
            return false;
        }
    }

    private static void MarkSent(RegistrationEmailOutboxMessage message)
    {
        message.Status = RegistrationEmailDeliveryStatus.Sent;
        message.SentAtUtc = DateTimeOffset.UtcNow;
        message.ProcessingStartedAtUtc = null;
        message.LastFailureCode = null;
        message.ProtectedConfirmationToken = null;
    }

    private async Task<string> CreateAndPersistProtectedTokenAsync(
        RegistrationEmailOutboxMessage message,
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        var token = await userManager.GenerateEmailConfirmationTokenAsync(user);
        message.ProtectedConfirmationToken = confirmationTokenProtector.Protect(token);
        await db.SaveChangesAsync(cancellationToken);
        return token;
    }

    private async Task<string> BrandNameAsync(CancellationToken cancellationToken)
    {
        var setting = await db.SiteSettings.AsNoTracking().SingleOrDefaultAsync(item => item.Key == "BrandName", cancellationToken);
        return setting?.EnglishValue.Trim() is { Length: > 0 } brandName ? brandName : "BETCCO";
    }

    private string PublicAppUrl()
    {
        var configured = configuration["APP_PUBLIC_URL"]?.TrimEnd('/')
            ?? configuration["NEXT_PUBLIC_APP_URL"]?.TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(configured)) return configured;
        if (environment.IsDevelopment()) return "http://localhost:3000";
        throw new InvalidOperationException("The public application URL is not configured.");
    }

    private static TimeSpan RetryDelay(int attemptCount) =>
        TimeSpan.FromSeconds(Math.Min(3600, 15 * Math.Pow(2, Math.Min(Math.Max(attemptCount - 1, 0), 8))));

    private static string Bounded(string value, int maximum) => value[..Math.Min(value.Length, maximum)];
}

public sealed class RegistrationEmailOutboxPublisher(
    IServiceScopeFactory scopeFactory,
    ILogger<RegistrationEmailOutboxPublisher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<RegistrationEmailOutboxDispatcher>()
                    .DispatchPendingAsync(cancellationToken: stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Unable to process registration confirmation email outbox messages.");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }
}
