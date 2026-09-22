using Betcco.Domain.Common;

namespace Betcco.Application.Evaluations;

public sealed record AcademicVersionView(Guid Id, string QualificationCode, string VersionCode, bool IsActive);
public sealed record AcademicCatalogueView(AcademicVersionView Version, IReadOnlyList<AcademicUnitView> Units);
public sealed record AcademicUnitView(Guid Id, string Code, string ArabicTitle, string EnglishTitle, string? SourceReference, bool IsActive,
    IReadOnlyList<AcademicAimView> Aims, IReadOnlyList<AcademicDefinitionView> Definitions);
public sealed record AcademicAimView(Guid Id, string Code, string ArabicTitle, string EnglishTitle, string ArabicDescription, string EnglishDescription,
    string SourceReference, int SortOrder, IReadOnlyList<AcademicCriterionView> Criteria);
public sealed record AcademicCriterionView(Guid Id, string Code, string Band, string ArabicDescription, string EnglishDescription,
    string SourceReference, int SortOrder);
public sealed record AcademicDefinitionView(Guid Id, string Code, int Version, string ArabicTitle, string EnglishTitle, string? SourceReference,
    bool IsActive, DateTimeOffset? PublishedAtUtc, IReadOnlyList<Guid> AimIds, IReadOnlyList<Guid> CriterionIds,
    IReadOnlyList<string> Validation, IReadOnlyList<AcademicScopeView> Scopes);
public sealed record AcademicScopeView(Guid Id, int Version, Guid GradeId, string GradeArabicName, string GradeEnglishName,
    Guid SpecializationId, string SpecializationArabicName, string SpecializationEnglishName,
    Guid RubricTemplateId, string RubricArabicTitle, string RubricEnglishTitle, bool IsActive,
    DateTimeOffset? PublishedAtUtc, IReadOnlyList<string> Validation);

public sealed record SaveAcademicUnit(Guid QualificationVersionId, string Code, string ArabicTitle, string EnglishTitle, string? SourceReference);
public sealed record SaveAcademicAim(Guid UnitDefinitionId, string Code, string ArabicTitle, string EnglishTitle,
    string ArabicDescription, string EnglishDescription, string SourceReference, int SortOrder);
public sealed record SaveAcademicCriterion(Guid LearningAimDefinitionId, string Code, BtecCriterionBand Band,
    string ArabicDescription, string EnglishDescription, string SourceReference, int SortOrder);
public sealed record SaveAcademicDefinition(Guid UnitDefinitionId, string Code, int Version, string ArabicTitle, string EnglishTitle,
    string? SourceReference);
public sealed record SaveAcademicMappings(IReadOnlyList<Guid> AimIds, IReadOnlyList<Guid> CriterionIds);
public sealed record SaveAcademicScope(Guid AssessmentDefinitionId, Guid GradeId, Guid SpecializationId, Guid RubricTemplateId, int Version);

public sealed class AcademicCatalogueException(string code) : Exception(code);

public interface IAcademicCatalogueService
{
    Task<IReadOnlyList<AcademicVersionView>> ListVersionsAsync(CancellationToken cancellationToken);
    Task<AcademicCatalogueView?> GetVersionAsync(Guid versionId, CancellationToken cancellationToken);
    Task<Guid> SaveUnitAsync(Guid? id, SaveAcademicUnit command, string actorId, CancellationToken cancellationToken);
    Task<Guid> SaveAimAsync(Guid? id, SaveAcademicAim command, string actorId, CancellationToken cancellationToken);
    Task<Guid> SaveCriterionAsync(Guid? id, SaveAcademicCriterion command, string actorId, CancellationToken cancellationToken);
    Task<Guid> SaveDefinitionAsync(Guid? id, SaveAcademicDefinition command, string actorId, CancellationToken cancellationToken);
    Task SetMappingsAsync(Guid definitionId, SaveAcademicMappings command, string actorId, CancellationToken cancellationToken);
    Task<Guid> SaveScopeAsync(Guid? id, SaveAcademicScope command, string actorId, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> ValidateDefinitionAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> ValidateScopeAsync(Guid id, CancellationToken cancellationToken);
    Task PublishDefinitionAsync(Guid id, string actorId, CancellationToken cancellationToken);
    Task ActivateScopeAsync(Guid id, string actorId, CancellationToken cancellationToken);
}
