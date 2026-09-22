using System.Text.Json;

namespace Betcco.Application.Evaluations;

// The selection identifier is the scope, never a browser-selected rubric.
public sealed record ScopedEvaluationCommand(Guid AssessmentScopeId, string? StudentComment);
public sealed record AssessmentScopeOption(
    Guid AssessmentScopeId,
    string QualificationCode, string QualificationArabicName, string QualificationEnglishName,
    string QualificationVersionCode, string GradeCode, string GradeArabicName, string GradeEnglishName,
    string SpecializationCode, string SpecializationArabicName, string SpecializationEnglishName,
    string UnitCode, string UnitArabicTitle, string UnitEnglishTitle,
    string AssessmentCode, int AssessmentVersion, string AssessmentArabicTitle, string AssessmentEnglishTitle,
    int ScopeVersion, IReadOnlyList<string> LearningAimCodes, IReadOnlyList<AssessmentCriterionDisplay> Criteria);

public sealed record AssessmentCriterionDisplay(string Code, string Band);
public sealed record AssessmentAcademicSummary(
    string QualificationCode, string QualificationArabicName, string QualificationEnglishName, string QualificationVersionCode,
    string GradeArabicName, string GradeEnglishName, string SpecializationArabicName, string SpecializationEnglishName,
    string UnitCode, string UnitArabicTitle, string UnitEnglishTitle,
    string AssessmentCode, int AssessmentVersion, string AssessmentArabicTitle, string AssessmentEnglishTitle,
    int ScopeVersion, IReadOnlyList<string> LearningAimCodes, IReadOnlyList<AssessmentCriterionDisplay> Criteria);

public sealed record AssessmentScopeSnapshot(
    string SchemaVersion, QualificationAcademicSnapshot Qualification, UnitAcademicSnapshot Unit,
    AssessmentDefinitionAcademicSnapshot Assessment, ScopeAcademicSnapshot Scope,
    IReadOnlyList<AimAcademicSnapshot> LearningAims, IReadOnlyList<CriterionAcademicSnapshot> CanonicalCriteria,
    RubricAcademicSnapshot Rubric)
{
    public const string Version = "betcco-assessment-scope-v1";

    public AssessmentAcademicSummary Summary() => new(
        Qualification.Code, Qualification.ArabicName, Qualification.EnglishName, Qualification.VersionCode,
        Scope.GradeArabicName, Scope.GradeEnglishName, Scope.SpecializationArabicName, Scope.SpecializationEnglishName,
        Unit.Code, Unit.ArabicTitle, Unit.EnglishTitle,
        Assessment.Code, Assessment.Version, Assessment.ArabicTitle, Assessment.EnglishTitle,
        Scope.Version, LearningAims.Select(x => x.Code).ToArray(),
        CanonicalCriteria.Select(x => new AssessmentCriterionDisplay(x.Code, x.Band)).ToArray());
}

public static class AssessmentScopeSnapshotReader
{
    public static AssessmentScopeSnapshot? Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var snapshot = JsonSerializer.Deserialize<AssessmentScopeSnapshot>(json);
            return snapshot?.SchemaVersion == AssessmentScopeSnapshot.Version
                && snapshot.Qualification is not null && snapshot.Unit is not null
                && snapshot.Assessment is not null && snapshot.Scope is not null
                && snapshot.Rubric is not null && snapshot.LearningAims is not null
                && snapshot.CanonicalCriteria is not null ? snapshot : null;
        }
        catch (JsonException) { return null; }
    }

    public static AssessmentAcademicSummary? Summary(string? json) => Read(json)?.Summary();
}

public sealed record QualificationAcademicSnapshot(string Code, string ArabicName, string EnglishName,
    string VersionCode, string SourceReference, DateTimeOffset EffectiveFromUtc, DateTimeOffset? EffectiveUntilUtc);
public sealed record UnitAcademicSnapshot(string Code, string ArabicTitle, string EnglishTitle, string? SourceReference);
public sealed record AssessmentDefinitionAcademicSnapshot(string Code, int Version, string ArabicTitle, string EnglishTitle,
    string? SourceReference, DateTimeOffset? PublishedAtUtc);
public sealed record ScopeAcademicSnapshot(int Version, DateTimeOffset? PublishedAtUtc,
    string GradeCode, string GradeArabicName, string GradeEnglishName,
    string SpecializationCode, string SpecializationArabicName, string SpecializationEnglishName);
public sealed record AimAcademicSnapshot(string Code, string ArabicTitle, string EnglishTitle,
    string ArabicDescription, string EnglishDescription, string SourceReference, int SortOrder);
public sealed record CriterionAcademicSnapshot(string Code, string Band, string LearningAimCode,
    string ArabicDescription, string EnglishDescription, string SourceReference, int SortOrder);
public sealed record RubricAcademicSnapshot(string ArabicTitle, string EnglishTitle, int Version,
    string AssessmentRuleSetVersion, IReadOnlyList<string> CriterionCodes);

public interface IScopedAssessmentService
{
    Task<IReadOnlyList<AssessmentScopeOption>> ListOptionsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<AssessmentScopeOption>> ListRetakeOptionsAsync(CancellationToken cancellationToken);
    Task<EvaluationView?> CreateAsync(string studentUserId, ScopedEvaluationCommand command, CancellationToken cancellationToken);
    Task<ResolvedAssessmentScope?> ResolveAsync(Guid assessmentScopeId, CancellationToken cancellationToken);
}

public sealed record ResolvedAssessmentScope(
    Guid AssessmentScopeId, Guid AssessmentDefinitionId, Guid UnitDefinitionId, Guid QualificationVersionId,
    Guid GradeId, Guid SpecializationId, Guid TaskTypeId, Guid RubricTemplateId,
    bool IsRetakeOnly,
    string QualificationVersionSnapshotJson, AssessmentScopeSnapshot Snapshot,
    IReadOnlyList<string> CriterionCodes, string AssessmentRuleSetVersion,
    string AssessmentRuleSetSnapshotJson, AssessmentScopeOption Option);
