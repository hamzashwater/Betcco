using System.Text.Json;
using Betcco.Application.Assignments;
using Betcco.Domain.Assessments;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class CourseAssignmentDeadlineExtensionService(BetccoDbContext db) : ICourseAssignmentDeadlineExtensionService
{
    public async Task<DeadlineExtensionWriteResult> GrantAsync(string teacherUserId, Guid assignmentId, GrantCourseAssignmentDeadlineExtension command, CancellationToken cancellationToken = default)
    {
        var assignment = await db.CourseAssignments.AsNoTracking()
            .Where(item => item.Id == assignmentId && item.Course!.TeacherUserId == teacherUserId)
            .Select(item => new { item.CourseId, item.DueAtUtc })
            .SingleOrDefaultAsync(cancellationToken);
        if (assignment is null) return new(DeadlineExtensionWriteStatus.NotFound);
        var reason = command.Reason?.Trim();
        if (assignment.DueAtUtc is not { } baseDueAtUtc
            || string.IsNullOrWhiteSpace(command.StudentUserId)
            || command.StudentUserId == teacherUserId
            || string.IsNullOrWhiteSpace(reason) || reason.Length > 500
            || command.ExtendedDueAtUtc.ToUniversalTime().Ticks / 10 <= baseDueAtUtc.ToUniversalTime().Ticks / 10)
            return new(DeadlineExtensionWriteStatus.Invalid);
        var enrolled = await db.Enrollments.AsNoTracking().AnyAsync(item => item.CourseId == assignment.CourseId
            && item.StudentUserId == command.StudentUserId
            && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
        if (!enrolled) return new(DeadlineExtensionWriteStatus.Invalid);
        if (await db.CourseAssignmentDeadlineExtensions.AsNoTracking().AnyAsync(item => item.CourseAssignmentId == assignmentId
            && item.StudentUserId == command.StudentUserId && item.RevokedAtUtc == null, cancellationToken))
            return new(DeadlineExtensionWriteStatus.Conflict);

        var extension = new CourseAssignmentDeadlineExtension
        {
            CourseAssignmentId = assignmentId,
            StudentUserId = command.StudentUserId,
            BaseDueAtUtcSnapshot = baseDueAtUtc,
            ExtendedDueAtUtc = command.ExtendedDueAtUtc.ToUniversalTime(),
            GrantedByUserId = teacherUserId,
            GrantedAtUtc = DateTimeOffset.UtcNow,
            Reason = reason
        };
        db.CourseAssignmentDeadlineExtensions.Add(extension);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentDeadlineExtensionGranted", extension));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return new(DeadlineExtensionWriteStatus.Conflict);
        }
        return new(DeadlineExtensionWriteStatus.Success, View(extension));
    }

    public async Task<DeadlineExtensionWriteResult> RevokeAsync(string teacherUserId, Guid assignmentId, Guid extensionId, RevokeCourseAssignmentDeadlineExtension command, CancellationToken cancellationToken = default)
    {
        var extension = await db.CourseAssignmentDeadlineExtensions
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Course)
            .SingleOrDefaultAsync(item => item.Id == extensionId && item.CourseAssignmentId == assignmentId
                && item.CourseAssignment!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (extension is null) return new(DeadlineExtensionWriteStatus.NotFound);
        if (extension.StudentUserId == teacherUserId) return new(DeadlineExtensionWriteStatus.Invalid);
        if (extension.RevokedAtUtc is not null) return new(DeadlineExtensionWriteStatus.Conflict);
        var reason = command.Reason?.Trim();
        if (reason?.Length > 500) return new(DeadlineExtensionWriteStatus.Invalid);
        extension.RevokedAtUtc = DateTimeOffset.UtcNow;
        extension.RevokedByUserId = teacherUserId;
        extension.RevocationReason = string.IsNullOrWhiteSpace(reason) ? null : reason;
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentDeadlineExtensionRevoked", extension));
        await db.SaveChangesAsync(cancellationToken);
        return new(DeadlineExtensionWriteStatus.Success, View(extension));
    }

    public async Task<IReadOnlyList<CourseAssignmentDeadlineExtensionView>?> HistoryAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default)
    {
        if (!await OwnedAsync(teacherUserId, assignmentId, cancellationToken)) return null;
        var history = await db.CourseAssignmentDeadlineExtensions.AsNoTracking()
            .Where(item => item.CourseAssignmentId == assignmentId)
            .OrderByDescending(item => item.GrantedAtUtc)
            .ToListAsync(cancellationToken);
        return history.Select(View).ToArray();
    }

    public async Task<IReadOnlyList<EligibleCourseworkStudent>?> EligibleStudentsAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default)
    {
        var courseId = await db.CourseAssignments.AsNoTracking()
            .Where(item => item.Id == assignmentId && item.Course!.TeacherUserId == teacherUserId)
            .Select(item => (Guid?)item.CourseId).SingleOrDefaultAsync(cancellationToken);
        if (courseId is null) return null;
        var ids = await db.Enrollments.AsNoTracking().Where(item => item.CourseId == courseId
            && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow))
            .Select(item => item.StudentUserId).ToListAsync(cancellationToken);
        var userIds = ids.Select(id => Guid.TryParse(id, out var parsed) ? parsed : Guid.Empty).Where(id => id != Guid.Empty).ToArray();
        var users = await db.Users.AsNoTracking().Where(user => userIds.Contains(user.Id))
            .Select(user => new { user.Id, user.DisplayName }).ToListAsync(cancellationToken);
        return users.Select(user => new EligibleCourseworkStudent(user.Id.ToString(), user.DisplayName))
            .OrderBy(user => user.DisplayName).ToArray();
    }

    private Task<bool> OwnedAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken) =>
        db.CourseAssignments.AsNoTracking().AnyAsync(item => item.Id == assignmentId && item.Course!.TeacherUserId == teacherUserId, cancellationToken);

    private static CourseAssignmentDeadlineExtensionView View(CourseAssignmentDeadlineExtension item) => new(
        item.Id, item.CourseAssignmentId, item.StudentUserId, item.BaseDueAtUtcSnapshot, item.ExtendedDueAtUtc,
        item.GrantedByUserId, item.GrantedAtUtc, item.Reason, item.RevokedAtUtc, item.RevokedByUserId, item.RevocationReason);

    private static AuditLog Audit(string actor, string action, CourseAssignmentDeadlineExtension item) => new()
    {
        ActorUserId = actor,
        Action = action,
        EntityType = nameof(CourseAssignmentDeadlineExtension),
        EntityId = item.Id.ToString(),
        Outcome = "Success",
        MetadataJson = JsonSerializer.Serialize(new { item.CourseAssignmentId, item.StudentUserId, item.ExtendedDueAtUtc })
    };
}
