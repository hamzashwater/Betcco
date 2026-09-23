using System.Data;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class AssessmentCoordinationService(
    BetccoDbContext db,
    IEvaluatorSpecialismService specialisms) : IAssessmentCoordinationService
{
    public async Task<AssessmentCoordinationPage> QueueAsync(
        EvaluationStatus? status, int page, int pageSize,
        CancellationToken cancellationToken = default, string? expectedCompletionState = null)
    {
        var now = DateTimeOffset.UtcNow;
        var query = db.EvaluationRequests.AsNoTracking()
            .Where(request => AssessmentCoordinationStatuses.Active.Contains(request.Status))
            .Select(request => new
            {
                Request = request,
                ExpectedCompletionAtUtc = db.EvaluationExpectedCompletionRevisions
                    .Where(revision => revision.EvaluationRequestId == request.Id)
                    .OrderByDescending(revision => revision.RevisionNumber)
                    .Select(revision => (DateTimeOffset?)revision.ExpectedCompletionAtUtc)
                    .FirstOrDefault()
            });
        if (status is not null)
            query = query.Where(row => row.Request.Status == status);
        query = expectedCompletionState switch
        {
            ExpectedCompletionStates.NotSet => query.Where(row => row.ExpectedCompletionAtUtc == null),
            ExpectedCompletionStates.OnTrack => query.Where(row => row.ExpectedCompletionAtUtc >= now),
            ExpectedCompletionStates.Overdue => query.Where(row => row.ExpectedCompletionAtUtc < now),
            _ => query
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(row => row.Request.UpdatedAtUtc)
            .ThenByDescending(row => row.Request.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(row => new
            {
                row.Request.Id,
                row.Request.Status,
                row.Request.CreatedAtUtc,
                row.Request.UpdatedAtUtc,
                row.Request.AssessmentScopeId,
                row.Request.QualificationVersionId,
                row.Request.GradeId,
                row.Request.SpecializationId,
                row.Request.RubricTemplateId,
                row.Request.RetakeOfEvaluationRequestId,
                row.ExpectedCompletionAtUtc
            })
            .ToListAsync(cancellationToken);

        var requestIds = rows.Select(row => row.Id).ToArray();
        var scopeIds = rows.Where(row => row.AssessmentScopeId is not null)
            .Select(row => row.AssessmentScopeId!.Value).Distinct().ToArray();
        var academicContexts = await db.AssessmentScopes.AsNoTracking()
            .Where(scope => scopeIds.Contains(scope.Id))
            .Select(scope => new
            {
                scope.Id,
                scope.GradeId,
                scope.SpecializationId,
                scope.RubricTemplateId,
                scope.AssessmentDefinition!.UnitDefinition!.QualificationVersionId,
                QualificationCode = scope.AssessmentDefinition.UnitDefinition.QualificationVersion!.Qualification!.Code,
                QualificationVersionCode = scope.AssessmentDefinition.UnitDefinition.QualificationVersion.VersionCode,
                UnitCode = scope.AssessmentDefinition.UnitDefinition.Code,
                UnitArabicTitle = scope.AssessmentDefinition.UnitDefinition.ArabicTitle,
                UnitEnglishTitle = scope.AssessmentDefinition.UnitDefinition.EnglishTitle
            })
            .ToDictionaryAsync(scope => scope.Id, cancellationToken);
        var assignments = await db.EvaluatorAssignments.AsNoTracking()
            .Where(assignment => requestIds.Contains(assignment.EvaluationRequestId))
            .Select(assignment => new
            {
                assignment.EvaluationRequestId,
                assignment.EvaluatorUserId,
                assignment.AssignedAtUtc
            })
            .ToListAsync(cancellationToken);
        var assignmentByRequest = assignments.ToDictionary(item => item.EvaluationRequestId);
        var evaluatorIds = assignments
            .Select(item => Guid.TryParse(item.EvaluatorUserId, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();
        var evaluatorNames = await db.Users.AsNoTracking()
            .Where(user => evaluatorIds.Contains(user.Id))
            .Select(user => new { user.Id, user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);

        var items = new List<AssessmentCoordinationItem>(rows.Count);
        foreach (var row in rows)
        {
            string? blocker = null;
            bool? hasEligibleEvaluator = null;
            if (row.Status == EvaluationStatus.PendingAssignment)
            {
                // Reuse the same canonical mapping and active-grant checks as
                // the existing candidate endpoint. Assignment rechecks them.
                var (result, candidates) = await specialisms.EligibleAsync(row.Id, cancellationToken);
                blocker = result switch
                {
                    AssignmentResult.AcademicMappingRequired => "AcademicMappingRequired",
                    AssignmentResult.Success when candidates.Count == 0 => "NoEligibleEvaluator",
                    AssignmentResult.RequestNotAssignable => "StateChanged",
                    _ => null
                };
                if (result == AssignmentResult.Success)
                    hasEligibleEvaluator = candidates.Count > 0;
            }

            assignmentByRequest.TryGetValue(row.Id, out var assignment);
            var evaluatorName = assignment is not null
                && Guid.TryParse(assignment.EvaluatorUserId, out var evaluatorId)
                && evaluatorNames.TryGetValue(evaluatorId, out var displayName)
                    ? displayName : null;
            var academic = row.AssessmentScopeId is Guid scopeId
                && academicContexts.TryGetValue(scopeId, out var context)
                && context.QualificationVersionId == row.QualificationVersionId
                && context.GradeId == row.GradeId
                && context.SpecializationId == row.SpecializationId
                && context.RubricTemplateId == row.RubricTemplateId
                && blocker != "AcademicMappingRequired"
                    ? context : null;
            items.Add(new AssessmentCoordinationItem(
                row.Id, row.Status.ToString(), row.CreatedAtUtc, row.UpdatedAtUtc,
                row.RetakeOfEvaluationRequestId is not null,
                academic?.QualificationCode, academic?.QualificationVersionCode,
                academic?.UnitCode, academic?.UnitArabicTitle, academic?.UnitEnglishTitle,
                evaluatorName, assignment?.AssignedAtUtc, hasEligibleEvaluator, blocker,
                row.ExpectedCompletionAtUtc, ExpectedCompletionStates.Resolve(row.ExpectedCompletionAtUtc, now)));
        }

        return new AssessmentCoordinationPage(items, page, pageSize, totalCount);
    }

    public async Task<ExpectedCompletionWriteResult> SetExpectedCompletionAsync(Guid evaluationRequestId,
        DateTimeOffset expectedCompletionAtUtc, string? reason, Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        if (expectedCompletionAtUtc.Offset != TimeSpan.Zero || expectedCompletionAtUtc <= now)
            return ExpectedCompletionWriteResult.InvalidTarget;
        var trimmedReason = reason?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedReason) || trimmedReason.Length > 500)
            return ExpectedCompletionWriteResult.InvalidReason;
        if (actorUserId == Guid.Empty || !await db.Users.AsNoTracking()
                .AnyAsync(user => user.Id == actorUserId && !user.IsFrozen, cancellationToken))
            return ExpectedCompletionWriteResult.InvalidActor;

        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        try
        {
            var request = db.Database.IsRelational()
                ? (await db.EvaluationRequests.FromSqlInterpolated($"""
                    SELECT * FROM "EvaluationRequests" WHERE "Id" = {evaluationRequestId} FOR UPDATE
                    """).AsNoTracking().ToListAsync(cancellationToken)).SingleOrDefault()
                : await db.EvaluationRequests.AsNoTracking()
                    .SingleOrDefaultAsync(item => item.Id == evaluationRequestId, cancellationToken);
            if (request is null) return ExpectedCompletionWriteResult.RequestNotFound;
            if (!AssessmentCoordinationStatuses.Active.Contains(request.Status))
                return ExpectedCompletionWriteResult.RequestNotActive;
            // Recheck inside the transaction: a target that expires while the
            // request waits for a row lock must never become the current target.
            if (expectedCompletionAtUtc <= DateTimeOffset.UtcNow)
                return ExpectedCompletionWriteResult.InvalidTarget;
            var lastRevision = await db.EvaluationExpectedCompletionRevisions.AsNoTracking()
                .Where(item => item.EvaluationRequestId == evaluationRequestId)
                .OrderByDescending(item => item.RevisionNumber)
                .Select(item => (int?)item.RevisionNumber)
                .FirstOrDefaultAsync(cancellationToken);
            db.EvaluationExpectedCompletionRevisions.Add(new EvaluationExpectedCompletionRevision
            {
                EvaluationRequestId = evaluationRequestId,
                RevisionNumber = (lastRevision ?? 0) + 1,
                ExpectedCompletionAtUtc = expectedCompletionAtUtc,
                Reason = trimmedReason,
                RecordedByUserId = actorUserId,
                RecordedAtUtc = DateTimeOffset.UtcNow
            });
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = actorUserId.ToString(),
                Action = "EvaluationExpectedCompletionSet",
                EntityType = nameof(EvaluationRequest),
                EntityId = evaluationRequestId.ToString(),
                Outcome = "Success"
            });
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return ExpectedCompletionWriteResult.Success;
        }
        catch (Exception error) when (IsWriteConflict(error))
        {
            db.ChangeTracker.Clear();
            return ExpectedCompletionWriteResult.Conflict;
        }
    }

    private static bool IsWriteConflict(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
        {
            if (current is not PostgresException postgres) continue;
            if (postgres.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected)
                return true;
            if (postgres.SqlState == PostgresErrorCodes.UniqueViolation
                && postgres.TableName == "EvaluationExpectedCompletionRevisions")
                return true;
        }
        return false;
    }
}
