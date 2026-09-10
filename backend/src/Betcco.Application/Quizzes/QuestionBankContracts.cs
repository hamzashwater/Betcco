using Betcco.Domain.Assessments;

namespace Betcco.Application.Quizzes;

public sealed record QuestionBankQuestionDto(
    Guid Id,
    Guid CourseId,
    Guid? SubjectId,
    Guid? CourseModuleId,
    Guid? BtecLearningAimId,
    string Type,
    string ArabicText,
    string EnglishText,
    IReadOnlyCollection<string> Options,
    IReadOnlyCollection<string> CorrectAnswers,
    Guid? ImageResourceId,
    string? Tag,
    int Difficulty);

public sealed record SaveQuestionBankQuestionCommand(
    Guid CourseId,
    string Type,
    string ArabicText,
    string EnglishText,
    IReadOnlyCollection<string>? Options,
    IReadOnlyCollection<string>? CorrectAnswers,
    Guid? ImageResourceId,
    string? Tag,
    int Difficulty,
    Guid? CourseModuleId = null,
    Guid? BtecLearningAimId = null);

public sealed record GenerateRandomQuizCommand(
    Guid CourseId,
    Guid? LessonId,
    string ArabicTitle,
    string EnglishTitle,
    int QuestionCount,
    decimal PassMark,
    bool RandomizeQuestions = true,
    bool RandomizeAnswers = true,
    string? Tag = null,
    int? Difficulty = null,
    Guid? CourseModuleId = null,
    Guid? BtecLearningAimId = null,
    string? Type = null);

public interface IQuestionBankService
{
    Task<IReadOnlyCollection<QuestionBankQuestionDto>?> ListAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default);
    Task<Guid?> CreateAsync(string teacherUserId, SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(string teacherUserId, Guid id, SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(string teacherUserId, Guid id, CancellationToken cancellationToken = default);
    Task<Guid?> AddToQuizAsync(string teacherUserId, Guid questionBankQuestionId, Guid quizId, CancellationToken cancellationToken = default);
    Task<Guid?> GenerateRandomQuizAsync(string teacherUserId, GenerateRandomQuizCommand command, CancellationToken cancellationToken = default);
}
