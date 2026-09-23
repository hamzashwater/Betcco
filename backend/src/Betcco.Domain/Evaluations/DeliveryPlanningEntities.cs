using Betcco.Domain.Common;

namespace Betcco.Domain.Evaluations;

/// <summary>A centre-defined calendar period; no regional calendar is assumed.</summary>
public sealed class AcademicYear : Entity
{
    public required string Code { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<AcademicTerm> Terms { get; } = new List<AcademicTerm>();
    public ICollection<DeliveryPlan> DeliveryPlans { get; } = new List<DeliveryPlan>();
}

/// <summary>An ordered, non-overlapping active period within one academic year.</summary>
public sealed class AcademicTerm : Entity
{
    public Guid AcademicYearId { get; set; }
    public AcademicYear? AcademicYear { get; set; }
    public required string Code { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<DeliveryPlanEntry> DeliveryPlanEntries { get; } = new List<DeliveryPlanEntry>();
}

/// <summary>An editable delivery plan for one canonical qualification version and academic year.</summary>
public sealed class DeliveryPlan : Entity
{
    public Guid QualificationVersionId { get; set; }
    public QualificationVersion? QualificationVersion { get; set; }
    public Guid AcademicYearId { get; set; }
    public AcademicYear? AcademicYear { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<DeliveryPlanEntry> Entries { get; } = new List<DeliveryPlanEntry>();
}

/// <summary>An ordered reference to a canonical unit, assigned to a term in the plan's year.</summary>
public sealed class DeliveryPlanEntry : Entity
{
    public Guid DeliveryPlanId { get; set; }
    public DeliveryPlan? DeliveryPlan { get; set; }
    public Guid UnitDefinitionId { get; set; }
    public UnitDefinition? UnitDefinition { get; set; }
    public Guid AcademicTermId { get; set; }
    public AcademicTerm? AcademicTerm { get; set; }
    public int SortOrder { get; set; }
}
