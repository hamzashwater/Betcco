using System.Security.Claims;
using Betcco.Application.Assignments;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/analytics")]
public sealed class TeacherAnalyticsController(BetccoDbContext db, ICourseAssignmentDeadlineResolver? deadlineResolver = null) : ControllerBase
{
    private readonly ICourseAssignmentDeadlineResolver deadlineResolverService = deadlineResolver ?? new CourseAssignmentDeadlineResolver(db);
    [HttpGet]
    public async Task<IActionResult> Get(
        CancellationToken cancellationToken,
        [FromQuery] bool followUp = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? search = null,
        [FromQuery] string? attention = null,
        [FromQuery] string? reason = null,
        [FromQuery] string sort = "priority")
    {
        var allowedAttentionLevels = new[] { "High", "Medium" };
        var allowedReasons = new[] { "LowProgress", "MissedAssignments", "Inactive14Days" };
        var allowedSorts = new[] { "priority", "progress", "missedAssignments", "lastActivity" };
        if (followUp && (page < 1 || pageSize is < 1 or > 100
            || search?.Length > 200
            || attention is not null && !allowedAttentionLevels.Contains(attention, StringComparer.OrdinalIgnoreCase)
            || reason is not null && !allowedReasons.Contains(reason, StringComparer.OrdinalIgnoreCase)
            || !allowedSorts.Contains(sort, StringComparer.OrdinalIgnoreCase)))
            return BadRequest(new
            {
                message = "Use page >= 1, pageSize between 1 and 100, a search up to 200 characters, supported attention/reason filters, and a supported sort."
            });

        var teacherUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (teacherUserId is null) return Unauthorized();
        var courses = await db.Courses.AsNoTracking()
            .Where(course => course.TeacherUserId == teacherUserId)
            .Select(course => new
            {
                course.Id,
                PublishedLessons = course.Modules
                    .Where(module => module.IsPublished)
                    .SelectMany(module => module.Lessons)
                    .Count(lesson => lesson.IsPublished && lesson.Type != LessonType.LegacyArchived)
            })
            .ToListAsync(cancellationToken);
        var courseIds = courses.Select(course => course.Id).ToArray();
        if (courseIds.Length == 0)
        {
            var empty = Array.Empty<object>();
            return followUp
                ? Ok(new { courses = 0, students = 0, pendingReviews = 0, averageLessonProgress = 0m, studentsAtRisk = empty, studentsAtRiskCount = 0, filteredStudentsAtRiskCount = 0, page, pageSize })
                : Ok(new { courses = 0, students = 0, pendingReviews = 0, averageLessonProgress = 0m, studentsAtRisk = empty, studentsAtRiskCount = 0 });
        }

        var enrollments = await db.Enrollments.AsNoTracking()
            .Where(enrollment => courseIds.Contains(enrollment.CourseId))
            .Select(enrollment => new { enrollment.StudentUserId, enrollment.CourseId })
            .ToListAsync(cancellationToken);
        var studentUserIds = enrollments
            .Select(enrollment => enrollment.StudentUserId)
            .Distinct()
            .ToArray();
        var publishedLessonsByCourse = courses.ToDictionary(course => course.Id, course => course.PublishedLessons);
        var publishedLessons = await db.Lessons.AsNoTracking()
            .Where(lesson => courseIds.Contains(lesson.CourseModule!.CourseId) && lesson.CourseModule.IsPublished && lesson.IsPublished && lesson.Type != LessonType.LegacyArchived)
            .Select(lesson => new { lesson.Id, CourseId = lesson.CourseModule!.CourseId })
            .ToListAsync(cancellationToken);
        var lessonIds = publishedLessons.Select(lesson => lesson.Id).ToArray();
        var completedProgress = lessonIds.Length == 0 || studentUserIds.Length == 0
            ? []
            : await db.LessonProgresses.AsNoTracking()
                .Where(progress => progress.IsCompleted && lessonIds.Contains(progress.LessonId) && studentUserIds.Contains(progress.StudentUserId))
                .Select(progress => new { progress.StudentUserId, progress.LessonId })
                .ToListAsync(cancellationToken);
        var completed = completedProgress.Count;
        var learningSlots = enrollments.Sum(enrollment => publishedLessonsByCourse[enrollment.CourseId]);
        var pendingReviews = await db.CourseAssignmentSubmissions.AsNoTracking()
            .CountAsync(submission => courseIds.Contains(submission.CourseAssignment!.CourseId) && submission.Status == CourseAssignmentSubmissionStatus.Submitted, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var overdueAssignments = await db.CourseAssignments.AsNoTracking()
            .Where(assignment => courseIds.Contains(assignment.CourseId) && assignment.IsPublished && assignment.DueAtUtc < now)
            .Select(assignment => new { assignment.Id, assignment.CourseId, assignment.DueAtUtc })
            .ToListAsync(cancellationToken);
        var assignmentDeadlines = await deadlineResolverService.ResolveManyAsync(overdueAssignments
            .SelectMany(assignment => enrollments.Where(enrollment => enrollment.CourseId == assignment.CourseId)
                .Select(enrollment => new CourseAssignmentDeadlineTarget(assignment.Id, enrollment.StudentUserId, assignment.DueAtUtc)))
            .ToArray(), cancellationToken);
        var overdueAssignmentIds = overdueAssignments.Select(assignment => assignment.Id).ToArray();
        var assignmentSubmissions = overdueAssignmentIds.Length == 0
            ? []
            : await db.CourseAssignmentSubmissions.AsNoTracking()
                .Where(submission => overdueAssignmentIds.Contains(submission.CourseAssignmentId) && studentUserIds.Contains(submission.StudentUserId))
                .Select(submission => new { submission.StudentUserId, submission.CourseAssignmentId, submission.Status })
                .ToListAsync(cancellationToken);
        var names = await db.Users.AsNoTracking()
            .Where(user => studentUserIds.Contains(user.Id.ToString()))
            .Select(user => new { Id = user.Id.ToString(), user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
        var lastActivity = await db.UserSessions.AsNoTracking()
            .Where(session => studentUserIds.Contains(session.UserId) && session.RevokedAtUtc == null && !session.IsDeleted)
            .GroupBy(session => session.UserId)
            .Select(group => new { StudentUserId = group.Key, LastActiveAtUtc = group.Max(session => session.LastActiveAtUtc) })
            .ToDictionaryAsync(item => item.StudentUserId, item => item.LastActiveAtUtc, cancellationToken);

        var enrolledCoursesByStudent = enrollments.GroupBy(enrollment => enrollment.StudentUserId)
            .ToDictionary(group => group.Key, group => group.Select(enrollment => enrollment.CourseId).ToHashSet());
        var lessonCourseById = publishedLessons.ToDictionary(lesson => lesson.Id, lesson => lesson.CourseId);
        var completedLessonsByStudent = completedProgress.GroupBy(progress => progress.StudentUserId)
            .ToDictionary(group => group.Key, group => group.Select(progress => progress.LessonId).ToHashSet());
        var submissionByStudentAndAssignment = assignmentSubmissions.ToDictionary(
            submission => (submission.StudentUserId, submission.CourseAssignmentId),
            submission => submission.Status);
        var studentsAtRisk = studentUserIds.Select(studentUserId =>
        {
            var enrolledCourseIds = enrolledCoursesByStudent.GetValueOrDefault(studentUserId, []);
            var expectedLessons = enrolledCourseIds.Sum(courseId => publishedLessonsByCourse.GetValueOrDefault(courseId));
            var completedLessons = completedLessonsByStudent.GetValueOrDefault(studentUserId, []).Count(lessonId => lessonCourseById.ContainsKey(lessonId) && enrolledCourseIds.Contains(lessonCourseById[lessonId]));
            var progressPercent = expectedLessons == 0 ? 0m : Math.Round(completedLessons * 100m / expectedLessons, 2);
            var missedAssignments = overdueAssignments.Count(assignment => enrolledCourseIds.Contains(assignment.CourseId)
                && assignmentDeadlines[(assignment.Id, studentUserId)].EffectiveDueAtUtc < now
                && (!submissionByStudentAndAssignment.TryGetValue((studentUserId, assignment.Id), out var status)
                    || status is CourseAssignmentSubmissionStatus.Draft or CourseAssignmentSubmissionStatus.NeedsRevision));
            lastActivity.TryGetValue(studentUserId, out var lastActiveAtUtc);
            var reasons = new List<string>();
            if (expectedLessons > 0 && progressPercent < 40m) reasons.Add("LowProgress");
            if (missedAssignments > 0) reasons.Add("MissedAssignments");
            if (lastActiveAtUtc != default && lastActiveAtUtc <= now.AddDays(-14)) reasons.Add("Inactive14Days");
            var riskLevel = reasons.Count switch
            {
                0 => "Low",
                1 => "Medium",
                _ => "High"
            };
            return new
            {
                studentUserId,
                studentName = names.GetValueOrDefault(studentUserId, "Student"),
                riskLevel,
                reasons,
                progressPercent,
                missedAssignments,
                lastActiveAtUtc = lastActiveAtUtc == default ? (DateTimeOffset?)null : lastActiveAtUtc
            };
        }).Where(student => student.reasons.Count > 0).OrderByDescending(student => student.riskLevel == "High").ThenByDescending(student => student.reasons.Count).ThenBy(student => student.studentName).ToArray();
        if (!followUp)
            return Ok(new
            {
                courses = courses.Count,
                students = enrollments.Select(enrollment => enrollment.StudentUserId).Distinct().Count(),
                pendingReviews,
                averageLessonProgress = learningSlots == 0 ? 0m : Math.Round(completed * 100m / learningSlots, 2),
                studentsAtRisk = studentsAtRisk.Take(8),
                studentsAtRiskCount = studentsAtRisk.Length
            });

        var filteredStudents = studentsAtRisk.AsEnumerable();
        var normalizedSearch = search?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedSearch))
            filteredStudents = filteredStudents.Where(student => student.studentName.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(attention))
            filteredStudents = filteredStudents.Where(student => string.Equals(student.riskLevel, attention, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(reason))
            filteredStudents = filteredStudents.Where(student => student.reasons.Contains(reason, StringComparer.OrdinalIgnoreCase));

        var orderedStudents = sort.ToLowerInvariant() switch
        {
            "progress" => filteredStudents.OrderBy(student => student.progressPercent)
                .ThenBy(student => student.studentName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(student => student.studentUserId, StringComparer.Ordinal),
            "missedassignments" => filteredStudents.OrderByDescending(student => student.missedAssignments)
                .ThenBy(student => student.studentName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(student => student.studentUserId, StringComparer.Ordinal),
            "lastactivity" => filteredStudents.OrderBy(student => student.lastActiveAtUtc is null)
                .ThenBy(student => student.lastActiveAtUtc)
                .ThenBy(student => student.studentName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(student => student.studentUserId, StringComparer.Ordinal),
            _ => filteredStudents.OrderByDescending(student => student.riskLevel == "High")
                .ThenByDescending(student => student.reasons.Count)
                .ThenBy(student => student.studentName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(student => student.studentUserId, StringComparer.Ordinal)
        };
        var filteredStudentsAtRisk = orderedStudents.ToArray();
        var skip = (page - 1L) * pageSize;
        var pagedStudentsAtRisk = skip >= filteredStudentsAtRisk.Length
            ? filteredStudentsAtRisk.Take(0).ToArray()
            : filteredStudentsAtRisk.Skip((int)skip).Take(pageSize).ToArray();

        return Ok(new
        {
            courses = courses.Count,
            students = enrollments.Select(enrollment => enrollment.StudentUserId).Distinct().Count(),
            pendingReviews,
            averageLessonProgress = learningSlots == 0 ? 0m : Math.Round(completed * 100m / learningSlots, 2),
            studentsAtRisk = pagedStudentsAtRisk,
            studentsAtRiskCount = studentsAtRisk.Length,
            filteredStudentsAtRiskCount = filteredStudentsAtRisk.Length,
            page,
            pageSize
        });
    }
}
