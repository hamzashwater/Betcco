namespace Betcco.Application.Evaluations;

public enum SpecialismWriteResult
{
    Success,
    InvalidActor,
    EvaluatorNotEligible,
    UnitNotFound,
    AlreadyActive,
    GrantNotFound,
    AlreadyRevoked,
    Conflict
}

public enum AssignmentResult
{
    Success,
    RequestNotAssignable,
    AcademicMappingRequired,
    EvaluatorNotEligible,
    UnitSpecialismRequired,
    Conflict
}

public sealed record EvaluatorSpecialismView(Guid Id, Guid EvaluatorUserId, string EvaluatorName,
    Guid UnitDefinitionId, string UnitCode, string UnitEnglishTitle, string UnitArabicTitle,
    Guid QualificationVersionId, DateTimeOffset GrantedAtUtc, DateTimeOffset? RevokedAtUtc,
    string? RevokeReason);

public sealed record EvaluatorSpecialismPage(IReadOnlyList<EvaluatorSpecialismView> Items,
    int Page, int PageSize, int TotalCount);

public sealed record EvaluatorStaffOption(Guid Id, string DisplayName);
public sealed record EvaluatorUnitOption(Guid Id, string Code, string EnglishTitle,
    string ArabicTitle, Guid QualificationVersionId, string QualificationCode,
    string QualificationVersionCode);
public sealed record EligibleEvaluatorView(Guid Id, string DisplayName);

public interface IEvaluatorSpecialismService
{
    Task<EvaluatorSpecialismPage> ListAsync(Guid? evaluatorUserId, int page, int pageSize,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<EvaluatorStaffOption>> ListStaffAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<EvaluatorUnitOption>> ListUnitsAsync(CancellationToken cancellationToken = default);
    Task<SpecialismWriteResult> GrantAsync(Guid evaluatorUserId, Guid unitDefinitionId, Guid actorUserId,
        CancellationToken cancellationToken = default);
    Task<SpecialismWriteResult> RevokeAsync(Guid grantId, Guid actorUserId, string? reason,
        CancellationToken cancellationToken = default);
    Task<(AssignmentResult Result, IReadOnlyList<EligibleEvaluatorView> Candidates)> EligibleAsync(
        Guid evaluationRequestId, CancellationToken cancellationToken = default);
}
