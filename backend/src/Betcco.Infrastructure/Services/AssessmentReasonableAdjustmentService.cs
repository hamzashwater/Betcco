using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class AssessmentReasonableAdjustmentService(BetccoDbContext db)
    : IAssessmentReasonableAdjustmentService
{
    public async Task<EvaluationReasonableAdjustmentWriteResult> GrantRevisionDeadlineAsync(
        Guid actorUserId,
        Guid evaluationRequestId,
        GrantEvaluationRevisionDeadlineAdjustment command,
        CancellationToken cancellationToken = default)
    {
        var reason = command.Reason?.Trim();
        var extendedDueAtUtc = command.ExtendedDueAtUtc.ToUniversalTime();
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 500)
            return EvaluationReasonableAdjustmentWriteResult.Invalid;
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return EvaluationReasonableAdjustmentWriteResult.InvalidActor;

        var request = await db.EvaluationRequests.AsNoTracking()
            .Where(item => item.Id == evaluationRequestId)
            .Select(item => new
            {
                item.Id,
                item.Status,
                item.SubmissionAttemptNumber,
                item.RetakeOfEvaluationRequestId,
                item.RevisionDueAtUtc
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (request is null)
            return EvaluationReasonableAdjustmentWriteResult.RequestNotFound;
        if (request.Status != EvaluationStatus.NeedsRevision
            || request.SubmissionAttemptNumber != 1
            || request.RetakeOfEvaluationRequestId is not null
            || request.RevisionDueAtUtc is null)
            return EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow;

        var baseDueAtUtc = request.RevisionDueAtUtc.Value.ToUniversalTime();
        if (extendedDueAtUtc <= baseDueAtUtc || extendedDueAtUtc <= DateTimeOffset.UtcNow)
            return EvaluationReasonableAdjustmentWriteResult.Invalid;
        if (await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
                .AnyAsync(item => item.EvaluationRequestId == evaluationRequestId
                    && item.RevokedAtUtc == null, cancellationToken))
            return EvaluationReasonableAdjustmentWriteResult.Conflict;

        var adjustment = new EvaluationRevisionDeadlineAdjustment
        {
            EvaluationRequestId = evaluationRequestId,
            BaseDueAtUtcSnapshot = baseDueAtUtc,
            ExtendedDueAtUtc = extendedDueAtUtc,
            GrantedByUserId = actorUserId,
            GrantedAtUtc = DateTimeOffset.UtcNow,
            Reason = reason
        };
        db.EvaluationRevisionDeadlineAdjustments.Add(adjustment);
        db.AuditLogs.Add(Audit(actorUserId, "EvaluationRevisionDeadlineAdjustmentGranted",
            evaluationRequestId, adjustment));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return EvaluationReasonableAdjustmentWriteResult.Success;
        }
        catch (DbUpdateException error) when (IsUniqueConflict(error))
        {
            db.ChangeTracker.Clear();
            return EvaluationReasonableAdjustmentWriteResult.Conflict;
        }
    }

    public async Task<EvaluationReasonableAdjustmentWriteResult> RevokeRevisionDeadlineAsync(
        Guid actorUserId,
        Guid evaluationRequestId,
        Guid adjustmentId,
        RevokeEvaluationRevisionDeadlineAdjustment command,
        CancellationToken cancellationToken = default)
    {
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return EvaluationReasonableAdjustmentWriteResult.InvalidActor;
        var reason = command.Reason?.Trim();
        if (reason?.Length > 500)
            return EvaluationReasonableAdjustmentWriteResult.Invalid;

        var adjustment = await db.EvaluationRevisionDeadlineAdjustments
            .Include(item => item.EvaluationRequest)
            .SingleOrDefaultAsync(item => item.Id == adjustmentId
                && item.EvaluationRequestId == evaluationRequestId,
                cancellationToken);
        if (adjustment is null)
            return EvaluationReasonableAdjustmentWriteResult.RequestNotFound;
        var request = adjustment.EvaluationRequest!;
        if (request.Status != EvaluationStatus.NeedsRevision
            || request.SubmissionAttemptNumber != 1
            || request.RetakeOfEvaluationRequestId is not null
            || request.RevisionDueAtUtc is null)
            return EvaluationReasonableAdjustmentWriteResult.NoActiveRevisionWindow;
        if (adjustment.RevokedAtUtc is not null)
            return EvaluationReasonableAdjustmentWriteResult.Conflict;

        adjustment.RevokedAtUtc = DateTimeOffset.UtcNow;
        adjustment.RevokedByUserId = actorUserId;
        adjustment.RevocationReason = string.IsNullOrWhiteSpace(reason) ? null : reason;
        db.AuditLogs.Add(Audit(actorUserId, "EvaluationRevisionDeadlineAdjustmentRevoked",
            evaluationRequestId, adjustment));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return EvaluationReasonableAdjustmentWriteResult.Success;
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            return EvaluationReasonableAdjustmentWriteResult.Conflict;
        }
    }

    public async Task<EvaluationRevisionDeadlineAdjustmentSummary?> GetRevisionDeadlineSummaryAsync(
        Guid evaluationRequestId,
        CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.AsNoTracking()
            .Where(item => item.Id == evaluationRequestId)
            .Select(item => new
            {
                item.Id,
                item.Status,
                item.SubmissionAttemptNumber,
                item.RetakeOfEvaluationRequestId,
                item.RevisionDueAtUtc
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (request is null) return null;

        var history = await db.EvaluationRevisionDeadlineAdjustments.AsNoTracking()
            .Where(item => item.EvaluationRequestId == evaluationRequestId)
            .OrderByDescending(item => item.GrantedAtUtc)
            .ToListAsync(cancellationToken);
        var revisionWindowActive = request.Status == EvaluationStatus.NeedsRevision
            && request.SubmissionAttemptNumber == 1
            && request.RetakeOfEvaluationRequestId is null
            && request.RevisionDueAtUtc is not null;
        var active = revisionWindowActive
            ? history.FirstOrDefault(item => item.RevokedAtUtc == null)
            : null;
        return new EvaluationRevisionDeadlineAdjustmentSummary(
            evaluationRequestId,
            request.RevisionDueAtUtc,
            request.RevisionDueAtUtc is null
                ? null
                : active?.ExtendedDueAtUtc ?? request.RevisionDueAtUtc,
            active?.Id,
            history.Select(View).ToArray());
    }

    private Task<bool> ValidActorAsync(Guid actorUserId, CancellationToken cancellationToken) =>
        actorUserId == Guid.Empty
            ? Task.FromResult(false)
            : db.Users.AsNoTracking().AnyAsync(user => user.Id == actorUserId && !user.IsFrozen,
                cancellationToken);

    private static EvaluationRevisionDeadlineAdjustmentView View(
        EvaluationRevisionDeadlineAdjustment item) => new(
        item.Id,
        item.EvaluationRequestId,
        item.BaseDueAtUtcSnapshot,
        item.ExtendedDueAtUtc,
        item.GrantedByUserId,
        item.GrantedAtUtc,
        item.Reason,
        item.RevokedAtUtc,
        item.RevokedByUserId,
        item.RevocationReason);

    private static AuditLog Audit(
        Guid actorUserId,
        string action,
        Guid evaluationRequestId,
        EvaluationRevisionDeadlineAdjustment item) => new()
        {
            ActorUserId = actorUserId.ToString(),
            Action = action,
            EntityType = nameof(EvaluationRevisionDeadlineAdjustment),
            EntityId = item.Id.ToString(),
            Outcome = "Success",
            MetadataJson = JsonSerializer.Serialize(new
            {
                EvaluationRequestId = evaluationRequestId,
                item.BaseDueAtUtcSnapshot,
                item.ExtendedDueAtUtc
            })
        };

    private static bool IsUniqueConflict(DbUpdateException error) =>
        error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
