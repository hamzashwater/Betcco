using Betcco.Application.Assignments;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class CourseAssignmentDeadlineResolver(BetccoDbContext db) : ICourseAssignmentDeadlineResolver
{
    public async Task<CourseAssignmentDeadlineValue> ResolveAsync(Guid assignmentId, string studentUserId, DateTimeOffset? baseDueAtUtc, CancellationToken cancellationToken = default)
    {
        var targets = new[] { new CourseAssignmentDeadlineTarget(assignmentId, studentUserId, baseDueAtUtc) };
        var values = await ResolveManyAsync(targets, cancellationToken);
        return values[(assignmentId, studentUserId)];
    }

    public async Task<IReadOnlyDictionary<(Guid AssignmentId, string StudentUserId), CourseAssignmentDeadlineValue>> ResolveManyAsync(
        IReadOnlyCollection<CourseAssignmentDeadlineTarget> targets, CancellationToken cancellationToken = default)
    {
        if (targets.Count == 0) return new Dictionary<(Guid, string), CourseAssignmentDeadlineValue>();
        var assignmentIds = targets.Select(target => target.AssignmentId).Distinct().ToArray();
        var studentIds = targets.Select(target => target.StudentUserId).Distinct().ToArray();
        var active = await db.CourseAssignmentDeadlineExtensions.AsNoTracking()
            .Where(extension => assignmentIds.Contains(extension.CourseAssignmentId)
                && studentIds.Contains(extension.StudentUserId) && extension.RevokedAtUtc == null)
            .Select(extension => new { extension.CourseAssignmentId, extension.StudentUserId, extension.ExtendedDueAtUtc })
            .ToListAsync(cancellationToken);
        var byPair = active.ToDictionary(extension => (extension.CourseAssignmentId, extension.StudentUserId));
        return targets.ToDictionary(target => (target.AssignmentId, target.StudentUserId), target =>
        {
            byPair.TryGetValue((target.AssignmentId, target.StudentUserId), out var extension);
            var hasExtension = target.BaseDueAtUtc.HasValue && extension is not null;
            return new CourseAssignmentDeadlineValue(target.BaseDueAtUtc,
                hasExtension ? extension!.ExtendedDueAtUtc : target.BaseDueAtUtc, hasExtension);
        });
    }
}
