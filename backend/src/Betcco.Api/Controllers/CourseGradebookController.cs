using Betcco.Application.Learning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/gradebook")]
public sealed class CourseGradebookController(ICourseGradebookService gradebook) : ControllerBase
{
    [Authorize(Policy = "Student")]
    [HttpGet("student/courses/{courseId:guid}")]
    public async Task<IActionResult> Student(
        Guid courseId,
        [FromQuery] string locale = "ar",
        CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is null) return Unauthorized();
        var view = await gradebook.GetStudentAsync(userId, courseId, locale, cancellationToken);
        return view is null ? NotFound() : Ok(view);
    }

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}")]
    public async Task<IActionResult> Teacher(
        Guid courseId,
        [FromQuery] string locale = "ar",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 100)
            return BadRequest(new { message = "Use a page of at least 1 and a pageSize between 1 and 100." });
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is null) return Unauthorized();
        var view = await gradebook.GetTeacherAsync(userId, courseId, locale, page, pageSize, cancellationToken);
        return view is null ? NotFound() : Ok(view);
    }
}
