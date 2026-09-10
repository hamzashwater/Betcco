namespace Betcco.Application.Evaluations;

public sealed record CreateQualificationCommand(string Code, string ArabicName, string EnglishName);

public sealed record CreateQualificationVersionCommand(
    Guid QualificationId,
    string VersionCode,
    string SourceReference,
    DateTimeOffset EffectiveFromUtc,
    DateTimeOffset? EffectiveUntilUtc);

public sealed record QualificationVersionView(
    Guid Id,
    string VersionCode,
    string SourceReference,
    DateTimeOffset EffectiveFromUtc,
    DateTimeOffset? EffectiveUntilUtc,
    bool IsActive);

public sealed record QualificationView(
    Guid Id,
    string Code,
    string ArabicName,
    string EnglishName,
    bool IsActive,
    IReadOnlyCollection<QualificationVersionView> Versions);

public sealed record RubricQualificationBindingView(
    Guid RubricTemplateId,
    string ArabicTitle,
    string EnglishTitle,
    Guid? QualificationVersionId,
    string? QualificationCode,
    string? QualificationVersionCode);

public interface IQualificationRegistryService
{
    Task<IReadOnlyCollection<QualificationView>> ListAsync(CancellationToken cancellationToken = default);
    Task<QualificationView?> CreateQualificationAsync(string actorUserId, CreateQualificationCommand command, CancellationToken cancellationToken = default);
    Task<QualificationVersionView?> CreateVersionAsync(string actorUserId, CreateQualificationVersionCommand command, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RubricQualificationBindingView>> ListRubricBindingsAsync(CancellationToken cancellationToken = default);
    Task<bool> AssignToRubricAsync(string actorUserId, Guid rubricTemplateId, Guid qualificationVersionId, CancellationToken cancellationToken = default);
}
