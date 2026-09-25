using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Server-side release and prerequisite policy. Controllers use this boundary
/// before returning protected learning material or recording learner progress;
/// a locked item is therefore never unlocked merely by changing the browser.
/// </summary>
public sealed class ContentAccessService(BetccoDbContext db) : IContentAccessService
{
    public async Task<ContentAccessDecision> CanAccessCourseAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        var enrollment = await db.Enrollments.AsNoTracking().SingleOrDefaultAsync(item => item.StudentUserId == studentUserId && item.CourseId == courseId && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
        if (enrollment is null) return Denied("EnrollmentRequired");
        if (!await TargetBelongsToCourseAsync(courseId, new ContentNode(LearningContentType.Course, courseId), cancellationToken)) return Denied("ContentNotFound");
        return await EvaluateNodeAsync(studentUserId, courseId, enrollment, new ContentNode(LearningContentType.Course, courseId), [], cancellationToken);
    }

    public Task<ContentAccessDecision> CanAccessAsync(string studentUserId, Guid courseId, LearningContentType contentType, Guid contentId, CancellationToken cancellationToken = default) =>
        CanAccessCoreAsync(studentUserId, courseId, contentType, contentId, null, cancellationToken);

    public Task<ContentAccessDecision> CanAccessComprehensiveForDisplayAsync(string studentUserId, Guid courseId, Guid assignmentId,
        ComprehensivePracticeProgressSnapshot progress, CancellationToken cancellationToken = default) =>
        CanAccessCoreAsync(studentUserId, courseId, LearningContentType.Assignment, assignmentId, progress, cancellationToken);

    private async Task<ContentAccessDecision> CanAccessCoreAsync(string studentUserId, Guid courseId,
        LearningContentType contentType, Guid contentId, ComprehensivePracticeProgressSnapshot? comprehensiveProgress, CancellationToken cancellationToken)
    {
        var enrollment = await db.Enrollments.AsNoTracking().SingleOrDefaultAsync(item => item.StudentUserId == studentUserId && item.CourseId == courseId && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
        if (enrollment is null) return Denied("EnrollmentRequired");
        var node = new ContentNode(contentType, contentId);
        if (!await TargetBelongsToCourseAsync(courseId, node, cancellationToken)) return Denied("ContentNotFound");
        var practice = new LearningAimPracticeProgressService(db);
        if (contentType == LearningContentType.Lesson)
        {
            var aimId = await db.Lessons.AsNoTracking().Where(x => x.Id == contentId && x.CourseModule!.UnitDefinitionId != null)
                .Select(x => x.BtecLearningAimId ?? (Guid?)x.BtecTopic!.BtecLearningAimId)
                .SingleOrDefaultAsync(cancellationToken);
            if (aimId is { } id && !await practice.CanAccessAimAsync(studentUserId, id, cancellationToken))
                return Denied("CompletePreviousLearningAim");
        }
        if (contentType == LearningContentType.Assignment
            && await db.CourseAssignments.AsNoTracking().AnyAsync(x => x.Id == contentId && x.Purpose == CourseAssignmentPurpose.LearningAimPractice, cancellationToken)
            && !await practice.CanSubmitAsync(studentUserId, contentId, cancellationToken))
            return Denied("CompleteLearningAimContent");
        if (contentType == LearningContentType.Assignment
            && await db.CourseAssignments.AsNoTracking().AnyAsync(x => x.Id == contentId && x.Purpose == CourseAssignmentPurpose.ComprehensivePractice, cancellationToken)
            && !(comprehensiveProgress is null
                ? await practice.CanSubmitComprehensiveAsync(studentUserId, contentId, cancellationToken)
                : await practice.CanSubmitComprehensiveWithProgressAsync(studentUserId, contentId, comprehensiveProgress, cancellationToken)))
            return Denied("CompleteAllLearningAims");
        return await EvaluateNodeAsync(studentUserId, courseId, enrollment, node, [], cancellationToken);
    }

    public async Task<IReadOnlyCollection<ContentReleaseConfiguration>> GetRulesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        if (!await OwnsCourseAsync(teacherUserId, courseId, cancellationToken)) return [];
        return await db.ContentAccessRules.AsNoTracking()
            .Where(item => item.CourseId == courseId)
            .OrderBy(item => item.TargetType).ThenBy(item => item.CreatedAtUtc)
            .Select(item => new ContentReleaseConfiguration(item.CourseId, item.TargetType, item.TargetId, item.ReleaseMode, item.SpecificDateUtc, item.DaysAfterEnrollment, item.PreviousContentType, item.PreviousContentId))
            .ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<ContentPrerequisiteConfiguration>> GetPrerequisitesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        if (!await OwnsCourseAsync(teacherUserId, courseId, cancellationToken)) return [];
        return await db.ContentPrerequisites.AsNoTracking()
            .Where(item => item.CourseId == courseId)
            .OrderBy(item => item.TargetType).ThenBy(item => item.CreatedAtUtc)
            .Select(item => new ContentPrerequisiteConfiguration(item.Id, item.CourseId, item.TargetType, item.TargetId, item.RequiredContentType, item.RequiredContentId))
            .ToArrayAsync(cancellationToken);
    }

    public async Task<bool> SetReleaseRuleAsync(string teacherUserId, ContentReleaseConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var target = new ContentNode(configuration.TargetType, configuration.TargetId);
        if (!await OwnsCourseAsync(teacherUserId, configuration.CourseId, cancellationToken)
            || !await TargetBelongsToCourseAsync(configuration.CourseId, target, cancellationToken)
            || !HasValidReleaseFields(configuration)) return false;

        ContentNode? previous = configuration.ReleaseMode == ContentReleaseMode.AfterPreviousContentCompletion
            ? new ContentNode(configuration.PreviousContentType!.Value, configuration.PreviousContentId!.Value)
            : null;
        if (previous is not null
            && (!await IsValidRequiredNodeAsync(configuration.CourseId, previous.Value, cancellationToken)
                || target == previous.Value
                || await WouldCreateCycleAsync(target, previous.Value, cancellationToken))) return false;

        var existing = await db.ContentAccessRules.SingleOrDefaultAsync(item => item.CourseId == configuration.CourseId && item.TargetType == configuration.TargetType && item.TargetId == configuration.TargetId, cancellationToken);
        if (configuration.ReleaseMode == ContentReleaseMode.Immediately)
        {
            if (existing is null) return true;
            db.ContentAccessRules.Remove(existing);
            db.AuditLogs.Add(Audit(teacherUserId, "ContentReleaseReset", nameof(ContentAccessRule), existing.Id));
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }

        var rule = existing ?? new ContentAccessRule { CourseId = configuration.CourseId, TargetType = configuration.TargetType, TargetId = configuration.TargetId };
        rule.ReleaseMode = configuration.ReleaseMode;
        rule.SpecificDateUtc = configuration.ReleaseMode == ContentReleaseMode.SpecificDate ? configuration.SpecificDateUtc : null;
        rule.DaysAfterEnrollment = configuration.ReleaseMode == ContentReleaseMode.DaysAfterEnrollment ? configuration.DaysAfterEnrollment : null;
        rule.PreviousContentType = previous?.Type;
        rule.PreviousContentId = previous?.Id;
        if (existing is null) db.ContentAccessRules.Add(rule);
        db.AuditLogs.Add(Audit(teacherUserId, "ContentReleaseConfigured", nameof(ContentAccessRule), rule.Id));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddPrerequisiteAsync(string teacherUserId, ContentPrerequisiteConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var target = new ContentNode(configuration.TargetType, configuration.TargetId);
        var required = new ContentNode(configuration.RequiredContentType, configuration.RequiredContentId);
        if (!await OwnsCourseAsync(teacherUserId, configuration.CourseId, cancellationToken)
            || !await TargetBelongsToCourseAsync(configuration.CourseId, target, cancellationToken)
            || !await IsValidRequiredNodeAsync(configuration.CourseId, required, cancellationToken)
            || target == required
            || await WouldCreateCycleAsync(target, required, cancellationToken)) return null;

        if (await db.ContentPrerequisites.AnyAsync(item => item.CourseId == configuration.CourseId
            && item.TargetType == configuration.TargetType && item.TargetId == configuration.TargetId
            && item.RequiredContentType == configuration.RequiredContentType && item.RequiredContentId == configuration.RequiredContentId, cancellationToken)) return null;
        var item = new ContentPrerequisite
        {
            CourseId = configuration.CourseId,
            TargetType = configuration.TargetType,
            TargetId = configuration.TargetId,
            RequiredContentType = configuration.RequiredContentType,
            RequiredContentId = configuration.RequiredContentId
        };
        db.ContentPrerequisites.Add(item);
        db.AuditLogs.Add(Audit(teacherUserId, "ContentPrerequisiteAdded", nameof(ContentPrerequisite), item.Id));
        await db.SaveChangesAsync(cancellationToken);
        return item.Id;
    }

    public async Task<bool> RemovePrerequisiteAsync(string teacherUserId, Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken = default)
    {
        if (!await OwnsCourseAsync(teacherUserId, courseId, cancellationToken)) return false;
        var item = await db.ContentPrerequisites.SingleOrDefaultAsync(value => value.Id == prerequisiteId && value.CourseId == courseId, cancellationToken);
        if (item is null) return false;
        db.ContentPrerequisites.Remove(item);
        db.AuditLogs.Add(Audit(teacherUserId, "ContentPrerequisiteRemoved", nameof(ContentPrerequisite), item.Id));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<ContentAccessDecision> EvaluateNodeAsync(string studentUserId, Guid courseId, Enrollment enrollment, ContentNode node, HashSet<ContentNode> path, CancellationToken cancellationToken)
    {
        if (!path.Add(node)) return Denied("PrerequisiteCycle");
        try
        {
            foreach (var parent in await ParentNodesAsync(node, cancellationToken))
            {
                var parentDecision = await EvaluateNodeAsync(studentUserId, courseId, enrollment, parent, path, cancellationToken);
                if (!parentDecision.IsAvailable) return parentDecision;
            }

            var rule = await db.ContentAccessRules.AsNoTracking().SingleOrDefaultAsync(item => item.CourseId == courseId && item.TargetType == node.Type && item.TargetId == node.Id, cancellationToken);
            if (rule is not null)
            {
                var releaseDecision = await EvaluateReleaseRuleAsync(studentUserId, courseId, enrollment, rule, cancellationToken);
                if (!releaseDecision.IsAvailable) return releaseDecision;
            }

            var prerequisites = await db.ContentPrerequisites.AsNoTracking()
                .Where(item => item.CourseId == courseId && item.TargetType == node.Type && item.TargetId == node.Id)
                .Select(item => new ContentNode(item.RequiredContentType, item.RequiredContentId))
                .ToArrayAsync(cancellationToken);
            foreach (var prerequisite in prerequisites)
            {
                if (!await IsCompletedAsync(studentUserId, prerequisite, cancellationToken))
                    return Denied("CompletePrerequisite", null, prerequisite.Type, prerequisite.Id);
            }
            return new ContentAccessDecision(true);
        }
        finally
        {
            path.Remove(node);
        }
    }

    private async Task<ContentAccessDecision> EvaluateReleaseRuleAsync(string studentUserId, Guid courseId, Enrollment enrollment, ContentAccessRule rule, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        return rule.ReleaseMode switch
        {
            ContentReleaseMode.Immediately => new ContentAccessDecision(true),
            ContentReleaseMode.SpecificDate when rule.SpecificDateUtc is { } date && now >= date => new ContentAccessDecision(true),
            ContentReleaseMode.SpecificDate => Denied("AvailableOnDate", rule.SpecificDateUtc),
            ContentReleaseMode.DaysAfterEnrollment when rule.DaysAfterEnrollment is { } days && now >= enrollment.EnrolledAtUtc.AddDays(days) => new ContentAccessDecision(true),
            ContentReleaseMode.DaysAfterEnrollment when rule.DaysAfterEnrollment is { } days => Denied("AvailableAfterEnrollment", enrollment.EnrolledAtUtc.AddDays(days)),
            ContentReleaseMode.AfterPreviousContentCompletion when rule.PreviousContentType is { } type && rule.PreviousContentId is { } id && await IsCompletedAsync(studentUserId, new ContentNode(type, id), cancellationToken) => new ContentAccessDecision(true),
            ContentReleaseMode.AfterPreviousContentCompletion => Denied("CompletePreviousContent", null, rule.PreviousContentType, rule.PreviousContentId),
            _ => Denied("InvalidReleaseRule")
        };
    }

    private async Task<bool> IsCompletedAsync(string studentUserId, ContentNode node, CancellationToken cancellationToken) => node.Type switch
    {
        LearningContentType.Course => await IsCourseCompletedAsync(studentUserId, node.Id, cancellationToken),
        LearningContentType.Unit => await IsUnitCompletedAsync(studentUserId, node.Id, cancellationToken),
        LearningContentType.Lesson => await db.LessonProgresses.AsNoTracking().AnyAsync(progress => progress.StudentUserId == studentUserId && progress.LessonId == node.Id && progress.IsCompleted, cancellationToken),
        LearningContentType.Assignment => await db.CourseAssignmentSubmissions.AsNoTracking().AnyAsync(submission =>
            submission.StudentUserId == studentUserId && submission.CourseAssignmentId == node.Id
            && (submission.CourseAssignment!.Purpose == CourseAssignmentPurpose.LearningAimPractice
                || submission.CourseAssignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                ? submission.Status == CourseAssignmentSubmissionStatus.Finalized && submission.TrainingOutcome != null
                : submission.CalculatedGrade != null && (submission.Status == CourseAssignmentSubmissionStatus.Graded || submission.Status == CourseAssignmentSubmissionStatus.Finalized)), cancellationToken),
        _ => false
    };

    private async Task<bool> IsCourseCompletedAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Enrollments.AsNoTracking().AnyAsync(enrollment => enrollment.StudentUserId == studentUserId && enrollment.CourseId == courseId && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return false;
        var lessonIds = await db.Lessons.AsNoTracking()
            .Where(lesson => lesson.CourseModule!.CourseId == courseId && lesson.IsPublished && lesson.Type != LessonType.LegacyArchived && lesson.CourseModule.IsPublished)
            .Select(lesson => lesson.Id)
            .ToArrayAsync(cancellationToken);
        return lessonIds.Length > 0 && await db.LessonProgresses.AsNoTracking().CountAsync(progress => progress.StudentUserId == studentUserId && progress.IsCompleted && lessonIds.Contains(progress.LessonId), cancellationToken) == lessonIds.Length;
    }

    private async Task<bool> IsUnitCompletedAsync(string studentUserId, Guid moduleId, CancellationToken cancellationToken)
    {
        var lessonIds = await db.Lessons.AsNoTracking().Where(lesson => lesson.CourseModuleId == moduleId && lesson.IsPublished && lesson.Type != LessonType.LegacyArchived).Select(lesson => lesson.Id).ToArrayAsync(cancellationToken);
        return lessonIds.Length > 0 && await db.LessonProgresses.AsNoTracking().CountAsync(progress => progress.StudentUserId == studentUserId && progress.IsCompleted && lessonIds.Contains(progress.LessonId), cancellationToken) == lessonIds.Length;
    }

    private async Task<IReadOnlyCollection<ContentNode>> ParentNodesAsync(ContentNode node, CancellationToken cancellationToken)
    {
        return node.Type switch
        {
            LearningContentType.Course => [],
            LearningContentType.Unit => (await db.CourseModules.AsNoTracking().Where(item => item.Id == node.Id).Select(item => item.CourseId).SingleOrDefaultAsync(cancellationToken)) is var courseId && courseId != Guid.Empty ? [new ContentNode(LearningContentType.Course, courseId)] : [],
            LearningContentType.Lesson => (await db.Lessons.AsNoTracking().Where(item => item.Id == node.Id).Select(item => item.CourseModuleId).SingleOrDefaultAsync(cancellationToken)) is var moduleId && moduleId != Guid.Empty ? [new ContentNode(LearningContentType.Unit, moduleId)] : [],
            LearningContentType.Assignment => await AssignmentParentsAsync(node.Id, cancellationToken),
            _ => []
        };
    }

    private async Task<IReadOnlyCollection<ContentNode>> AssignmentParentsAsync(Guid assignmentId, CancellationToken cancellationToken)
    {
        var row = await db.CourseAssignments.AsNoTracking().Where(item => item.Id == assignmentId).Select(item => new { item.CourseId, item.CourseModuleId, item.LessonId }).SingleOrDefaultAsync(cancellationToken);
        if (row is null) return [];
        if (row.LessonId is { } lessonId) return [new ContentNode(LearningContentType.Lesson, lessonId)];
        if (row.CourseModuleId is { } moduleId) return [new ContentNode(LearningContentType.Unit, moduleId)];
        return [new ContentNode(LearningContentType.Course, row.CourseId)];
    }

    private async Task<bool> TargetBelongsToCourseAsync(Guid courseId, ContentNode node, CancellationToken cancellationToken) => node.Type switch
    {
        LearningContentType.Course => node.Id == courseId && await db.Courses.AsNoTracking().AnyAsync(course => course.Id == courseId, cancellationToken),
        LearningContentType.Unit => await db.CourseModules.AsNoTracking().AnyAsync(module => module.Id == node.Id && module.CourseId == courseId, cancellationToken),
        LearningContentType.Lesson => await db.Lessons.AsNoTracking().AnyAsync(lesson => lesson.Id == node.Id && lesson.Type != LessonType.LegacyArchived && lesson.CourseModule!.CourseId == courseId, cancellationToken),
        LearningContentType.Assignment => await db.CourseAssignments.AsNoTracking().AnyAsync(assignment => assignment.Id == node.Id && assignment.CourseId == courseId, cancellationToken),
        _ => false
    };

    private async Task<bool> IsValidRequiredNodeAsync(Guid targetCourseId, ContentNode node, CancellationToken cancellationToken)
    {
        if (node.Type == LearningContentType.Course) return await db.Courses.AsNoTracking().AnyAsync(course => course.Id == node.Id && course.Status == CourseStatus.Published, cancellationToken);
        return await TargetBelongsToCourseAsync(targetCourseId, node, cancellationToken);
    }

    private async Task<bool> WouldCreateCycleAsync(ContentNode target, ContentNode required, CancellationToken cancellationToken)
    {
        var prerequisites = await db.ContentPrerequisites.AsNoTracking()
            .Select(item => new ContentEdge(new ContentNode(item.TargetType, item.TargetId), new ContentNode(item.RequiredContentType, item.RequiredContentId)))
            .ToArrayAsync(cancellationToken);
        var releases = await db.ContentAccessRules.AsNoTracking()
            .Where(item => item.ReleaseMode == ContentReleaseMode.AfterPreviousContentCompletion && item.PreviousContentType != null && item.PreviousContentId != null
                && !(item.TargetType == target.Type && item.TargetId == target.Id))
            .Select(item => new ContentEdge(new ContentNode(item.TargetType, item.TargetId), new ContentNode(item.PreviousContentType!.Value, item.PreviousContentId!.Value)))
            .ToArrayAsync(cancellationToken);
        var graph = prerequisites.Concat(releases).Append(new ContentEdge(target, required))
            .GroupBy(edge => edge.Target)
            .ToDictionary(group => group.Key, group => group.Select(edge => edge.Required).ToArray());
        return CanReach(required, target, graph, []);
    }

    private static bool CanReach(ContentNode current, ContentNode target, IReadOnlyDictionary<ContentNode, ContentNode[]> graph, HashSet<ContentNode> visited)
    {
        if (current == target) return true;
        if (!visited.Add(current) || !graph.TryGetValue(current, out var next)) return false;
        return next.Any(item => CanReach(item, target, graph, visited));
    }

    private static bool HasValidReleaseFields(ContentReleaseConfiguration configuration) => configuration.ReleaseMode switch
    {
        ContentReleaseMode.Immediately => true,
        ContentReleaseMode.SpecificDate => configuration.SpecificDateUtc is not null,
        ContentReleaseMode.DaysAfterEnrollment => configuration.DaysAfterEnrollment is >= 0 and <= 3650,
        ContentReleaseMode.AfterPreviousContentCompletion => configuration.PreviousContentType is not null && configuration.PreviousContentId is not null,
        _ => false
    };

    private Task<bool> OwnsCourseAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken) => db.Courses.AsNoTracking().AnyAsync(course => course.Id == courseId && course.TeacherUserId == teacherUserId, cancellationToken);
    private static ContentAccessDecision Denied(string reason, DateTimeOffset? availableAtUtc = null, LearningContentType? requiredType = null, Guid? requiredId = null) => new(false, reason, availableAtUtc, requiredType, requiredId);
    private static AuditLog Audit(string actorUserId, string action, string entityType, Guid entityId) => new() { ActorUserId = actorUserId, Action = action, EntityType = entityType, EntityId = entityId.ToString(), Outcome = "Success" };

    private readonly record struct ContentNode(LearningContentType Type, Guid Id);
    private sealed record ContentEdge(ContentNode Target, ContentNode Required);
}
