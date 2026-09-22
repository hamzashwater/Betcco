using System.Data;
using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class ScopedAssessmentService(BetccoDbContext db) : IScopedAssessmentService
{
    public async Task<IReadOnlyList<AssessmentScopeOption>> ListOptionsAsync(CancellationToken cancellationToken)
    {
        var scopes = await LoadScopes(null, cancellationToken);
        var bindings = await LoadBindings(scopes, cancellationToken);
        return scopes.Select(scope => Resolve(scope, bindings))
            .Where(x => x is not null)
            .Select(x => x!.Option)
            .OrderBy(x => x.QualificationCode).ThenBy(x => x.QualificationVersionCode)
            .ThenBy(x => x.GradeEnglishName).ThenBy(x => x.SpecializationEnglishName)
            .ThenBy(x => x.UnitCode).ThenBy(x => x.AssessmentCode).ThenBy(x => x.AssessmentVersion)
            .ThenBy(x => x.ScopeVersion).ToArray();
    }

    public async Task<EvaluationView?> CreateAsync(string studentUserId, ScopedEvaluationCommand command, CancellationToken cancellationToken)
    {
        if (command.AssessmentScopeId == Guid.Empty || string.IsNullOrWhiteSpace(studentUserId)
            || command.StudentComment?.Trim().Length > 1_000) return null;
        // A single consistent catalogue reading and a single SaveChanges keep the
        // request, all snapshots, and its first academic/operational audit atomic.
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var scopes = await LoadScopes(command.AssessmentScopeId, cancellationToken);
        var bindings = await LoadBindings(scopes, cancellationToken);
        var resolved = scopes.Select(scope => Resolve(scope, bindings)).SingleOrDefault();
        if (resolved is null) return null;

        var scope = resolved.Scope;
        var rubric = resolved.Rubric;
        var version = scope.AssessmentDefinition!.UnitDefinition!.QualificationVersion!;
        var ruleSet = resolved.RuleSet;
        var codes = resolved.RubricCodes;
        var snapshot = resolved.Snapshot;
        var request = new EvaluationRequest
        {
            StudentUserId = studentUserId,
            GradeId = scope.GradeId,
            SpecializationId = scope.SpecializationId,
            TaskTypeId = rubric.TaskTypeId!.Value,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            QualificationVersionSnapshotJson = JsonSerializer.Serialize(new
            {
                qualificationCode = version.Qualification!.Code,
                version.VersionCode,
                version.SourceReference,
                version.EffectiveFromUtc,
                version.EffectiveUntilUtc
            }),
            AssessmentScopeId = scope.Id,
            AssessmentScopeSnapshotJson = JsonSerializer.Serialize(snapshot),
            CriteriaSnapshotJson = JsonSerializer.Serialize(codes),
            AssessmentRuleSetVersion = ruleSet.Version,
            AssessmentRuleSetSnapshotJson = JsonSerializer.Serialize(ruleSet),
            Price = 5m,
            StudentComment = command.StudentComment?.Trim()
        };
        db.EvaluationRequests.Add(request);
        db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            EvaluationRequestId = request.Id,
            ActorUserId = studentUserId,
            EventType = "DraftCreated",
            ToStatus = request.Status.ToString(),
            AttemptNumber = request.SubmissionAttemptNumber
        });
        db.AuditLogs.Add(new Betcco.Domain.Platform.AuditLog
        {
            ActorUserId = studentUserId,
            Action = "EvaluationDraftCreated",
            EntityType = nameof(EvaluationRequest),
            EntityId = request.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return new EvaluationView(request.Id, request.Status.ToString(), request.Price, request.Currency,
            request.StudentComment, codes, snapshot.Summary());
    }

    private async Task<AssessmentScope[]> LoadScopes(Guid? id, CancellationToken cancellationToken) =>
        await db.AssessmentScopes.AsNoTracking()
            .Where(x => x.IsActive && x.PublishedAtUtc != null && (id == null || x.Id == id))
            .Include(x => x.AssessmentDefinition).ThenInclude(x => x!.UnitDefinition).ThenInclude(x => x!.QualificationVersion).ThenInclude(x => x!.Qualification)
            .Include(x => x.AssessmentDefinition).ThenInclude(x => x!.UnitDefinition).ThenInclude(x => x!.LearningAims).ThenInclude(x => x.Criteria)
            .Include(x => x.AssessmentDefinition).ThenInclude(x => x!.AimMappings)
            .Include(x => x.AssessmentDefinition).ThenInclude(x => x!.CriterionMappings)
            .AsSplitQuery().ToArrayAsync(cancellationToken);

    private async Task<Bindings> LoadBindings(AssessmentScope[] scopes, CancellationToken cancellationToken)
    {
        var gradeIds = scopes.Select(x => x.GradeId).Distinct().ToArray();
        var specializationIds = scopes.Select(x => x.SpecializationId).Distinct().ToArray();
        var rubricIds = scopes.Select(x => x.RubricTemplateId).Distinct().ToArray();
        var grades = await db.Grades.AsNoTracking().Where(x => gradeIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var specializations = await db.Specializations.AsNoTracking().Where(x => specializationIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var rubrics = await db.RubricTemplates.AsNoTracking().Include(x => x.Criteria)
            .Where(x => rubricIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var taskIds = rubrics.Values.Where(x => x.TaskTypeId.HasValue).Select(x => x.TaskTypeId!.Value).Distinct().ToArray();
        var activeTasks = await db.TaskTypes.AsNoTracking().Where(x => taskIds.Contains(x.Id) && x.IsActive)
            .Select(x => x.Id).ToArrayAsync(cancellationToken);
        return new Bindings(grades, specializations, rubrics, activeTasks.ToHashSet());
    }

    private static Resolved? Resolve(AssessmentScope scope, Bindings bindings)
    {
        var definition = scope.AssessmentDefinition;
        var unit = definition?.UnitDefinition;
        var version = unit?.QualificationVersion;
        var qualification = version?.Qualification;
        if (definition is null || unit is null || version is null || qualification is null
            || !unit.IsActive || unit.PublishedAtUtc is null || !definition.IsActive || definition.PublishedAtUtc is null
            || !version.IsActive || !qualification.IsActive || !scope.IsActive || scope.PublishedAtUtc is null
            || !bindings.Grades.TryGetValue(scope.GradeId, out var grade) || !grade.IsVisible
            || !bindings.Specializations.TryGetValue(scope.SpecializationId, out var specialization) || !specialization.IsVisible
            || grade.LearningTrackId != specialization.LearningTrackId
            || !bindings.Rubrics.TryGetValue(scope.RubricTemplateId, out var rubric)
            || !rubric.IsActive || rubric.TaskTypeId is null || !bindings.ActiveTasks.Contains(rubric.TaskTypeId.Value)
            || rubric.GradeId is not null && rubric.GradeId != scope.GradeId
            || rubric.SpecializationId is not null && rubric.SpecializationId != scope.SpecializationId) return null;

        var allCriteria = unit.LearningAims.SelectMany(x => x.Criteria).ToArray();
        if (allCriteria.Select(x => x.Id).Distinct().Count() != allCriteria.Length) return null;
        var byId = allCriteria.ToDictionary(x => x.Id);
        var issues = AcademicCatalogueService.DefinitionIssues(version, unit, definition, byId);
        var selectedCodes = definition.CriterionMappings.Where(x => byId.ContainsKey(x.AssessmentCriterionDefinitionId))
            .Select(x => byId[x.AssessmentCriterionDefinitionId].Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (AcademicCatalogueService.ScopeIssues(version, definition, scope, rubric, selectedCodes, issues).Length != 0) return null;
        var rubricCodes = rubric.Criteria.OrderBy(x => x.SortOrder).ThenBy(x => x.Code).Select(x => x.Code).ToArray();
        if (rubricCodes.Distinct(StringComparer.OrdinalIgnoreCase).Count() != rubricCodes.Length) return null;
        var configured = string.IsNullOrWhiteSpace(rubric.AssessmentRuleSetJson)
            ? BtecAssessmentRuleSet.DefaultJson : rubric.AssessmentRuleSetJson;
        if (!BtecAssessmentRuleSet.TryRead(configured, out var ruleSet) || !ruleSet.HasValidPlan(rubricCodes)) return null;

        var aims = unit.LearningAims.Where(x => definition.AimMappings.Any(m => m.LearningAimDefinitionId == x.Id))
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Code).ToArray();
        var aimById = aims.ToDictionary(x => x.Id);
        var criteria = definition.CriterionMappings.Select(x => byId[x.AssessmentCriterionDefinitionId])
            .OrderBy(x => aimById[x.LearningAimDefinitionId].SortOrder)
            .ThenBy(x => aimById[x.LearningAimDefinitionId].Code)
            .ThenBy(x => x.SortOrder).ThenBy(x => x.Code).ToArray();
        var snapshot = new AssessmentScopeSnapshot(AssessmentScopeSnapshot.Version,
            new(qualification.Code, qualification.ArabicName, qualification.EnglishName, version.VersionCode,
                version.SourceReference, version.EffectiveFromUtc, version.EffectiveUntilUtc),
            new(unit.Code, unit.ArabicTitle, unit.EnglishTitle, unit.SourceReference),
            new(definition.Code, definition.Version, definition.ArabicTitle, definition.EnglishTitle,
                definition.SourceReference, definition.PublishedAtUtc),
            new(scope.Version, scope.PublishedAtUtc, grade.Slug, grade.ArabicName, grade.EnglishName,
                specialization.Slug, specialization.ArabicName, specialization.EnglishName),
            aims.Select(x => new AimAcademicSnapshot(x.Code, x.ArabicTitle, x.EnglishTitle,
                x.ArabicDescription, x.EnglishDescription, x.SourceReference, x.SortOrder)).ToArray(),
            criteria.Select(x => new CriterionAcademicSnapshot(x.Code, x.Band.ToString(),
                aimById[x.LearningAimDefinitionId].Code, x.ArabicDescription, x.EnglishDescription,
                x.SourceReference, x.SortOrder)).ToArray(),
            new(rubric.ArabicTitle, rubric.EnglishTitle, rubric.Version, ruleSet.Version, rubricCodes));
        var option = new AssessmentScopeOption(scope.Id, qualification.Code, qualification.ArabicName,
            qualification.EnglishName, version.VersionCode, grade.Slug, grade.ArabicName, grade.EnglishName,
            specialization.Slug, specialization.ArabicName, specialization.EnglishName,
            unit.Code, unit.ArabicTitle, unit.EnglishTitle, definition.Code, definition.Version,
            definition.ArabicTitle, definition.EnglishTitle, scope.Version,
            aims.Select(x => x.Code).ToArray(),
            criteria.Select(x => new AssessmentCriterionDisplay(x.Code, x.Band.ToString())).ToArray());
        return new Resolved(scope, rubric, ruleSet, rubricCodes, snapshot, option);
    }

    private sealed record Bindings(Dictionary<Guid, Grade> Grades, Dictionary<Guid, Specialization> Specializations,
        Dictionary<Guid, RubricTemplate> Rubrics, HashSet<Guid> ActiveTasks);
    private sealed record Resolved(AssessmentScope Scope, RubricTemplate Rubric, BtecAssessmentRuleSet RuleSet,
        string[] RubricCodes, AssessmentScopeSnapshot Snapshot, AssessmentScopeOption Option);
}
