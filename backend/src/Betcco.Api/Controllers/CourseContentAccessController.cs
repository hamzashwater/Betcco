using System.Security.Claims;
using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>Teacher-owned configuration for drip release and prerequisites.</summary>
[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/courses/{courseId:guid}/learning-access")]
public sealed class CourseContentAccessController(IContentAccessService contentAccess, BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await OwnsCourseAsync(courseId, cancellationToken)) return NotFound();
        var items = await CourseItemsAsync(courseId, cancellationToken);
        var prerequisiteCourses = await db.Courses.AsNoTracking()
            .Where(course => course.TeacherUserId == UserId && course.Id != courseId && course.Status == CourseStatus.Published)
            .OrderBy(course => course.ArabicTitle)
            .Select(course => new { type = "Course", course.Id, course.ArabicTitle, course.EnglishTitle })
            .ToArrayAsync(cancellationToken);
        var rules = await contentAccess.GetRulesAsync(UserId, courseId, cancellationToken);
        var prerequisites = await contentAccess.GetPrerequisitesAsync(UserId, courseId, cancellationToken);
        return Ok(new
        {
            items,
            prerequisiteCourses,
            rules = rules.Select(rule => new
            {
                rule.TargetType,
                rule.TargetId,
                releaseMode = rule.ReleaseMode.ToString(),
                rule.SpecificDateUtc,
                rule.DaysAfterEnrollment,
                previousContentType = rule.PreviousContentType?.ToString(),
                rule.PreviousContentId
            }),
            prerequisites = prerequisites.Select(item => new
            {
                item.Id,
                item.TargetType,
                item.TargetId,
                requiredContentType = item.RequiredContentType.ToString(),
                item.RequiredContentId
            })
        });
    }

    [HttpPut("release")]
    public async Task<IActionResult> SetRelease(Guid courseId, SetContentReleaseRequest request, CancellationToken cancellationToken)
    {
        if (!TryContentType(request.TargetType, out var targetType)
            || !TryReleaseMode(request.ReleaseMode, out var releaseMode)
            || !TryOptionalContentType(request.PreviousContentType, out var previousType))
            return BadRequest(new { message = "Use supported content and release types." });
        var saved = await contentAccess.SetReleaseRuleAsync(UserId, new ContentReleaseConfiguration(
            courseId,
            targetType,
            request.TargetId,
            releaseMode,
            request.SpecificDateUtc,
            request.DaysAfterEnrollment,
            previousType,
            request.PreviousContentId), cancellationToken);
        return saved ? NoContent() : BadRequest(new { message = "The release rule is invalid, not owned by you, or would create a prerequisite cycle." });
    }

    [HttpPost("prerequisites")]
    public async Task<IActionResult> AddPrerequisite(Guid courseId, AddContentPrerequisiteRequest request, CancellationToken cancellationToken)
    {
        if (!TryContentType(request.TargetType, out var targetType) || !TryContentType(request.RequiredContentType, out var requiredType))
            return BadRequest(new { message = "Use supported content types." });
        var id = await contentAccess.AddPrerequisiteAsync(UserId, new ContentPrerequisiteConfiguration(Guid.Empty, courseId, targetType, request.TargetId, requiredType, request.RequiredContentId), cancellationToken);
        return id is null ? BadRequest(new { message = "The prerequisite must be valid, unique, owned by your course, and acyclic." }) : Ok(new { id });
    }

    [HttpDelete("prerequisites/{prerequisiteId:guid}")]
    public async Task<IActionResult> RemovePrerequisite(Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken) => await contentAccess.RemovePrerequisiteAsync(UserId, courseId, prerequisiteId, cancellationToken) ? NoContent() : NotFound();

    private async Task<IReadOnlyCollection<object>> CourseItemsAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().Where(item => item.Id == courseId).Select(item => new { item.Id, item.ArabicTitle, item.EnglishTitle }).SingleAsync(cancellationToken);
        var modules = await db.CourseModules.AsNoTracking().Where(item => item.CourseId == courseId).OrderBy(item => item.SortOrder)
            .Select(item => new
            {
                item.Id,
                ArabicTitle = item.UnitDefinition != null ? item.UnitDefinition.ArabicTitle : item.ArabicTitle,
                EnglishTitle = item.UnitDefinition != null ? item.UnitDefinition.EnglishTitle : item.EnglishTitle
            }).ToArrayAsync(cancellationToken);
        var lessons = await db.Lessons.AsNoTracking().Where(item => item.CourseModule!.CourseId == courseId && item.Type != LessonType.LegacyArchived).OrderBy(item => item.CourseModule!.SortOrder).ThenBy(item => item.SortOrder).Select(item => new { item.Id, item.ArabicTitle, item.EnglishTitle }).ToArrayAsync(cancellationToken);
        var assignments = await db.CourseAssignments.AsNoTracking().Where(item => item.CourseId == courseId).OrderBy(item => item.CreatedAtUtc).Select(item => new { item.Id, item.ArabicTitle, item.EnglishTitle }).ToArrayAsync(cancellationToken);
        return new object[]
        {
            new { type = LearningContentType.Course.ToString(), course.Id, course.ArabicTitle, course.EnglishTitle }
        }
        .Concat(modules.Select(item => (object)new { type = LearningContentType.Unit.ToString(), item.Id, item.ArabicTitle, item.EnglishTitle }))
        .Concat(lessons.Select(item => (object)new { type = LearningContentType.Lesson.ToString(), item.Id, item.ArabicTitle, item.EnglishTitle }))
        .Concat(assignments.Select(item => (object)new { type = LearningContentType.Assignment.ToString(), item.Id, item.ArabicTitle, item.EnglishTitle }))
        .ToArray();
    }

    private Task<bool> OwnsCourseAsync(Guid courseId, CancellationToken cancellationToken) => db.Courses.AsNoTracking().AnyAsync(course => course.Id == courseId && course.TeacherUserId == UserId, cancellationToken);
    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static bool TryContentType(string? value, out LearningContentType contentType) => Enum.TryParse(value, true, out contentType) && Enum.IsDefined(contentType);
    private static bool TryReleaseMode(string? value, out ContentReleaseMode releaseMode) => Enum.TryParse(value, true, out releaseMode) && Enum.IsDefined(releaseMode);
    private static bool TryOptionalContentType(string? value, out LearningContentType? contentType)
    {
        if (string.IsNullOrWhiteSpace(value)) { contentType = null; return true; }
        if (TryContentType(value, out var parsed)) { contentType = parsed; return true; }
        contentType = null;
        return false;
    }
}

public sealed record SetContentReleaseRequest(
    string TargetType,
    Guid TargetId,
    string ReleaseMode,
    DateTimeOffset? SpecificDateUtc,
    int? DaysAfterEnrollment,
    string? PreviousContentType,
    Guid? PreviousContentId);

public sealed record AddContentPrerequisiteRequest(string TargetType, Guid TargetId, string RequiredContentType, Guid RequiredContentId);
