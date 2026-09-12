using Betcco.Application.Common;
using System.Runtime.CompilerServices;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Betcco.IntegrationTests;

public sealed class StorageLifecycleTests
{
    [Fact]
    public async Task Temporary_finalize_failure_is_persisted_and_retried_idempotently()
    {
        await using var db = Database();
        var storage = new FlakyLifecycleStorage(failFinalizeOnce: true);
        var coordinator = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);
        var staged = new StagedPrivateFile("staging/2026/09/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "objects/2026/09/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "application/pdf", 4, DateTimeOffset.UtcNow);
        var operation = coordinator.EnqueueFinalization(staged);
        await db.SaveChangesAsync();

        Assert.False(await coordinator.TryProcessNowAsync(operation.Id));
        Assert.Equal(1, operation.Attempts);
        Assert.Equal(StorageLifecycleStatus.Pending, operation.Status);

        operation.NextAttemptAtUtc = DateTimeOffset.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync();
        Assert.True(await coordinator.TryProcessNowAsync(operation.Id));
        Assert.True(await coordinator.TryProcessNowAsync(operation.Id));

        Assert.Equal(StorageLifecycleStatus.Completed, operation.Status);
        Assert.Equal(2, storage.FinalizeAttempts);
    }

    [Fact]
    public async Task Missing_object_delete_and_duplicate_execution_are_safe()
    {
        await using var db = Database();
        var storage = new FlakyLifecycleStorage();
        var coordinator = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);
        var operation = coordinator.EnqueueDeletion("objects/2026/09/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
        await db.SaveChangesAsync();

        Assert.True(await coordinator.TryProcessNowAsync(operation.Id));
        Assert.True(await coordinator.TryProcessNowAsync(operation.Id));

        Assert.Equal(1, storage.DeleteAttempts);
        Assert.Equal(StorageLifecycleStatus.Completed, operation.Status);
    }

    [Fact]
    public async Task Old_staging_object_without_committed_operation_is_cleaned()
    {
        await using var db = Database();
        var staged = new StagedPrivateFile("staging/2026/09/cccccccccccccccccccccccccccccccc", "objects/2026/09/cccccccccccccccccccccccccccccccc", "application/pdf", 4, DateTimeOffset.UtcNow.AddHours(-1));
        var storage = new FlakyLifecycleStorage(stagedFile: staged);
        var coordinator = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);

        var cleaned = await coordinator.CleanOrphanedStagingAsync(DateTimeOffset.UtcNow.AddMinutes(-15));

        Assert.Equal(1, cleaned);
        Assert.Equal(1, storage.DeleteAttempts);
    }

    [Fact]
    public async Task Storage_write_followed_by_cancelled_database_save_discards_staging()
    {
        await using var db = Database();
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.Draft
        };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();

        using var cancellation = new CancellationTokenSource();
        var storage = new CancellingStageStorage(cancellation);
        var lifecycle = new RecordingLifecycleCoordinator();
        var service = new EvaluationService(db, storage, new CleanScanner(), null, lifecycle);
        await using var content = new MemoryStream("%PDF-1.7\ncontent"u8.ToArray());

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.AddFileAsync(
            "student", request.Id, "evidence.pdf", "application/pdf", content.Length, content, cancellation.Token));

        Assert.True(storage.WasStaged);
        Assert.True(lifecycle.WasDiscarded);
        Assert.Empty(await db.SubmissionFiles.AsNoTracking().ToListAsync());
    }

    private static BetccoDbContext Database() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private sealed class FlakyLifecycleStorage(bool failFinalizeOnce = false, StagedPrivateFile? stagedFile = null) : IFileStorage
    {
        public int FinalizeAttempts { get; private set; }
        public int DeleteAttempts { get; private set; }
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
        public Task FinalizePrivateAsync(StagedPrivateFile file, CancellationToken cancellationToken = default)
        {
            FinalizeAttempts++;
            if (failFinalizeOnce && FinalizeAttempts == 1) throw new IOException("Temporary provider failure.");
            return Task.CompletedTask;
        }
        public Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            DeleteAttempts++;
            return Task.CompletedTask;
        }
        public async IAsyncEnumerable<StagedPrivateFile> ListStagedAsync(DateTimeOffset createdBeforeUtc, [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            if (stagedFile is not null && stagedFile.CreatedAtUtc <= createdBeforeUtc) yield return stagedFile;
            await Task.CompletedTask;
        }
    }

    private sealed class CancellingStageStorage(CancellationTokenSource cancellation) : IFileStorage
    {
        public bool WasStaged { get; private set; }
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
        public Task<StagedPrivateFile> StagePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            WasStaged = true;
            cancellation.Cancel();
            return Task.FromResult(new StagedPrivateFile("staging/2026/09/dddddddddddddddddddddddddddddddd", "objects/2026/09/dddddddddddddddddddddddddddddddd", contentType, content.Length, DateTimeOffset.UtcNow));
        }
    }

    private sealed class RecordingLifecycleCoordinator : IStorageLifecycleCoordinator
    {
        public bool WasDiscarded { get; private set; }
        public StorageLifecycleOperation EnqueueFinalization(StagedPrivateFile file) => new() { Action = StorageLifecycleAction.Finalize, StagingKey = file.StagingKey, StorageKey = file.StorageKey };
        public StorageLifecycleOperation EnqueueDeletion(string storageKey) => new() { Action = StorageLifecycleAction.Delete, StorageKey = storageKey };
        public Task<bool> TryProcessNowAsync(Guid operationId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task DiscardStagedAsync(StagedPrivateFile file, CancellationToken cancellationToken = default) { WasDiscarded = true; return Task.CompletedTask; }
        public Task<int> ProcessPendingAsync(CancellationToken cancellationToken = default) => Task.FromResult(0);
        public Task<int> CleanOrphanedStagingAsync(DateTimeOffset createdBeforeUtc, CancellationToken cancellationToken = default) => Task.FromResult(0);
    }

    private sealed class CleanScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
