using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/platform")]
public sealed class PlatformController(BetccoDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken cancellationToken) => Ok(new
    {
        publishedCourses = await db.Courses.CountAsync(x => x.Status == CourseStatus.Published, cancellationToken),
        publishedLessons = await db.Lessons.CountAsync(x => x.IsPublished && x.CourseModule!.Course!.Status == CourseStatus.Published, cancellationToken),
        activeTeachers = await db.Users.CountAsync(x => !x.IsFrozen && db.UserRoles.Where(role => role.RoleId == db.Roles.Where(item => item.Name == "Teacher").Select(item => item.Id).FirstOrDefault()).Select(role => role.UserId).Contains(x.Id), cancellationToken),
        enrolledStudents = await db.Enrollments.Select(x => x.StudentUserId).Distinct().CountAsync(cancellationToken)
    });
}
