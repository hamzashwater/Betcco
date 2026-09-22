using System.Data;
using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class RetakeService(
    BetccoDbContext db,
    IScopedAssessmentService scopedAssessments,
    IAssessorEligibilityService assessorEligibility) : IRetakeService
{
    public async Task<IReadOnlyList<RetakeEligibilityView>> ListEligibleAsync(
        string leadVerifierUserId,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken)) return [];

        var originals = await BaseOriginalsQuery()
            .Where(x => x.Status == EvaluationStatus.Completed
                && x.RetakeOfEvaluationRequestId == null
                && x.AssessmentScopeId != null)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .ToListAsync(cancellationToken);
        var resolvedScopes = new List<ResolvedAssessmentScope>();
        foreach (var option in await scopedAssessments.ListRetakeOptionsAsync(cancellationToken))
        {
            var resolved = await scopedAssessments.ResolveAsync(option.AssessmentScopeId, cancellationToken);
            if (resolved is not null) resolvedScopes.Add(resolved);
        }

        var output = new List<RetakeEligibilityView>();
        foreach (var original in originals)
        {
            var eligibility = ReadEligibility(original);
            if (eligibility is null) continue;
            var options = resolvedScopes
                .Where(scope => IsCompatible(original, eligibility.UnmetPassCriteria, scope))
                .Select(scope => new RetakeScopeOption(scope.AssessmentScopeId,
                    scope.Option.AssessmentCode, scope.Option.AssessmentArabicTitle,
                    scope.Option.AssessmentEnglishTitle, scope.CriterionCodes.ToArray()))
                .ToArray();
            if (options.Length == 0) continue;
            output.Add(new RetakeEligibilityView(original.Id, original.StudentUserId,
                eligibility.Snapshot.Summary(), eligibility.UnmetPassCriteria, options));
        }
        return output;
    }

    public async Task<RetakeAuthorizationResult> AuthorizeAsync(
        string leadVerifierUserId,
        Guid originalEvaluationRequestId,
        AuthorizeRetakeCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken))
            return new(RetakeAuthorizationStatus.Forbidden);
        var reason = command.Reason?.Trim();
        if (originalEvaluationRequestId == Guid.Empty || command.RetakeAssessmentScopeId == Guid.Empty
            || string.IsNullOrWhiteSpace(reason) || reason.Length > 2_000)
            return new(RetakeAuthorizationStatus.InvalidScope);

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var original = await BaseOriginalsQuery().SingleOrDefaultAsync(x => x.Id == originalEvaluationRequestId, cancellationToken);
        var eligibility = original is null ? null : ReadEligibility(original);
        if (original is null || eligibility is null)
            return new(RetakeAuthorizationStatus.NotEligible);

        var target = await scopedAssessments.ResolveAsync(command.RetakeAssessmentScopeId, cancellationToken);
        if (target is null || !IsCompatible(original, eligibility.UnmetPassCriteria, target))
            return new(RetakeAuthorizationStatus.InvalidScope);

        var retake = new EvaluationRequest
        {
            StudentUserId = original.StudentUserId,
            GradeId = target.GradeId,
            SpecializationId = target.SpecializationId,
            TaskTypeId = target.TaskTypeId,
            RubricTemplateId = target.RubricTemplateId,
            Price = AssessmentPricing.StandardEvaluationPrice,
            Currency = original.Currency,
            QualificationVersionId = target.QualificationVersionId,
            QualificationVersionSnapshotJson = target.QualificationVersionSnapshotJson,
            AssessmentScopeId = target.AssessmentScopeId,
            AssessmentScopeSnapshotJson = JsonSerializer.Serialize(target.Snapshot),
            CriteriaSnapshotJson = JsonSerializer.Serialize(target.CriterionCodes),
            AssessmentRuleSetVersion = target.AssessmentRuleSetVersion,
            AssessmentRuleSetSnapshotJson = target.AssessmentRuleSetSnapshotJson,
            RetakeOfEvaluationRequestId = original.Id
        };
        var authorization = new RetakeAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            RetakeAssessmentScopeId = target.AssessmentScopeId,
            RetakeEvaluationRequestId = retake.Id,
            AuthorizedByUserId = leadVerifierUserId,
            AuthorizedAtUtc = DateTimeOffset.UtcNow,
            Reason = reason
        };
        db.EvaluationRequests.Add(retake);
        db.RetakeAuthorizations.Add(authorization);
        db.AssessmentAuditEvents.AddRange(
            new AssessmentAuditEvent
            {
                EvaluationRequestId = original.Id,
                ActorUserId = leadVerifierUserId,
                EventType = "RetakeAuthorized",
                Reason = $"RetakeEvaluationRequest:{retake.Id}",
                AttemptNumber = original.SubmissionAttemptNumber
            },
            new AssessmentAuditEvent
            {
                EvaluationRequestId = retake.Id,
                ActorUserId = leadVerifierUserId,
                EventType = "RetakeEvaluationCreated",
                ToStatus = retake.Status.ToString(),
                Reason = $"OriginalEvaluationRequest:{original.Id}",
                AttemptNumber = retake.SubmissionAttemptNumber
            });
        db.AuditLogs.AddRange(
            Audit(leadVerifierUserId, "RetakeAuthorized", original.Id),
            Audit(leadVerifierUserId, "RetakeEvaluationCreated", retake.Id));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new(RetakeAuthorizationStatus.Conflict);
        }

        return new(RetakeAuthorizationStatus.Created,
            new RetakeAuthorizationView(authorization.Id, original.Id, retake.Id,
                target.AssessmentScopeId, authorization.AuthorizedAtUtc));
    }

    private IQueryable<EvaluationRequest> BaseOriginalsQuery() => db.EvaluationRequests
        .Include(x => x.AssessmentScope).ThenInclude(x => x!.AssessmentDefinition).ThenInclude(x => x!.UnitDefinition)
        .Include(x => x.CriterionResults)
        .Include(x => x.ResubmissionAuthorizations)
        .Include(x => x.Retakes)
        .Include(x => x.RetakeAuthorization)
        .AsSplitQuery();

    private static Eligibility? ReadEligibility(EvaluationRequest original)
    {
        if (original.Status != EvaluationStatus.Completed
            || original.RetakeOfEvaluationRequestId is not null
            || original.Retakes.Count != 0
            || original.RetakeAuthorization is not null
            || original.SubmissionAttemptNumber < 2
            || original.CalculatedGrade != EvaluationGrade.NotYetAchieved
            || original.AssessmentScope?.AssessmentDefinition?.UnitDefinition is null
            || !original.ResubmissionAuthorizations.Any(x =>
                x.AttemptNumber == original.SubmissionAttemptNumber
                && x.SubmittedAtUtc is not null
                && x.RevokedAtUtc is null)
            || !BtecAssessmentRuleSet.TryRead(original.AssessmentRuleSetSnapshotJson, out var ruleSet)) return null;

        var snapshot = AssessmentScopeSnapshotReader.Read(original.AssessmentScopeSnapshotJson);
        if (snapshot is null) return null;
        var calculated = EvaluationAssessmentCalculator.Calculate(original.CriterionResults.Select(result =>
            new CriterionSubmission(result.CriterionCode, result.Achievement.ToString(), result.Evidence, result.Comment)), ruleSet);
        if (calculated.Grade != EvaluationGrade.NotYetAchieved) return null;

        var achieved = original.CriterionResults
            .Where(x => x.Achievement == CriterionAchievement.Achieved)
            .Select(x => x.CriterionCode)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unmetPass = snapshot.CanonicalCriteria
            .Where(x => string.Equals(x.Band, "Pass", StringComparison.OrdinalIgnoreCase)
                && !achieved.Contains(x.Code))
            .Select(x => x.Code.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return unmetPass.Length == 0 ? null : new(snapshot, unmetPass);
    }

    private static bool IsCompatible(EvaluationRequest original, IReadOnlyCollection<string> unmetPassCriteria,
        ResolvedAssessmentScope target)
    {
        var originalScope = original.AssessmentScope;
        var originalDefinition = originalScope?.AssessmentDefinition;
        var originalUnit = originalDefinition?.UnitDefinition;
        if (originalScope is null || originalDefinition is null || originalUnit is null) return false;
        if (!target.IsRetakeOnly
            || target.AssessmentDefinitionId == originalDefinition.Id
            || target.UnitDefinitionId != originalUnit.Id
            || target.QualificationVersionId != originalUnit.QualificationVersionId
            || target.QualificationVersionId != original.QualificationVersionId
            || target.GradeId != original.GradeId
            || target.SpecializationId != original.SpecializationId
            || target.TaskTypeId != original.TaskTypeId
            || !string.Equals(target.AssessmentRuleSetVersion, original.AssessmentRuleSetVersion,
                StringComparison.Ordinal)) return false;

        var targetCriteria = target.Snapshot.CanonicalCriteria;
        if (targetCriteria.Count == 0
            || targetCriteria.Any(x => !string.Equals(x.Band, "Pass", StringComparison.OrdinalIgnoreCase))) return false;
        var targetCodes = targetCriteria.Select(x => x.Code.Trim().ToUpperInvariant())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return targetCodes.SetEquals(unmetPassCriteria)
            && target.CriterionCodes.All(targetCodes.Contains)
            && targetCodes.Count == target.CriterionCodes.Count;
    }

    private static AuditLog Audit(string actor, string action, Guid entityId) => new()
    {
        ActorUserId = actor,
        Action = action,
        EntityType = nameof(EvaluationRequest),
        EntityId = entityId.ToString(),
        Outcome = "Success"
    };

    private sealed record Eligibility(AssessmentScopeSnapshot Snapshot, IReadOnlyList<string> UnmetPassCriteria);
}
