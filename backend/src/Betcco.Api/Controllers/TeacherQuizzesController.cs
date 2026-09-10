using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Quizzes;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher")]
public sealed class TeacherQuizzesController(IQuizAuthoringService quizzes, BetccoDbContext db) : ControllerBase
{
    [HttpGet("courses/{courseId:guid}/quizzes")]
    public async Task<IActionResult> List(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Courses.AnyAsync(course => course.Id == courseId && course.TeacherUserId == UserId, cancellationToken)) return NotFound();
        var data = await db.Quizzes.AsNoTracking().Include(quiz => quiz.Questions)
            .Where(quiz => quiz.CourseId == courseId)
            .OrderBy(quiz => quiz.CreatedAtUtc).ToListAsync(cancellationToken);
        return Ok(data.Select(quiz => new
        {
            quiz.Id,
            quiz.CourseId,
            quiz.LessonId,
            quiz.ArabicTitle,
            quiz.EnglishTitle,
            quiz.PassMark,
            quiz.AttemptLimit,
            quiz.TimeLimitMinutes,
            quiz.RandomizeQuestions,
            quiz.RandomizeAnswers,
            quiz.ShowAnswers,
            quiz.ShowScore,
            quiz.AvailableFromUtc,
            quiz.AvailableUntilUtc,
            quiz.AllowLateAttempts,
            quiz.IsPublished,
            publicationStatus = quiz.PublicationStatus.ToString(),
            questions = quiz.Questions.OrderBy(question => question.SortOrder).Select(question => new { question.Id, type = question.Type.ToString(), question.ArabicText, question.EnglishText, options = JsonSerializer.Deserialize<string[]>(question.OptionsJson) ?? [], correctAnswers = JsonSerializer.Deserialize<string[]>(question.CorrectAnswersJson) ?? [], question.ImageResourceId, question.SortOrder })
        }));
    }

    [HttpPost("quizzes")]
    public async Task<IActionResult> Create(CreateQuizCommand command, CancellationToken cancellationToken)
    {
        var id = await quizzes.CreateAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Use a course you own, valid quiz details, and a quiz lesson from that course." }) : Ok(new { id });
    }

    [HttpPut("quizzes/{quizId:guid}")]
    public async Task<IActionResult> Update(Guid quizId, UpdateQuizCommand command, CancellationToken cancellationToken) => await quizzes.UpdateAsync(UserId, quizId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "Only a draft quiz without attempts can be structurally updated." });

    [HttpDelete("quizzes/{quizId:guid}")]
    public async Task<IActionResult> Delete(Guid quizId, CancellationToken cancellationToken) => await quizzes.DeleteAsync(UserId, quizId, cancellationToken) ? NoContent() : BadRequest(new { message = "Only a draft quiz without attempts can be deleted." });

    [HttpPost("quizzes/questions")]
    public async Task<IActionResult> AddQuestion(CreateQuizQuestionCommand command, CancellationToken cancellationToken)
    {
        var id = await quizzes.AddQuestionAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Provide a valid question, options, and correct answer for this draft quiz." }) : Ok(new { id });
    }

    [HttpDelete("quizzes/questions/{questionId:guid}")]
    public async Task<IActionResult> DeleteQuestion(Guid questionId, CancellationToken cancellationToken) => await quizzes.DeleteQuestionAsync(UserId, questionId, cancellationToken) ? NoContent() : BadRequest(new { message = "Published quizzes and quizzes with attempts cannot be structurally edited." });

    [HttpPost("quizzes/{quizId:guid}/publish")]
    public async Task<IActionResult> Publish(Guid quizId, PublishQuizRequest request, CancellationToken cancellationToken) => await quizzes.PublishAsync(UserId, quizId, request.Publish, cancellationToken) ? NoContent() : BadRequest(new { message = "A published quiz needs at least one question. A quiz with attempts cannot be unpublished." });

    [HttpPost("quizzes/{quizId:guid}/publication")]
    public async Task<IActionResult> SetPublication(Guid quizId, SetQuizPublicationRequest request, CancellationToken cancellationToken) =>
        await quizzes.SetPublicationStatusAsync(UserId, quizId, request.PublicationStatus, request.AvailableFromUtc, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "Use a valid publication state. Scheduled quizzes need a future opening date and published quizzes need questions." });

    [HttpGet("quizzes/{quizId:guid}/manual-reviews")]
    public async Task<IActionResult> ManualReviews(Guid quizId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var quiz = await db.Quizzes.AsNoTracking().Include(item => item.Questions)
            .SingleOrDefaultAsync(item => item.Id == quizId && db.Courses.Any(course => course.Id == item.CourseId && course.TeacherUserId == UserId), cancellationToken);
        if (quiz is null) return NotFound();

        var manualQuestions = quiz.Questions.Where(IsManuallyGraded).OrderBy(item => item.SortOrder).ToArray();
        if (manualQuestions.Length == 0) return Ok(new { total = 0, items = Array.Empty<object>() });
        var attemptsQuery = db.QuizAttempts.AsNoTracking()
            .Where(item => item.QuizId == quizId && item.SubmittedAtUtc != null && item.RequiresManualReview);
        var total = await attemptsQuery.CountAsync(cancellationToken);
        var attempts = await attemptsQuery.OrderBy(item => item.SubmittedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        var studentIds = attempts.Select(item => item.StudentUserId).Distinct().ToArray();
        var studentNames = await db.Users.AsNoTracking().Where(item => studentIds.Contains(item.Id.ToString()))
            .ToDictionaryAsync(item => item.Id.ToString(), item => item.DisplayName, cancellationToken);
        return Ok(new
        {
            total,
            page,
            pageSize,
            items = attempts.Select(attempt =>
            {
                var answers = DeserializeAnswers(attempt.AnswersJson);
                return new
                {
                    attempt.Id,
                    attempt.StudentUserId,
                    studentName = studentNames.GetValueOrDefault(attempt.StudentUserId, attempt.StudentUserId),
                    attempt.SubmittedAtUtc,
                    attempt.WasLate,
                    questions = manualQuestions.Select(question => new
                    {
                        question.Id,
                        type = question.Type.ToString(),
                        text = Localize(locale, question.ArabicText, question.EnglishText),
                        answer = answers.TryGetValue(question.Id, out var answer) ? string.Join("\n", answer) : string.Empty
                    })
                };
            })
        });
    }

    [HttpPut("quiz-attempts/{attemptId:guid}/manual-grades")]
    public async Task<IActionResult> GradeManualAttempt(Guid attemptId, ManualQuizGradeRequest request, CancellationToken cancellationToken)
    {
        var attempt = await db.QuizAttempts.Include(item => item.ManualQuestionGrades)
            .SingleOrDefaultAsync(item => item.Id == attemptId && item.SubmittedAtUtc != null && item.RequiresManualReview
                && db.Quizzes.Any(quiz => quiz.Id == item.QuizId && db.Courses.Any(course => course.Id == quiz.CourseId && course.TeacherUserId == UserId)), cancellationToken);
        if (attempt is null) return NotFound();
        var quiz = await db.Quizzes.Include(item => item.Questions).SingleAsync(item => item.Id == attempt.QuizId, cancellationToken);
        var manualQuestions = quiz.Questions.Where(IsManuallyGraded).ToArray();
        var grades = request.Grades ?? [];
        if (manualQuestions.Length == 0
            || grades.Count != manualQuestions.Length
            || grades.Select(item => item.QuestionId).Distinct().Count() != grades.Count
            || grades.Any(item => item.ScorePercent is < 0 or > 100 || (item.StudentFeedback?.Length ?? 0) > 4000)
            || !grades.Select(item => item.QuestionId).Order().SequenceEqual(manualQuestions.Select(item => item.Id).Order()))
            return BadRequest(new { message = "Provide one score from 0 to 100 for every manual quiz question." });

        foreach (var grade in grades)
        {
            var stored = attempt.ManualQuestionGrades.SingleOrDefault(item => item.QuizQuestionId == grade.QuestionId);
            if (stored is null)
            {
                stored = new QuizAttemptQuestionGrade { QuizAttemptId = attempt.Id, QuizQuestionId = grade.QuestionId, TeacherUserId = UserId };
                db.QuizAttemptQuestionGrades.Add(stored);
            }
            stored.ScorePercent = Math.Round(grade.ScorePercent, 2);
            stored.StudentFeedback = string.IsNullOrWhiteSpace(grade.StudentFeedback) ? null : grade.StudentFeedback.Trim();
            stored.TeacherUserId = UserId;
        }

        var answers = DeserializeAnswers(attempt.AnswersJson);
        var automaticCorrect = quiz.Questions.Count(question => !IsManuallyGraded(question)
            && answers.TryGetValue(question.Id, out var answer)
            && IsCorrect(question, answer));
        attempt.ScorePercent = quiz.Questions.Count == 0 ? 0 : Math.Round((automaticCorrect * 100m + grades.Sum(item => Math.Round(item.ScorePercent, 2))) / quiz.Questions.Count, 2);
        attempt.Passed = attempt.ScorePercent >= quiz.PassMark;
        attempt.RequiresManualReview = false;
        attempt.ManuallyGradedAtUtc = DateTimeOffset.UtcNow;
        db.Notifications.Add(new Notification
        {
            UserId = attempt.StudentUserId,
            Title = "Quiz graded",
            Body = "Your teacher has completed the manual marking for a quiz attempt.",
            Type = NotificationType.Course,
            DeepLink = $"/student/learn/{quiz.CourseId}"
        });
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = "QuizManualAttemptGraded",
            EntityType = nameof(QuizAttempt),
            EntityId = attempt.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { attempt.Id, attempt.ScorePercent, attempt.Passed, attempt.ManuallyGradedAtUtc });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static bool IsManuallyGraded(QuizQuestion question) => question.Type is QuizQuestionType.Essay or QuizQuestionType.CodeQuestion;

    private static bool IsCorrect(QuizQuestion question, IEnumerable<string>? submitted)
    {
        var expected = JsonSerializer.Deserialize<string[]>(question.CorrectAnswersJson) ?? [];
        var answers = (submitted ?? []).Select(answer => answer?.Trim() ?? string.Empty).Where(answer => answer.Length > 0).ToArray();
        return question.Type switch
        {
            QuizQuestionType.ShortAnswer or QuizQuestionType.FillInBlank => answers.Length == 1 && expected.Any(answer => string.Equals(answer, answers[0], StringComparison.OrdinalIgnoreCase)),
            QuizQuestionType.Ordering => expected.SequenceEqual(answers, StringComparer.OrdinalIgnoreCase),
            _ => expected.OrderBy(answer => answer, StringComparer.OrdinalIgnoreCase).SequenceEqual(answers.OrderBy(answer => answer, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase)
        };
    }

    private static Dictionary<Guid, string[]> DeserializeAnswers(string json) => JsonSerializer.Deserialize<Dictionary<Guid, string[]>>(json) ?? [];

    private static string Localize(string locale, string arabic, string english) => locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? arabic : english;
}

public sealed record PublishQuizRequest(bool Publish);
public sealed record SetQuizPublicationRequest(string PublicationStatus, DateTimeOffset? AvailableFromUtc);
public sealed record ManualQuizQuestionGrade(Guid QuestionId, decimal ScorePercent, string? StudentFeedback);
public sealed record ManualQuizGradeRequest(IReadOnlyCollection<ManualQuizQuestionGrade>? Grades);
