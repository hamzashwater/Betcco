using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Privacy;

public sealed class DataPortabilityArtifactCleanupService(
    BetccoDbContext db,
    IStorageLifecycleCoordinator storageLifecycle) : IDataPortabilityArtifactCleanup
{
    private const int BatchSize = 50;
    private const string DeletedAuditAction = "DataPortabilityExportExpiredArtifactDeleted";

    public async Task<int> EnqueueExpiredArtifactDeletionsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expiredExports = await db.DataPortabilityExports
            .Where(export => export.StorageKey != null && export.ExpiresAtUtc <= now &&
                !db.StorageLifecycleOperations.Any(operation =>
                    operation.Action == StorageLifecycleAction.Delete && operation.StorageKey == export.StorageKey))
            .OrderBy(export => export.ExpiresAtUtc)
            .ThenBy(export => export.Id)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        foreach (var export in expiredExports)
            storageLifecycle.EnqueueDeletion(export.StorageKey!);

        if (expiredExports.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        return expiredExports.Count;
    }

    public async Task<int> AuditCompletedArtifactDeletionsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var deletedExports = await db.DataPortabilityExports
            .Where(export => export.StorageKey != null && export.ExpiresAtUtc <= now &&
                db.StorageLifecycleOperations.Any(operation =>
                    operation.Action == StorageLifecycleAction.Delete &&
                    operation.Status == StorageLifecycleStatus.Completed &&
                    operation.StorageKey == export.StorageKey) &&
                !db.AuditLogs.Any(audit => audit.Action == DeletedAuditAction &&
                    audit.EntityType == nameof(DataPortabilityExport) &&
                    audit.EntityId == export.Id.ToString()))
            .OrderBy(export => export.ExpiresAtUtc)
            .ThenBy(export => export.Id)
            .Take(BatchSize)
            .Select(export => new { export.Id, export.ExpiresAtUtc })
            .ToListAsync(cancellationToken);

        foreach (var export in deletedExports)
        {
            db.AuditLogs.Add(new AuditLog
            {
                Action = DeletedAuditAction,
                EntityType = nameof(DataPortabilityExport),
                EntityId = export.Id.ToString(),
                Outcome = "Success",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    exportId = export.Id,
                    export.ExpiresAtUtc,
                    deletionResult = "Completed"
                })
            });
        }

        if (deletedExports.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        return deletedExports.Count;
    }
}
