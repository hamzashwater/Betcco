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
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        var now = DateTimeOffset.UtcNow;
        var candidateIds = await db.DataPortabilityExports.AsNoTracking()
            .Where(export => export.StorageKey != null && export.ExpiresAtUtc <= now &&
                !db.StorageLifecycleOperations.Any(operation =>
                    operation.Action == StorageLifecycleAction.Delete && operation.StorageKey == export.StorageKey))
            .OrderBy(export => export.ExpiresAtUtc)
            .ThenBy(export => export.Id)
            .Take(BatchSize)
            .Select(export => export.Id)
            .ToListAsync(cancellationToken);

        var enqueuedKeys = new HashSet<string>(StringComparer.Ordinal);
        var enqueued = 0;
        foreach (var id in candidateIds)
        {
            var export = await LoadExportAsync(id, transaction is not null, cancellationToken);
            if (export?.StorageKey is not { } storageKey || export.ExpiresAtUtc > now ||
                !enqueuedKeys.Add(storageKey) ||
                await db.StorageLifecycleOperations.AsNoTracking().AnyAsync(operation =>
                    operation.Action == StorageLifecycleAction.Delete && operation.StorageKey == storageKey, cancellationToken))
                continue;

            storageLifecycle.EnqueueDeletion(storageKey);
            enqueued++;
        }

        if (enqueued > 0)
            await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
            await transaction.CommitAsync(cancellationToken);

        return enqueued;
    }

    public async Task<int> AuditCompletedArtifactDeletionsAsync(CancellationToken cancellationToken = default)
    {
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        var now = DateTimeOffset.UtcNow;
        var candidateIds = await db.DataPortabilityExports.AsNoTracking()
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
            .Select(export => export.Id)
            .ToListAsync(cancellationToken);

        var audited = 0;
        foreach (var id in candidateIds)
        {
            var export = await LoadExportAsync(id, transaction is not null, cancellationToken);
            if (export?.StorageKey is not { } storageKey || export.ExpiresAtUtc > now ||
                !await db.StorageLifecycleOperations.AsNoTracking().AnyAsync(operation =>
                    operation.Action == StorageLifecycleAction.Delete &&
                    operation.Status == StorageLifecycleStatus.Completed &&
                    operation.StorageKey == storageKey, cancellationToken) ||
                await db.AuditLogs.AsNoTracking().AnyAsync(audit => audit.Action == DeletedAuditAction &&
                    audit.EntityType == nameof(DataPortabilityExport) &&
                    audit.EntityId == id.ToString(), cancellationToken))
                continue;

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
            audited++;
        }

        if (audited > 0)
            await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
            await transaction.CommitAsync(cancellationToken);

        return audited;
    }

    private Task<DataPortabilityExport?> LoadExportAsync(Guid id, bool lockRow, CancellationToken cancellationToken) =>
        lockRow
            ? db.DataPortabilityExports.FromSqlInterpolated($"SELECT * FROM \"DataPortabilityExports\" WHERE \"Id\" = {id} FOR UPDATE")
                .AsNoTracking().SingleOrDefaultAsync(cancellationToken)
            : db.DataPortabilityExports.AsNoTracking().SingleOrDefaultAsync(export => export.Id == id, cancellationToken);
}
