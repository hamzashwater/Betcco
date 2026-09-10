using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Student")]
[Route("api/v1/ai")]
public sealed class AiController(IAiProvider ai, BetccoDbContext db) : ControllerBase
{
    [HttpPost("courses/{courseId:guid}/chat")]
    [EnableRateLimiting("ai")]
    public async Task<IActionResult> Chat(Guid courseId, AiChatRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        if (!await db.Enrollments.AnyAsync(x => x.StudentUserId == userId && x.CourseId == courseId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return NotFound();
        if (string.IsNullOrWhiteSpace(request.Message) || request.Message.Trim().Length > 2000 || !new[] { "Explain", "Practice", "Plan" }.Contains(request.Mode, StringComparer.OrdinalIgnoreCase)) return BadRequest(new { message = "Use a supported tutor mode and a message of up to 2000 characters." });
        if (!ai.IsConfigured) return StatusCode(StatusCodes.Status503ServiceUnavailable, new { code = "AI_UNAVAILABLE", message = "AI Tutor is not configured for this environment." });
        var course = await db.Courses.Include(x => x.Modules).ThenInclude(x => x.Lessons).AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId, cancellationToken);
        if (course is null) return NotFound();
        var sources = new List<string>
        {
            $"[Course] {course.ArabicTitle} / {course.EnglishTitle}\n{Limit(course.ArabicDescription, 3000)}\n{Limit(course.EnglishDescription, 3000)}"
        };
        if (request.LessonId is not null)
        {
            var lesson = course.Modules.Where(x => x.IsPublished).SelectMany(x => x.Lessons).SingleOrDefault(x => x.Id == request.LessonId && x.IsPublished);
            if (lesson is null) return NotFound();
            sources.Add($"[Lesson] {lesson.ArabicTitle} / {lesson.EnglishTitle}\n{Limit(lesson.ArabicBody, 4000)}\n{Limit(lesson.EnglishBody, 4000)}");
        }
        try
        {
            var response = await ai.CompleteAsync(new AiPrompt(courseId, request.LessonId, request.Mode.Trim(), request.Message.Trim(), sources), cancellationToken);
            return Ok(response);
        }
        catch (Exception exception) when (exception is InvalidOperationException or HttpRequestException or TaskCanceledException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { code = "AI_UNAVAILABLE", message = "AI Tutor is temporarily unavailable." });
        }
    }

    private static string Limit(string? value, int max) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim()[..Math.Min(value.Trim().Length, max)];
}

public sealed record AiChatRequest(Guid? LessonId, string Mode, string Message);
