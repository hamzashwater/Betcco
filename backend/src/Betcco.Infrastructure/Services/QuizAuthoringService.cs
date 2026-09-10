using System.Text.Json;
using Betcco.Application.Quizzes;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>Teacher-owned quiz authoring. Correct answers never leave this service through student endpoints.</summary>
public sealed class QuizAuthoringService(BetccoDbContext db) : IQuizAuthoringService
{
    public async Task<Guid?> CreateAsync(string teacherUserId, CreateQuizCommand command, CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.SingleOrDefaultAsync(item => item.Id == command.CourseId && item.TeacherUserId == teacherUserId, cancellationToken);
        if (course is null || !CanAuthor(course.Status) || !ValidQuiz(command)
            || !await ValidLessonAsync(course.Id, command.LessonId, cancellationToken)) return null;
        var quiz = new Quiz
        {
            CourseId = course.Id,
            LessonId = command.LessonId,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            PassMark = command.PassMark,
            AttemptLimit = command.AttemptLimit,
            TimeLimitMinutes = command.TimeLimitMinutes,
            RandomizeQuestions = command.RandomizeQuestions,
            RandomizeAnswers = command.RandomizeAnswers,
            ShowAnswers = command.ShowAnswers,
            ShowScore = command.ShowScore,
            AvailableFromUtc = command.AvailableFromUtc,
            AvailableUntilUtc = command.AvailableUntilUtc,
            AllowLateAttempts = command.AllowLateAttempts,
            IsPublished = false,
            PublicationStatus = ContentPublicationStatus.Draft
        };
        db.Quizzes.Add(quiz);
        db.AuditLogs.Add(Audit(teacherUserId, "QuizCreated", nameof(Quiz), quiz.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return quiz.Id;
    }

    public async Task<bool> UpdateAsync(string teacherUserId, Guid quizId, UpdateQuizCommand command, CancellationToken cancellationToken = default)
    {
        var quiz = await OwnedQuizAsync(teacherUserId, quizId, cancellationToken);
        if (quiz is null || quiz.PublicationStatus != ContentPublicationStatus.Draft || !ValidQuiz(command)
            || !await ValidLessonAsync(quiz.CourseId, command.LessonId, cancellationToken)) return false;
        quiz.LessonId = command.LessonId;
        quiz.ArabicTitle = command.ArabicTitle.Trim();
        quiz.EnglishTitle = command.EnglishTitle.Trim();
        quiz.PassMark = command.PassMark;
        quiz.AttemptLimit = command.AttemptLimit;
        quiz.TimeLimitMinutes = command.TimeLimitMinutes;
        quiz.RandomizeQuestions = command.RandomizeQuestions;
        quiz.RandomizeAnswers = command.RandomizeAnswers;
        quiz.ShowAnswers = command.ShowAnswers;
        quiz.ShowScore = command.ShowScore;
        quiz.AvailableFromUtc = command.AvailableFromUtc;
        quiz.AvailableUntilUtc = command.AvailableUntilUtc;
        quiz.AllowLateAttempts = command.AllowLateAttempts;
        db.AuditLogs.Add(Audit(teacherUserId, "QuizUpdated", nameof(Quiz), quiz.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(string teacherUserId, Guid quizId, CancellationToken cancellationToken = default)
    {
        var quiz = await OwnedQuizAsync(teacherUserId, quizId, cancellationToken);
        if (quiz is null || quiz.PublicationStatus != ContentPublicationStatus.Draft || await db.QuizAttempts.AnyAsync(item => item.QuizId == quizId, cancellationToken)) return false;
        db.Quizzes.Remove(quiz);
        db.AuditLogs.Add(Audit(teacherUserId, "QuizDeleted", nameof(Quiz), quizId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddQuestionAsync(string teacherUserId, CreateQuizQuestionCommand command, CancellationToken cancellationToken = default)
    {
        var quiz = await OwnedQuizAsync(teacherUserId, command.QuizId, cancellationToken);
        if (quiz is null || quiz.PublicationStatus != ContentPublicationStatus.Draft || await db.QuizAttempts.AnyAsync(item => item.QuizId == quiz.Id, cancellationToken)
            || string.IsNullOrWhiteSpace(command.ArabicText) || string.IsNullOrWhiteSpace(command.EnglishText)
            || !Enum.TryParse<QuizQuestionType>(command.Type, true, out var type)
            || !TryNormalizeQuestion(type, command.Options, command.CorrectAnswers, out var options, out var correctAnswers)
            || !await HasValidImageResourceAsync(quiz.CourseId, type, command.ImageResourceId, cancellationToken)) return null;
        var question = new QuizQuestion
        {
            QuizId = quiz.Id,
            Type = type,
            ArabicText = command.ArabicText.Trim(),
            EnglishText = command.EnglishText.Trim(),
            OptionsJson = JsonSerializer.Serialize(options),
            CorrectAnswersJson = JsonSerializer.Serialize(correctAnswers),
            ImageResourceId = command.ImageResourceId,
            SortOrder = Math.Max(0, command.SortOrder)
        };
        db.QuizQuestions.Add(question);
        db.AuditLogs.Add(Audit(teacherUserId, "QuizQuestionAdded", nameof(QuizQuestion), question.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return question.Id;
    }

    public async Task<bool> DeleteQuestionAsync(string teacherUserId, Guid questionId, CancellationToken cancellationToken = default)
    {
        var question = await (from item in db.QuizQuestions
                              join quiz in db.Quizzes on item.QuizId equals quiz.Id
                              join course in db.Courses on quiz.CourseId equals course.Id
                              where item.Id == questionId && course.TeacherUserId == teacherUserId
                              select item).SingleOrDefaultAsync(cancellationToken);
        if (question is null || await db.Quizzes.AnyAsync(item => item.Id == question.QuizId && item.PublicationStatus != ContentPublicationStatus.Draft, cancellationToken)
            || await db.QuizAttempts.AnyAsync(item => item.QuizId == question.QuizId, cancellationToken)) return false;
        db.QuizQuestions.Remove(question);
        db.AuditLogs.Add(Audit(teacherUserId, "QuizQuestionDeleted", nameof(QuizQuestion), questionId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> PublishAsync(string teacherUserId, Guid quizId, bool publish, CancellationToken cancellationToken = default)
    {
        var quiz = await OwnedQuizAsync(teacherUserId, quizId, cancellationToken);
        if (quiz is null) return false;
        if (publish && !await db.QuizQuestions.AnyAsync(item => item.QuizId == quizId, cancellationToken)) return false;
        if (!publish && await db.QuizAttempts.AnyAsync(item => item.QuizId == quizId, cancellationToken)) return false;
        quiz.IsPublished = publish;
        quiz.PublicationStatus = publish ? ContentPublicationStatus.Published : ContentPublicationStatus.Draft;
        db.AuditLogs.Add(Audit(teacherUserId, publish ? "QuizPublished" : "QuizUnpublished", nameof(Quiz), quizId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SetPublicationStatusAsync(string teacherUserId, Guid quizId, string publicationStatus, DateTimeOffset? availableFromUtc, CancellationToken cancellationToken = default)
    {
        var quiz = await OwnedQuizAsync(teacherUserId, quizId, cancellationToken);
        if (quiz is null
            || !TryPublicationStatus(publicationStatus, out var status)
            || status == ContentPublicationStatus.Published && !await db.QuizQuestions.AnyAsync(item => item.QuizId == quizId, cancellationToken)
            || status is ContentPublicationStatus.Archived or ContentPublicationStatus.Scheduled && await db.QuizAttempts.AnyAsync(item => item.QuizId == quizId && item.SubmittedAtUtc != null, cancellationToken)
            || status == ContentPublicationStatus.Scheduled && availableFromUtc <= DateTimeOffset.UtcNow)
            return false;

        quiz.PublicationStatus = status;
        quiz.IsPublished = status == ContentPublicationStatus.Published;
        quiz.AvailableFromUtc = status == ContentPublicationStatus.Scheduled ? availableFromUtc : quiz.AvailableFromUtc;
        db.AuditLogs.Add(Audit(teacherUserId, $"QuizPublication{status}", nameof(Quiz), quizId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<Quiz?> OwnedQuizAsync(string teacherUserId, Guid quizId, CancellationToken cancellationToken) => await (
        from quiz in db.Quizzes
        join course in db.Courses on quiz.CourseId equals course.Id
        where quiz.Id == quizId && course.TeacherUserId == teacherUserId
        select quiz).SingleOrDefaultAsync(cancellationToken);

    private async Task<bool> HasValidImageResourceAsync(Guid courseId, QuizQuestionType type, Guid? imageResourceId, CancellationToken cancellationToken)
    {
        if (type != QuizQuestionType.ImageQuestion) return imageResourceId is null;
        return imageResourceId is { } id && await db.LessonResources.AnyAsync(resource =>
            resource.Id == id
            && resource.ScanStatus == UploadScanStatus.Clean
            && resource.Lesson!.CourseModule!.CourseId == courseId
            && resource.ContentType.StartsWith("image/"), cancellationToken);
    }
    private async Task<bool> ValidLessonAsync(Guid courseId, Guid? lessonId, CancellationToken cancellationToken) => lessonId is not { } id || await db.Lessons.AnyAsync(item => item.Id == id && item.CourseModule!.CourseId == courseId && item.Type == LessonType.Quiz, cancellationToken);
    private static bool CanAuthor(CourseStatus status) => status is CourseStatus.Draft or CourseStatus.Rejected or CourseStatus.Approved or CourseStatus.Published;
    private static bool TryPublicationStatus(string value, out ContentPublicationStatus status) =>
        Enum.TryParse(value, true, out status) && status is ContentPublicationStatus.Draft or ContentPublicationStatus.Published or ContentPublicationStatus.Archived or ContentPublicationStatus.Scheduled;
    private static bool ValidQuiz(CreateQuizCommand command) => ValidQuiz(
        command.ArabicTitle,
        command.EnglishTitle,
        command.PassMark,
        command.AttemptLimit,
        command.TimeLimitMinutes,
        command.AvailableFromUtc,
        command.AvailableUntilUtc);

    private static bool ValidQuiz(UpdateQuizCommand command) => ValidQuiz(
        command.ArabicTitle,
        command.EnglishTitle,
        command.PassMark,
        command.AttemptLimit,
        command.TimeLimitMinutes,
        command.AvailableFromUtc,
        command.AvailableUntilUtc);

    private static bool ValidQuiz(
        string arabicTitle,
        string englishTitle,
        decimal passMark,
        int? attemptLimit,
        int? timeLimitMinutes,
        DateTimeOffset? availableFromUtc,
        DateTimeOffset? availableUntilUtc) => !string.IsNullOrWhiteSpace(arabicTitle)
            && !string.IsNullOrWhiteSpace(englishTitle)
            && passMark is >= 0 and <= 100
            && (attemptLimit is null || attemptLimit is >= 1 and <= 100)
            && (timeLimitMinutes is null || timeLimitMinutes is >= 1 and <= 300)
            && (!availableFromUtc.HasValue || !availableUntilUtc.HasValue || availableFromUtc < availableUntilUtc);

    private static bool TryNormalizeQuestion(QuizQuestionType type, IReadOnlyCollection<string> rawOptions, IReadOnlyCollection<string> rawCorrectAnswers, out string[] options, out string[] correctAnswers)
    {
        options = (rawOptions ?? []).Select(item => item?.Trim() ?? string.Empty).Where(item => item.Length > 0).ToArray();
        correctAnswers = (rawCorrectAnswers ?? []).Select(item => item?.Trim() ?? string.Empty).Where(item => item.Length > 0).ToArray();
        if (type == QuizQuestionType.TrueFalse)
        {
            options = ["True", "False"];
            correctAnswers = correctAnswers.Select(item => item.Equals("true", StringComparison.OrdinalIgnoreCase) ? "True" : item.Equals("false", StringComparison.OrdinalIgnoreCase) ? "False" : item).ToArray();
        }
        if (type is QuizQuestionType.Essay or QuizQuestionType.CodeQuestion)
            return options.Length == 0 && correctAnswers.Length == 0;
        if (type is QuizQuestionType.ShortAnswer or QuizQuestionType.FillInBlank)
            return options.Length == 0
                && correctAnswers.Length is >= 1 and <= 10
                && correctAnswers.Distinct(StringComparer.OrdinalIgnoreCase).Count() == correctAnswers.Length;
        if (type == QuizQuestionType.Ordering)
        {
            return options.Length is >= 2 and <= 8
                && options.Distinct(StringComparer.OrdinalIgnoreCase).Count() == options.Length
                && correctAnswers.Length == options.Length
                && correctAnswers.OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                    .SequenceEqual(options.OrderBy(value => value, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase);
        }
        if (type == QuizQuestionType.Matching)
            return TryNormalizeMatchingPairs(options, ref correctAnswers);
        if (options.Length is < 2 or > 8 || options.Distinct(StringComparer.OrdinalIgnoreCase).Count() != options.Length || correctAnswers.Length == 0) return false;
        foreach (var answer in correctAnswers)
        {
            if (!options.Contains(answer, StringComparer.Ordinal)) return false;
        }
        return type switch
        {
            QuizQuestionType.SingleChoice or QuizQuestionType.TrueFalse or QuizQuestionType.ImageQuestion => correctAnswers.Length == 1,
            _ => correctAnswers.Distinct(StringComparer.OrdinalIgnoreCase).Count() == correctAnswers.Length
        };
    }

    private static bool TryNormalizeMatchingPairs(string[] options, ref string[] correctAnswers)
    {
        if (options.Length is < 2 or > 8 || options.Distinct(StringComparer.OrdinalIgnoreCase).Count() != options.Length || correctAnswers.Length != options.Length)
            return false;
        var pairs = new List<(string Left, string Right)>();
        foreach (var rawPair in correctAnswers)
        {
            var separator = rawPair.IndexOf("=>", StringComparison.Ordinal);
            if (separator <= 0 || separator == rawPair.Length - 2) return false;
            var left = rawPair[..separator].Trim();
            var right = rawPair[(separator + 2)..].Trim();
            if (left.Length == 0 || right.Length == 0 || left.Contains("=>", StringComparison.Ordinal) || right.Contains("=>", StringComparison.Ordinal)) return false;
            pairs.Add((left, right));
        }
        if (!pairs.Select(pair => pair.Left).OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .SequenceEqual(options.OrderBy(value => value, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase)
            || pairs.Select(pair => pair.Right).Distinct(StringComparer.OrdinalIgnoreCase).Count() != pairs.Count)
            return false;
        correctAnswers = pairs.Select(pair => $"{pair.Left} => {pair.Right}").ToArray();
        return true;
    }

    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success" };
}
