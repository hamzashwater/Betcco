namespace Betcco.Application.Evaluations;

public sealed record PagedDeliveryPlanningResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed record AcademicYearView(Guid Id, string Code, DateOnly StartDate, DateOnly EndDate, bool IsActive);
public sealed record SaveAcademicYearCommand(string Code, DateOnly StartDate, DateOnly EndDate, bool IsActive = true);

public sealed record AcademicTermView(
    Guid Id,
    Guid AcademicYearId,
    string Code,
    DateOnly StartDate,
    DateOnly EndDate,
    int SortOrder,
    bool IsActive);
public sealed record SaveAcademicTermCommand(
    Guid AcademicYearId,
    string Code,
    DateOnly StartDate,
    DateOnly EndDate,
    int SortOrder,
    bool IsActive = true);

public sealed record DeliveryPlanningQualificationVersionView(
    Guid Id,
    string QualificationCode,
    string VersionCode,
    bool IsActive,
    Guid? SpecializationId = null,
    string? SpecializationEnglishName = null,
    string? SpecializationArabicName = null);
public sealed record DeliveryPlanningUnitView(Guid Id, string Code, string ArabicTitle, string EnglishTitle, bool IsActive);

public sealed record DeliveryPlanSummaryView(
    Guid Id,
    Guid QualificationVersionId,
    string QualificationCode,
    string QualificationVersionCode,
    Guid AcademicYearId,
    string AcademicYearCode,
    bool IsActive,
    int EntryCount,
    Guid? GradeId = null,
    string? GradeEnglishName = null,
    string? GradeArabicName = null,
    Guid? SpecializationId = null,
    string? SpecializationEnglishName = null,
    string? SpecializationArabicName = null);
public sealed record DeliveryPlanEntryView(
    Guid Id,
    Guid UnitDefinitionId,
    string UnitCode,
    string UnitArabicTitle,
    string UnitEnglishTitle,
    Guid AcademicTermId,
    string TermCode,
    int SortOrder);
public sealed record DeliveryPlanView(DeliveryPlanSummaryView Plan, IReadOnlyList<DeliveryPlanEntryView> Entries);
public sealed record CreateDeliveryPlanCommand(Guid QualificationVersionId, Guid AcademicYearId, Guid? GradeId = null);
public sealed record UpdateDeliveryPlanCommand(bool IsActive);
public sealed record AddDeliveryPlanEntryCommand(Guid UnitDefinitionId, Guid AcademicTermId);
public sealed record UpdateDeliveryPlanEntryCommand(Guid AcademicTermId);
public sealed record ReorderDeliveryPlanEntriesCommand(IReadOnlyList<Guid> EntryIds);

public sealed class DeliveryPlanningException(string code, bool notFound = false) : Exception(code)
{
    public string Code { get; } = code;
    public bool NotFound { get; } = notFound;
}

public interface IDeliveryPlanningService
{
    Task<PagedDeliveryPlanningResult<AcademicYearView>> ListAcademicYearsAsync(int page, int pageSize, CancellationToken cancellationToken = default);
    Task<AcademicYearView> GetAcademicYearAsync(Guid id, CancellationToken cancellationToken = default);
    Task<AcademicYearView> CreateAcademicYearAsync(SaveAcademicYearCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<AcademicYearView> UpdateAcademicYearAsync(Guid id, SaveAcademicYearCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<PagedDeliveryPlanningResult<AcademicTermView>> ListTermsAsync(Guid academicYearId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<AcademicTermView> CreateTermAsync(SaveAcademicTermCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<AcademicTermView> UpdateTermAsync(Guid id, SaveAcademicTermCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<PagedDeliveryPlanningResult<DeliveryPlanningQualificationVersionView>> ListQualificationVersionsAsync(int page, int pageSize, CancellationToken cancellationToken = default);
    Task<PagedDeliveryPlanningResult<DeliveryPlanningUnitView>> ListUnitsAsync(Guid qualificationVersionId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<PagedDeliveryPlanningResult<DeliveryPlanSummaryView>> ListPlansAsync(Guid? academicYearId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> GetPlanAsync(Guid id, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> CreatePlanAsync(CreateDeliveryPlanCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> UpdatePlanAsync(Guid id, UpdateDeliveryPlanCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> AddEntryAsync(Guid planId, AddDeliveryPlanEntryCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> UpdateEntryAsync(Guid entryId, UpdateDeliveryPlanEntryCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> ReorderEntriesAsync(Guid planId, ReorderDeliveryPlanEntriesCommand command, string actorId, CancellationToken cancellationToken = default);
    Task<DeliveryPlanView> RemoveEntryAsync(Guid entryId, string actorId, CancellationToken cancellationToken = default);
}
