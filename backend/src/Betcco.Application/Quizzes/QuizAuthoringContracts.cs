namespace Betcco.Application.Quizzes;

public sealed record CreateQuizCommand(
    Guid CourseId,
    Guid? LessonId,
    string ArabicTitle,
    string EnglishTitle,
    decimal PassMark,
    int? AttemptLimit,
    int? TimeLimitMinutes = null,
    bool RandomizeQuestions = false,
    bool RandomizeAnswers = false,
    bool ShowAnswers = false,
    bool ShowScore = true,
    DateTimeOffset? AvailableFromUtc = null,
    DateTimeOffset? AvailableUntilUtc = null,
    bool AllowLateAttempts = false);

public sealed record UpdateQuizCommand(
    Guid? LessonId,
    string ArabicTitle,
    string EnglishTitle,
    decimal PassMark,
    int? AttemptLimit,
    int? TimeLimitMinutes = null,
    bool RandomizeQuestions = false,
    bool RandomizeAnswers = false,
    bool ShowAnswers = false,
    bool ShowScore = true,
    DateTimeOffset? AvailableFromUtc = null,
    DateTimeOffset? AvailableUntilUtc = null,
    bool AllowLateAttempts = false);

public sealed record CreateQuizQuestionCommand(
    Guid QuizId,
    string Type,
    string ArabicText,
    string EnglishText,
    IReadOnlyCollection<string> Options,
    IReadOnlyCollection<string> CorrectAnswers,
    int SortOrder,
    Guid? ImageResourceId = null);

public interface IQuizAuthoringService
{
    Task<Guid?> CreateAsync(string teacherUserId, CreateQuizCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(string teacherUserId, Guid quizId, UpdateQuizCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(string teacherUserId, Guid quizId, CancellationToken cancellationToken = default);
    Task<Guid?> AddQuestionAsync(string teacherUserId, CreateQuizQuestionCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteQuestionAsync(string teacherUserId, Guid questionId, CancellationToken cancellationToken = default);
    Task<bool> PublishAsync(string teacherUserId, Guid quizId, bool publish, CancellationToken cancellationToken = default);
    Task<bool> SetPublicationStatusAsync(string teacherUserId, Guid quizId, string publicationStatus, DateTimeOffset? availableFromUtc, CancellationToken cancellationToken = default);
}
