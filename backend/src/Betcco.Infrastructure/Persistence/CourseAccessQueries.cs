using Betcco.Domain.Learning;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Persistence;

/// <summary>One server-side predicate for learner course authorization.</summary>
public static class CourseAccessQueries
{
    public static IQueryable<Enrollment> ActiveEnrollments(this BetccoDbContext db, DateTimeOffset now) =>
        db.Enrollments.Where(enrollment => !enrollment.IsDeleted && (
            db.CourseAccessGrants.Any(grant => !grant.IsDeleted && grant.StudentUserId == enrollment.StudentUserId
                && grant.CourseId == enrollment.CourseId && grant.RevokedAtUtc == null
                && grant.ValidFromUtc <= now
                && (grant.ValidUntilUtc == null || grant.ValidUntilUtc > now))
            // Enrollments created before the provenance migration are represented
            // by Legacy grants. This fallback also keeps unmigrated test data safe.
            || (!db.CourseAccessGrants.Any(grant => grant.StudentUserId == enrollment.StudentUserId
                    && grant.CourseId == enrollment.CourseId)
                && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > now))));
}
