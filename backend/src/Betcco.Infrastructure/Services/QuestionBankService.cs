using System.Text.Json;
using Betcco.Application.Quizzes;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>Owns reusable question-bank records and copies them into draft quizzes.</summary>
public sealed class QuestionBankService(BetccoDbContext db) : IQuestionBankService
{
    public async Task<IReadOnlyCollection<QuestionBankQuestionDto>?> ListAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        if (!await OwnsCourseAsync(teacherUserId, courseId, cancellationToken)) return null;
        var questions = await db.QuestionBankQuestions.AsNoTracking()
            .Where(item => item.TeacherUserId == teacherUserId && item.CourseId == courseId)
            .OrderBy(item => item.Tag).ThenBy(item => item.Difficulty).ThenByDescending(item => item.UpdatedAtUtc)
            .ToListAsync(cancellationToken);
        return questions.Select(ToDto).ToArray();
    }

    public async Task<Guid?> CreateAsync(string teacherUserId, SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken = default)
    {
        var context = await GetOwnedContextAsync(teacherUserId, command.CourseId, command.CourseModuleId, command.BtecLearningAimId, cancellationToken);
        if (context is null
            || !TryNormalize(command, out var type, out var options, out var correctAnswers)
            || !await HasValidImageResourceAsync(command.CourseId, type, command.ImageResourceId, cancellationToken)) return null;
        var question = new QuestionBankQuestion
        {
            TeacherUserId = teacherUserId,
            CourseId = command.CourseId,
            SubjectId = context.SubjectId,
            CourseModuleId = command.CourseModuleId,
            BtecLearningAimId = command.BtecLearningAimId,
            Type = type,
            ArabicText = command.ArabicText.Trim(),
            EnglishText = command.EnglishText.Trim(),
            OptionsJson = JsonSerializer.Serialize(options),
            CorrectAnswersJson = JsonSerializer.Serialize(correctAnswers),
            ImageResourceId = command.ImageResourceId,
            Tag = TrimOrNull(command.Tag, 80),
            Difficulty = command.Difficulty
        };
        db.QuestionBankQuestions.Add(question);
        db.AuditLogs.Add(Audit(teacherUserId, "QuestionBankQuestionCreated", question.Id));
        await db.SaveChangesAsync(cancellationToken);
        return question.Id;
    }

    public async Task<bool> UpdateAsync(string teacherUserId, Guid id, SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken = default)
    {
        var question = await db.QuestionBankQuestions.SingleOrDefaultAsync(item => item.Id == id && item.TeacherUserId == teacherUserId, cancellationToken);
        var context = await GetOwnedContextAsync(teacherUserId, command.CourseId, command.CourseModuleId, command.BtecLearningAimId, cancellationToken);
        if (question is null || question.CourseId != command.CourseId || context is null
            || !TryNormalize(command, out var type, out var options, out var correctAnswers)
            || !await HasValidImageResourceAsync(command.CourseId, type, command.ImageResourceId, cancellationToken)) return false;
        question.SubjectId = context.SubjectId;
        question.CourseModuleId = command.CourseModuleId;
        question.BtecLearningAimId = command.BtecLearningAimId;
        question.Type = type;
        question.ArabicText = command.ArabicText.Trim();
        question.EnglishText = command.EnglishText.Trim();
        question.OptionsJson = JsonSerializer.Serialize(options);
        question.CorrectAnswersJson = JsonSerializer.Serialize(correctAnswers);
        question.ImageResourceId = command.ImageResourceId;
        question.Tag = TrimOrNull(command.Tag, 80);
        question.Difficulty = command.Difficulty;
        db.AuditLogs.Add(Audit(teacherUserId, "QuestionBankQuestionUpdated", question.Id));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(string teacherUserId, Guid id, CancellationToken cancellationToken = default)
    {
        var question = await db.QuestionBankQuestions.SingleOrDefaultAsync(item => item.Id == id && item.TeacherUserId == teacherUserId, cancellationToken);
        if (question is null) return false;
        db.QuestionBankQuestions.Remove(question);
        db.AuditLogs.Add(Audit(teacherUserId, "QuestionBankQuestionDeleted", id));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddToQuizAsync(string teacherUserId, Guid questionBankQuestionId, Guid quizId, CancellationToken cancellationToken = default)
    {
        var source = await db.QuestionBankQuestions.AsNoTracking().SingleOrDefaultAsync(item => item.Id == questionBankQuestionId && item.TeacherUserId == teacherUserId, cancellationToken);
        var quiz = await OwnedDraftQuizAsync(teacherUserId, quizId, cancellationToken);
        if (source is null || quiz is null || source.CourseId != quiz.CourseId) return null;
        var question = new QuizQuestion
        {
            QuizId = quiz.Id,
            Type = source.Type,
            ArabicText = source.ArabicText,
            EnglishText = source.EnglishText,
            OptionsJson = source.OptionsJson,
            CorrectAnswersJson = source.CorrectAnswersJson,
            ImageResourceId = source.ImageResourceId,
            SortOrder = await db.QuizQuestions.Where(item => item.QuizId == quiz.Id).CountAsync(cancellationToken)
        };
        db.QuizQuestions.Add(question);
        db.AuditLogs.Add(Audit(teacherUserId, "QuestionBankQuestionAddedToQuiz", question.Id));
        await db.SaveChangesAsync(cancellationToken);
        return question.Id;
    }

    public async Task<Guid?> GenerateRandomQuizAsync(string teacherUserId, GenerateRandomQuizCommand command, CancellationToken cancellationToken = default)
    {
        var context = await GetOwnedContextAsync(teacherUserId, command.CourseId, command.CourseModuleId, command.BtecLearningAimId, cancellationToken);
        var hasRequestedType = !string.IsNullOrWhiteSpace(command.Type);
        var requestedType = default(QuizQuestionType);
        if (command.QuestionCount is < 1 or > 100 || string.IsNullOrWhiteSpace(command.ArabicTitle) || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || command.PassMark is < 0 or > 100 || context is null
            || hasRequestedType && !Enum.TryParse(command.Type, true, out requestedType)
            || !await ValidLessonAsync(command.CourseId, command.LessonId, cancellationToken)) return null;
        var candidates = await db.QuestionBankQuestions.AsNoTracking()
            .Where(item => item.TeacherUserId == teacherUserId && item.CourseId == command.CourseId
                && (command.Tag == null || item.Tag == command.Tag.Trim())
                && (command.Difficulty == null || item.Difficulty == command.Difficulty.Value)
                && (command.CourseModuleId == null || item.CourseModuleId == command.CourseModuleId)
                && (command.BtecLearningAimId == null || item.BtecLearningAimId == command.BtecLearningAimId)
                && (!hasRequestedType || item.Type == requestedType))
            .ToListAsync(cancellationToken);
        if (candidates.Count < command.QuestionCount) return null;
        var selected = candidates.OrderBy(_ => Guid.NewGuid()).Take(command.QuestionCount).ToArray();
        var quiz = new Quiz
        {
            CourseId = command.CourseId,
            LessonId = command.LessonId,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            PassMark = command.PassMark,
            RandomizeQuestions = command.RandomizeQuestions,
            RandomizeAnswers = command.RandomizeAnswers,
            IsPublished = false
        };
        db.Quizzes.Add(quiz);
        foreach (var item in selected.Select((value, index) => new { value, index }))
        {
            db.QuizQuestions.Add(new QuizQuestion
            {
                QuizId = quiz.Id,
                Type = item.value.Type,
                ArabicText = item.value.ArabicText,
                EnglishText = item.value.EnglishText,
                OptionsJson = item.value.OptionsJson,
                CorrectAnswersJson = item.value.CorrectAnswersJson,
                ImageResourceId = item.value.ImageResourceId,
                SortOrder = item.index
            });
        }
        db.AuditLogs.Add(Audit(teacherUserId, "RandomQuizGenerated", quiz.Id));
        await db.SaveChangesAsync(cancellationToken);
        return quiz.Id;
    }

    private async Task<bool> OwnsCourseAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken) => await db.Courses.AnyAsync(course => course.Id == courseId && course.TeacherUserId == teacherUserId, cancellationToken);
    private async Task<QuestionBankContext?> GetOwnedContextAsync(string teacherUserId, Guid courseId, Guid? courseModuleId, Guid? btecLearningAimId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking()
            .Where(item => item.Id == courseId && item.TeacherUserId == teacherUserId)
            .Select(item => new { item.SubjectId })
            .SingleOrDefaultAsync(cancellationToken);
        if (course is null) return null;
        if (courseModuleId is { } moduleId && !await db.CourseModules.AsNoTracking()
                .AnyAsync(item => item.Id == moduleId && item.CourseId == courseId, cancellationToken)) return null;
        if (btecLearningAimId is { } aimId && !await db.BtecLearningAims.AsNoTracking()
                .AnyAsync(item => item.Id == aimId
                    && item.CourseModule!.CourseId == courseId
                    && (!courseModuleId.HasValue || item.CourseModuleId == courseModuleId.Value), cancellationToken)) return null;
        return new QuestionBankContext(course.SubjectId);
    }
    private async Task<Quiz?> OwnedDraftQuizAsync(string teacherUserId, Guid quizId, CancellationToken cancellationToken) => await db.Quizzes.SingleOrDefaultAsync(quiz => quiz.Id == quizId && !quiz.IsPublished && !db.QuizAttempts.Any(attempt => attempt.QuizId == quizId) && db.Courses.Any(course => course.Id == quiz.CourseId && course.TeacherUserId == teacherUserId), cancellationToken);
    private async Task<bool> ValidLessonAsync(Guid courseId, Guid? lessonId, CancellationToken cancellationToken) => lessonId is null || await db.Lessons.AnyAsync(lesson => lesson.Id == lessonId && lesson.CourseModule!.CourseId == courseId && lesson.Type == LessonType.Quiz, cancellationToken);
    private async Task<bool> HasValidImageResourceAsync(Guid courseId, QuizQuestionType type, Guid? imageResourceId, CancellationToken cancellationToken) => type != QuizQuestionType.ImageQuestion
        ? imageResourceId is null
        : imageResourceId is { } id && await db.LessonResources.AnyAsync(resource => resource.Id == id && resource.ScanStatus == UploadScanStatus.Clean && resource.Lesson!.CourseModule!.CourseId == courseId && resource.ContentType.StartsWith("image/"), cancellationToken);

    private static QuestionBankQuestionDto ToDto(QuestionBankQuestion question) => new(question.Id, question.CourseId, question.SubjectId, question.CourseModuleId, question.BtecLearningAimId, question.Type.ToString(), question.ArabicText, question.EnglishText, JsonSerializer.Deserialize<string[]>(question.OptionsJson) ?? [], JsonSerializer.Deserialize<string[]>(question.CorrectAnswersJson) ?? [], question.ImageResourceId, question.Tag, question.Difficulty);
    private static bool TryNormalize(SaveQuestionBankQuestionCommand command, out QuizQuestionType type, out string[] options, out string[] correctAnswers)
    {
        type = default;
        options = (command.Options ?? []).Select(item => item?.Trim() ?? string.Empty).Where(item => item.Length > 0).ToArray();
        correctAnswers = (command.CorrectAnswers ?? []).Select(item => item?.Trim() ?? string.Empty).Where(item => item.Length > 0).ToArray();
        if (string.IsNullOrWhiteSpace(command.ArabicText) || command.ArabicText.Trim().Length > 6000 || string.IsNullOrWhiteSpace(command.EnglishText) || command.EnglishText.Trim().Length > 6000
            || command.Difficulty is < 1 or > 5 || !Enum.TryParse(command.Type, true, out type)) return false;
        if (type == QuizQuestionType.TrueFalse)
        {
            options = ["True", "False"];
            correctAnswers = correctAnswers.Select(item => item.Equals("true", StringComparison.OrdinalIgnoreCase) ? "True" : item.Equals("false", StringComparison.OrdinalIgnoreCase) ? "False" : item).ToArray();
        }
        if (type is QuizQuestionType.Essay or QuizQuestionType.CodeQuestion) return options.Length == 0 && correctAnswers.Length == 0;
        if (type is QuizQuestionType.ShortAnswer or QuizQuestionType.FillInBlank) return options.Length == 0 && correctAnswers.Length is >= 1 and <= 10 && correctAnswers.Distinct(StringComparer.OrdinalIgnoreCase).Count() == correctAnswers.Length;
        if (type == QuizQuestionType.Ordering) return options.Length is >= 2 and <= 8 && options.Distinct(StringComparer.OrdinalIgnoreCase).Count() == options.Length && correctAnswers.Length == options.Length && correctAnswers.OrderBy(value => value, StringComparer.OrdinalIgnoreCase).SequenceEqual(options.OrderBy(value => value, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase);
        if (type == QuizQuestionType.Matching) return TryNormalizeMatchingPairs(options, ref correctAnswers);
        var allowedOptions = options.ToHashSet(StringComparer.Ordinal);
        return options.Length is >= 2 and <= 8 && options.Distinct(StringComparer.OrdinalIgnoreCase).Count() == options.Length && correctAnswers.Length > 0 && correctAnswers.All(allowedOptions.Contains) && (type is not (QuizQuestionType.SingleChoice or QuizQuestionType.TrueFalse or QuizQuestionType.ImageQuestion) || correctAnswers.Length == 1);
    }

    // Matching answers are persisted as normalized "left => right" pairs.
    // This is intentionally identical to quiz-authoring validation so a bank
    // question cannot later create an ambiguous or ungradable random quiz.
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
    private static string? TrimOrNull(string? value, int max) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];
    private static AuditLog Audit(string actor, string action, Guid id) => new() { ActorUserId = actor, Action = action, EntityType = nameof(QuestionBankQuestion), EntityId = id.ToString(), Outcome = "Success" };
    private sealed record QuestionBankContext(Guid? SubjectId);
}
