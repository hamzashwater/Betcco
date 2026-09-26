namespace Betcco.Application.Evaluations;

public sealed record GrantEvaluationRevisionDeadlineAdjustment(
    DateTimeOffset ExtendedDueAtUtc,
    string Reason);

public sealed record RevokeEvaluationRevisionDeadlineAdjustment(string? Reason);

public sealed record EvaluationRevisionDeadlineAdjustmentView(
    Guid Id,
    Guid EvaluationRequestId,
    DateTimeOffset BaseDueAtUtcSnapshot,
    DateTimeOffset ExtendedDueAtUtc,
    Guid GrantedByUserId,
    DateTimeOffset GrantedAtUtc,
    string Reason,
    DateTimeOffset? RevokedAtUtc,
    Guid? RevokedByUserId,
    string? RevocationReason);

public sealed record EvaluationRevisionDeadlineAdjustmentSummary(
    Guid EvaluationRequestId,
    DateTimeOffset? BaseDueAtUtc,
    DateTimeOffset? EffectiveDueAtUtc,
    Guid? ActiveAdjustmentId,
    IReadOnlyList<EvaluationRevisionDeadlineAdjustmentView> History);

public interface IAssessmentReasonableAdjustmentService
{
    Task<EvaluationReasonableAdjustmentWriteResult> GrantRevisionDeadlineAsync(
        Guid actorUserId,
        Guid evaluationRequestId,
        GrantEvaluationRevisionDeadlineAdjustment command,
        CancellationToken cancellationToken = default);

    Task<EvaluationReasonableAdjustmentWriteResult> RevokeRevisionDeadlineAsync(
        Guid actorUserId,
        Guid evaluationRequestId,
        Guid adjustmentId,
        RevokeEvaluationRevisionDeadlineAdjustment command,
        CancellationToken cancellationToken = default);

    Task<EvaluationRevisionDeadlineAdjustmentSummary?> GetRevisionDeadlineSummaryAsync(
        Guid evaluationRequestId,
        CancellationToken cancellationToken = default);
}

public enum EvaluationReasonableAdjustmentWriteResult
{
    Success,
    RequestNotFound,
    NoActiveRevisionWindow,
    Invalid,
    InvalidActor,
    Conflict
}
