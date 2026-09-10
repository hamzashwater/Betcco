using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class EvaluationAppealService(
    BetccoDbContext db,
    IAssessorEligibilityService assessorEligibility) : IEvaluationAppealService
{
    public async Task<EvaluationAppealView?> CreateAsync(string studentUserId, CreateEvaluationAppealCommand command, CancellationToken cancellationToken = default)
    {
        if (!TryText(command.Reason, out var reason)) return null;
        var request = await db.EvaluationRequests.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Id == command.EvaluationRequestId
            && item.StudentUserId == studentUserId
            && item.Status == EvaluationStatus.Completed,
            cancellationToken);
        if (request is null) return null;
        if (await db.EvaluationAppeals.AnyAsync(item => item.EvaluationRequestId == request.Id
            && (item.Status == EvaluationAppealStatus.Submitted || item.Status == EvaluationAppealStatus.UnderReview), cancellationToken)) return null;

        var appeal = new EvaluationAppeal
        {
            EvaluationRequestId = request.Id,
            StudentUserId = studentUserId,
            Reason = reason
        };
        db.EvaluationAppeals.Add(appeal);
        db.AssessmentAuditEvents.Add(Event(request, studentUserId, "AppealSubmitted", reason));
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationAppealSubmitted", nameof(EvaluationAppeal), appeal.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return View(appeal);
    }

    public async Task<IReadOnlyCollection<EvaluationAppealView>> ListMineAsync(string studentUserId, CancellationToken cancellationToken = default) =>
        (await db.EvaluationAppeals.AsNoTracking().Where(item => item.StudentUserId == studentUserId)
            .OrderByDescending(item => item.CreatedAtUtc).Take(100).ToArrayAsync(cancellationToken)).Select(View).ToArray();

    public async Task<IReadOnlyCollection<EvaluationAppealView>> ListForReviewAsync(CancellationToken cancellationToken = default) =>
        (await db.EvaluationAppeals.AsNoTracking().Where(item =>
                item.Status == EvaluationAppealStatus.Submitted || item.Status == EvaluationAppealStatus.UnderReview)
            .OrderBy(item => item.CreatedAtUtc).Take(100).ToArrayAsync(cancellationToken)).Select(View).ToArray();

    public async Task<bool> WithdrawAsync(string studentUserId, Guid appealId, CancellationToken cancellationToken = default)
    {
        var appeal = await db.EvaluationAppeals.Include(item => item.EvaluationRequest).SingleOrDefaultAsync(item =>
            item.Id == appealId && item.StudentUserId == studentUserId && item.Status == EvaluationAppealStatus.Submitted,
            cancellationToken);
        if (appeal is null) return false;
        appeal.Status = EvaluationAppealStatus.Withdrawn;
        appeal.WithdrawnAtUtc = DateTimeOffset.UtcNow;
        db.AssessmentAuditEvents.Add(Event(appeal.EvaluationRequest!, studentUserId, "AppealWithdrawn", null));
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationAppealWithdrawn", nameof(EvaluationAppeal), appeal.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ReviewAsync(string leadVerifierUserId, Guid appealId, ReviewEvaluationAppealCommand command, CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken)
            || command.Status is not (EvaluationAppealStatus.Upheld or EvaluationAppealStatus.Rejected)
            || !TryText(command.DecisionRationale, out var rationale)) return false;

        var appeal = await db.EvaluationAppeals.Include(item => item.EvaluationRequest).SingleOrDefaultAsync(item =>
            item.Id == appealId
            && (item.Status == EvaluationAppealStatus.Submitted || item.Status == EvaluationAppealStatus.UnderReview),
            cancellationToken);
        if (appeal?.EvaluationRequest is null) return false;
        var wasInvolved = await db.EvaluatorAssignments.AsNoTracking().AnyAsync(item => item.EvaluationRequestId == appeal.EvaluationRequestId && item.EvaluatorUserId == leadVerifierUserId, cancellationToken)
            || await db.InternalVerifications.AsNoTracking().AnyAsync(item => item.EvaluationRequestId == appeal.EvaluationRequestId && item.VerifierUserId == leadVerifierUserId, cancellationToken);
        if (wasInvolved) return false;

        appeal.Status = command.Status;
        appeal.ReviewedByUserId = leadVerifierUserId;
        appeal.DecisionRationale = rationale;
        appeal.ReviewedAtUtc = DateTimeOffset.UtcNow;
        var eventType = command.Status == EvaluationAppealStatus.Upheld ? "AppealUpheld" : "AppealRejected";
        db.AssessmentAuditEvents.Add(Event(appeal.EvaluationRequest, leadVerifierUserId, eventType, rationale));
        db.Notifications.Add(new Notification
        {
            UserId = appeal.StudentUserId,
            Title = command.Status == EvaluationAppealStatus.Upheld ? "Appeal upheld" : "Appeal decision recorded",
            Body = command.Status == EvaluationAppealStatus.Upheld
                ? "Your appeal was upheld. Any reassessment will be recorded separately."
                : "Your appeal decision and rationale are available in BETCCO.",
            Type = NotificationType.Evaluation,
            DeepLink = "/student/appeals"
        });
        db.AuditLogs.Add(Audit(leadVerifierUserId, "EvaluationAppealReviewed", nameof(EvaluationAppeal), appeal.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static bool TryText(string? text, out string normalized)
    {
        normalized = text?.Trim() ?? string.Empty;
        return normalized.Length is >= 10 and <= 4_000;
    }

    private static EvaluationAppealView View(EvaluationAppeal appeal) => new(
        appeal.Id, appeal.EvaluationRequestId, appeal.Status.ToString(), appeal.Reason,
        appeal.DecisionRationale, appeal.CreatedAtUtc, appeal.ReviewedAtUtc, appeal.WithdrawnAtUtc);

    private static AssessmentAuditEvent Event(EvaluationRequest request, string actor, string eventType, string? reason) => new()
    {
        EvaluationRequestId = request.Id,
        ActorUserId = actor,
        EventType = eventType,
        FromStatus = request.Status.ToString(),
        ToStatus = request.Status.ToString(),
        Reason = reason,
        AttemptNumber = request.SubmissionAttemptNumber
    };

    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new()
    {
        ActorUserId = actor,
        Action = action,
        EntityType = entityType,
        EntityId = entityId,
        Outcome = "Success"
    };
}
