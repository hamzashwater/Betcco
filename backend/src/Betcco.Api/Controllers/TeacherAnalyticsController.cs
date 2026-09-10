using System.Security.Claims;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/analytics")]
public sealed class TeacherAnalyticsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
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
                    .Count(lesson => lesson.IsPublished)
            })
            .ToListAsync(cancellationToken);
        var courseIds = courses.Select(course => course.Id).ToArray();
        if (courseIds.Length == 0)
            return Ok(new { courses = 0, students = 0, pendingReviews = 0, quizAttempts = 0, averageQuizScore = 0m, averageLessonProgress = 0m, studentsAtRisk = Array.Empty<object>(), studentsAtRiskCount = 0 });

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
            .Where(lesson => courseIds.Contains(lesson.CourseModule!.CourseId) && lesson.CourseModule.IsPublished && lesson.IsPublished)
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
        var quizIds = await db.Quizzes.AsNoTracking()
            .Where(quiz => courseIds.Contains(quiz.CourseId))
            .Select(quiz => quiz.Id)
            .ToArrayAsync(cancellationToken);
        var quizData = await db.QuizAttempts.AsNoTracking()
            .Where(attempt => quizIds.Contains(attempt.QuizId) && attempt.SubmittedAtUtc != null && !attempt.RequiresManualReview && studentUserIds.Contains(attempt.StudentUserId))
            .Select(attempt => new { attempt.StudentUserId, attempt.ScorePercent })
            .ToListAsync(cancellationToken);
        var overdueAssignments = await db.CourseAssignments.AsNoTracking()
            .Where(assignment => courseIds.Contains(assignment.CourseId) && assignment.IsPublished && assignment.DueAtUtc < DateTimeOffset.UtcNow)
            .Select(assignment => new { assignment.Id, assignment.CourseId })
            .ToListAsync(cancellationToken);
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
        var quizScoresByStudent = quizData.GroupBy(attempt => attempt.StudentUserId)
            .ToDictionary(group => group.Key, group => group.Select(attempt => attempt.ScorePercent).ToArray());
        var submissionByStudentAndAssignment = assignmentSubmissions.ToDictionary(
            submission => (submission.StudentUserId, submission.CourseAssignmentId),
            submission => submission.Status);
        var now = DateTimeOffset.UtcNow;
        var studentsAtRisk = studentUserIds.Select(studentUserId =>
        {
            var enrolledCourseIds = enrolledCoursesByStudent.GetValueOrDefault(studentUserId, []);
            var expectedLessons = enrolledCourseIds.Sum(courseId => publishedLessonsByCourse.GetValueOrDefault(courseId));
            var completedLessons = completedLessonsByStudent.GetValueOrDefault(studentUserId, []).Count(lessonId => lessonCourseById.ContainsKey(lessonId) && enrolledCourseIds.Contains(lessonCourseById[lessonId]));
            var progressPercent = expectedLessons == 0 ? 0m : Math.Round(completedLessons * 100m / expectedLessons, 2);
            var missedAssignments = overdueAssignments.Count(assignment => enrolledCourseIds.Contains(assignment.CourseId)
                && (!submissionByStudentAndAssignment.TryGetValue((studentUserId, assignment.Id), out var status)
                    || status is CourseAssignmentSubmissionStatus.Draft or CourseAssignmentSubmissionStatus.NeedsRevision));
            var quizScores = quizScoresByStudent.GetValueOrDefault(studentUserId, []);
            var averageQuizScore = quizScores.Length == 0 ? (decimal?)null : Math.Round(quizScores.Average(), 2);
            lastActivity.TryGetValue(studentUserId, out var lastActiveAtUtc);
            var reasons = new List<string>();
            if (expectedLessons > 0 && progressPercent < 40m) reasons.Add("LowProgress");
            if (missedAssignments > 0) reasons.Add("MissedAssignments");
            if (averageQuizScore is < 50m) reasons.Add("LowQuizScore");
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
                averageQuizScore,
                lastActiveAtUtc = lastActiveAtUtc == default ? (DateTimeOffset?)null : lastActiveAtUtc
            };
        }).Where(student => student.reasons.Count > 0).OrderByDescending(student => student.riskLevel == "High").ThenByDescending(student => student.reasons.Count).ThenBy(student => student.studentName).ToArray();
        return Ok(new
        {
            courses = courses.Count,
            students = enrollments.Select(enrollment => enrollment.StudentUserId).Distinct().Count(),
            pendingReviews,
            quizAttempts = quizData.Count,
            averageQuizScore = quizData.Count == 0 ? 0m : Math.Round(quizData.Average(attempt => attempt.ScorePercent), 2),
            averageLessonProgress = learningSlots == 0 ? 0m : Math.Round(completed * 100m / learningSlots, 2),
            studentsAtRisk = studentsAtRisk.Take(8),
            studentsAtRiskCount = studentsAtRisk.Length
        });
    }
}
