namespace Betcco.Application.Learning;

public sealed record BtecCriterionProgressItem(
    Guid AssignmentId,
    Guid? UnitId,
    string? UnitCode,
    Guid? LearningAimId,
    string? LearningAimCode,
    string AssignmentTitle,
    string Code,
    string Band,
    string Status,
    string? Feedback);

public sealed record BtecGradeSummary(
    string PredictedGrade,
    int PassAchieved,
    int PassRequired,
    int MeritAchieved,
    int MeritRequired,
    int DistinctionAchieved,
    int DistinctionRequired);

public sealed record CourseUnitGradebookItem(
    Guid UnitId,
    string UnitTitle,
    decimal LessonProgressPercent,
    int LessonsCompleted,
    int LessonsTotal,
    BtecGradeSummary PredictedGrade,
    IReadOnlyList<CourseLearningAimProgressItem> LearningAims);

public sealed record CourseLearningAimProgressItem(
    Guid LearningAimId,
    string Code,
    string Title,
    decimal LessonProgressPercent,
    int LessonsCompleted,
    int LessonsTotal,
    BtecGradeSummary PredictedGrade);

public sealed record StudentCourseGradebookView(
    Guid CourseId,
    string CourseTitle,
    decimal LessonProgressPercent,
    int LessonsCompleted,
    int LessonsTotal,
    int AssignmentsCompleted,
    int AssignmentsTotal,
    BtecGradeSummary PredictedGrade,
    IReadOnlyList<CourseUnitGradebookItem> Units,
    IReadOnlyList<BtecCriterionProgressItem> Criteria);

public sealed record TeacherCourseGradebookRow(
    string StudentUserId,
    string StudentName,
    decimal LessonProgressPercent,
    int AssignmentsCompleted,
    int AssignmentsTotal,
    BtecGradeSummary PredictedGrade);

public sealed record TeacherCourseGradebookView(
    Guid CourseId,
    string CourseTitle,
    int TotalStudents,
    int Page,
    int PageSize,
    IReadOnlyList<TeacherCourseGradebookRow> Students);

public sealed record AdminGradebookQuery(
    Guid? CourseId,
    Guid? UnitId,
    string? TeacherUserId,
    string? StudentUserId,
    string? Status,
    string? Grade,
    DateTimeOffset? FromUtc,
    DateTimeOffset? ToUtc,
    string? Search,
    int Page,
    int PageSize);

public sealed record AdminGradebookRow(
    Guid SubmissionId,
    Guid CourseId,
    string CourseTitle,
    Guid? UnitId,
    string? UnitTitle,
    string TeacherUserId,
    string TeacherName,
    string StudentUserId,
    string StudentName,
    string AssignmentTitle,
    string Status,
    string? Grade,
    DateTimeOffset? SubmittedAtUtc,
    DateTimeOffset? GradedAtUtc);

public sealed record AdminGradebookView(int Total, int Page, int PageSize, IReadOnlyList<AdminGradebookRow> Rows);

public interface ICourseGradebookService
{
    Task<StudentCourseGradebookView?> GetStudentAsync(
        string studentUserId,
        Guid courseId,
        string locale,
        CancellationToken cancellationToken = default);

    Task<TeacherCourseGradebookView?> GetTeacherAsync(
        string teacherUserId,
        Guid courseId,
        string locale,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<AdminGradebookView> GetAdminAsync(
        AdminGradebookQuery query,
        string locale,
        CancellationToken cancellationToken = default);
}
