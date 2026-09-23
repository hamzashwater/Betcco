using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class AcademicCatalogueService(BetccoDbContext db) : IAcademicCatalogueService
{
    public async Task<IReadOnlyList<AcademicVersionView>> ListVersionsAsync(CancellationToken cancellationToken) =>
        await db.QualificationVersions.AsNoTracking()
            .OrderBy(x => x.Qualification!.Code).ThenBy(x => x.VersionCode)
            .Select(x => new AcademicVersionView(x.Id, x.Qualification!.Code, x.VersionCode,
                x.IsActive && x.Qualification.IsActive, x.Qualification.ArabicName, x.Qualification.EnglishName)).ToListAsync(cancellationToken);

    public async Task<AcademicCatalogueView?> GetVersionAsync(Guid versionId, CancellationToken cancellationToken)
    {
        var version = await db.QualificationVersions.AsNoTracking()
            .Include(x => x.Qualification)
            .Include(x => x.UnitDefinitions).ThenInclude(x => x.LearningAims).ThenInclude(x => x.Criteria)
            .Include(x => x.UnitDefinitions).ThenInclude(x => x.AssessmentDefinitions).ThenInclude(x => x.AimMappings)
            .Include(x => x.UnitDefinitions).ThenInclude(x => x.AssessmentDefinitions).ThenInclude(x => x.CriterionMappings)
            .Include(x => x.UnitDefinitions).ThenInclude(x => x.AssessmentDefinitions).ThenInclude(x => x.Scopes)
            .AsSplitQuery().SingleOrDefaultAsync(x => x.Id == versionId, cancellationToken);
        if (version is null || version.Qualification is null) return null;

        var scopeIds = version.UnitDefinitions.SelectMany(x => x.AssessmentDefinitions).SelectMany(x => x.Scopes).ToArray();
        var gradeIds = scopeIds.Select(x => x.GradeId).Distinct().ToArray();
        var specializationIds = scopeIds.Select(x => x.SpecializationId).Distinct().ToArray();
        var rubricIds = scopeIds.Select(x => x.RubricTemplateId).Distinct().ToArray();
        var grades = await db.Grades.AsNoTracking().Where(x => gradeIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var specializations = await db.Specializations.AsNoTracking().Where(x => specializationIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var rubrics = await db.RubricTemplates.AsNoTracking().Include(x => x.Criteria)
            .Where(x => rubricIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);

        var units = version.UnitDefinitions.OrderBy(x => x.Code).Select(unit =>
        {
            var aims = unit.LearningAims.OrderBy(x => x.SortOrder).ThenBy(x => x.Code).Select(aim =>
                new AcademicAimView(aim.Id, aim.Code, aim.ArabicTitle, aim.EnglishTitle, aim.ArabicDescription,
                    aim.EnglishDescription, aim.SourceReference, aim.SortOrder,
                    aim.Criteria.OrderBy(x => x.SortOrder).ThenBy(x => x.Code).Select(criterion =>
                        new AcademicCriterionView(criterion.Id, criterion.Code, criterion.Band.ToString(), criterion.ArabicDescription,
                            criterion.EnglishDescription, criterion.SourceReference, criterion.SortOrder)).ToArray())).ToArray();
            var criteria = unit.LearningAims.SelectMany(x => x.Criteria).ToDictionary(x => x.Id);
            var definitions = unit.AssessmentDefinitions.OrderBy(x => x.Code).ThenBy(x => x.Version).Select(definition =>
            {
                var issues = DefinitionIssues(version, unit, definition, criteria);
                var selectedCodes = definition.CriterionMappings.Where(x => criteria.ContainsKey(x.AssessmentCriterionDefinitionId))
                    .Select(x => criteria[x.AssessmentCriterionDefinitionId].Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
                var scopes = definition.Scopes.OrderBy(x => x.Version).Select(scope =>
                {
                    grades.TryGetValue(scope.GradeId, out var grade);
                    specializations.TryGetValue(scope.SpecializationId, out var specialization);
                    rubrics.TryGetValue(scope.RubricTemplateId, out var rubric);
                    var scopeIssues = ScopeIssues(version, definition, scope, rubric, selectedCodes, issues);
                    return new AcademicScopeView(scope.Id, scope.Version, scope.GradeId, grade?.ArabicName ?? "", grade?.EnglishName ?? "",
                        scope.SpecializationId, specialization?.ArabicName ?? "", specialization?.EnglishName ?? "",
                        scope.RubricTemplateId, rubric?.ArabicTitle ?? "", rubric?.EnglishTitle ?? "", scope.IsActive,
                        scope.PublishedAtUtc, scopeIssues, scope.IsRetakeOnly);
                }).ToArray();
                return new AcademicDefinitionView(definition.Id, definition.Code, definition.Version, definition.ArabicTitle,
                    definition.EnglishTitle, definition.SourceReference, definition.IsActive, definition.PublishedAtUtc,
                    definition.AimMappings.Select(x => x.LearningAimDefinitionId).ToArray(),
                    definition.CriterionMappings.Select(x => x.AssessmentCriterionDefinitionId).ToArray(), issues, scopes);
            }).ToArray();
            return new AcademicUnitView(unit.Id, unit.Code, unit.ArabicTitle, unit.EnglishTitle, unit.SourceReference,
                unit.IsActive, aims, definitions, unit.Source.ToString(),
                unit.Source == AcademicSource.PearsonOfficial ? "BetccoLocalized" : unit.Source.ToString());
        }).ToArray();
        return new AcademicCatalogueView(new AcademicVersionView(version.Id, version.Qualification.Code, version.VersionCode,
            version.IsActive && version.Qualification.IsActive, version.Qualification.ArabicName,
            version.Qualification.EnglishName), units);
    }

    public async Task<Guid> SaveUnitAsync(Guid? id, SaveAcademicUnit command, string actorId, CancellationToken cancellationToken)
    {
        var code = Code(command.Code);
        var arabicTitle = Text(command.ArabicTitle, 256);
        var englishTitle = Text(command.EnglishTitle, 256);
        var source = OptionalText(command.SourceReference, 2_048);
        var version = await db.QualificationVersions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == command.QualificationVersionId, cancellationToken);
        if (version is null) throw new AcademicCatalogueException("QualificationVersionMissing");
        if (id is null && version.Source == AcademicSource.PearsonOfficial)
            throw new AcademicCatalogueException("OfficialVersionImmutable");
        var unit = id is null ? null : await db.UnitDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (id is not null && unit is null) throw new AcademicCatalogueException("UnitMissing");
        if (unit is not null && (unit.Source == AcademicSource.PearsonOfficial || unit.PublishedAtUtc is not null || unit.QualificationVersionId != command.QualificationVersionId))
            throw new AcademicCatalogueException("PublishedImmutable");
        if (await db.UnitDefinitions.AnyAsync(x => x.QualificationVersionId == command.QualificationVersionId && x.Code == code && x.Id != id, cancellationToken))
            throw new AcademicCatalogueException("DuplicateCode");
        unit ??= new UnitDefinition
        {
            QualificationVersionId = command.QualificationVersionId,
            Code = code,
            ArabicTitle = arabicTitle,
            EnglishTitle = englishTitle,
            Source = AcademicSource.AdminCustom
        };
        unit.Code = code;
        unit.ArabicTitle = arabicTitle;
        unit.EnglishTitle = englishTitle;
        unit.SourceReference = source;
        if (id is null) db.UnitDefinitions.Add(unit);
        await SaveAsync(actorId, id is null ? "AcademicUnitCreated" : "AcademicUnitUpdated", unit, cancellationToken);
        return unit.Id;
    }

    public async Task<Guid> SaveAimAsync(Guid? id, SaveAcademicAim command, string actorId, CancellationToken cancellationToken)
    {
        var code = Code(command.Code);
        var unit = await EditableUnit(command.UnitDefinitionId, cancellationToken);
        var aim = id is null ? null : await db.LearningAimDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (id is not null && aim is null) throw new AcademicCatalogueException("LearningAimMissing");
        if (aim is not null && aim.UnitDefinitionId != unit.Id) throw new AcademicCatalogueException("ParentImmutable");
        if (await db.LearningAimDefinitions.AnyAsync(x => x.UnitDefinitionId == unit.Id && x.Code == code && x.Id != id, cancellationToken))
            throw new AcademicCatalogueException("DuplicateCode");
        aim ??= new LearningAimDefinition
        {
            UnitDefinitionId = unit.Id,
            Code = code,
            ArabicTitle = "",
            EnglishTitle = "",
            ArabicDescription = "",
            EnglishDescription = "",
            SourceReference = ""
        };
        aim.Code = code;
        aim.ArabicTitle = Text(command.ArabicTitle, 256);
        aim.EnglishTitle = Text(command.EnglishTitle, 256);
        aim.ArabicDescription = Text(command.ArabicDescription, 4_000);
        aim.EnglishDescription = Text(command.EnglishDescription, 4_000);
        aim.SourceReference = OptionalText(command.SourceReference, 2_048) ?? "";
        aim.SortOrder = Order(command.SortOrder);
        if (id is null) db.LearningAimDefinitions.Add(aim);
        await SaveAsync(actorId, id is null ? "LearningAimCreated" : "LearningAimUpdated", aim, cancellationToken);
        return aim.Id;
    }

    public async Task<Guid> SaveCriterionAsync(Guid? id, SaveAcademicCriterion command, string actorId, CancellationToken cancellationToken)
    {
        var aim = await db.LearningAimDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.LearningAimDefinitionId, cancellationToken)
            ?? throw new AcademicCatalogueException("LearningAimMissing");
        await EditableUnit(aim.UnitDefinitionId, cancellationToken);
        if (!Enum.IsDefined(command.Band)) throw new AcademicCatalogueException("InvalidBand");
        var code = Code(command.Code);
        var criterion = id is null ? null : await db.AssessmentCriterionDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (id is not null && criterion is null) throw new AcademicCatalogueException("CriterionMissing");
        if (criterion is not null && criterion.LearningAimDefinitionId != aim.Id) throw new AcademicCatalogueException("ParentImmutable");
        if (await db.AssessmentCriterionDefinitions.AnyAsync(x => x.LearningAimDefinitionId == aim.Id && x.Code == code && x.Id != id, cancellationToken))
            throw new AcademicCatalogueException("DuplicateCode");
        criterion ??= new AssessmentCriterionDefinition
        {
            LearningAimDefinitionId = aim.Id,
            Code = code,
            ArabicDescription = "",
            EnglishDescription = "",
            SourceReference = ""
        };
        criterion.Code = code;
        criterion.Band = command.Band;
        criterion.ArabicDescription = Text(command.ArabicDescription, 4_000);
        criterion.EnglishDescription = Text(command.EnglishDescription, 4_000);
        criterion.SourceReference = OptionalText(command.SourceReference, 2_048) ?? "";
        criterion.SortOrder = Order(command.SortOrder);
        if (id is null) db.AssessmentCriterionDefinitions.Add(criterion);
        await SaveAsync(actorId, id is null ? "AssessmentCriterionCreated" : "AssessmentCriterionUpdated", criterion, cancellationToken);
        return criterion.Id;
    }

    public async Task<Guid> SaveDefinitionAsync(Guid? id, SaveAcademicDefinition command, string actorId, CancellationToken cancellationToken)
    {
        var unit = await db.UnitDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.UnitDefinitionId, cancellationToken)
            ?? throw new AcademicCatalogueException("UnitMissing");
        var code = Code(command.Code);
        if (command.Version < 1) throw new AcademicCatalogueException("InvalidVersion");
        var definition = id is null ? null : await db.AssessmentDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (id is not null && definition is null) throw new AcademicCatalogueException("DefinitionMissing");
        if (definition is not null && (definition.PublishedAtUtc is not null || definition.UnitDefinitionId != unit.Id))
            throw new AcademicCatalogueException("PublishedImmutable");
        if (await db.AssessmentDefinitions.AnyAsync(x => x.UnitDefinitionId == unit.Id && x.Code == code && x.Version == command.Version && x.Id != id, cancellationToken))
            throw new AcademicCatalogueException("DuplicateCode");
        definition ??= new AssessmentDefinition { UnitDefinitionId = unit.Id, Code = code, ArabicTitle = "", EnglishTitle = "" };
        definition.Code = code;
        definition.Version = command.Version;
        definition.ArabicTitle = Text(command.ArabicTitle, 256);
        definition.EnglishTitle = Text(command.EnglishTitle, 256);
        definition.SourceReference = OptionalText(command.SourceReference, 2_048);
        if (id is null) db.AssessmentDefinitions.Add(definition);
        await SaveAsync(actorId, id is null ? "AssessmentDefinitionCreated" : "AssessmentDefinitionUpdated", definition, cancellationToken);
        return definition.Id;
    }

    public async Task SetMappingsAsync(Guid definitionId, SaveAcademicMappings command, string actorId, CancellationToken cancellationToken)
    {
        var definition = await db.AssessmentDefinitions.SingleOrDefaultAsync(x => x.Id == definitionId, cancellationToken)
            ?? throw new AcademicCatalogueException("DefinitionMissing");
        if (definition.PublishedAtUtc is not null) throw new AcademicCatalogueException("PublishedImmutable");
        var aimIds = command.AimIds ?? [];
        var criterionIds = command.CriterionIds ?? [];
        if (aimIds.Count == 0 || criterionIds.Count == 0) throw new AcademicCatalogueException("MissingMappings");
        if (aimIds.Distinct().Count() != aimIds.Count || criterionIds.Distinct().Count() != criterionIds.Count)
            throw new AcademicCatalogueException("DuplicateMapping");
        var aims = await db.LearningAimDefinitions.AsNoTracking().Where(x => aimIds.Contains(x.Id)).ToArrayAsync(cancellationToken);
        var criteria = await db.AssessmentCriterionDefinitions.AsNoTracking().Where(x => criterionIds.Contains(x.Id)).ToArrayAsync(cancellationToken);
        if (aims.Length != aimIds.Count || aims.Any(x => x.UnitDefinitionId != definition.UnitDefinitionId))
            throw new AcademicCatalogueException("CrossUnitAim");
        if (criteria.Length != criterionIds.Count || criteria.Any(x => !aimIds.Contains(x.LearningAimDefinitionId)))
            throw new AcademicCatalogueException("CriterionAimMismatch");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.AssessmentDefinitionCriteria.Where(x => x.AssessmentDefinitionId == definitionId).ExecuteDeleteAsync(cancellationToken);
        await db.AssessmentDefinitionAims.Where(x => x.AssessmentDefinitionId == definitionId).ExecuteDeleteAsync(cancellationToken);
        db.AssessmentDefinitionAims.AddRange(aims.Select(x => new AssessmentDefinitionAim
        {
            AssessmentDefinitionId = definitionId,
            UnitDefinitionId = definition.UnitDefinitionId,
            LearningAimDefinitionId = x.Id
        }));
        db.AssessmentDefinitionCriteria.AddRange(criteria.Select(x => new AssessmentDefinitionCriterion
        {
            AssessmentDefinitionId = definitionId,
            LearningAimDefinitionId = x.LearningAimDefinitionId,
            AssessmentCriterionDefinitionId = x.Id
        }));
        await SaveAsync(actorId, "AssessmentMappingsUpdated", definition, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<Guid> SaveScopeAsync(Guid? id, SaveAcademicScope command, string actorId, CancellationToken cancellationToken)
    {
        if (command.Version < 1) throw new AcademicCatalogueException("InvalidVersion");
        if (!await db.AssessmentDefinitions.AnyAsync(x => x.Id == command.AssessmentDefinitionId, cancellationToken))
            throw new AcademicCatalogueException("DefinitionMissing");
        if (!await db.Grades.AnyAsync(x => x.Id == command.GradeId, cancellationToken)
            || !await db.Specializations.AnyAsync(x => x.Id == command.SpecializationId, cancellationToken)
            || !await db.RubricTemplates.AnyAsync(x => x.Id == command.RubricTemplateId, cancellationToken))
            throw new AcademicCatalogueException("ScopeBindingMissing");
        var scope = id is null ? null : await db.AssessmentScopes.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (id is not null && scope is null) throw new AcademicCatalogueException("ScopeMissing");
        if (scope is not null && scope.PublishedAtUtc is not null) throw new AcademicCatalogueException("PublishedImmutable");
        if (scope is not null && scope.AssessmentDefinitionId != command.AssessmentDefinitionId)
            throw new AcademicCatalogueException("ParentImmutable");
        if (await db.AssessmentScopes.AnyAsync(x => x.AssessmentDefinitionId == command.AssessmentDefinitionId
            && x.GradeId == command.GradeId && x.SpecializationId == command.SpecializationId && x.Version == command.Version && x.Id != id,
            cancellationToken)) throw new AcademicCatalogueException("DuplicateScope");
        scope ??= new AssessmentScope { AssessmentDefinitionId = command.AssessmentDefinitionId };
        scope.GradeId = command.GradeId;
        scope.SpecializationId = command.SpecializationId;
        scope.RubricTemplateId = command.RubricTemplateId;
        scope.Version = command.Version;
        scope.IsRetakeOnly = command.IsRetakeOnly;
        if (id is null) db.AssessmentScopes.Add(scope);
        await SaveAsync(actorId, id is null ? "AssessmentScopeCreated" : "AssessmentScopeUpdated", scope, cancellationToken);
        return scope.Id;
    }

    public async Task<IReadOnlyList<string>> ValidateDefinitionAsync(Guid id, CancellationToken cancellationToken)
    {
        var definition = await db.AssessmentDefinitions.AsNoTracking()
            .Include(x => x.UnitDefinition).ThenInclude(x => x!.QualificationVersion).ThenInclude(x => x!.Qualification)
            .Include(x => x.UnitDefinition).ThenInclude(x => x!.LearningAims).ThenInclude(x => x.Criteria)
            .Include(x => x.AimMappings).Include(x => x.CriterionMappings).AsSplitQuery()
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AcademicCatalogueException("DefinitionMissing");
        var unit = definition.UnitDefinition!;
        return DefinitionIssues(unit.QualificationVersion!, unit, definition,
            unit.LearningAims.SelectMany(x => x.Criteria).ToDictionary(x => x.Id));
    }

    public async Task<IReadOnlyList<string>> ValidateScopeAsync(Guid id, CancellationToken cancellationToken)
    {
        var scope = await db.AssessmentScopes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AcademicCatalogueException("ScopeMissing");
        var definition = await db.AssessmentDefinitions.AsNoTracking()
            .Include(x => x.UnitDefinition).ThenInclude(x => x!.QualificationVersion).ThenInclude(x => x!.Qualification)
            .Include(x => x.UnitDefinition).ThenInclude(x => x!.LearningAims).ThenInclude(x => x.Criteria)
            .Include(x => x.AimMappings).Include(x => x.CriterionMappings).AsSplitQuery()
            .SingleAsync(x => x.Id == scope.AssessmentDefinitionId, cancellationToken);
        var unit = definition.UnitDefinition!;
        var criteria = unit.LearningAims.SelectMany(x => x.Criteria).ToDictionary(x => x.Id);
        var definitionIssues = DefinitionIssues(unit.QualificationVersion!, unit, definition, criteria);
        var selectedCodes = definition.CriterionMappings.Where(x => criteria.ContainsKey(x.AssessmentCriterionDefinitionId))
            .Select(x => criteria[x.AssessmentCriterionDefinitionId].Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var rubric = await db.RubricTemplates.AsNoTracking().Include(x => x.Criteria)
            .SingleOrDefaultAsync(x => x.Id == scope.RubricTemplateId, cancellationToken);
        return ScopeIssues(unit.QualificationVersion!, definition, scope, rubric, selectedCodes, definitionIssues);
    }

    public async Task PublishDefinitionAsync(Guid id, string actorId, CancellationToken cancellationToken)
    {
        var issues = await ValidateDefinitionAsync(id, cancellationToken);
        if (issues.Count > 0) throw new AcademicCatalogueException(string.Join(",", issues));
        var definition = await db.AssessmentDefinitions.SingleAsync(x => x.Id == id, cancellationToken);
        if (definition.PublishedAtUtc is not null) throw new AcademicCatalogueException("PublishedImmutable");
        var unit = await db.UnitDefinitions.SingleAsync(x => x.Id == definition.UnitDefinitionId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        unit.PublishedAtUtc ??= now;
        unit.IsActive = true;
        definition.PublishedAtUtc = now;
        definition.IsActive = true;
        await SaveAsync(actorId, "AssessmentDefinitionPublished", definition, cancellationToken);
    }

    public async Task ActivateScopeAsync(Guid id, string actorId, CancellationToken cancellationToken)
    {
        var issues = await ValidateScopeAsync(id, cancellationToken);
        if (issues.Count > 0) throw new AcademicCatalogueException(string.Join(",", issues));
        var scope = await db.AssessmentScopes.SingleAsync(x => x.Id == id, cancellationToken);
        if (scope.PublishedAtUtc is not null) throw new AcademicCatalogueException("PublishedImmutable");
        scope.PublishedAtUtc = DateTimeOffset.UtcNow;
        scope.IsActive = true;
        await SaveAsync(actorId, "AssessmentScopeActivated", scope, cancellationToken);
    }

    private async Task<UnitDefinition> EditableUnit(Guid id, CancellationToken cancellationToken)
    {
        var unit = await db.UnitDefinitions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AcademicCatalogueException("UnitMissing");
        if (unit.Source == AcademicSource.PearsonOfficial || unit.PublishedAtUtc is not null) throw new AcademicCatalogueException("PublishedImmutable");
        return unit;
    }

    internal static string[] DefinitionIssues(QualificationVersion version, UnitDefinition unit,
        AssessmentDefinition definition, IReadOnlyDictionary<Guid, AssessmentCriterionDefinition> criteria)
    {
        var issues = new List<string>();
        if (!version.IsActive || version.Qualification?.IsActive != true || unit.QualificationVersionId != version.Id)
            issues.Add("InactiveQualificationVersion");
        if (string.IsNullOrWhiteSpace(version.SourceReference) || string.IsNullOrWhiteSpace(unit.SourceReference)
            || string.IsNullOrWhiteSpace(definition.SourceReference)) issues.Add("MissingSource");
        if (definition.AimMappings.Count == 0) issues.Add("MissingAims");
        if (definition.CriterionMappings.Count == 0) issues.Add("MissingCriteria");
        var aimIds = unit.LearningAims.Select(x => x.Id).ToHashSet();
        var selectedAims = definition.AimMappings.Select(x => x.LearningAimDefinitionId).ToHashSet();
        if (definition.AimMappings.Any(x => x.UnitDefinitionId != unit.Id || !aimIds.Contains(x.LearningAimDefinitionId))
            || definition.CriterionMappings.Any(x => !criteria.TryGetValue(x.AssessmentCriterionDefinitionId, out var criterion)
                || criterion.LearningAimDefinitionId != x.LearningAimDefinitionId || !selectedAims.Contains(x.LearningAimDefinitionId)))
            issues.Add("InvalidMapping");
        if (unit.LearningAims.Where(x => selectedAims.Contains(x.Id)).Any(x => string.IsNullOrWhiteSpace(x.SourceReference))
            || definition.CriterionMappings.Any(x => criteria.TryGetValue(x.AssessmentCriterionDefinitionId, out var criterion)
                && string.IsNullOrWhiteSpace(criterion.SourceReference))) issues.Add("MissingSource");
        var codes = definition.CriterionMappings.Where(x => criteria.ContainsKey(x.AssessmentCriterionDefinitionId))
            .Select(x => criteria[x.AssessmentCriterionDefinitionId].Code).ToArray();
        if (codes.Distinct(StringComparer.OrdinalIgnoreCase).Count() != codes.Length) issues.Add("DuplicateCriterionCode");
        return issues.Distinct().ToArray();
    }

    internal static string[] ScopeIssues(QualificationVersion version, AssessmentDefinition definition, AssessmentScope scope,
        RubricTemplate? rubric, IReadOnlySet<string> selectedCodes, IReadOnlyList<string> definitionIssues)
    {
        var issues = new List<string>(definitionIssues);
        if (!definition.IsActive || definition.PublishedAtUtc is null) issues.Add("Draft");
        if (rubric is null || !rubric.IsActive || rubric.QualificationVersionId is null
            || rubric.QualificationVersionId != version.Id) issues.Add("RubricMismatch");
        if (rubric is not null && (rubric.Criteria.Count == 0 || rubric.Criteria.Any(x => !selectedCodes.Contains(x.Code))))
            issues.Add("RubricCriteriaMismatch");
        return issues.Distinct().ToArray();
    }

    private async Task SaveAsync(string actorId, string action, Entity entity, CancellationToken cancellationToken)
    {
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorId,
            Action = action,
            EntityType = entity.GetType().Name,
            EntityId = entity.Id.ToString(),
            Outcome = "Success",
            MetadataJson = JsonSerializer.Serialize(new { entity.Id })
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string Code(string? value)
    {
        var code = value?.Trim().ToUpperInvariant() ?? "";
        if (code.Length is < 1 or > 64 || code.Any(c => !char.IsAsciiLetterUpper(c) && !char.IsAsciiDigit(c) && c is not '.' and not '-' and not '_'))
            throw new AcademicCatalogueException("InvalidCode");
        return code;
    }

    private static string Text(string? value, int max)
    {
        var text = value?.Trim() ?? "";
        if (text.Length is < 1 || text.Length > max) throw new AcademicCatalogueException("InvalidText");
        return text;
    }

    private static string? OptionalText(string? value, int max)
    {
        var text = value?.Trim();
        if (text?.Length > max) throw new AcademicCatalogueException("InvalidSource");
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static int Order(int value)
    {
        if (value < 0 || value > 10_000) throw new AcademicCatalogueException("InvalidOrder");
        return value;
    }
}
