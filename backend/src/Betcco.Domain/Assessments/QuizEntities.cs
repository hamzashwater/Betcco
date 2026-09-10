using Betcco.Domain.Common;
using Betcco.Domain.Learning;

namespace Betcco.Domain.Assessments;

public sealed class Quiz : Entity
{
    public Guid CourseId { get; set; }
    public Guid? LessonId { get; set; }
    public required string ArabicTitle { get; set; }
    public required string EnglishTitle { get; set; }
    public decimal PassMark { get; set; } = 50m;
    public int? AttemptLimit { get; set; }
    public int? TimeLimitMinutes { get; set; }
    public bool RandomizeQuestions { get; set; }
    public bool RandomizeAnswers { get; set; }
    public bool ShowAnswers { get; set; }
    public bool ShowScore { get; set; } = true;
    public DateTimeOffset? AvailableFromUtc { get; set; }
    public DateTimeOffset? AvailableUntilUtc { get; set; }
    public bool AllowLateAttempts { get; set; }
    public bool IsPublished { get; set; }
    // Kept alongside IsPublished for backwards-compatible course-player
    // checks. The publication state is the authoritative authoring lifecycle.
    public ContentPublicationStatus PublicationStatus { get; set; } = ContentPublicationStatus.Draft;
    public ICollection<QuizQuestion> Questions { get; } = new List<QuizQuestion>();
}

public sealed class QuizQuestion : Entity
{
    public Guid QuizId { get; set; }
    public Quiz? Quiz { get; set; }
    public QuizQuestionType Type { get; set; }
    public required string ArabicText { get; set; }
    public required string EnglishText { get; set; }
    public required string OptionsJson { get; set; }
    public required string CorrectAnswersJson { get; set; }
    // Image questions reference an existing, scanned private course resource.
    // The image is delivered through an authorized quiz endpoint, never a public URL.
    public Guid? ImageResourceId { get; set; }
    public LessonResource? ImageResource { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// A private teacher-owned reusable question. It is copied into a quiz rather
/// than shared by reference so published attempts keep an immutable snapshot.
/// </summary>
public sealed class QuestionBankQuestion : Entity
{
    public required string TeacherUserId { get; set; }
    public Guid CourseId { get; set; }
    // These optional taxonomy links make a question reusable while preserving
    // its BTEC context. Subject is derived on the server from the owned course
    // and never trusted from a browser request.
    public Guid? SubjectId { get; set; }
    public Subject? Subject { get; set; }
    public Guid? CourseModuleId { get; set; }
    public CourseModule? CourseModule { get; set; }
    public Guid? BtecLearningAimId { get; set; }
    public BtecLearningAim? BtecLearningAim { get; set; }
    public QuizQuestionType Type { get; set; }
    public required string ArabicText { get; set; }
    public required string EnglishText { get; set; }
    public required string OptionsJson { get; set; }
    public required string CorrectAnswersJson { get; set; }
    public Guid? ImageResourceId { get; set; }
    public LessonResource? ImageResource { get; set; }
    public string? Tag { get; set; }
    public int Difficulty { get; set; } = 2;
}

public sealed class QuizAttempt : Entity
{
    public required string StudentUserId { get; set; }
    public Guid QuizId { get; set; }
    public decimal ScorePercent { get; set; }
    public bool Passed { get; set; }
    public string AnswersJson { get; set; } = "{}";
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? SubmittedAtUtc { get; set; }
    public bool WasLate { get; set; }
    public bool RequiresManualReview { get; set; }
    public DateTimeOffset? ManuallyGradedAtUtc { get; set; }
    public ICollection<QuizAttemptQuestionGrade> ManualQuestionGrades { get; } = new List<QuizAttemptQuestionGrade>();
}

/// <summary>
/// A teacher-owned grade for an Essay or Code question. Automatic questions are
/// deliberately never written here, so server scoring remains deterministic.
/// </summary>
public sealed class QuizAttemptQuestionGrade : Entity
{
    public Guid QuizAttemptId { get; set; }
    public QuizAttempt? QuizAttempt { get; set; }
    public Guid QuizQuestionId { get; set; }
    public QuizQuestion? QuizQuestion { get; set; }
    public required string TeacherUserId { get; set; }
    public decimal ScorePercent { get; set; }
    public string? StudentFeedback { get; set; }
}
