using Betcco.Application.Assignments;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

// The canonical UnitDefinition orders the delivery aims. Missing or mismatched
// mappings fail closed rather than assigning a teacher-authored identity.
public sealed class LearningAimPracticeProgressService(BetccoDbContext db, ICourseAssignmentDeadlineResolver? deadlineResolver = null)
{
    private readonly ICourseAssignmentDeadlineResolver deadlineResolverService = deadlineResolver ?? new CourseAssignmentDeadlineResolver(db);

    public async Task<IReadOnlyList<LearningAimPracticeProgress>> GetAsync(
        string studentUserId, Guid moduleId, CancellationToken cancellationToken = default)
    {
        var module = await db.CourseModules.AsNoTracking()
            .Include(x => x.UnitDefinition).ThenInclude(x => x!.LearningAims)
            .Include(x => x.LearningAims).ThenInclude(x => x.LearningAimDefinition)
            .SingleOrDefaultAsync(x => x.Id == moduleId && x.IsPublished
                && x.Course!.Status == CourseStatus.Published, cancellationToken);
        if (module?.UnitDefinition is null) return [];
        var definitions = module.UnitDefinition.LearningAims.OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Code).ThenBy(x => x.Id).ToArray();
        var delivery = module.LearningAims.Where(x => x.LearningAimDefinitionId is not null
                && x.LearningAimDefinition?.UnitDefinitionId == module.UnitDefinitionId
                && x.PublicationStatus == ContentPublicationStatus.Published)
            .ToDictionary(x => x.LearningAimDefinitionId!.Value);
        if (definitions.Length == 0 || delivery.Count != definitions.Length
            || definitions.Any(x => !delivery.ContainsKey(x.Id))) return [];

        var aimIds = delivery.Values.Select(x => x.Id).ToArray();
        var lessons = await db.Lessons.AsNoTracking()
            .Where(x => x.CourseModuleId == moduleId && x.IsPublished
                && x.Type != LessonType.LegacyArchived
                && (x.BtecLearningAimId != null || x.BtecTopicId != null))
            .Select(x => new { x.Id, AimId = x.BtecLearningAimId ?? x.BtecTopic!.BtecLearningAimId })
            .ToArrayAsync(cancellationToken);
        var lessonIds = lessons.Select(x => x.Id).ToArray();
        var completed = await db.LessonProgresses.AsNoTracking()
            .Where(x => x.StudentUserId == studentUserId && x.IsCompleted && lessonIds.Contains(x.LessonId))
            .Select(x => x.LessonId).ToArrayAsync(cancellationToken);
        var completedSet = completed.ToHashSet();
        var assignments = await db.CourseAssignments.AsNoTracking()
            .Where(x => x.Purpose == CourseAssignmentPurpose.LearningAimPractice
                && x.CourseModuleId == moduleId && x.BtecLearningAimId != null)
            .Select(x => new
            {
                x.Id,
                AimId = x.BtecLearningAimId!.Value,
                x.IsPublished,
                x.PublicationStatus,
                x.ArabicTitle,
                x.EnglishTitle,
                x.ArabicInstructions,
                x.EnglishInstructions,
                x.AvailableFromUtc,
                x.DueAtUtc
            })
            .ToArrayAsync(cancellationToken);
        var assignmentIds = assignments.Select(x => x.Id).ToArray();
        var deadlines = await deadlineResolverService.ResolveManyAsync(assignments.Select(x =>
            new CourseAssignmentDeadlineTarget(x.Id, studentUserId, x.DueAtUtc)).ToArray(), cancellationToken);
        var submissions = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(x => x.StudentUserId == studentUserId && assignmentIds.Contains(x.CourseAssignmentId))
            .Select(x => new
            {
                x.CourseAssignmentId,
                x.Status,
                x.TrainingOutcome,
                x.TrainingStrengths,
                x.TrainingGaps,
                x.TrainingImprovementGuidance
            })
            .ToArrayAsync(cancellationToken);

        var result = new List<LearningAimPracticeProgress>(definitions.Length);
        var previousComplete = true;
        foreach (var definition in definitions)
        {
            var aim = delivery[definition.Id];
            var aimLessons = lessons.Where(x => x.AimId == aim.Id).ToArray();
            var completedCount = aimLessons.Count(x => completedSet.Contains(x.Id));
            var contentComplete = aimLessons.Length > 0 && completedCount == aimLessons.Length;
            var assignment = assignments.SingleOrDefault(x => x.AimId == aim.Id);
            var submission = assignment is null ? null : submissions.SingleOrDefault(x => x.CourseAssignmentId == assignment.Id);
            var reviewed = submission?.Status == CourseAssignmentSubmissionStatus.Finalized
                && submission.TrainingOutcome is not null;
            var effectiveDueAtUtc = assignment is null ? null : deadlines[(assignment.Id, studentUserId)].EffectiveDueAtUtc;
            var available = assignment is not null && assignment.IsPublished
                && assignment.PublicationStatus == ContentPublicationStatus.Published
                && (assignment.AvailableFromUtc is null || assignment.AvailableFromUtc <= DateTimeOffset.UtcNow)
                && (effectiveDueAtUtc is null || effectiveDueAtUtc >= DateTimeOffset.UtcNow);
            var complete = contentComplete && reviewed;
            result.Add(new LearningAimPracticeProgress(
                aim.Id, definition.Id, moduleId, definition.Code, definition.ArabicTitle, definition.EnglishTitle,
                previousComplete, aimLessons.Length, completedCount, contentComplete,
                assignment?.Id, assignment?.ArabicTitle, assignment?.EnglishTitle,
                assignment?.ArabicInstructions, assignment?.EnglishInstructions,
                previousComplete && contentComplete && available,
                submission?.Status.ToString() ?? (assignment is null ? "NotConfigured"
                    : previousComplete && contentComplete && available ? "Available" : "Locked"),
                reviewed ? submission?.TrainingOutcome?.ToString() : null,
                reviewed ? submission?.TrainingStrengths : null,
                reviewed ? submission?.TrainingGaps : null,
                reviewed ? submission?.TrainingImprovementGuidance : null,
                complete));
            previousComplete = previousComplete && complete;
        }
        return result;
    }

    public async Task<bool> CanAccessAimAsync(string studentUserId, Guid aimId, CancellationToken cancellationToken = default)
    {
        var moduleId = await db.BtecLearningAims.AsNoTracking().Where(x => x.Id == aimId)
            .Select(x => (Guid?)x.CourseModuleId).SingleOrDefaultAsync(cancellationToken);
        if (moduleId is null) return false;
        var aims = await GetAsync(studentUserId, moduleId.Value, cancellationToken);
        return aims.Any(x => x.Id == aimId && x.IsUnlocked);
    }

    public async Task<bool> CanSubmitAsync(string studentUserId, Guid assignmentId, CancellationToken cancellationToken = default)
    {
        var target = await db.CourseAssignments.AsNoTracking()
            .Where(x => x.Id == assignmentId && x.Purpose == CourseAssignmentPurpose.LearningAimPractice
                && x.BtecLearningAimId != null && x.CourseModuleId != null)
            .Select(x => new { AimId = x.BtecLearningAimId!.Value, ModuleId = x.CourseModuleId!.Value })
            .SingleOrDefaultAsync(cancellationToken);
        if (target is null) return false;
        var aims = await GetAsync(studentUserId, target.ModuleId, cancellationToken);
        return aims.Any(x => x.Id == target.AimId && x.PracticeAvailable);
    }
}

public sealed record LearningAimPracticeProgress(
    Guid Id, Guid DefinitionId, Guid ModuleId, string Code, string ArabicTitle, string EnglishTitle,
    bool IsUnlocked, int ContentTotal, int ContentCompleted, bool ContentComplete,
    Guid? AssignmentId, string? AssignmentArabicTitle, string? AssignmentEnglishTitle,
    string? ArabicInstructions, string? EnglishInstructions, bool PracticeAvailable,
    string PracticeStatus, string? TrainingOutcome, string? Strengths, string? Gaps,
    string? ImprovementGuidance, bool IsComplete);
