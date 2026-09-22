namespace Betcco.Application.Assignments;

public sealed record CourseAssignmentDeadlineTarget(Guid AssignmentId, string StudentUserId, DateTimeOffset? BaseDueAtUtc);
public sealed record CourseAssignmentDeadlineValue(DateTimeOffset? BaseDueAtUtc, DateTimeOffset? EffectiveDueAtUtc, bool HasDeadlineExtension);

public interface ICourseAssignmentDeadlineResolver
{
    Task<CourseAssignmentDeadlineValue> ResolveAsync(Guid assignmentId, string studentUserId, DateTimeOffset? baseDueAtUtc, CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<(Guid AssignmentId, string StudentUserId), CourseAssignmentDeadlineValue>> ResolveManyAsync(
        IReadOnlyCollection<CourseAssignmentDeadlineTarget> targets, CancellationToken cancellationToken = default);
}

public sealed record GrantCourseAssignmentDeadlineExtension(string StudentUserId, DateTimeOffset ExtendedDueAtUtc, string Reason);
public sealed record RevokeCourseAssignmentDeadlineExtension(string? Reason);
public sealed record CourseAssignmentDeadlineExtensionView(
    Guid Id, Guid CourseAssignmentId, string StudentUserId, DateTimeOffset BaseDueAtUtcSnapshot,
    DateTimeOffset ExtendedDueAtUtc, string GrantedByUserId, DateTimeOffset GrantedAtUtc,
    string Reason, DateTimeOffset? RevokedAtUtc, string? RevokedByUserId, string? RevocationReason);
public sealed record EligibleCourseworkStudent(string StudentUserId, string DisplayName);
public enum DeadlineExtensionWriteStatus { Success, Invalid, NotFound, Conflict }
public sealed record DeadlineExtensionWriteResult(DeadlineExtensionWriteStatus Status, CourseAssignmentDeadlineExtensionView? Extension = null);

public interface ICourseAssignmentDeadlineExtensionService
{
    Task<DeadlineExtensionWriteResult> GrantAsync(string teacherUserId, Guid assignmentId, GrantCourseAssignmentDeadlineExtension command, CancellationToken cancellationToken = default);
    Task<DeadlineExtensionWriteResult> RevokeAsync(string teacherUserId, Guid assignmentId, Guid extensionId, RevokeCourseAssignmentDeadlineExtension command, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CourseAssignmentDeadlineExtensionView>?> HistoryAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<EligibleCourseworkStudent>?> EligibleStudentsAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default);
}
