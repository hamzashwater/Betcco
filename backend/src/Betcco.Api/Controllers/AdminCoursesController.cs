using System.Security.Claims;
using Betcco.Application.Courses;
using Betcco.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/admin/courses")]
public sealed class AdminCoursesController(ICourseAuthoringService courses, IFileStorage storage, BetccoDbContext db) : ControllerBase
{
    [HttpGet("approvals")]
    public async Task<IActionResult> Approvals(CancellationToken cancellationToken) => Ok(await db.Courses.AsNoTracking()
        .Where(x => x.Status == Betcco.Domain.Common.CourseStatus.SubmittedForReview || x.Status == Betcco.Domain.Common.CourseStatus.Approved)
        .OrderBy(x => x.UpdatedAtUtc)
        .Select(x => new
        {
            x.Id,
            x.ArabicTitle,
            x.EnglishTitle,
            subjectArabicName = x.Subject == null ? null : x.Subject.ArabicName,
            subjectEnglishName = x.Subject == null ? null : x.Subject.EnglishName,
            subjectPendingReview = x.Subject != null && !x.Subject.IsVisible,
            status = x.Status.ToString(),
            x.Price,
            x.IsFree,
            hasCover = x.CoverImageKey != null,
            moduleCount = x.Modules.Count,
            lessonCount = x.Modules.SelectMany(module => module.Lessons).Count(),
            resourceCount = x.Modules.SelectMany(module => module.Lessons).SelectMany(lesson => lesson.Resources).Count()
        })
        .ToListAsync(cancellationToken));

    [HttpGet("{courseId:guid}")]
    public async Task<IActionResult> Get(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking()
            .Include(x => x.Modules).ThenInclude(x => x.Lessons).ThenInclude(x => x.Resources)
            .Include(x => x.Modules).ThenInclude(x => x.LearningAims).ThenInclude(x => x.Topics)
            .Include(x => x.Modules).ThenInclude(x => x.UnitDefinition)
            .Include(x => x.Modules).ThenInclude(x => x.LearningAims).ThenInclude(x => x.LearningAimDefinition)
            .Include(x => x.Modules).ThenInclude(x => x.Criteria)
            .Include(x => x.Modules).ThenInclude(x => x.Criteria).ThenInclude(x => x.AssessmentCriterionDefinition)
            .Include(x => x.LearningOutcomes)
            .Include(x => x.Subject)
            .SingleOrDefaultAsync(x => x.Id == courseId && (x.Status == Betcco.Domain.Common.CourseStatus.SubmittedForReview || x.Status == Betcco.Domain.Common.CourseStatus.Approved), cancellationToken);
        if (course is null) return NotFound();
        var assignments = await db.CourseAssignments.AsNoTracking()
            .Include(assignment => assignment.Criteria)
            .Where(assignment => assignment.CourseId == courseId)
            .OrderBy(assignment => assignment.DueAtUtc)
            .ToListAsync(cancellationToken);
        return Ok(new
        {
            course.Id,
            course.ArabicTitle,
            course.EnglishTitle,
            course.ArabicDescription,
            course.EnglishDescription,
            subjectArabicName = course.Subject?.ArabicName,
            subjectEnglishName = course.Subject?.EnglishName,
            subjectPendingReview = course.Subject is not null && !course.Subject.IsVisible,
            status = course.Status.ToString(),
            course.Price,
            course.IsFree,
            hasCover = course.CoverImageKey != null,
            course.SeoTitle,
            course.SeoDescription,
            outcomes = course.LearningOutcomes.OrderBy(x => x.SortOrder).Select(x => new { x.ArabicText, x.EnglishText }),
            assignments = assignments.Select(assignment => new
            {
                assignment.ArabicTitle,
                assignment.EnglishTitle,
                assignment.ArabicInstructions,
                assignment.EnglishInstructions,
                assignment.AvailableFromUtc,
                assignment.DueAtUtc,
                assignment.MaxSubmissionAttempts,
                assignment.AllowResubmission,
                assignment.MaxFileSizeBytes,
                allowedFileExtensions = System.Text.Json.JsonSerializer.Deserialize<string[]>(assignment.AllowedFileExtensionsJson) ?? [],
                assignment.MaxScore,
                assignment.IsPublished,
                criteria = assignment.Criteria.OrderBy(criterion => criterion.SortOrder).Select(criterion => new { criterion.Code, band = criterion.Band.ToString(), criterion.ArabicDescription, criterion.EnglishDescription })
            }),
            modules = course.Modules.OrderBy(x => x.SortOrder).Select(module => new
            {
                ArabicTitle = module.UnitDefinition?.ArabicTitle ?? module.ArabicTitle,
                EnglishTitle = module.UnitDefinition?.EnglishTitle ?? module.EnglishTitle,
                UnitCode = module.UnitDefinition?.Code ?? module.UnitCode,
                module.ArabicDescription,
                module.EnglishDescription,
                module.GuidedLearningHours,
                module.Credits,
                module.QualificationLevel,
                publicationStatus = module.PublicationStatus.ToString(),
                module.SortOrder,
                learningAims = module.LearningAims.OrderBy(aim => aim.SortOrder).Select(aim => new
                {
                    Code = aim.LearningAimDefinition?.Code ?? aim.Code,
                    ArabicTitle = aim.LearningAimDefinition?.ArabicTitle ?? aim.ArabicTitle,
                    EnglishTitle = aim.LearningAimDefinition?.EnglishTitle ?? aim.EnglishTitle,
                    ArabicDescription = aim.LearningAimDefinition?.ArabicDescription ?? aim.ArabicDescription,
                    EnglishDescription = aim.LearningAimDefinition?.EnglishDescription ?? aim.EnglishDescription,
                    publicationStatus = aim.PublicationStatus.ToString(),
                    topics = aim.Topics.OrderBy(topic => topic.SortOrder).Select(topic => new
                    {
                        topic.ArabicTitle,
                        topic.EnglishTitle,
                        topic.ArabicDescription,
                        topic.EnglishDescription,
                        publicationStatus = topic.PublicationStatus.ToString()
                    })
                }),
                criteria = module.Criteria.OrderBy(criterion => criterion.SortOrder).Select(criterion => new
                {
                    Code = criterion.AssessmentCriterionDefinition?.Code ?? criterion.Code,
                    band = (criterion.AssessmentCriterionDefinition?.Band ?? criterion.Band).ToString(),
                    ArabicDescription = criterion.AssessmentCriterionDefinition?.ArabicDescription ?? criterion.ArabicDescription,
                    EnglishDescription = criterion.AssessmentCriterionDefinition?.EnglishDescription ?? criterion.EnglishDescription,
                    criterion.ArabicEvidenceGuidance,
                    criterion.EnglishEvidenceGuidance,
                    publicationStatus = criterion.PublicationStatus.ToString()
                }),
                lessons = module.Lessons.OrderBy(x => x.SortOrder).Select(lesson => new
                {
                    lesson.ArabicTitle,
                    lesson.EnglishTitle,
                    lesson.ArabicBody,
                    lesson.EnglishBody,
                    type = lesson.Type.ToString(),
                    lesson.DurationSeconds,
                    lesson.IsPreview,
                    resources = lesson.Resources.OrderBy(x => x.DisplayName).Select(resource => new { resource.Id, resource.DisplayName, resource.ContentType, scanStatus = resource.ScanStatus.ToString(), resource.IsDownloadable })
                })
            })
        });
    }

    [HttpGet("{courseId:guid}/cover")]
    public async Task<IActionResult> GetCover(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId && (x.Status == Betcco.Domain.Common.CourseStatus.SubmittedForReview || x.Status == Betcco.Domain.Common.CourseStatus.Approved), cancellationToken);
        if (course?.CoverImageKey is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(course.CoverImageKey, cancellationToken);
        return content is null ? NotFound() : File(content, course.CoverImageContentType ?? "image/jpeg", enableRangeProcessing: true);
    }

    [HttpGet("resources/{resourceId:guid}")]
    public async Task<IActionResult> DownloadResource(Guid resourceId, CancellationToken cancellationToken)
    {
        var resource = await db.LessonResources.AsNoTracking().SingleOrDefaultAsync(x => x.Id == resourceId, cancellationToken);
        if (resource is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(resource.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, resource.ContentType, resource.DisplayName, enableRangeProcessing: true);
    }

    [HttpPost("{courseId:guid}/review")]
    public async Task<IActionResult> Review(Guid courseId, ReviewCourseRequest request, CancellationToken cancellationToken) => await courses.ReviewAsync(UserId, courseId, request.Approved, request.Reason, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{courseId:guid}/publish")]
    public async Task<IActionResult> Publish(Guid courseId, CancellationToken cancellationToken) => await courses.PublishAsync(UserId, courseId, cancellationToken) ? NoContent() : BadRequest(new { message = "The course must be approved and pass the publishing quality gate." });

    [HttpPost("{courseId:guid}/schedule")]
    public async Task<IActionResult> Schedule(Guid courseId, ScheduleCourseRequest request, CancellationToken cancellationToken) => await courses.ScheduleAsync(UserId, courseId, request.PublishAtUtc, cancellationToken) ? NoContent() : BadRequest(new { message = "The course must be approved, complete, and scheduled for a future time." });

    [HttpPost("{courseId:guid}/archive")]
    public async Task<IActionResult> Archive(Guid courseId, CancellationToken cancellationToken) => await courses.ArchiveAsync(UserId, courseId, cancellationToken) ? NoContent() : BadRequest(new { message = "Only approved, published, or scheduled courses can be archived." });

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

public sealed record ReviewCourseRequest(bool Approved, string? Reason);
public sealed record ScheduleCourseRequest(DateTimeOffset PublishAtUtc);
