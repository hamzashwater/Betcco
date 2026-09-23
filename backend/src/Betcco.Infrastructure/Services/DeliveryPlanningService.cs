using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed partial class DeliveryPlanningService(BetccoDbContext db) : IDeliveryPlanningService
{
    public async Task<PagedDeliveryPlanningResult<AcademicYearView>> ListAcademicYearsAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        (page, pageSize) = Page(page, pageSize);
        var query = db.AcademicYears.AsNoTracking().OrderByDescending(x => x.StartDate).ThenBy(x => x.Code).ThenBy(x => x.Id);
        return new(await query.Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new AcademicYearView(x.Id, x.Code, x.StartDate, x.EndDate, x.IsActive)).ToArrayAsync(cancellationToken),
            page, pageSize, await query.CountAsync(cancellationToken));
    }

    public async Task<AcademicYearView> GetAcademicYearAsync(Guid id, CancellationToken cancellationToken = default) =>
        await db.AcademicYears.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new AcademicYearView(x.Id, x.Code, x.StartDate, x.EndDate, x.IsActive)).SingleOrDefaultAsync(cancellationToken)
        ?? throw Missing("AcademicYearMissing");

    public async Task<AcademicYearView> CreateAcademicYearAsync(SaveAcademicYearCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var code = ValidCode(command.Code);
        ValidRange(command.StartDate, command.EndDate);
        if (await db.AcademicYears.AnyAsync(x => x.Code == code, cancellationToken)) throw Invalid("DuplicateAcademicYearCode");
        var year = new AcademicYear { Code = code, StartDate = command.StartDate, EndDate = command.EndDate, IsActive = command.IsActive };
        StampActor(year, actorId, true);
        db.AcademicYears.Add(year);
        Audit(actorId, "AcademicYearCreated", year, new { year.Code, year.StartDate, year.EndDate, year.IsActive });
        await db.SaveChangesAsync(cancellationToken);
        return YearView(year);
    }

    public async Task<AcademicYearView> UpdateAcademicYearAsync(Guid id, SaveAcademicYearCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var year = await db.AcademicYears.Include(x => x.Terms).SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw Missing("AcademicYearMissing");
        var code = ValidCode(command.Code);
        ValidRange(command.StartDate, command.EndDate);
        if (await db.AcademicYears.AnyAsync(x => x.Code == code && x.Id != id, cancellationToken)) throw Invalid("DuplicateAcademicYearCode");
        if (year.Terms.Any(x => x.StartDate < command.StartDate || x.EndDate > command.EndDate)) throw Invalid("AcademicYearExcludesTerm");
        if (!command.IsActive && await db.DeliveryPlans.AnyAsync(x => x.AcademicYearId == id && x.IsActive, cancellationToken))
            throw Invalid("AcademicYearHasActiveDeliveryPlan");
        year.Code = code;
        year.StartDate = command.StartDate;
        year.EndDate = command.EndDate;
        year.IsActive = command.IsActive;
        StampActor(year, actorId, false);
        Audit(actorId, "AcademicYearUpdated", year, new { year.Code, year.StartDate, year.EndDate, year.IsActive });
        await db.SaveChangesAsync(cancellationToken);
        return YearView(year);
    }

    public async Task<PagedDeliveryPlanningResult<AcademicTermView>> ListTermsAsync(Guid academicYearId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (!await db.AcademicYears.AnyAsync(x => x.Id == academicYearId, cancellationToken)) throw Missing("AcademicYearMissing");
        (page, pageSize) = Page(page, pageSize);
        var query = db.AcademicTerms.AsNoTracking().Where(x => x.AcademicYearId == academicYearId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.StartDate).ThenBy(x => x.Code).ThenBy(x => x.Id);
        return new(await query.Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new AcademicTermView(x.Id, x.AcademicYearId, x.Code, x.StartDate, x.EndDate, x.SortOrder, x.IsActive)).ToArrayAsync(cancellationToken),
            page, pageSize, await query.CountAsync(cancellationToken));
    }

    public Task<AcademicTermView> CreateTermAsync(SaveAcademicTermCommand command, string actorId, CancellationToken cancellationToken = default) =>
        SaveTermAsync(null, command, actorId, cancellationToken);

    public Task<AcademicTermView> UpdateTermAsync(Guid id, SaveAcademicTermCommand command, string actorId, CancellationToken cancellationToken = default) =>
        SaveTermAsync(id, command, actorId, cancellationToken);

    private async Task<AcademicTermView> SaveTermAsync(Guid? id, SaveAcademicTermCommand command, string actorId, CancellationToken cancellationToken)
    {
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var year = await db.AcademicYears.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.AcademicYearId, cancellationToken) ?? throw Missing("AcademicYearMissing");
        var code = ValidCode(command.Code);
        ValidRange(command.StartDate, command.EndDate);
        if (command.SortOrder is < 0 or > 10_000) throw Invalid("InvalidSortOrder");
        if (command.StartDate < year.StartDate || command.EndDate > year.EndDate) throw Invalid("TermOutsideAcademicYear");
        if (command.IsActive && !year.IsActive) throw Invalid("ActiveAcademicYearRequired");
        if (await db.AcademicTerms.AnyAsync(x => x.AcademicYearId == year.Id && x.Code == code && x.Id != id, cancellationToken)) throw Invalid("DuplicateTermCode");
        if (command.IsActive && await db.AcademicTerms.AnyAsync(x => x.AcademicYearId == year.Id && x.Id != id && x.IsActive
            && x.StartDate <= command.EndDate && command.StartDate <= x.EndDate, cancellationToken)) throw Invalid("OverlappingActiveTerm");

        AcademicTerm term;
        if (id is null)
        {
            term = new AcademicTerm { AcademicYearId = year.Id, Code = code };
            StampActor(term, actorId, true);
            db.AcademicTerms.Add(term);
        }
        else
        {
            term = await db.AcademicTerms.SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw Missing("AcademicTermMissing");
            if (term.AcademicYearId != command.AcademicYearId) throw Invalid("AcademicTermYearImmutable");
            if (!command.IsActive && term.IsActive && await db.DeliveryPlanEntries.AnyAsync(x => x.AcademicTermId == term.Id && x.DeliveryPlan!.IsActive, cancellationToken))
                throw Invalid("AcademicTermHasActiveDeliveryPlanEntry");
            StampActor(term, actorId, false);
        }
        term.Code = code;
        term.StartDate = command.StartDate;
        term.EndDate = command.EndDate;
        term.SortOrder = command.SortOrder;
        term.IsActive = command.IsActive;
        Audit(actorId, id is null ? "AcademicTermCreated" : "AcademicTermUpdated", term,
            new { term.AcademicYearId, term.Code, term.StartDate, term.EndDate, term.SortOrder, term.IsActive });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return TermView(term);
    }

    public async Task<PagedDeliveryPlanningResult<DeliveryPlanningQualificationVersionView>> ListQualificationVersionsAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        (page, pageSize) = Page(page, pageSize);
        var query = db.QualificationVersions.AsNoTracking().OrderBy(x => x.Qualification!.Code).ThenBy(x => x.VersionCode).ThenBy(x => x.Id);
        return new(await query.Skip((page - 1) * pageSize).Take(pageSize).Select(x => new DeliveryPlanningQualificationVersionView(
            x.Id, x.Qualification!.Code, x.VersionCode, x.IsActive && x.Qualification.IsActive,
            x.Qualification.SpecializationId, x.Qualification.Specialization != null ? x.Qualification.Specialization.EnglishName : null,
            x.Qualification.Specialization != null ? x.Qualification.Specialization.ArabicName : null)).ToArrayAsync(cancellationToken),
            page, pageSize, await query.CountAsync(cancellationToken));
    }

    public async Task<PagedDeliveryPlanningResult<DeliveryPlanningUnitView>> ListUnitsAsync(Guid qualificationVersionId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (!await db.QualificationVersions.AnyAsync(x => x.Id == qualificationVersionId, cancellationToken)) throw Missing("QualificationVersionMissing");
        (page, pageSize) = Page(page, pageSize);
        var query = db.UnitDefinitions.AsNoTracking().Where(x => x.QualificationVersionId == qualificationVersionId)
            .OrderBy(x => x.Code).ThenBy(x => x.Id);
        return new(await query.Skip((page - 1) * pageSize).Take(pageSize).Select(x => new DeliveryPlanningUnitView(
            x.Id, x.Code, x.ArabicTitle, x.EnglishTitle, x.IsActive)).ToArrayAsync(cancellationToken),
            page, pageSize, await query.CountAsync(cancellationToken));
    }

    public async Task<PagedDeliveryPlanningResult<DeliveryPlanSummaryView>> ListPlansAsync(Guid? academicYearId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        (page, pageSize) = Page(page, pageSize);
        var query = db.DeliveryPlans.AsNoTracking().Where(x => academicYearId == null || x.AcademicYearId == academicYearId)
            .OrderByDescending(x => x.AcademicYear!.StartDate).ThenBy(x => x.QualificationVersion!.Qualification!.Code)
            .ThenBy(x => x.QualificationVersion!.VersionCode).ThenBy(x => x.Id);
        return new(await query.Skip((page - 1) * pageSize).Take(pageSize).Select(x => new DeliveryPlanSummaryView(
                x.Id, x.QualificationVersionId, x.QualificationVersion!.Qualification!.Code, x.QualificationVersion.VersionCode,
                x.AcademicYearId, x.AcademicYear!.Code, x.IsActive, x.Entries.Count,
                x.GradeId, x.Grade != null ? x.Grade.EnglishName : null, x.Grade != null ? x.Grade.ArabicName : null,
                x.QualificationVersion.Qualification.SpecializationId,
                x.QualificationVersion.Qualification.Specialization != null ? x.QualificationVersion.Qualification.Specialization.EnglishName : null,
                x.QualificationVersion.Qualification.Specialization != null ? x.QualificationVersion.Qualification.Specialization.ArabicName : null)).ToArrayAsync(cancellationToken),
            page, pageSize, await query.CountAsync(cancellationToken));
    }

    public async Task<DeliveryPlanView> GetPlanAsync(Guid id, CancellationToken cancellationToken = default) =>
        ToView(await PlanQuery().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw Missing("DeliveryPlanMissing"));

    public async Task<DeliveryPlanView> CreatePlanAsync(CreateDeliveryPlanCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var year = await db.AcademicYears.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.AcademicYearId && x.IsActive, cancellationToken)
            ?? throw Invalid("ActiveAcademicYearRequired");
        var version = await db.QualificationVersions.AsNoTracking().Include(x => x.Qualification)
            .SingleOrDefaultAsync(x => x.Id == command.QualificationVersionId && x.IsActive && x.Qualification!.IsActive, cancellationToken)
            ?? throw Invalid("ActiveQualificationVersionRequired");
        if (version.Qualification!.SpecializationId is not { } specializationId || command.GradeId is not { } gradeId)
            throw Invalid("GradeAndSpecializationRequired");
        var specialization = await db.Specializations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == specializationId && x.IsVisible, cancellationToken);
        if (specialization is null || !await db.Grades.AnyAsync(x => x.Id == gradeId && x.IsVisible
            && x.LearningTrackId == specialization.LearningTrackId && x.LearningTrack!.IsBtecFocused, cancellationToken))
            throw Invalid("GradeTrackMismatch");
        if (await db.DeliveryPlans.AnyAsync(x => x.AcademicYearId == year.Id && x.QualificationVersionId == version.Id && x.GradeId == gradeId, cancellationToken))
            throw Invalid("DuplicateDeliveryPlan");
        var plan = new DeliveryPlan { AcademicYearId = year.Id, QualificationVersionId = version.Id, GradeId = gradeId };
        StampActor(plan, actorId, true);
        db.DeliveryPlans.Add(plan);
        Audit(actorId, "DeliveryPlanCreated", plan, new { plan.AcademicYearId, plan.QualificationVersionId, plan.GradeId });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    public async Task<DeliveryPlanView> UpdatePlanAsync(Guid id, UpdateDeliveryPlanCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var plan = await db.DeliveryPlans.SingleOrDefaultAsync(x => x.Id == id, cancellationToken) ?? throw Missing("DeliveryPlanMissing");
        if (command.IsActive && !plan.IsActive)
        {
            if (plan.GradeId is not { } gradeId
                || !await db.QualificationVersions.AnyAsync(x => x.Id == plan.QualificationVersionId
                    && x.Qualification!.Specialization!.IsVisible
                    && x.Qualification.Specialization.LearningTrack!.IsBtecFocused
                    && db.Grades.Any(grade => grade.Id == gradeId && grade.IsVisible
                        && grade.LearningTrackId == x.Qualification.Specialization.LearningTrackId), cancellationToken))
                throw Invalid("GradeTrackMismatch");
            if (!await db.AcademicYears.AnyAsync(x => x.Id == plan.AcademicYearId && x.IsActive, cancellationToken))
                throw Invalid("ActiveAcademicYearRequired");
            if (!await db.QualificationVersions.AnyAsync(x => x.Id == plan.QualificationVersionId && x.IsActive && x.Qualification!.IsActive, cancellationToken))
                throw Invalid("ActiveQualificationVersionRequired");
            if (await db.DeliveryPlanEntries.AnyAsync(x => x.DeliveryPlanId == id
                && (!x.AcademicTerm!.IsActive || x.AcademicTerm.AcademicYearId != plan.AcademicYearId
                    || !x.UnitDefinition!.IsActive || x.UnitDefinition.QualificationVersionId != plan.QualificationVersionId), cancellationToken))
                throw Invalid("DeliveryPlanEntriesInvalid");
        }
        plan.IsActive = command.IsActive;
        StampActor(plan, actorId, false);
        Audit(actorId, "DeliveryPlanUpdated", plan, new { plan.IsActive });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    public async Task<DeliveryPlanView> AddEntryAsync(Guid planId, AddDeliveryPlanEntryCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var plan = await EditablePlanAsync(planId, cancellationToken);
        await ValidateEntryBindingsAsync(plan, command.UnitDefinitionId, command.AcademicTermId, cancellationToken);
        if (await db.DeliveryPlanEntries.AnyAsync(x => x.DeliveryPlanId == plan.Id && x.UnitDefinitionId == command.UnitDefinitionId, cancellationToken))
            throw Invalid("DuplicateUnitInDeliveryPlan");
        var nextOrder = await db.DeliveryPlanEntries.Where(x => x.DeliveryPlanId == plan.Id).Select(x => (int?)x.SortOrder).MaxAsync(cancellationToken) ?? 0;
        var entry = new DeliveryPlanEntry
        {
            DeliveryPlanId = plan.Id,
            UnitDefinitionId = command.UnitDefinitionId,
            AcademicTermId = command.AcademicTermId,
            SortOrder = nextOrder + 10
        };
        StampActor(entry, actorId, true);
        db.DeliveryPlanEntries.Add(entry);
        Audit(actorId, "DeliveryPlanEntryAdded", entry, new { entry.DeliveryPlanId, entry.UnitDefinitionId, entry.AcademicTermId, entry.SortOrder });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    public async Task<DeliveryPlanView> UpdateEntryAsync(Guid entryId, UpdateDeliveryPlanEntryCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var entry = await db.DeliveryPlanEntries.Include(x => x.DeliveryPlan).SingleOrDefaultAsync(x => x.Id == entryId, cancellationToken)
            ?? throw Missing("DeliveryPlanEntryMissing");
        var plan = entry.DeliveryPlan is { IsActive: true } ? entry.DeliveryPlan : throw Invalid("DeliveryPlanNotEditable");
        if (await db.CourseModules.AnyAsync(x => x.DeliveryPlanEntryId == entryId, cancellationToken))
            throw Invalid("DeliveryPlanEntryInUse");
        await ValidateEntryBindingsAsync(plan, entry.UnitDefinitionId, command.AcademicTermId, cancellationToken);
        entry.AcademicTermId = command.AcademicTermId;
        StampActor(entry, actorId, false);
        Audit(actorId, "DeliveryPlanEntryUpdated", entry, new { entry.AcademicTermId });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    public async Task<DeliveryPlanView> ReorderEntriesAsync(Guid planId, ReorderDeliveryPlanEntriesCommand command, string actorId, CancellationToken cancellationToken = default)
    {
        var plan = await EditablePlanAsync(planId, cancellationToken);
        if (await db.CourseModules.AnyAsync(x => x.Course!.DeliveryPlanId == planId, cancellationToken))
            throw Invalid("DeliveryPlanInUse");
        var entries = await db.DeliveryPlanEntries.Where(x => x.DeliveryPlanId == plan.Id).ToArrayAsync(cancellationToken);
        var ids = command.EntryIds ?? [];
        if (ids.Count != entries.Length || ids.Distinct().Count() != ids.Count || entries.Any(x => !ids.Contains(x.Id)))
            throw Invalid("InvalidDeliveryPlanOrder");
        var byId = entries.ToDictionary(x => x.Id);
        for (var index = 0; index < ids.Count; index++)
        {
            var entry = byId[ids[index]];
            entry.SortOrder = (index + 1) * 10;
            StampActor(entry, actorId, false);
        }
        Audit(actorId, "DeliveryPlanEntriesReordered", plan, new { EntryIds = ids });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    public async Task<DeliveryPlanView> RemoveEntryAsync(Guid entryId, string actorId, CancellationToken cancellationToken = default)
    {
        var entry = await db.DeliveryPlanEntries.Include(x => x.DeliveryPlan).SingleOrDefaultAsync(x => x.Id == entryId, cancellationToken)
            ?? throw Missing("DeliveryPlanEntryMissing");
        var plan = entry.DeliveryPlan is { IsActive: true } ? entry.DeliveryPlan : throw Invalid("DeliveryPlanNotEditable");
        if (await db.CourseModules.AnyAsync(x => x.DeliveryPlanEntryId == entryId, cancellationToken))
            throw Invalid("DeliveryPlanEntryInUse");
        db.DeliveryPlanEntries.Remove(entry);
        Audit(actorId, "DeliveryPlanEntryRemoved", entry, new { entry.DeliveryPlanId, entry.UnitDefinitionId, entry.AcademicTermId });
        await db.SaveChangesAsync(cancellationToken);
        return await GetPlanAsync(plan.Id, cancellationToken);
    }

    private async Task<DeliveryPlan> EditablePlanAsync(Guid id, CancellationToken cancellationToken) =>
        await db.DeliveryPlans.SingleOrDefaultAsync(x => x.Id == id && x.IsActive, cancellationToken) ?? throw Invalid("DeliveryPlanNotEditable");

    private async Task ValidateEntryBindingsAsync(DeliveryPlan plan, Guid unitId, Guid termId, CancellationToken cancellationToken)
    {
        if (!await db.UnitDefinitions.AnyAsync(x => x.Id == unitId && x.QualificationVersionId == plan.QualificationVersionId && x.IsActive, cancellationToken))
            throw Invalid("UnitOutsideQualificationVersion");
        if (!await db.AcademicTerms.AnyAsync(x => x.Id == termId && x.AcademicYearId == plan.AcademicYearId && x.IsActive, cancellationToken))
            throw Invalid("TermOutsideDeliveryPlanAcademicYear");
    }

    private IQueryable<DeliveryPlan> PlanQuery() => db.DeliveryPlans.AsNoTracking()
        .Include(x => x.AcademicYear)
        .Include(x => x.Grade)
        .Include(x => x.QualificationVersion).ThenInclude(x => x!.Qualification).ThenInclude(x => x!.Specialization)
        .Include(x => x.Entries).ThenInclude(x => x.UnitDefinition)
        .Include(x => x.Entries).ThenInclude(x => x.AcademicTerm)
        .AsSplitQuery();

    private static DeliveryPlanView ToView(DeliveryPlan plan) => new(SummaryView(plan), plan.Entries
        .OrderBy(x => x.SortOrder).ThenBy(x => x.AcademicTerm!.SortOrder).ThenBy(x => x.UnitDefinition!.Code).ThenBy(x => x.Id)
        .Select(x => new DeliveryPlanEntryView(x.Id, x.UnitDefinitionId, x.UnitDefinition!.Code, x.UnitDefinition.ArabicTitle,
            x.UnitDefinition.EnglishTitle, x.AcademicTermId, x.AcademicTerm!.Code, x.SortOrder)).ToArray());

    private static DeliveryPlanSummaryView SummaryView(DeliveryPlan plan) => new(plan.Id, plan.QualificationVersionId,
        plan.QualificationVersion!.Qualification!.Code, plan.QualificationVersion.VersionCode, plan.AcademicYearId,
        plan.AcademicYear!.Code, plan.IsActive, plan.Entries.Count,
        plan.GradeId, plan.Grade?.EnglishName, plan.Grade?.ArabicName,
        plan.QualificationVersion.Qualification.SpecializationId,
        plan.QualificationVersion.Qualification.Specialization?.EnglishName,
        plan.QualificationVersion.Qualification.Specialization?.ArabicName);
    private static AcademicYearView YearView(AcademicYear year) => new(year.Id, year.Code, year.StartDate, year.EndDate, year.IsActive);
    private static AcademicTermView TermView(AcademicTerm term) => new(term.Id, term.AcademicYearId, term.Code, term.StartDate, term.EndDate, term.SortOrder, term.IsActive);

    private static (int Page, int PageSize) Page(int page, int pageSize) => (Math.Max(1, page), Math.Clamp(pageSize, 1, 100));
    private static string ValidCode(string? value)
    {
        var code = value?.Trim().ToUpperInvariant() ?? string.Empty;
        if (code.Length is < 2 or > 64 || !CodePattern().IsMatch(code)) throw Invalid("InvalidCode");
        return code;
    }
    private static void ValidRange(DateOnly startDate, DateOnly endDate)
    {
        if (startDate >= endDate) throw Invalid("InvalidDateRange");
    }
    private static void StampActor(Entity entity, string actorId, bool created)
    {
        if (string.IsNullOrWhiteSpace(actorId)) throw Invalid("ActorRequired");
        if (created) entity.CreatedByUserId = actorId;
        entity.UpdatedByUserId = actorId;
    }
    private void Audit(string actorId, string action, Entity entity, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actorId,
        Action = action,
        EntityType = entity.GetType().Name,
        EntityId = entity.Id.ToString(),
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(metadata)
    });
    private static DeliveryPlanningException Invalid(string code) => new(code);
    private static DeliveryPlanningException Missing(string code) => new(code, true);

    [GeneratedRegex("^[A-Z0-9][A-Z0-9._/-]*$")]
    private static partial Regex CodePattern();
}
