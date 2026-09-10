using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Student")]
[Route("api/v1/quizzes")]
public sealed class QuizzesController(BetccoDbContext db, IFileStorage storage, IContentAccessService contentAccess) : ControllerBase
{
    [HttpGet("courses/{courseId:guid}")]
    public async Task<IActionResult> List(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        if (!await HasEnrollmentAsync(courseId, cancellationToken)) return NotFound();
        var studentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var now = DateTimeOffset.UtcNow;
        var quizzes = await db.Quizzes.Include(x => x.Questions).AsNoTracking()
            .Where(quiz => quiz.CourseId == courseId
                && quiz.IsPublished
                && quiz.PublicationStatus == ContentPublicationStatus.Published
                && (quiz.LessonId == null || db.Lessons.Any(lesson => lesson.Id == quiz.LessonId && lesson.IsPublished && lesson.CourseModule!.IsPublished)))
            .ToListAsync(cancellationToken);
        var accessibleQuizzes = new List<Quiz>();
        foreach (var quiz in quizzes)
        {
            if ((await contentAccess.CanAccessAsync(studentUserId, courseId, LearningContentType.Quiz, quiz.Id, cancellationToken)).IsAvailable)
                accessibleQuizzes.Add(quiz);
        }
        quizzes = accessibleQuizzes;
        var quizIds = quizzes.Select(quiz => quiz.Id).ToArray();
        var activeAttempts = await db.QuizAttempts.AsNoTracking()
            .Where(attempt => attempt.StudentUserId == studentUserId && quizIds.Contains(attempt.QuizId) && attempt.SubmittedAtUtc == null)
            .OrderByDescending(attempt => attempt.StartedAtUtc)
            .ToListAsync(cancellationToken);
        var activeByQuiz = activeAttempts
            .GroupBy(attempt => attempt.QuizId)
            .ToDictionary(group => group.Key, group => group.First());
        var completedAttempts = await db.QuizAttempts.AsNoTracking()
            .Where(attempt => attempt.StudentUserId == studentUserId && quizIds.Contains(attempt.QuizId) && attempt.SubmittedAtUtc != null)
            .OrderByDescending(attempt => attempt.SubmittedAtUtc)
            .ToListAsync(cancellationToken);
        var latestCompletedByQuiz = completedAttempts
            .GroupBy(attempt => attempt.QuizId)
            .ToDictionary(group => group.Key, group => group.First());
        var latestAttemptIds = latestCompletedByQuiz.Values.Select(attempt => attempt.Id).ToArray();
        IReadOnlyDictionary<Guid, List<(Guid QuestionId, string ArabicText, string EnglishText, string Feedback)>> manualFeedbackByAttempt = latestAttemptIds.Length == 0
            ? new Dictionary<Guid, List<(Guid QuestionId, string ArabicText, string EnglishText, string Feedback)>>()
            : (await (from grade in db.QuizAttemptQuestionGrades.AsNoTracking()
                      join question in db.QuizQuestions.AsNoTracking() on grade.QuizQuestionId equals question.Id
                      where latestAttemptIds.Contains(grade.QuizAttemptId) && !string.IsNullOrWhiteSpace(grade.StudentFeedback)
                      select new { grade.QuizAttemptId, grade.QuizQuestionId, question.ArabicText, question.EnglishText, grade.StudentFeedback })
                .ToListAsync(cancellationToken))
                .GroupBy(item => item.QuizAttemptId)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(item => (QuestionId: item.QuizQuestionId, item.ArabicText, item.EnglishText, Feedback: item.StudentFeedback!)).ToList());
        return Ok(quizzes.Select(quiz => new
        {
            quiz.Id,
            quiz.LessonId,
            title = locale.StartsWith("ar") ? quiz.ArabicTitle : quiz.EnglishTitle,
            quiz.PassMark,
            quiz.TimeLimitMinutes,
            quiz.ShowScore,
            quiz.ShowAnswers,
            quiz.AvailableFromUtc,
            quiz.AvailableUntilUtc,
            quiz.AllowLateAttempts,
            isOpen = IsOpenForAttempt(quiz, now),
            isLate = IsLate(quiz, now),
            activeAttempt = activeByQuiz.TryGetValue(quiz.Id, out var activeAttempt)
                ? new
                {
                    activeAttempt.Id,
                    activeAttempt.StartedAtUtc,
                    expiresAtUtc = quiz.TimeLimitMinutes is { } minutes && activeAttempt.StartedAtUtc is { } startedAt
                        ? startedAt.AddMinutes(minutes)
                        : (DateTimeOffset?)null
                }
                : null,
            latestAttempt = latestCompletedByQuiz.TryGetValue(quiz.Id, out var latestAttempt)
                ? new
                {
                    latestAttempt.Id,
                    latestAttempt.SubmittedAtUtc,
                    latestAttempt.RequiresManualReview,
                    isFinal = !latestAttempt.RequiresManualReview,
                    scorePercent = quiz.ShowScore && !latestAttempt.RequiresManualReview ? latestAttempt.ScorePercent : (decimal?)null,
                    passed = quiz.ShowScore && !latestAttempt.RequiresManualReview ? latestAttempt.Passed : (bool?)null,
                    latestAttempt.WasLate,
                    feedback = manualFeedbackByAttempt.TryGetValue(latestAttempt.Id, out var feedback)
                        ? feedback.Select(item => new
                        {
                            item.QuestionId,
                            question = Localize(locale, item.ArabicText, item.EnglishText),
                            item.Feedback
                        })
                        : []
                }
                : null,
            questions = OrderedQuestions(quiz, studentUserId).Select(question => new
            {
                question.Id,
                type = question.Type.ToString(),
                text = locale.StartsWith("ar") ? question.ArabicText : question.EnglishText,
                options = OrderedOptions(JsonSerializer.Deserialize<string[]>(question.OptionsJson) ?? [], quiz, question.Id, studentUserId),
                matchingOptions = question.Type == QuizQuestionType.Matching
                    ? OrderedOptions(MatchingOptions(question.CorrectAnswersJson), quiz, question.Id, studentUserId)
                    : [],
                imagePath = question.Type == QuizQuestionType.ImageQuestion && question.ImageResourceId is { } imageResourceId
                    ? $"/api/v1/quizzes/questions/{question.Id}/image"
                    : null
            })
        }));
    }

    [HttpGet("questions/{questionId:guid}/image")]
    public async Task<IActionResult> GetQuestionImage(Guid questionId, CancellationToken cancellationToken)
    {
        var question = await db.QuizQuestions.AsNoTracking()
            .Include(item => item.Quiz)
            .Include(item => item.ImageResource)
            .SingleOrDefaultAsync(item => item.Id == questionId
                && item.Type == QuizQuestionType.ImageQuestion
                && item.Quiz!.IsPublished
                && item.Quiz.PublicationStatus == ContentPublicationStatus.Published
                && item.ImageResource != null
                && item.ImageResource.ScanStatus == UploadScanStatus.Clean
                && item.ImageResource.ContentType.StartsWith("image/"), cancellationToken);
        if (question is null || !await HasEnrollmentAsync(question.Quiz!.CourseId, cancellationToken)
            || !(await contentAccess.CanAccessAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!, question.Quiz.CourseId, LearningContentType.Quiz, question.Quiz.Id, cancellationToken)).IsAvailable) return NotFound();
        var content = await storage.OpenPrivateReadAsync(question.ImageResource!.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, question.ImageResource.ContentType, enableRangeProcessing: true);
    }

    [HttpPost("{quizId:guid}/attempts/start")]
    public async Task<IActionResult> Start(Guid quizId, CancellationToken cancellationToken)
    {
        var quiz = await db.Quizzes.SingleOrDefaultAsync(item => item.Id == quizId && item.IsPublished && item.PublicationStatus == ContentPublicationStatus.Published, cancellationToken);
        if (quiz is null
            || !await HasEnrollmentAsync(quiz.CourseId, cancellationToken)
            || !(await contentAccess.CanAccessAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!, quiz.CourseId, LearningContentType.Quiz, quiz.Id, cancellationToken)).IsAvailable) return NotFound();
        var now = DateTimeOffset.UtcNow;
        if (!IsOpenForAttempt(quiz, now)) return Conflict(new { message = AttemptWindowMessage(quiz, now) });
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var activeAttempt = await db.QuizAttempts
            .Where(attempt => attempt.StudentUserId == userId && attempt.QuizId == quizId && attempt.SubmittedAtUtc == null)
            .OrderByDescending(attempt => attempt.StartedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (activeAttempt is not null && IsTimedOut(quiz, activeAttempt, now))
        {
            ExpireAttempt(activeAttempt, quiz, now);
            await db.SaveChangesAsync(cancellationToken);
            activeAttempt = null;
        }
        if (activeAttempt is null)
        {
            var completedAttempts = await db.QuizAttempts.CountAsync(attempt => attempt.StudentUserId == userId && attempt.QuizId == quizId && attempt.SubmittedAtUtc != null, cancellationToken);
            if (quiz.AttemptLimit is not null && completedAttempts >= quiz.AttemptLimit) return BadRequest(new { message = "The attempt limit has been reached." });
            activeAttempt = new QuizAttempt { StudentUserId = userId, QuizId = quizId, StartedAtUtc = now };
            db.QuizAttempts.Add(activeAttempt);
            await db.SaveChangesAsync(cancellationToken);
        }
        return Ok(AttemptView(activeAttempt, quiz));
    }

    [HttpPost("{quizId:guid}/attempts")]
    public async Task<IActionResult> Submit(Guid quizId, SubmitQuizRequest request, CancellationToken cancellationToken)
    {
        var quiz = await db.Quizzes.Include(x => x.Questions).SingleOrDefaultAsync(x => x.Id == quizId && x.IsPublished && x.PublicationStatus == ContentPublicationStatus.Published, cancellationToken);
        if (quiz is null
            || !await HasEnrollmentAsync(quiz.CourseId, cancellationToken)
            || !(await contentAccess.CanAccessAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!, quiz.CourseId, LearningContentType.Quiz, quiz.Id, cancellationToken)).IsAvailable) return NotFound();
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var attempt = await db.QuizAttempts.SingleOrDefaultAsync(item => item.Id == request.AttemptId && item.StudentUserId == userId && item.QuizId == quizId && item.SubmittedAtUtc == null, cancellationToken);
        if (attempt is null) return NotFound();
        var now = DateTimeOffset.UtcNow;
        if (!IsOpenForAttempt(quiz, now) || IsTimedOut(quiz, attempt, now))
        {
            ExpireAttempt(attempt, quiz, now);
            await db.SaveChangesAsync(cancellationToken);
            return Conflict(new { message = IsTimedOut(quiz, attempt, now) ? "The quiz time limit has expired." : AttemptWindowMessage(quiz, now) });
        }
        var submittedAnswers = request.Answers ?? new Dictionary<Guid, string[]>();
        var manualQuestions = quiz.Questions.Where(IsManuallyGraded).ToArray();
        var correct = quiz.Questions.Count(question => !IsManuallyGraded(question)
            && submittedAnswers.TryGetValue(question.Id, out var answer)
            && IsCorrect(question, answer));
        // Each question has equal weight. For manual questions the automatic
        // portion is retained internally, but never presented as a final result.
        var score = quiz.Questions.Count == 0 ? 0 : Math.Round(correct * 100m / quiz.Questions.Count, 2);
        attempt.ScorePercent = score;
        attempt.RequiresManualReview = manualQuestions.Length > 0;
        attempt.ManuallyGradedAtUtc = null;
        attempt.Passed = !attempt.RequiresManualReview && score >= quiz.PassMark;
        attempt.AnswersJson = JsonSerializer.Serialize(submittedAnswers);
        attempt.SubmittedAtUtc = now;
        attempt.WasLate = IsLate(quiz, now);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new
        {
            attempt.Id,
            submitted = true,
            quiz.ShowScore,
            requiresManualReview = attempt.RequiresManualReview,
            scorePercent = quiz.ShowScore && !attempt.RequiresManualReview ? attempt.ScorePercent : (decimal?)null,
            passed = quiz.ShowScore && !attempt.RequiresManualReview ? attempt.Passed : (bool?)null,
            attempt.WasLate,
            review = quiz.ShowAnswers
                ? quiz.Questions.Where(question => !IsManuallyGraded(question)).OrderBy(question => question.SortOrder).Select(question => new
                {
                    question.Id,
                    isCorrect = submittedAnswers.TryGetValue(question.Id, out var answers) && IsCorrect(question, answers),
                    correctAnswers = JsonSerializer.Deserialize<string[]>(question.CorrectAnswersJson) ?? []
                })
                : []
        });
    }

    private async Task<bool> HasEnrollmentAsync(Guid courseId, CancellationToken cancellationToken) => await db.Enrollments.AnyAsync(enrollment =>
        enrollment.CourseId == courseId
        && enrollment.StudentUserId == User.FindFirstValue(ClaimTypes.NameIdentifier)
        && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow)
        && db.Courses.Any(course => course.Id == courseId && course.Status == CourseStatus.Published), cancellationToken);

    private async Task<bool> IsLessonVisibleAsync(Guid? lessonId, CancellationToken cancellationToken) => lessonId is null || await db.Lessons.AsNoTracking().AnyAsync(lesson =>
        lesson.Id == lessonId
        && lesson.IsPublished
        && lesson.CourseModule!.IsPublished, cancellationToken);

    private static bool IsOpenForAttempt(Quiz quiz, DateTimeOffset now) => (!quiz.AvailableFromUtc.HasValue || now >= quiz.AvailableFromUtc)
        && (!quiz.AvailableUntilUtc.HasValue || now <= quiz.AvailableUntilUtc || quiz.AllowLateAttempts);

    private static bool IsLate(Quiz quiz, DateTimeOffset now) => quiz.AvailableUntilUtc is { } until && now > until;

    private static string AttemptWindowMessage(Quiz quiz, DateTimeOffset now) => quiz.AvailableFromUtc is { } startsAt && now < startsAt
        ? "This quiz is not available yet."
        : "The quiz availability window has closed.";

    private static bool IsTimedOut(Quiz quiz, QuizAttempt attempt, DateTimeOffset now) => quiz.TimeLimitMinutes is { } minutes
        && attempt.StartedAtUtc is { } startedAt
        && now >= startedAt.AddMinutes(minutes);

    private static void ExpireAttempt(QuizAttempt attempt, Quiz quiz, DateTimeOffset now)
    {
        attempt.ScorePercent = 0m;
        attempt.Passed = false;
        attempt.SubmittedAtUtc = now;
        attempt.WasLate = IsLate(quiz, now);
    }

    private static object AttemptView(QuizAttempt attempt, Quiz quiz) => new
    {
        attempt.Id,
        attempt.StartedAtUtc,
        expiresAtUtc = quiz.TimeLimitMinutes is { } minutes && attempt.StartedAtUtc is { } startedAt
            ? startedAt.AddMinutes(minutes)
            : (DateTimeOffset?)null
    };

    private static IEnumerable<QuizQuestion> OrderedQuestions(Quiz quiz, string studentUserId) => quiz.RandomizeQuestions
        ? quiz.Questions.OrderBy(question => StableRank($"{studentUserId}:{quiz.Id}:{question.Id}"))
        : quiz.Questions.OrderBy(question => question.SortOrder);

    private static string[] OrderedOptions(IEnumerable<string> options, Quiz quiz, Guid questionId, string studentUserId) => quiz.RandomizeAnswers
        ? options.OrderBy(option => StableRank($"{studentUserId}:{quiz.Id}:{questionId}:{option}")).ToArray()
        : options.ToArray();

    private static ulong StableRank(string source) => BitConverter.ToUInt64(SHA256.HashData(Encoding.UTF8.GetBytes(source)));

    private static bool IsCorrect(QuizQuestion question, IEnumerable<string>? submitted)
    {
        var expected = JsonSerializer.Deserialize<string[]>(question.CorrectAnswersJson) ?? [];
        var answers = (submitted ?? []).Select(answer => answer?.Trim() ?? string.Empty).Where(answer => answer.Length > 0).ToArray();
        return question.Type switch
        {
            QuizQuestionType.ShortAnswer or QuizQuestionType.FillInBlank => answers.Length == 1 && expected.Any(answer => string.Equals(answer, answers[0], StringComparison.OrdinalIgnoreCase)),
            QuizQuestionType.Ordering => expected.SequenceEqual(answers, StringComparer.OrdinalIgnoreCase),
            QuizQuestionType.Matching => SameValues(expected, answers),
            _ => SameValues(expected, answers)
        };
    }

    private static bool IsManuallyGraded(QuizQuestion question) => question.Type is QuizQuestionType.Essay or QuizQuestionType.CodeQuestion;

    private static bool SameValues(IEnumerable<string> expected, IEnumerable<string> answers) => expected
        .OrderBy(answer => answer, StringComparer.OrdinalIgnoreCase)
        .SequenceEqual(answers.OrderBy(answer => answer, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase);

    private static string[] MatchingOptions(string correctAnswersJson) => (JsonSerializer.Deserialize<string[]>(correctAnswersJson) ?? [])
        .Select(answer => answer.IndexOf("=>", StringComparison.Ordinal) is var separator && separator >= 0
            ? answer[(separator + 2)..].Trim()
            : string.Empty)
        .Where(answer => answer.Length > 0)
        .ToArray();

    private static string Localize(string locale, string arabic, string english) => locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? arabic : english;
}

public sealed record SubmitQuizRequest(Guid AttemptId, Dictionary<Guid, string[]> Answers);
