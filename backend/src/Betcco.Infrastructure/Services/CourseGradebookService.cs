using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Produces learner-safe and teacher-owned BTEC progress views. Every award is
/// derived from persisted criterion results; the browser never supplies grades.
/// </summary>
public sealed class CourseGradebookService(BetccoDbContext db) : ICourseGradebookService
{
    public async Task<StudentCourseGradebookView?> GetStudentAsync(
        string studentUserId,
        Guid courseId,
        string locale,
        CancellationToken cancellationToken = default)
    {
        if (!await db.Enrollments.AsNoTracking().AnyAsync(enrollment =>
                enrollment.StudentUserId == studentUserId && enrollment.CourseId == courseId,
                cancellationToken))
            return null;

        var data = await LoadCourseDataAsync(courseId, [studentUserId], cancellationToken);
        return data is null ? null : BuildStudentView(data, studentUserId, locale);
    }

    public async Task<TeacherCourseGradebookView?> GetTeacherAsync(
        string teacherUserId,
        Guid courseId,
        string locale,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(course =>
            course.Id == courseId && course.TeacherUserId == teacherUserId, cancellationToken);
        if (course is null) return null;

        var totalStudents = await db.Enrollments.AsNoTracking()
            .CountAsync(enrollment => enrollment.CourseId == courseId, cancellationToken);
        var studentIds = await db.Enrollments.AsNoTracking()
            .Where(enrollment => enrollment.CourseId == courseId)
            .OrderBy(enrollment => enrollment.StudentUserId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(enrollment => enrollment.StudentUserId)
            .ToArrayAsync(cancellationToken);
        var data = await LoadCourseDataAsync(courseId, studentIds, cancellationToken);
        if (data is null) return null;

        var displayNames = await db.Users.AsNoTracking()
            .Where(user => studentIds.Contains(user.Id.ToString()))
            .Select(user => new { Id = user.Id.ToString(), user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
        var students = studentIds.Select(studentId =>
        {
            var view = BuildStudentView(data, studentId, locale);
            return new TeacherCourseGradebookRow(
                studentId,
                displayNames.GetValueOrDefault(studentId, locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? "طالب" : "Student"),
                view.LessonProgressPercent,
                view.AssignmentsCompleted,
                view.AssignmentsTotal,
                view.PredictedGrade);
        }).ToArray();
        return new TeacherCourseGradebookView(
            course.Id,
            Localize(locale, course.ArabicTitle, course.EnglishTitle),
            totalStudents,
            page,
            pageSize,
            students);
    }

    public async Task<AdminGradebookView> GetAdminAsync(
        AdminGradebookQuery query,
        string locale,
        CancellationToken cancellationToken = default)
    {
        var rows = db.CourseAssignmentSubmissions.AsNoTracking()
            .Include(submission => submission.CourseAssignment).ThenInclude(assignment => assignment!.Course)
            .Include(submission => submission.CourseAssignment).ThenInclude(assignment => assignment!.CourseModule)
            .AsQueryable();

        if (query.CourseId is { } courseId)
            rows = rows.Where(submission => submission.CourseAssignment!.CourseId == courseId);
        if (query.UnitId is { } unitId)
            rows = rows.Where(submission => submission.CourseAssignment!.CourseModuleId == unitId);
        if (!string.IsNullOrWhiteSpace(query.TeacherUserId))
            rows = rows.Where(submission => submission.CourseAssignment!.Course!.TeacherUserId == query.TeacherUserId);
        if (!string.IsNullOrWhiteSpace(query.StudentUserId))
            rows = rows.Where(submission => submission.StudentUserId == query.StudentUserId);
        if (Enum.TryParse<CourseAssignmentSubmissionStatus>(query.Status, true, out var status))
            rows = rows.Where(submission => submission.Status == status);
        if (Enum.TryParse<EvaluationGrade>(query.Grade, true, out var grade))
            rows = rows.Where(submission => submission.CalculatedGrade == grade);
        if (query.FromUtc is { } fromUtc)
            rows = rows.Where(submission => (submission.GradedAtUtc ?? submission.SubmittedAtUtc) >= fromUtc);
        if (query.ToUtc is { } toUtc)
            rows = rows.Where(submission => (submission.GradedAtUtc ?? submission.SubmittedAtUtc) <= toUtc);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            var matchingUserIds = await db.Users.AsNoTracking()
                .Where(user => EF.Functions.ILike(user.DisplayName, $"%{search}%") || EF.Functions.ILike(user.Email!, $"%{search}%"))
                .Select(user => user.Id.ToString())
                .ToArrayAsync(cancellationToken);
            rows = rows.Where(submission => matchingUserIds.Contains(submission.StudentUserId)
                || matchingUserIds.Contains(submission.CourseAssignment!.Course!.TeacherUserId!)
                || EF.Functions.ILike(submission.CourseAssignment.ArabicTitle, $"%{search}%")
                || EF.Functions.ILike(submission.CourseAssignment.EnglishTitle, $"%{search}%"));
        }

        var total = await rows.CountAsync(cancellationToken);
        var items = await rows
            .OrderByDescending(submission => submission.GradedAtUtc ?? submission.SubmittedAtUtc ?? submission.UpdatedAtUtc)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(submission => new
            {
                submission.Id,
                submission.StudentUserId,
                submission.Status,
                submission.CalculatedGrade,
                submission.SubmittedAtUtc,
                submission.GradedAtUtc,
                AssignmentId = submission.CourseAssignmentId,
                submission.CourseAssignment!.CourseId,
                submission.CourseAssignment.CourseModuleId,
                submission.CourseAssignment.Course!.TeacherUserId,
                CourseArabicTitle = submission.CourseAssignment.Course.ArabicTitle,
                CourseEnglishTitle = submission.CourseAssignment.Course.EnglishTitle,
                UnitArabicTitle = submission.CourseAssignment.CourseModule == null ? null : submission.CourseAssignment.CourseModule.UnitDefinition != null
                    ? submission.CourseAssignment.CourseModule.UnitDefinition.ArabicTitle : submission.CourseAssignment.CourseModule.ArabicTitle,
                UnitEnglishTitle = submission.CourseAssignment.CourseModule == null ? null : submission.CourseAssignment.CourseModule.UnitDefinition != null
                    ? submission.CourseAssignment.CourseModule.UnitDefinition.EnglishTitle : submission.CourseAssignment.CourseModule.EnglishTitle,
                AssignmentArabicTitle = submission.CourseAssignment.ArabicTitle,
                AssignmentEnglishTitle = submission.CourseAssignment.EnglishTitle
            })
            .ToListAsync(cancellationToken);
        var userIds = items.Select(item => item.StudentUserId)
            .Concat(items.Where(item => !string.IsNullOrWhiteSpace(item.TeacherUserId)).Select(item => item.TeacherUserId!))
            .Distinct()
            .ToArray();
        var names = await db.Users.AsNoTracking()
            .Where(user => userIds.Contains(user.Id.ToString()))
            .Select(user => new { Id = user.Id.ToString(), user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
        var fallbackStudent = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? "طالب" : "Student";
        var fallbackTeacher = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? "معلم" : "Teacher";
        return new AdminGradebookView(total, query.Page, query.PageSize, items.Select(item => new AdminGradebookRow(
            item.Id,
            item.CourseId,
            Localize(locale, item.CourseArabicTitle, item.CourseEnglishTitle),
            item.CourseModuleId,
            item.UnitArabicTitle is null || item.UnitEnglishTitle is null ? null : Localize(locale, item.UnitArabicTitle, item.UnitEnglishTitle),
            item.TeacherUserId ?? string.Empty,
            item.TeacherUserId is null ? fallbackTeacher : names.GetValueOrDefault(item.TeacherUserId, fallbackTeacher),
            item.StudentUserId,
            names.GetValueOrDefault(item.StudentUserId, fallbackStudent),
            Localize(locale, item.AssignmentArabicTitle, item.AssignmentEnglishTitle),
            item.Status.ToString(),
            item.CalculatedGrade?.ToString(),
            item.SubmittedAtUtc,
            item.GradedAtUtc)).ToArray());
    }

    private async Task<CourseData?> LoadCourseDataAsync(
        Guid courseId,
        IReadOnlyCollection<string> studentIds,
        CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        if (course is null) return null;
        var units = await db.CourseModules.AsNoTracking()
            .Include(unit => unit.UnitDefinition)
            .Where(unit => unit.CourseId == courseId && unit.IsPublished)
            .OrderBy(unit => unit.SortOrder)
            .ToListAsync(cancellationToken);
        var lessons = await db.Lessons.AsNoTracking()
            .Where(lesson => lesson.CourseModule!.CourseId == courseId && lesson.IsPublished && lesson.Type != LessonType.LegacyArchived && lesson.CourseModule.IsPublished)
            .ToListAsync(cancellationToken);
        var assignments = await db.CourseAssignments.AsNoTracking()
            .Include(assignment => assignment.CourseModule).ThenInclude(module => module!.UnitDefinition)
            .Include(assignment => assignment.Criteria).ThenInclude(criterion => criterion.BtecCriterion).ThenInclude(criterion => criterion!.BtecLearningAim)
            .Include(assignment => assignment.Criteria).ThenInclude(criterion => criterion.BtecCriterion).ThenInclude(criterion => criterion!.BtecLearningAim).ThenInclude(aim => aim!.LearningAimDefinition)
            .Where(assignment => assignment.CourseId == courseId && assignment.IsPublished)
            .OrderBy(assignment => assignment.DueAtUtc)
            .ToListAsync(cancellationToken);
        var lessonIds = lessons.Select(lesson => lesson.Id).ToArray();
        var assignmentIds = assignments.Select(assignment => assignment.Id).ToArray();
        var progress = studentIds.Count == 0 || lessonIds.Length == 0
            ? []
            : await db.LessonProgresses.AsNoTracking()
                .Where(item => studentIds.Contains(item.StudentUserId) && item.IsCompleted && lessonIds.Contains(item.LessonId))
                .ToListAsync(cancellationToken);
        var submissions = studentIds.Count == 0 || assignmentIds.Length == 0
            ? []
            : await db.CourseAssignmentSubmissions.AsNoTracking()
                .Include(submission => submission.CriterionResults)
                .Where(submission => studentIds.Contains(submission.StudentUserId) && assignmentIds.Contains(submission.CourseAssignmentId))
                .ToListAsync(cancellationToken);
        var learningAims = await db.BtecLearningAims.AsNoTracking()
            .Include(aim => aim.LearningAimDefinition)
            .Where(aim => aim.CourseModule!.CourseId == courseId && aim.PublicationStatus == ContentPublicationStatus.Published)
            .OrderBy(aim => aim.SortOrder)
            .ToListAsync(cancellationToken);
        var topics = await db.BtecTopics.AsNoTracking()
            .Where(topic => topic.BtecLearningAim!.CourseModule!.CourseId == courseId && topic.PublicationStatus == ContentPublicationStatus.Published)
            .Select(topic => new TopicAimMap(topic.Id, topic.BtecLearningAimId))
            .ToListAsync(cancellationToken);
        return new CourseData(course, units, lessons, assignments, progress, submissions, learningAims, topics);
    }

    private static StudentCourseGradebookView BuildStudentView(CourseData data, string studentUserId, string locale)
    {
        var completeLessonIds = data.LessonProgresses
            .Where(progress => progress.StudentUserId == studentUserId)
            .Select(progress => progress.LessonId)
            .ToHashSet();
        var submissionsByAssignment = data.Submissions
            .Where(submission => submission.StudentUserId == studentUserId)
            .ToDictionary(submission => submission.CourseAssignmentId);
        var criteria = data.Assignments.SelectMany(assignment => assignment.Criteria.Select(criterion =>
        {
            submissionsByAssignment.TryGetValue(assignment.Id, out var submission);
            var result = submission?.CriterionResults.SingleOrDefault(item => item.CourseAssignmentCriterionId == criterion.Id);
            return new BtecCriterionProgressItem(
                assignment.Id,
                assignment.CourseModuleId,
                assignment.CourseModule?.UnitDefinition?.Code ?? assignment.CourseModule?.UnitCode,
                assignment.BtecLearningAimId ?? criterion.BtecCriterion?.BtecLearningAimId,
                criterion.BtecCriterion?.BtecLearningAim?.LearningAimDefinition?.Code ?? criterion.BtecCriterion?.BtecLearningAim?.Code,
                Localize(locale, assignment.ArabicTitle, assignment.EnglishTitle),
                criterion.Code,
                criterion.Band.ToString(),
                CriterionStatus(submission, result),
                result?.Feedback);
        })).ToArray();
        var completedAssignments = submissionsByAssignment.Values.Count(submission =>
            submission.Status is CourseAssignmentSubmissionStatus.Graded or CourseAssignmentSubmissionStatus.Finalized);
        var topicAimById = data.Topics.ToDictionary(topic => topic.Id, topic => topic.BtecLearningAimId);
        var units = data.Units.Select(unit =>
        {
            var unitLessons = data.Lessons.Where(lesson => lesson.CourseModuleId == unit.Id).ToArray();
            var unitCriteria = criteria.Where(criterion => criterion.UnitId == unit.Id).ToArray();
            var aims = data.LearningAims.Where(aim => aim.CourseModuleId == unit.Id).Select(aim =>
            {
                var aimLessons = unitLessons.Where(lesson => lesson.BtecLearningAimId == aim.Id
                    || lesson.BtecTopicId is { } topicId && topicAimById.GetValueOrDefault(topicId) == aim.Id).ToArray();
                var aimCriteria = criteria.Where(criterion => criterion.LearningAimId == aim.Id).ToArray();
                return new CourseLearningAimProgressItem(
                    aim.Id,
                    aim.LearningAimDefinition?.Code ?? aim.Code,
                    Localize(locale, aim.LearningAimDefinition?.ArabicTitle ?? aim.ArabicTitle, aim.LearningAimDefinition?.EnglishTitle ?? aim.EnglishTitle),
                    Percentage(aimLessons.Count(lesson => completeLessonIds.Contains(lesson.Id)), aimLessons.Length),
                    aimLessons.Count(lesson => completeLessonIds.Contains(lesson.Id)),
                    aimLessons.Length,
                    Summarize(aimCriteria));
            }).ToArray();
            return new CourseUnitGradebookItem(
                unit.Id,
                (unit.UnitDefinition?.Code ?? unit.UnitCode) is { Length: > 0 } code
                    ? $"{code} · {Localize(locale, unit.UnitDefinition?.ArabicTitle ?? unit.ArabicTitle, unit.UnitDefinition?.EnglishTitle ?? unit.EnglishTitle)}"
                    : Localize(locale, unit.UnitDefinition?.ArabicTitle ?? unit.ArabicTitle, unit.UnitDefinition?.EnglishTitle ?? unit.EnglishTitle),
                Percentage(unitLessons.Count(lesson => completeLessonIds.Contains(lesson.Id)), unitLessons.Length),
                unitLessons.Count(lesson => completeLessonIds.Contains(lesson.Id)),
                unitLessons.Length,
                Summarize(unitCriteria),
                aims);
        }).ToArray();
        return new StudentCourseGradebookView(
            data.Course.Id,
            Localize(locale, data.Course.ArabicTitle, data.Course.EnglishTitle),
            Percentage(completeLessonIds.Count, data.Lessons.Count),
            completeLessonIds.Count,
            data.Lessons.Count,
            completedAssignments,
            data.Assignments.Count,
            Summarize(criteria),
            units,
            criteria);
    }

    private static BtecGradeSummary Summarize(IEnumerable<BtecCriterionProgressItem> values)
    {
        var criteria = values.ToArray();
        var pass = criteria.Where(criterion => criterion.Band == BtecCriterionBand.Pass.ToString()).ToArray();
        var merit = criteria.Where(criterion => criterion.Band == BtecCriterionBand.Merit.ToString()).ToArray();
        var distinction = criteria.Where(criterion => criterion.Band == BtecCriterionBand.Distinction.ToString()).ToArray();
        var passAchieved = pass.Count(IsAchieved);
        var meritAchieved = merit.Count(IsAchieved);
        var distinctionAchieved = distinction.Count(IsAchieved);
        var predicted = pass.Length == 0 || passAchieved != pass.Length
            ? EvaluationGrade.NotYetAchieved
            : merit.Length > 0 && meritAchieved == merit.Length && distinction.Length > 0 && distinctionAchieved == distinction.Length
                ? EvaluationGrade.Distinction
                : merit.Length > 0 && meritAchieved == merit.Length
                    ? EvaluationGrade.Merit
                    : EvaluationGrade.Pass;
        return new BtecGradeSummary(
            predicted.ToString(),
            passAchieved,
            pass.Length,
            meritAchieved,
            merit.Length,
            distinctionAchieved,
            distinction.Length);
    }

    private static bool IsAchieved(BtecCriterionProgressItem criterion) => criterion.Status == "Achieved";
    private static decimal Percentage(int complete, int total) => total == 0 ? 0m : Math.Round(complete * 100m / total, 2);
    private static string CriterionStatus(CourseAssignmentSubmission? submission, CourseAssignmentCriterionResult? result) => submission?.Status switch
    {
        null or CourseAssignmentSubmissionStatus.Draft => "NotStarted",
        CourseAssignmentSubmissionStatus.Submitted => "InReview",
        CourseAssignmentSubmissionStatus.NeedsRevision => "ResubmissionRequired",
        CourseAssignmentSubmissionStatus.Graded or CourseAssignmentSubmissionStatus.Finalized => result?.Achievement switch
        {
            CriterionAchievement.Achieved => "Achieved",
            CriterionAchievement.PartiallyAchieved => "NeedsImprovement",
            CriterionAchievement.NotApplicable => "NotApplicable",
            _ => "NotAchieved"
        },
        _ => "NotStarted"
    };
    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;

    private sealed record TopicAimMap(Guid Id, Guid BtecLearningAimId);

    private sealed record CourseData(
        Course Course,
        IReadOnlyList<CourseModule> Units,
        IReadOnlyList<Lesson> Lessons,
        IReadOnlyList<CourseAssignment> Assignments,
        IReadOnlyList<LessonProgress> LessonProgresses,
        IReadOnlyList<CourseAssignmentSubmission> Submissions,
        IReadOnlyList<BtecLearningAim> LearningAims,
        IReadOnlyList<TopicAimMap> Topics);
}
