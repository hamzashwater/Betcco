using Betcco.Domain.Common;

namespace Betcco.Domain.Evaluations;

/// <summary>Canonical academic identity within one qualification-version unit.</summary>
public sealed class LearningAimDefinition : Entity
{
    public Guid UnitDefinitionId { get; set; }
    public UnitDefinition? UnitDefinition { get; set; }
    public required string Code { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public required string SourceReference { get; set; }
    public int SortOrder { get; set; }
    public ICollection<AssessmentCriterionDefinition> Criteria { get; } = new List<AssessmentCriterionDefinition>();
}

public sealed class AssessmentCriterionDefinition : Entity
{
    public Guid LearningAimDefinitionId { get; set; }
    public LearningAimDefinition? LearningAimDefinition { get; set; }
    public required string Code { get; set; }
    public BtecCriterionBand Band { get; set; }
    public required string ArabicDescription { get; set; }
    public required string EnglishDescription { get; set; }
    public required string SourceReference { get; set; }
    public int SortOrder { get; set; }
}

public sealed class AssessmentDefinitionAim : Entity
{
    public Guid AssessmentDefinitionId { get; set; }
    public Guid UnitDefinitionId { get; set; }
    public Guid LearningAimDefinitionId { get; set; }
}

public sealed class AssessmentDefinitionCriterion : Entity
{
    public Guid AssessmentDefinitionId { get; set; }
    public Guid LearningAimDefinitionId { get; set; }
    public Guid AssessmentCriterionDefinitionId { get; set; }
}
