using Betcco.Application.Common;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Betcco.IntegrationTests;

public sealed class PrivacyPortabilityArtifactCleanupPostgresTests
{
    [Fact]
    [Trait("Category", "PostgreSQLPrivacy")]
    public async Task Expired_export_cleanup_queries_enqueue_delete_and_audit_completed_storage_operation()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("privacy_portability_expiry_cleanup");
        await using var db = database.CreateContext();
        const string storageKey = "objects/portability/expired-artifact";
        var request = new DataSubjectRequest
        {
            OwnerUserId = Guid.NewGuid().ToString(),
            RequestType = DataSubjectRequestType.Portability,
            Status = DataSubjectRequestStatus.InReview,
            IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
            IdentityVerifiedByUserId = "privacy-admin"
        };
        db.DataSubjectRequests.Add(request);
        var export = new DataPortabilityExport
        {
            DataSubjectRequestId = request.Id,
            SubjectUserId = request.OwnerUserId,
            Status = DataPortabilityExportStatus.Released,
            RequestedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            RequestedByUserId = "privacy-admin",
            GeneratedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            GeneratedByUserId = "privacy-admin",
            ExportFormat = "application/json",
            ExportVersion = "betcco-portability-v1",
            StorageKey = storageKey,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
            ReleasedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            ReleasedByUserId = "privacy-admin"
        };
        db.DataPortabilityExports.Add(export);
        await db.SaveChangesAsync();

        var storage = new DeletedObjectStorage();
        var coordinator = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);
        var cleanup = new DataPortabilityArtifactCleanupService(db, coordinator);

        Assert.Equal(1, await cleanup.EnqueueExpiredArtifactDeletionsAsync());
        Assert.Equal(1, await coordinator.ProcessPendingAsync());
        Assert.Equal(1, await cleanup.AuditCompletedArtifactDeletionsAsync());
        Assert.Equal(0, await cleanup.EnqueueExpiredArtifactDeletionsAsync());
        Assert.Equal(0, await cleanup.AuditCompletedArtifactDeletionsAsync());

        Assert.True(storage.WasDeleted);
        Assert.NotNull(await db.DataPortabilityExports.SingleOrDefaultAsync(item => item.Id == export.Id));
        Assert.Equal(storageKey, (await db.DataPortabilityExports.SingleAsync(item => item.Id == export.Id)).StorageKey);
        Assert.Single(await db.StorageLifecycleOperations.Where(item => item.StorageKey == storageKey).ToListAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "DataPortabilityExportExpiredArtifactDeleted").ToListAsync());
    }

    private sealed class DeletedObjectStorage : IFileStorage
    {
        public bool WasDeleted { get; private set; }

        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(null);

        public Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            WasDeleted = true;
            return Task.CompletedTask;
        }
    }
}
