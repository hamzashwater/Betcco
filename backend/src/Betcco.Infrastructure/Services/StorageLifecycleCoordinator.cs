using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Betcco.Infrastructure.Services;

public sealed class StorageLifecycleCoordinator(
    BetccoDbContext db,
    IFileStorage storage,
    ILogger<StorageLifecycleCoordinator> logger) : IStorageLifecycleCoordinator
{
    private const int BatchSize = 50;

    public StorageLifecycleOperation EnqueueFinalization(StagedPrivateFile file)
    {
        var operation = new StorageLifecycleOperation
        {
            Action = StorageLifecycleAction.Finalize,
            StagingKey = file.StagingKey,
            StorageKey = file.StorageKey
        };
        db.StorageLifecycleOperations.Add(operation);
        return operation;
    }

    public StorageLifecycleOperation EnqueueDeletion(string storageKey)
    {
        var operation = new StorageLifecycleOperation
        {
            Action = StorageLifecycleAction.Delete,
            StorageKey = storageKey
        };
        db.StorageLifecycleOperations.Add(operation);
        return operation;
    }

    public async Task<bool> TryProcessNowAsync(Guid operationId, CancellationToken cancellationToken = default)
    {
        var operation = db.StorageLifecycleOperations.Local.SingleOrDefault(item => item.Id == operationId)
            ?? await db.StorageLifecycleOperations.SingleOrDefaultAsync(item => item.Id == operationId, cancellationToken);
        if (operation is null || operation.Status == StorageLifecycleStatus.Completed) return operation is not null;

        try
        {
            if (operation.Action == StorageLifecycleAction.Finalize)
            {
                if (string.IsNullOrWhiteSpace(operation.StagingKey)) throw new InvalidOperationException("A finalization operation requires a staging key.");
                await storage.FinalizePrivateAsync(
                    new StagedPrivateFile(operation.StagingKey, operation.StorageKey, "application/octet-stream", null, operation.CreatedAtUtc),
                    cancellationToken);
            }
            else
            {
                // A cleanup operation may depend on an unfinished finalization.
                // This prevents deleting an object before a retry copies its staged bytes.
                if (operation.StagingKey is not null && await db.StorageLifecycleOperations.AsNoTracking()
                    .AnyAsync(item => item.Action == StorageLifecycleAction.Finalize
                        && item.StorageKey == operation.StagingKey
                        && item.Status != StorageLifecycleStatus.Completed, cancellationToken))
                    return false;
                await storage.DeletePrivateAsync(operation.StorageKey, cancellationToken);
            }

            operation.Status = StorageLifecycleStatus.Completed;
            operation.CompletedAtUtc = DateTimeOffset.UtcNow;
            operation.LastErrorCategory = null;
            operation.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Private storage {Operation} completed for object {ObjectId}.", operation.Action, SafeIdentifier(operation.StorageKey));
            return true;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            operation.Attempts++;
            operation.LastErrorCategory = exception.GetType().Name[..Math.Min(exception.GetType().Name.Length, 200)];
            operation.NextAttemptAtUtc = DateTimeOffset.UtcNow.AddMinutes(Math.Min(60, Math.Pow(2, Math.Min(operation.Attempts, 5))));
            operation.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogWarning(exception, "Private storage {Operation} deferred for object {ObjectId}; attempt {Attempt}.", operation.Action, SafeIdentifier(operation.StorageKey), operation.Attempts);
            return false;
        }
    }

    public async Task DiscardStagedAsync(StagedPrivateFile file, CancellationToken cancellationToken = default)
    {
        foreach (var tracked in db.ChangeTracker.Entries<StorageLifecycleOperation>()
                     .Where(entry => entry.State == EntityState.Added && entry.Entity.StagingKey == file.StagingKey))
            tracked.State = EntityState.Detached;

        try
        {
            await storage.DeletePrivateAsync(file.StagingKey, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Immediate staged-object cleanup failed for object {ObjectId}; reconciliation will retry.", SafeIdentifier(file.StorageKey));
        }
    }

    public async Task<int> ProcessPendingAsync(CancellationToken cancellationToken = default)
    {
        var ids = await db.StorageLifecycleOperations.AsNoTracking()
            .Where(item => item.Status == StorageLifecycleStatus.Pending && item.NextAttemptAtUtc <= DateTimeOffset.UtcNow)
            .OrderBy(item => item.NextAttemptAtUtc)
            .Select(item => item.Id)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);
        var completed = 0;
        foreach (var id in ids)
        {
            if (await TryProcessNowAsync(id, cancellationToken)) completed++;
        }
        return completed;
    }

    public async Task<int> CleanOrphanedStagingAsync(DateTimeOffset createdBeforeUtc, CancellationToken cancellationToken = default)
    {
        var cleaned = 0;
        var inspected = 0;
        await foreach (var staged in storage.ListStagedAsync(createdBeforeUtc, cancellationToken))
        {
            if (++inspected > BatchSize) break;
            var operation = await db.StorageLifecycleOperations.AsNoTracking()
                .Where(item => item.StagingKey == staged.StagingKey)
                .OrderByDescending(item => item.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
            if (operation?.Status == StorageLifecycleStatus.Pending) continue;
            try
            {
                await storage.DeletePrivateAsync(staged.StagingKey, cancellationToken);
                cleaned++;
                logger.LogInformation("Removed orphaned staged object {ObjectId}.", SafeIdentifier(staged.StorageKey));
            }
            catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning(exception, "Staged-object reconciliation failed for object {ObjectId}.", SafeIdentifier(staged.StorageKey));
            }
        }
        return cleaned;
    }

    private static string SafeIdentifier(string storageKey) => storageKey.Split('/').LastOrDefault() ?? "unknown";
}

public sealed class StorageLifecycleWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<StorageLifecycleWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Clamp(configuration.GetValue("Storage:CleanupIntervalSeconds", 300), 30, 3600));
        var stagingGrace = TimeSpan.FromMinutes(Math.Clamp(configuration.GetValue("Storage:StagingGraceMinutes", 15), 5, 1440));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var coordinator = scope.ServiceProvider.GetRequiredService<IStorageLifecycleCoordinator>();
                await coordinator.ProcessPendingAsync(stoppingToken);
                await coordinator.CleanOrphanedStagingAsync(DateTimeOffset.UtcNow.Subtract(stagingGrace), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Private storage lifecycle reconciliation cycle failed.");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }
}
