using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Manages explicit, risk-informed internal-verification samples. It does not
/// calculate a sample percentage or infer Pearson rules; a Lead Internal
/// Verifier documents the scope and selection reason for each sample.
/// </summary>
public sealed class InternalVerificationSamplingService(
    BetccoDbContext db,
    IAssessorEligibilityService assessorEligibility) : IInternalVerificationSamplingService
{
    public async Task<InternalVerificationPlanView?> CreatePlanAsync(
        string leadVerifierUserId,
        CreateInternalVerificationPlanCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken)
            || !HasScope(command)
            || !TryNormalizeRationale(command.SelectionRationale, out var rationale)
            || (command.ActiveUntilUtc.HasValue && command.ActiveUntilUtc <= DateTimeOffset.UtcNow))
            return null;

        if (command.AssessorUserId is not null
            && !await assessorEligibility.IsEligibleAsync(command.AssessorUserId, cancellationToken))
            return null;
        if (command.GradeId.HasValue
            && !await db.Grades.AsNoTracking().AnyAsync(item => item.Id == command.GradeId.Value, cancellationToken))
            return null;
        if (command.SpecializationId.HasValue
            && !await db.Specializations.AsNoTracking().AnyAsync(item => item.Id == command.SpecializationId.Value, cancellationToken))
            return null;
        if (command.TaskTypeId.HasValue
            && !await db.TaskTypes.AsNoTracking().AnyAsync(item => item.Id == command.TaskTypeId.Value && item.IsActive, cancellationToken))
            return null;
        if (!TryParseOutcome(command.TargetOutcome, out var targetOutcome)) return null;

        var plan = new InternalVerificationPlan
        {
            AssessorUserId = TrimOrNull(command.AssessorUserId, 128),
            GradeId = command.GradeId,
            SpecializationId = command.SpecializationId,
            TaskTypeId = command.TaskTypeId,
            TargetOutcome = targetOutcome,
            SelectionRationale = rationale,
            ActiveUntilUtc = command.ActiveUntilUtc,
            CreatedByUserId = leadVerifierUserId
        };
        db.InternalVerificationPlans.Add(plan);
        db.AuditLogs.Add(Audit(leadVerifierUserId, "InternalVerificationPlanCreated", nameof(InternalVerificationPlan), plan.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return ToView(plan, 0);
    }

    public async Task<IReadOnlyCollection<InternalVerificationPlanView>> ListPlansAsync(CancellationToken cancellationToken = default)
    {
        var plans = await db.InternalVerificationPlans.AsNoTracking()
            .OrderByDescending(item => item.IsActive)
            .ThenByDescending(item => item.CreatedAtUtc)
            .Take(100)
            .Select(item => new { Plan = item, SamplesCount = item.Samples.Count })
            .ToArrayAsync(cancellationToken);
        return plans.Select(item => ToView(item.Plan, item.SamplesCount)).ToArray();
    }

    public async Task<IReadOnlyCollection<InternalVerificationCandidateView>?> ListCandidatesAsync(
        string leadVerifierUserId,
        Guid planId,
        int take,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken)) return null;
        var plan = await db.InternalVerificationPlans.AsNoTracking().SingleOrDefaultAsync(item => item.Id == planId, cancellationToken);
        if (plan is null || !IsActive(plan)) return null;

        var candidates = await CandidateQuery(plan)
            .Take(Math.Clamp(take, 1, 100))
            .ToArrayAsync(cancellationToken);
        return candidates.Select(item => new InternalVerificationCandidateView(
                item.EvaluationRequest.Id,
                item.EvaluationRequest.SubmissionAttemptNumber,
                item.EvaluatorAssignment.EvaluatorUserId,
                item.EvaluationRequest.GradeId,
                item.EvaluationRequest.SpecializationId,
                item.EvaluationRequest.TaskTypeId,
                item.EvaluationRequest.CalculatedGrade == null ? null : item.EvaluationRequest.CalculatedGrade.ToString(),
                item.EvaluationRequest.UpdatedAtUtc))
            .ToArray();
    }

    public async Task<bool> SelectSampleAsync(
        string leadVerifierUserId,
        Guid planId,
        SelectInternalVerificationSampleCommand command,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken)
            || !TryNormalizeRationale(command.SelectionRationale, out var rationale)
            || !await assessorEligibility.IsEligibleVerifierAsync(command.AssignedVerifierUserId, cancellationToken))
            return false;

        var plan = await db.InternalVerificationPlans.SingleOrDefaultAsync(item => item.Id == planId, cancellationToken);
        if (plan is null || !IsActive(plan)) return false;

        var candidate = await CandidateQuery(plan, command.EvaluationRequestId)
            .SingleOrDefaultAsync(cancellationToken);
        if (candidate is null || candidate.EvaluatorAssignment.EvaluatorUserId == command.AssignedVerifierUserId) return false;

        var alreadySampled = await db.InternalVerificationSamples.AnyAsync(item =>
            item.EvaluationRequestId == candidate.EvaluationRequest.Id
            && item.SubmissionAttemptNumber == candidate.EvaluationRequest.SubmissionAttemptNumber,
            cancellationToken);
        if (alreadySampled) return false;

        var sample = new InternalVerificationSample
        {
            InternalVerificationPlanId = plan.Id,
            EvaluationRequestId = candidate.EvaluationRequest.Id,
            SubmissionAttemptNumber = candidate.EvaluationRequest.SubmissionAttemptNumber,
            SelectedByUserId = leadVerifierUserId,
            AssignedVerifierUserId = command.AssignedVerifierUserId.Trim(),
            SelectionRationale = rationale
        };
        db.InternalVerificationSamples.Add(sample);
        db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            EvaluationRequestId = candidate.EvaluationRequest.Id,
            ActorUserId = leadVerifierUserId,
            EventType = "InternalVerificationSampleSelected",
            FromStatus = candidate.EvaluationRequest.Status.ToString(),
            ToStatus = candidate.EvaluationRequest.Status.ToString(),
            Reason = rationale,
            AttemptNumber = candidate.EvaluationRequest.SubmissionAttemptNumber
        });
        db.AuditLogs.Add(Audit(leadVerifierUserId, "InternalVerificationSampleSelected", nameof(InternalVerificationSample), sample.Id.ToString()));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            // The unique request/attempt key makes concurrent selection safe.
            return false;
        }
    }

    private IQueryable<CandidateRow> CandidateQuery(InternalVerificationPlan plan, Guid? evaluationRequestId = null)
    {
        var rows = from request in db.EvaluationRequests.AsNoTracking()
                   join assignment in db.EvaluatorAssignments.AsNoTracking()
                       on request.Id equals assignment.EvaluationRequestId
                   where request.Status == EvaluationStatus.UnderReview
                   where !evaluationRequestId.HasValue || request.Id == evaluationRequestId.Value
                   where plan.AssessorUserId == null || assignment.EvaluatorUserId == plan.AssessorUserId
                   where !plan.GradeId.HasValue || request.GradeId == plan.GradeId.Value
                   where !plan.SpecializationId.HasValue || request.SpecializationId == plan.SpecializationId.Value
                   where !plan.TaskTypeId.HasValue || request.TaskTypeId == plan.TaskTypeId.Value
                   where !plan.TargetOutcome.HasValue || request.CalculatedGrade == plan.TargetOutcome.Value
                   where !db.InternalVerificationSamples.Any(sample =>
                       sample.EvaluationRequestId == request.Id
                       && sample.SubmissionAttemptNumber == request.SubmissionAttemptNumber)
                   select new { EvaluationRequest = request, EvaluatorAssignment = assignment };
        return rows.OrderBy(item => item.EvaluationRequest.UpdatedAtUtc)
            .Select(item => new CandidateRow(item.EvaluationRequest, item.EvaluatorAssignment));
    }

    private static bool HasScope(CreateInternalVerificationPlanCommand command) =>
        !string.IsNullOrWhiteSpace(command.AssessorUserId)
        || command.GradeId.HasValue
        || command.SpecializationId.HasValue
        || command.TaskTypeId.HasValue;

    private static bool IsActive(InternalVerificationPlan plan) => plan.IsActive
        && plan.ActiveFromUtc <= DateTimeOffset.UtcNow
        && (!plan.ActiveUntilUtc.HasValue || plan.ActiveUntilUtc > DateTimeOffset.UtcNow);

    private static bool TryParseOutcome(string? value, out EvaluationGrade? outcome)
    {
        outcome = null;
        if (string.IsNullOrWhiteSpace(value)) return true;
        if (!Enum.TryParse<EvaluationGrade>(value, true, out var parsed) || parsed == EvaluationGrade.NotYetAchieved)
            return false;
        outcome = parsed;
        return true;
    }

    private static bool TryNormalizeRationale(string? value, out string rationale)
    {
        rationale = value?.Trim() ?? string.Empty;
        return rationale.Length is >= 10 and <= 2_000;
    }

    private static string? TrimOrNull(string? value, int maximum) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim()[..Math.Min(value.Trim().Length, maximum)];

    private static InternalVerificationPlanView ToView(InternalVerificationPlan plan, int samplesCount) => new(
        plan.Id,
        plan.AssessorUserId,
        plan.GradeId,
        plan.SpecializationId,
        plan.TaskTypeId,
        plan.TargetOutcome?.ToString(),
        plan.SelectionRationale,
        plan.ActiveFromUtc,
        plan.ActiveUntilUtc,
        plan.IsActive,
        samplesCount);

    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new()
    {
        ActorUserId = actor,
        Action = action,
        EntityType = entityType,
        EntityId = entityId,
        Outcome = "Success"
    };

    private sealed record CandidateRow(EvaluationRequest EvaluationRequest, EvaluatorAssignment EvaluatorAssignment);
}
