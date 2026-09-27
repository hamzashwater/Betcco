using System.Data;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class ResitService(BetccoDbContext db) : IResitService
{
    public async Task<ResitEligibilityPage> ListEligibleAsync(
        Guid actorUserId,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return new([], page, pageSize, false);
        ValidatePage(page, pageSize);

        var candidates = db.EvaluationRequests.AsNoTracking()
            .Where(request =>
                request.Status == EvaluationStatus.Completed
                && request.CalculatedGrade == EvaluationGrade.NotYetAchieved
                && request.SubmissionAttemptNumber == 2
                && request.RevisionDueAtUtc != null
                && request.RetakeOfEvaluationRequestId == null
                && request.AssessmentScopeId != null
                && db.AssessmentScopes.Any(scope => scope.Id == request.AssessmentScopeId.Value)
                && request.AssessmentScopeSnapshotJson != null
                && !db.EvaluationRequests.Any(item =>
                    item.RetakeOfEvaluationRequestId == request.Id)
                && !db.RetakeAuthorizations.Any(item =>
                    item.OriginalEvaluationRequestId == request.Id)
                && !db.ResitAuthorizations.Any(item =>
                    item.OriginalEvaluationRequestId == request.Id
                    || item.ResitEvaluationRequestId == request.Id)
                && !db.EvaluationAppeals.Any(appeal =>
                    appeal.EvaluationRequestId == request.Id
                    && (appeal.Status == EvaluationAppealStatus.Submitted
                        || appeal.Status == EvaluationAppealStatus.UnderReview))
                && !db.EvaluatorAssignments.Any(assignment =>
                    assignment.EvaluationRequestId == request.Id
                    && assignment.EvaluatorUserId == actorUserId.ToString()))
            .OrderByDescending(request => request.UpdatedAtUtc)
            .ThenByDescending(request => request.Id)
            .Select(request => new
            {
                request.Id,
                request.AssessmentScopeSnapshotJson,
                request.CalculatedGrade,
                request.SubmissionAttemptNumber
            });

        // Snapshot validation is not SQL-translatable. Scan fixed-size database batches
        // so logical page boundaries count only candidates with valid snapshots.
        const int batchSize = 50;
        var validToSkip = (long)(page - 1) * pageSize;
        var validSeen = 0L;
        var databaseOffset = 0;
        var output = new List<ResitEligibilityView>(pageSize + 1);
        while (true)
        {
            var batch = await candidates.Skip(databaseOffset).Take(batchSize)
                .ToArrayAsync(cancellationToken);
            foreach (var item in batch)
            {
                var academic = AssessmentScopeSnapshotReader.Summary(item.AssessmentScopeSnapshotJson);
                if (academic is null) continue;
                if (validSeen++ < validToSkip) continue;
                output.Add(new ResitEligibilityView(
                    item.Id,
                    academic,
                    item.CalculatedGrade!.Value.ToString(),
                    item.SubmissionAttemptNumber));
                if (output.Count > pageSize)
                    return new(output.Take(pageSize).ToArray(), page, pageSize, true);
            }

            if (batch.Length < batchSize) break;
            databaseOffset += batch.Length;
        }

        return new(output, page, pageSize, false);
    }

    public async Task<ResitAuthorizationPage> ListAuthorizationsAsync(
        Guid actorUserId,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return new([], page, pageSize, false);
        ValidatePage(page, pageSize);

        var authorizations = db.ResitAuthorizations.AsNoTracking();
        var offset = (long)(page - 1) * pageSize;
        if (offset >= await authorizations.LongCountAsync(cancellationToken))
            return new([], page, pageSize, false);

        var items = await authorizations
            .OrderByDescending(item => item.AuthorizedAtUtc)
            .ThenByDescending(item => item.Id)
            .Skip(checked((int)offset))
            .Take(pageSize + 1)
            .Select(item => new ResitAuthorizationStaffView(
                item.Id,
                item.OriginalEvaluationRequestId,
                item.ResitEvaluationRequestId,
                item.AuthorizedAtUtc,
                item.Reason,
                item.ActivatedAtUtc,
                item.RevokedAtUtc,
                item.RevokedByUserId,
                item.RevocationReason))
            .ToArrayAsync(cancellationToken);
        return new(items.Take(pageSize).ToArray(), page, pageSize, items.Length > pageSize);
    }

    public async Task<ResitAuthorizationWriteResult> AuthorizeAsync(
        Guid actorUserId,
        Guid originalEvaluationRequestId,
        AuthorizeResitCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!TryReason(command.Reason, out var reason))
            return new(ResitAuthorizationWriteStatus.Invalid);
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return new(ResitAuthorizationWriteStatus.InvalidActor);

        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        try
        {
            var original = db.Database.IsRelational()
                ? (await db.EvaluationRequests.FromSqlInterpolated($"""
                    SELECT * FROM "EvaluationRequests"
                    WHERE "Id" = {originalEvaluationRequestId}
                    FOR UPDATE
                    """).ToListAsync(cancellationToken)).SingleOrDefault()
                : await db.EvaluationRequests.SingleOrDefaultAsync(
                    request => request.Id == originalEvaluationRequestId,
                    cancellationToken);

            if (original is null) return new(ResitAuthorizationWriteStatus.NotFound);
            if (!await IsEligibleAsync(original, actorUserId, cancellationToken))
                return new(ResitAuthorizationWriteStatus.NotEligible);

            var authorization = new ResitAuthorization
            {
                OriginalEvaluationRequestId = original.Id,
                AuthorizedByUserId = actorUserId,
                AuthorizedAtUtc = DateTimeOffset.UtcNow,
                Reason = reason
            };
            db.ResitAuthorizations.Add(authorization);
            db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
            {
                EvaluationRequestId = original.Id,
                ActorUserId = actorUserId.ToString(),
                EventType = "ResitAuthorized",
                FromStatus = original.Status.ToString(),
                ToStatus = original.Status.ToString(),
                AttemptNumber = original.SubmissionAttemptNumber
            });
            db.AuditLogs.Add(Audit(actorUserId, "EvaluationResitAuthorized", authorization.Id));

            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return new(ResitAuthorizationWriteStatus.Created, View(authorization));
        }
        catch (Exception error) when (IsWriteConflict(error))
        {
            if (transaction is not null) await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return new(ResitAuthorizationWriteStatus.Conflict);
        }
    }

    public async Task<ResitAuthorizationWriteResult> RevokeAsync(
        Guid actorUserId,
        Guid authorizationId,
        RevokeResitAuthorizationCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!TryReason(command.Reason, out var reason))
            return new(ResitAuthorizationWriteStatus.Invalid);
        if (!await ValidActorAsync(actorUserId, cancellationToken))
            return new(ResitAuthorizationWriteStatus.InvalidActor);

        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        try
        {
            var authorization = db.Database.IsRelational()
                ? (await db.ResitAuthorizations.FromSqlInterpolated($"""
                    SELECT * FROM "ResitAuthorizations"
                    WHERE "Id" = {authorizationId}
                    FOR UPDATE
                    """).ToListAsync(cancellationToken)).SingleOrDefault()
                : await db.ResitAuthorizations.SingleOrDefaultAsync(
                    item => item.Id == authorizationId,
                    cancellationToken);

            if (authorization is null) return new(ResitAuthorizationWriteStatus.NotFound);
            if (authorization.ActivatedAtUtc is not null || authorization.ResitEvaluationRequestId is not null)
                return new(ResitAuthorizationWriteStatus.AlreadyActivated);
            if (authorization.RevokedAtUtc is not null)
                return new(ResitAuthorizationWriteStatus.Conflict);

            authorization.RevokedAtUtc = DateTimeOffset.UtcNow;
            authorization.RevokedByUserId = actorUserId;
            authorization.RevocationReason = reason;

            var original = await db.EvaluationRequests.AsNoTracking()
                .SingleAsync(request => request.Id == authorization.OriginalEvaluationRequestId, cancellationToken);
            db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
            {
                EvaluationRequestId = original.Id,
                ActorUserId = actorUserId.ToString(),
                EventType = "ResitAuthorizationRevoked",
                FromStatus = original.Status.ToString(),
                ToStatus = original.Status.ToString(),
                AttemptNumber = original.SubmissionAttemptNumber
            });
            db.AuditLogs.Add(Audit(actorUserId, "EvaluationResitAuthorizationRevoked", authorization.Id));

            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return new(ResitAuthorizationWriteStatus.Revoked, View(authorization));
        }
        catch (Exception error) when (IsWriteConflict(error))
        {
            if (transaction is not null) await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return new(ResitAuthorizationWriteStatus.Conflict);
        }
    }

    private async Task<bool> IsEligibleAsync(
        EvaluationRequest original,
        Guid actorUserId,
        CancellationToken cancellationToken)
    {
        if (original.Status != EvaluationStatus.Completed
            || original.CalculatedGrade != EvaluationGrade.NotYetAchieved
            || original.SubmissionAttemptNumber != 2
            || original.RevisionDueAtUtc is null
            || original.RetakeOfEvaluationRequestId is not null
            || original.AssessmentScopeId is null
            || AssessmentScopeSnapshotReader.Read(original.AssessmentScopeSnapshotJson) is null)
            return false;

        if (!await db.AssessmentScopes.AsNoTracking()
                .AnyAsync(scope => scope.Id == original.AssessmentScopeId.Value, cancellationToken))
            return false;

        if (await db.EvaluationRequests.AsNoTracking()
                .AnyAsync(request => request.RetakeOfEvaluationRequestId == original.Id, cancellationToken)
            || await db.RetakeAuthorizations.AsNoTracking()
                .AnyAsync(item => item.OriginalEvaluationRequestId == original.Id, cancellationToken)
            || await db.ResitAuthorizations.AsNoTracking().AnyAsync(item =>
                item.OriginalEvaluationRequestId == original.Id
                || item.ResitEvaluationRequestId == original.Id,
                cancellationToken))
            return false;

        if (await db.EvaluationAppeals.AsNoTracking().AnyAsync(appeal =>
                appeal.EvaluationRequestId == original.Id
                && (appeal.Status == EvaluationAppealStatus.Submitted
                    || appeal.Status == EvaluationAppealStatus.UnderReview),
                cancellationToken))
            return false;

        // A CourseReviewer who also assessed the original must not authorize
        // the exceptional additional review.
        if (await db.EvaluatorAssignments.AsNoTracking().AnyAsync(assignment =>
                assignment.EvaluationRequestId == original.Id
                && assignment.EvaluatorUserId == actorUserId.ToString(),
                cancellationToken))
            return false;

        return true;
    }

    private Task<bool> ValidActorAsync(Guid actorUserId, CancellationToken cancellationToken) =>
        actorUserId == Guid.Empty
            ? Task.FromResult(false)
            : db.Users.AsNoTracking().AnyAsync(
                user => user.Id == actorUserId && !user.IsFrozen,
                cancellationToken);

    private static void ValidatePage(int page, int pageSize)
    {
        if (page < 1) throw new ArgumentOutOfRangeException(nameof(page));
        if (pageSize is < 1 or > 50) throw new ArgumentOutOfRangeException(nameof(pageSize));
    }

    private static bool TryReason(string? value, out string reason)
    {
        reason = value?.Trim() ?? string.Empty;
        return reason.Length is >= 10 and <= 2_000;
    }

    private static ResitAuthorizationStaffView View(ResitAuthorization item) => new(
        item.Id,
        item.OriginalEvaluationRequestId,
        item.ResitEvaluationRequestId,
        item.AuthorizedAtUtc,
        item.Reason,
        item.ActivatedAtUtc,
        item.RevokedAtUtc,
        item.RevokedByUserId,
        item.RevocationReason);

    private static AuditLog Audit(Guid actorUserId, string action, Guid authorizationId) => new()
    {
        ActorUserId = actorUserId.ToString(),
        Action = action,
        EntityType = nameof(ResitAuthorization),
        EntityId = authorizationId.ToString(),
        Outcome = "Success"
    };

    private static bool IsWriteConflict(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
        {
            if (current is not PostgresException postgres) continue;
            if (postgres.SqlState is PostgresErrorCodes.SerializationFailure
                or PostgresErrorCodes.DeadlockDetected
                or PostgresErrorCodes.UniqueViolation)
                return true;
        }

        return error is DbUpdateConcurrencyException;
    }
}