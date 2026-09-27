using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AssessmentReasonableAdjustmentTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Revision_check_deadline_adjustment_is_auditable_revocable_and_enforced()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("assess_reasonable_adjustment");
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());

        var now = DateTimeOffset.UtcNow;
        var actor = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "reviewer@betcco.test",
            Email = "reviewer@betcco.test",
            DisplayName = "Course Reviewer"
        };
        var request = new EvaluationRequest
        {
            StudentUserId = "student-1",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RevisionDueAtUtc = now.AddHours(-1)
        };
        var feedback = new EvaluationFeedback
        {
            EvaluationRequestId = request.Id,
            AuthorUserId = "teacher-1",
            Body = "Submit revised evidence.",
            RequestsResubmission = true,
            CreatedAtUtc = now.AddHours(-3)
        };
        db.AddRange(actor, request, feedback);
        await db.SaveChangesAsync();
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = request.Id,
            OriginalFileName = "revision.pdf",
            StorageKey = "private/revision.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean,
            CreatedAtUtc = feedback.CreatedAtUtc.AddMinutes(1)
        });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = request.Id,
            StudentUserId = request.StudentUserId,
            AttemptNumber = 2,
            PolicyVersion = "test-v1",
            StatementSnapshot = "I confirm this is my work.",
            DeclaredAtUtc = now.AddMinutes(-30)
        });
        await db.SaveChangesAsync();

        var evaluation = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner());
        var adjustments = new AssessmentReasonableAdjustmentService(db);
        Assert.False(await evaluation.ResubmitAsync(request.StudentUserId, request.Id));

        var extended = now.AddHours(6);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.InvalidActor,
            await adjustments.GrantRevisionDeadlineAsync(Guid.NewGuid(), request.Id,
                new(extended, "Adjustment reason")));
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Invalid,
            await adjustments.GrantRevisionDeadlineAsync(actor.Id, request.Id,
                new(request.RevisionDueAtUtc!.Value, "Adjustment reason")));
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await adjustments.GrantRevisionDeadlineAsync(actor.Id, request.Id,
                new(extended, "  Approved access adjustment  ")));
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Conflict,
            await adjustments.GrantRevisionDeadlineAsync(actor.Id, request.Id,
                new(extended.AddHours(1), "Duplicate active adjustment")));

        var summary = await adjustments.GetRevisionDeadlineSummaryAsync(request.Id);
        Assert.NotNull(summary);
        Assert.Equal(request.RevisionDueAtUtc!.Value.ToUnixTimeMilliseconds(),
            summary!.BaseDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal(extended.ToUnixTimeMilliseconds(),
            summary.EffectiveDueAtUtc!.Value.ToUnixTimeMilliseconds());
        var first = Assert.Single(summary.History);
        Assert.Equal("Approved access adjustment", first.Reason);
        Assert.Equal(first.Id, summary.ActiveAdjustmentId);

        var queue = await new AssessmentCoordinationService(
            db, new EvaluatorSpecialismService(db, null!)).QueueAsync(null, 1, 10);
        var queueItem = Assert.Single(queue.Items);
        Assert.Equal(request.RevisionDueAtUtc.Value.ToUnixTimeMilliseconds(),
            queueItem.RevisionDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal(extended.ToUnixTimeMilliseconds(),
            queueItem.EffectiveRevisionDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal(first.Id, queueItem.ActiveDeadlineAdjustmentId);

        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await adjustments.RevokeRevisionDeadlineAsync(actor.Id, request.Id, first.Id,
                new("  No longer required  ")));
        summary = await adjustments.GetRevisionDeadlineSummaryAsync(request.Id);
        Assert.Null(summary!.ActiveAdjustmentId);
        Assert.Equal(request.RevisionDueAtUtc.Value.ToUnixTimeMilliseconds(),
            summary.EffectiveDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal("No longer required", Assert.Single(summary.History).RevocationReason);
        Assert.False(await evaluation.ResubmitAsync(request.StudentUserId, request.Id));
        var secondExtended = now.AddHours(8);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await adjustments.GrantRevisionDeadlineAsync(actor.Id, request.Id,
                new(secondExtended, "Second approved extension")));
        summary = await adjustments.GetRevisionDeadlineSummaryAsync(request.Id);
        Assert.Equal(2, summary!.History.Count);
        var secondId = summary.ActiveAdjustmentId!.Value;

        Assert.True(await evaluation.ResubmitAsync(request.StudentUserId, request.Id));
        Assert.Equal(EvaluationStatus.Assigned, request.Status);
        Assert.Equal(2, request.SubmissionAttemptNumber);
        queue = await new AssessmentCoordinationService(
            db, new EvaluatorSpecialismService(db, null!)).QueueAsync(null, 1, 10);
        queueItem = Assert.Single(queue.Items);
        Assert.Null(queueItem.RevisionDueAtUtc);
        Assert.Null(queueItem.EffectiveRevisionDueAtUtc);
        Assert.Null(queueItem.ActiveDeadlineAdjustmentId);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await adjustments.RevokeRevisionDeadlineAsync(actor.Id, request.Id, secondId, new(null)));

        var auditLogs = await db.AuditLogs.AsNoTracking()
            .Where(item => item.EntityType == nameof(EvaluationRevisionDeadlineAdjustment))
            .ToListAsync();
        Assert.Equal(3, auditLogs.Count);
        Assert.All(auditLogs, item => Assert.DoesNotContain("Approved access adjustment",
            item.MetadataJson ?? string.Empty, StringComparison.Ordinal));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Resit_has_no_revision_adjustment_window_even_when_its_state_is_corrupted()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("assess_resit_adjustment_guard");
        await using var db = database.CreateContext();
        var now = DateTimeOffset.UtcNow;
        var actor = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "reviewer@betcco.test",
            Email = "reviewer@betcco.test",
            DisplayName = "Course Reviewer"
        };
        var original = new EvaluationRequest
        {
            StudentUserId = "student-original",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RevisionDueAtUtc = now.AddHours(1)
        };
        var resit = new EvaluationRequest
        {
            StudentUserId = "student-resit",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RetakeOfEvaluationRequestId = null,
            RevisionDueAtUtc = now.AddHours(1)
        };
        var retakeOriginal = new EvaluationRequest
        {
            StudentUserId = "student-retake-original",
            Status = EvaluationStatus.Completed
        };
        var retake = new EvaluationRequest
        {
            StudentUserId = "student-retake",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RetakeOfEvaluationRequestId = retakeOriginal.Id,
            RevisionDueAtUtc = now.AddHours(1)
        };
        db.AddRange(actor, original, resit, retakeOriginal, retake);
        db.ResitAuthorizations.Add(new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            AuthorizedByUserId = actor.Id,
            AuthorizedAtUtc = now,
            ActivatedAtUtc = now,
            Reason = "Authorized Resit"
        });
        await db.SaveChangesAsync();

        var service = new AssessmentReasonableAdjustmentService(db);
        var extension = now.AddHours(4);

        // The original remains eligible even though it authorizes a linked Resit.
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await service.GrantRevisionDeadlineAsync(actor.Id, original.Id,
                new(extension, "Original evaluation adjustment")));

        // Resit identity comes only from the persisted ResitEvaluationRequestId link.
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.GrantRevisionDeadlineAsync(actor.Id, resit.Id,
                new(extension, "Must not be granted to Resit")));
        Assert.Empty(await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
            .Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());
        var resitSummary = await service.GetRevisionDeadlineSummaryAsync(resit.Id);
        Assert.NotNull(resitSummary);
        Assert.Null(resitSummary!.ActiveAdjustmentId);
        Assert.Equal(resit.RevisionDueAtUtc!.Value.ToUnixTimeMilliseconds(),
            resitSummary.EffectiveDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Empty(resitSummary.History);

        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.GrantRevisionDeadlineAsync(actor.Id, retake.Id,
                new(extension, "Historical Retake remains blocked")));

        // Preserve invalid historical evidence, but never activate or revoke it as a normal window.
        var historicalAdjustment = new EvaluationRevisionDeadlineAdjustment
        {
            EvaluationRequestId = resit.Id,
            BaseDueAtUtcSnapshot = resit.RevisionDueAtUtc.Value,
            ExtendedDueAtUtc = extension,
            GrantedByUserId = actor.Id,
            GrantedAtUtc = now,
            Reason = "Historical invalid adjustment"
        };
        db.EvaluationRevisionDeadlineAdjustments.Add(historicalAdjustment);
        await db.SaveChangesAsync();

        resitSummary = await service.GetRevisionDeadlineSummaryAsync(resit.Id);
        Assert.Null(resitSummary!.ActiveAdjustmentId);
        Assert.Equal(resit.RevisionDueAtUtc.Value.ToUnixTimeMilliseconds(),
            resitSummary.EffectiveDueAtUtc!.Value.ToUnixTimeMilliseconds());
        Assert.Equal(historicalAdjustment.Id, Assert.Single(resitSummary.History).Id);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.RevokeRevisionDeadlineAsync(actor.Id, resit.Id, historicalAdjustment.Id,
                new("Must remain historical")));
        var preservedAdjustment = await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
            .SingleAsync(item => item.Id == historicalAdjustment.Id);
        Assert.Null(preservedAdjustment.RevokedAtUtc);

        var resitAuditLogs = await db.AuditLogs.AsNoTracking()
            .Where(item => item.EntityType == nameof(EvaluationRevisionDeadlineAdjustment))
            .ToListAsync();
        Assert.DoesNotContain(resitAuditLogs,
            item => item.MetadataJson?.Contains(resit.Id.ToString(), StringComparison.Ordinal) == true);
    }

    [Fact]
    public async Task Grant_requires_an_active_one_revision_check_window()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var actor = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "reviewer@betcco.test",
            DisplayName = "Reviewer"
        };
        var request = new EvaluationRequest
        {
            StudentUserId = "student-1",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RevisionDueAtUtc = null
        };
        db.AddRange(actor, request);
        await db.SaveChangesAsync();

        var service = new AssessmentReasonableAdjustmentService(db);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.GrantRevisionDeadlineAsync(actor.Id, request.Id,
                new(DateTimeOffset.UtcNow.AddDays(2), "No revision deadline exists")));
        Assert.Empty(db.EvaluationRevisionDeadlineAdjustments);
    }

    [Fact]
    public async Task Resit_link_blocks_grant_summary_and_revoke_without_blocking_its_original()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var now = DateTimeOffset.UtcNow;
        var actor = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "reviewer@betcco.test",
            DisplayName = "Reviewer"
        };
        var original = new EvaluationRequest
        {
            StudentUserId = "student-original",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RevisionDueAtUtc = now.AddHours(1)
        };
        var resit = new EvaluationRequest
        {
            StudentUserId = "student-resit",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RevisionDueAtUtc = now.AddHours(1)
        };
        var retakeOriginal = new EvaluationRequest
        {
            StudentUserId = "student-retake-original",
            Status = EvaluationStatus.Completed
        };
        var retake = new EvaluationRequest
        {
            StudentUserId = "student-retake",
            Status = EvaluationStatus.NeedsRevision,
            SubmissionAttemptNumber = 1,
            RetakeOfEvaluationRequestId = retakeOriginal.Id,
            RevisionDueAtUtc = now.AddHours(1)
        };
        db.AddRange(actor, original, resit, retakeOriginal, retake);
        db.ResitAuthorizations.Add(new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            AuthorizedByUserId = actor.Id,
            AuthorizedAtUtc = now,
            ActivatedAtUtc = now,
            Reason = "Authorized Resit"
        });
        await db.SaveChangesAsync();

        var service = new AssessmentReasonableAdjustmentService(db);
        var extended = now.AddHours(3);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await service.GrantRevisionDeadlineAsync(actor.Id, original.Id,
                new(extended, "Original remains eligible")));
        var originalSummary = await service.GetRevisionDeadlineSummaryAsync(original.Id);
        Assert.Equal(extended, originalSummary!.EffectiveDueAtUtc);
        Assert.NotNull(originalSummary.ActiveAdjustmentId);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.Success,
            await service.RevokeRevisionDeadlineAsync(actor.Id, original.Id,
                originalSummary.ActiveAdjustmentId.Value, new("No longer required")));
        originalSummary = await service.GetRevisionDeadlineSummaryAsync(original.Id);
        Assert.Null(originalSummary!.ActiveAdjustmentId);
        Assert.Equal(original.RevisionDueAtUtc, originalSummary.EffectiveDueAtUtc);
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.GrantRevisionDeadlineAsync(actor.Id, resit.Id,
                new(extended, "Resit must be blocked")));
        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.GrantRevisionDeadlineAsync(actor.Id, retake.Id,
                new(extended, "Historical Retake remains blocked")));
        Assert.Empty(await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
            .Where(item => item.EvaluationRequestId == resit.Id).ToListAsync());

        var invalidHistory = new EvaluationRevisionDeadlineAdjustment
        {
            EvaluationRequestId = resit.Id,
            BaseDueAtUtcSnapshot = resit.RevisionDueAtUtc!.Value,
            ExtendedDueAtUtc = extended,
            GrantedByUserId = actor.Id,
            GrantedAtUtc = now,
            Reason = "Invalid historical data"
        };
        db.EvaluationRevisionDeadlineAdjustments.Add(invalidHistory);
        await db.SaveChangesAsync();
        var summary = await service.GetRevisionDeadlineSummaryAsync(resit.Id);
        Assert.Null(summary!.ActiveAdjustmentId);
        Assert.Equal(resit.RevisionDueAtUtc.Value, summary.EffectiveDueAtUtc);
        Assert.Equal(invalidHistory.Id, Assert.Single(summary.History).Id);

        Assert.Equal(EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow,
            await service.RevokeRevisionDeadlineAsync(actor.Id, resit.Id, invalidHistory.Id,
                new("Still not an active revision window")));
        Assert.Null(await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
            .Where(item => item.Id == invalidHistory.Id)
            .Select(item => item.RevokedAtUtc).SingleAsync());
    }

    private sealed class NullFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType,
            CancellationToken cancellationToken = default) => Task.FromResult("unused");

        public Task<Stream?> OpenPrivateReadAsync(string storageKey,
            CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }

    private sealed class CleanFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
