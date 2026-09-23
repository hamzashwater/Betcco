using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Application.Courses;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseAuthor")]
[Route("api/v1/teacher/courses")]
public sealed class CourseAuthoringController(ICourseAuthoringService courses, IFileStorage storage, IStorageLifecycleCoordinator storageLifecycle, IFileSecurityScanner scanner, BetccoDbContext db) : ControllerBase
{
    private const long MaxCourseVideoBytes = 500L * 1024 * 1024;

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) => Ok(await db.Courses.AsNoTracking().Where(x => x.TeacherUserId == UserId).OrderByDescending(x => x.UpdatedAtUtc).Select(x => new { x.Id, x.ArabicTitle, x.EnglishTitle, status = x.Status.ToString(), x.Price, x.IsFree, hasCover = x.CoverImageKey != null, moduleCount = x.Modules.Count, lessonCount = x.Modules.SelectMany(module => module.Lessons).Count() }).ToListAsync(cancellationToken));

    [HttpGet("{courseId:guid}")]
    public async Task<IActionResult> Get(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking()
            .Include(x => x.LearningTrack)
            .Include(x => x.Modules).ThenInclude(x => x.Lessons).ThenInclude(x => x.Resources)
            .Include(x => x.Modules).ThenInclude(x => x.LearningAims).ThenInclude(x => x.Topics)
            .Include(x => x.Modules).ThenInclude(x => x.UnitDefinition)
            .Include(x => x.Modules).ThenInclude(x => x.LearningAims).ThenInclude(x => x.LearningAimDefinition)
            .Include(x => x.Modules).ThenInclude(x => x.Criteria)
            .Include(x => x.Modules).ThenInclude(x => x.Criteria).ThenInclude(x => x.AssessmentCriterionDefinition)
            .Include(x => x.LearningOutcomes)
            .SingleOrDefaultAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken);
        return course is null ? NotFound() : Ok(CourseView(course));
    }

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateCourseCommand command, CancellationToken cancellationToken)
    {
        var normalizedCommand = await NormalizeCreateCommandAsync(command, cancellationToken);
        if (string.IsNullOrWhiteSpace(normalizedCommand.ArabicTitle)
            || string.IsNullOrWhiteSpace(normalizedCommand.ArabicDescription)
            || (!command.IsFree && command.Price <= 0))
            return BadRequest(new { message = "Enter the required course details and a valid price." });
        if (!await HasValidTaxonomyAsync(normalizedCommand, cancellationToken))
            return BadRequest(new { message = "Choose a valid learning track, grade, specialization, and subject." });

        return Ok(new { id = await courses.CreateDraftAsync(UserId, normalizedCommand, cancellationToken) });
    }

    [HttpPut("{courseId:guid}")]
    public async Task<IActionResult> Update(Guid courseId, UpdateCourseCommand command, CancellationToken cancellationToken) => await courses.UpdateCourseAsync(UserId, courseId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "Only editable draft courses with complete details can be updated." });

    [HttpPost("modules")]
    public async Task<IActionResult> AddModule(CreateModuleCommand command, CancellationToken cancellationToken)
    {
        var id = await courses.AddModuleAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new ProblemDetails { Status = 400, Title = "Invalid course unit", Detail = "Select an active published unit from the course qualification version." }) : Ok(new { id });
    }

    [HttpGet("{courseId:guid}/academic-units")]
    public async Task<IActionResult> AcademicUnits(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().Include(x => x.LearningTrack)
            .SingleOrDefaultAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken);
        if (course is null) return NotFound();
        if (course.LearningTrack?.IsBtecFocused != true) return Ok(Array.Empty<object>());
        var units = await db.UnitDefinitions.AsNoTracking()
            .Where(x => x.IsActive && x.PublishedAtUtc != null
                && x.QualificationVersion!.IsActive && x.QualificationVersion.Qualification!.IsActive
                && (course.QualificationVersionId == null || x.QualificationVersionId == course.QualificationVersionId))
            .OrderBy(x => x.QualificationVersion!.Qualification!.Code)
            .ThenBy(x => x.QualificationVersion!.VersionCode).ThenBy(x => x.Code)
            .Select(x => new
            {
                x.Id,
                x.Code,
                x.ArabicTitle,
                x.EnglishTitle,
                x.QualificationVersionId,
                QualificationCode = x.QualificationVersion!.Qualification!.Code,
                x.QualificationVersion.VersionCode
            })
            .Take(500).ToArrayAsync(cancellationToken);
        return Ok(units);
    }

    [HttpPost("modules/{moduleId:guid}/academic-link")]
    public async Task<IActionResult> LinkModule(Guid moduleId, LinkCourseUnitCommand command, CancellationToken cancellationToken) =>
        await courses.LinkModuleToUnitAsync(UserId, moduleId, command.UnitDefinitionId, cancellationToken)
            ? NoContent()
            : BadRequest(new ProblemDetails { Status = 400, Title = "Academic mapping required", Detail = "This unit cannot be linked automatically. Check its existing aims, criteria, and qualification version." });

    [HttpPut("modules/{moduleId:guid}")]
    public async Task<IActionResult> UpdateModule(Guid moduleId, UpdateModuleCommand command, CancellationToken cancellationToken) => await courses.UpdateModuleAsync(UserId, moduleId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "This module cannot be updated." });

    [HttpDelete("modules/{moduleId:guid}")]
    public async Task<IActionResult> DeleteModule(Guid moduleId, CancellationToken cancellationToken) => await courses.DeleteModuleAsync(UserId, moduleId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("modules/{moduleId:guid}/duplicate")]
    public async Task<IActionResult> DuplicateModule(Guid moduleId, CancellationToken cancellationToken)
    {
        var id = await courses.DuplicateModuleAsync(UserId, moduleId, cancellationToken);
        return id is null ? BadRequest(new { message = "Only an editable unit can be duplicated." }) : Ok(new { id });
    }

    [HttpPost("learning-aims")]
    public async Task<IActionResult> AddLearningAim(CreateLearningAimCommand command, CancellationToken cancellationToken)
    {
        var id = await courses.AddLearningAimAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "The learning aim must belong to an editable unit and have a unique code." }) : Ok(new { id });
    }

    [HttpPut("learning-aims/{learningAimId:guid}")]
    public async Task<IActionResult> UpdateLearningAim(Guid learningAimId, UpdateLearningAimCommand command, CancellationToken cancellationToken) => await courses.UpdateLearningAimAsync(UserId, learningAimId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "This learning aim cannot be updated." });

    [HttpDelete("learning-aims/{learningAimId:guid}")]
    public async Task<IActionResult> DeleteLearningAim(Guid learningAimId, CancellationToken cancellationToken) => await courses.DeleteLearningAimAsync(UserId, learningAimId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("topics")]
    public async Task<IActionResult> AddTopic(CreateTopicCommand command, CancellationToken cancellationToken)
    {
        var id = await courses.AddTopicAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "The topic must belong to an editable learning aim." }) : Ok(new { id });
    }

    [HttpPut("topics/{topicId:guid}")]
    public async Task<IActionResult> UpdateTopic(Guid topicId, UpdateTopicCommand command, CancellationToken cancellationToken) => await courses.UpdateTopicAsync(UserId, topicId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "This topic cannot be updated." });

    [HttpDelete("topics/{topicId:guid}")]
    public async Task<IActionResult> DeleteTopic(Guid topicId, CancellationToken cancellationToken) => await courses.DeleteTopicAsync(UserId, topicId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("criteria")]
    public async Task<IActionResult> AddCriterion(CreateBtecCriterionCommand command, CancellationToken cancellationToken)
    {
        var id = await courses.AddCriterionAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Use a unique BTEC code such as A.P1 with the matching P/M/D band." }) : Ok(new { id });
    }

    [HttpPut("criteria/{criterionId:guid}")]
    public async Task<IActionResult> UpdateCriterion(Guid criterionId, UpdateBtecCriterionCommand command, CancellationToken cancellationToken) => await courses.UpdateCriterionAsync(UserId, criterionId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "This criterion cannot be updated." });

    [HttpDelete("criteria/{criterionId:guid}")]
    public async Task<IActionResult> DeleteCriterion(Guid criterionId, CancellationToken cancellationToken) => await courses.DeleteCriterionAsync(UserId, criterionId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("lessons")]
    public async Task<IActionResult> AddLesson(CreateLessonCommand command, CancellationToken cancellationToken)
    {
        var id = await courses.AddLessonAsync(UserId, command, cancellationToken);
        return id is null ? Forbid() : Ok(new { id });
    }

    [HttpPut("lessons/{lessonId:guid}")]
    public async Task<IActionResult> UpdateLesson(Guid lessonId, UpdateLessonCommand command, CancellationToken cancellationToken) => await courses.UpdateLessonAsync(UserId, lessonId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "This lesson cannot be updated." });

    [HttpDelete("lessons/{lessonId:guid}")]
    public async Task<IActionResult> DeleteLesson(Guid lessonId, CancellationToken cancellationToken) => await courses.DeleteLessonAsync(UserId, lessonId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("lessons/{lessonId:guid}/duplicate")]
    public async Task<IActionResult> DuplicateLesson(Guid lessonId, CancellationToken cancellationToken)
    {
        var id = await courses.DuplicateLessonAsync(UserId, lessonId, cancellationToken);
        return id is null ? BadRequest(new { message = "Only an editable lesson can be duplicated." }) : Ok(new { id });
    }

    [HttpPost("{courseId:guid}/cover")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(6L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 6L * 1024 * 1024)]
    public async Task<IActionResult> UploadCover(Guid courseId, IFormFile file, [FromForm] string? seoTitle, [FromForm] string? seoDescription, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > 5 * 1024 * 1024) return BadRequest(new { message = "Use a JPG, PNG, or WEBP image smaller than 5 MB." });
        await using var stream = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(stream, file.FileName, out var validation)
            || validation.DetectedContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            return BadRequest(new { message = "The image content does not match an approved JPG, PNG, or WEBP file." });
        var scan = await scanner.ScanAsync(stream, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected) return BadRequest(new { message = "The image was rejected by the security scanner." });
        if (!scan.IsClean) return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." });
        stream.Position = 0;
        var previousKey = await db.Courses.AsNoTracking()
            .Where(course => course.Id == courseId && course.TeacherUserId == UserId)
            .Select(course => course.CoverImageKey)
            .SingleOrDefaultAsync(cancellationToken);
        var staged = await storage.StagePrivateAsync(stream, validation.DetectedContentType, cancellationToken);
        var finalization = storageLifecycle.EnqueueFinalization(staged);
        StorageLifecycleOperation? deletion = null;
        if (!string.IsNullOrWhiteSpace(previousKey) && !string.Equals(previousKey, staged.StorageKey, StringComparison.Ordinal))
            deletion = storageLifecycle.EnqueueDeletion(previousKey);
        var updated = await courses.SetPresentationAsync(UserId, new SetCoursePresentationCommand(courseId, staged.StorageKey, validation.DetectedContentType, seoTitle, seoDescription), cancellationToken);
        if (!updated)
        {
            await storageLifecycle.DiscardStagedAsync(staged, cancellationToken);
            return Forbid();
        }
        await storageLifecycle.TryProcessNowAsync(finalization.Id, cancellationToken);
        if (deletion is not null) await storageLifecycle.TryProcessNowAsync(deletion.Id, cancellationToken);
        return Ok(new { storageKey = staged.StorageKey });
    }

    [HttpGet("{courseId:guid}/cover")]
    public async Task<IActionResult> GetCover(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken);
        if (course?.CoverImageKey is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(course.CoverImageKey, cancellationToken);
        return content is null ? NotFound() : File(content, course.CoverImageContentType ?? "image/jpeg", enableRangeProcessing: true);
    }

    [HttpPost("lessons/{lessonId:guid}/resources")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(110L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110L * 1024 * 1024)]
    public async Task<IActionResult> UploadResource(Guid lessonId, IFormFile file, [FromForm] bool isDownloadable = true, CancellationToken cancellationToken = default)
    {
        const long maxBytes = 100L * 1024 * 1024;
        if (file.Length is <= 0 or > maxBytes || !IsAllowedResource(file.FileName)) return BadRequest(new { message = "Use an approved course resource type no larger than 100 MB." });
        await using var stream = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(stream, file.FileName, out var validation))
            return BadRequest(new { message = "The resource content does not match its approved file type." });
        var scan = await scanner.ScanAsync(stream, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected) return BadRequest(new { message = "The resource was rejected by the security scanner." });
        if (!scan.IsClean) return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." });
        stream.Position = 0;
        var staged = await storage.StagePrivateAsync(stream, validation.DetectedContentType!, cancellationToken);
        var finalization = storageLifecycle.EnqueueFinalization(staged);
        var added = await courses.AddLessonResourceAsync(UserId, new AddLessonResourceCommand(lessonId, Path.GetFileName(file.FileName), staged.StorageKey, validation.DetectedContentType!, isDownloadable), cancellationToken);
        if (!added)
        {
            await storageLifecycle.DiscardStagedAsync(staged, cancellationToken);
            return Forbid();
        }
        await storageLifecycle.TryProcessNowAsync(finalization.Id, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Uploads the playable source for a lesson. The video remains in private
    /// storage and can only be streamed through an authorization-checked API
    /// endpoint; it is never exposed below the public web root.
    /// </summary>
    [HttpPost("lessons/{lessonId:guid}/video")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(MaxCourseVideoBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxCourseVideoBytes)]
    public async Task<IActionResult> UploadLessonVideo(Guid lessonId, IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file.Length is <= 0 or > MaxCourseVideoBytes || !TryGetVideoContentType(file.FileName, out var contentType))
            return BadRequest(new { message = "Use an MP4 or WEBM video no larger than 500 MB." });

        // Reject non-owners before reading, scanning, or staging a large upload.
        if (!await db.Lessons.AsNoTracking().AnyAsync(item => item.Id == lessonId
            && item.CourseModule!.Course!.TeacherUserId == UserId
            && (item.CourseModule.Course.Status == CourseStatus.Draft
                || item.CourseModule.Course.Status == CourseStatus.Rejected), cancellationToken))
            return NotFound();

        await using var stream = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(stream, file.FileName, out var validation)
            || !string.Equals(contentType, validation.DetectedContentType, StringComparison.Ordinal))
            return BadRequest(new { message = "The video content does not match its MP4 or WEBM extension." });
        var scan = await scanner.ScanAsync(stream, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected)
            return BadRequest(new { message = "The video was rejected by the security scanner." });
        if (!scan.IsClean)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." });
        if (stream.CanSeek) stream.Position = 0;

        var staged = await storage.StagePrivateAsync(stream, validation.DetectedContentType!, cancellationToken);
        var finalization = storageLifecycle.EnqueueFinalization(staged);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await storageLifecycle.DiscardStagedAsync(staged, CancellationToken.None);
            throw;
        }
        if (!await storageLifecycle.TryProcessNowAsync(finalization.Id, cancellationToken))
        {
            await QueueAbandonedVideoCleanupAsync(staged, waitForFinalization: true, cancellationToken);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "The video could not be prepared. The previous video remains available; try again later." });
        }

        LessonVideoChangeResult? change;
        try
        {
            change = await courses.AddLessonVideoAsync(UserId,
                new AddLessonVideoCommand(lessonId, Path.GetFileName(file.FileName), staged.StorageKey, validation.DetectedContentType!), cancellationToken);
        }
        catch
        {
            db.ChangeTracker.Clear();
            await QueueAbandonedVideoCleanupAsync(staged, waitForFinalization: false, CancellationToken.None);
            throw;
        }
        if (change is null)
        {
            await QueueAbandonedVideoCleanupAsync(staged, waitForFinalization: false, cancellationToken);
            return NotFound();
        }
        foreach (var deletionId in change.DeletionOperationIds)
            await storageLifecycle.TryProcessNowAsync(deletionId, cancellationToken);
        return Ok(new { id = change.VideoId });
    }

    private async Task QueueAbandonedVideoCleanupAsync(StagedPrivateFile staged, bool waitForFinalization, CancellationToken cancellationToken)
    {
        var cleanup = storageLifecycle.EnqueueDeletion(staged.StorageKey);
        // The final key doubles as a dependency marker for cleanup after a pending copy.
        if (waitForFinalization) cleanup.StagingKey = staged.StorageKey;
        await db.SaveChangesAsync(cancellationToken);
        if (!waitForFinalization) await storageLifecycle.TryProcessNowAsync(cleanup.Id, cancellationToken);
    }

    [HttpDelete("lessons/{lessonId:guid}/video")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> RemoveLessonVideo(Guid lessonId, CancellationToken cancellationToken)
    {
        var change = await courses.RemoveLessonVideoAsync(UserId, lessonId, cancellationToken);
        if (change is null) return NotFound();
        foreach (var deletionId in change.DeletionOperationIds)
            await storageLifecycle.TryProcessNowAsync(deletionId, cancellationToken);
        return NoContent();
    }

    [HttpGet("lessons/{lessonId:guid}/video")]
    public async Task<IActionResult> StreamLessonVideo(Guid lessonId, CancellationToken cancellationToken)
    {
        var lesson = await db.Lessons.AsNoTracking()
            .Include(item => item.CourseModule).ThenInclude(item => item!.Course)
            .Include(item => item.Resources)
            .SingleOrDefaultAsync(item => item.Id == lessonId && item.CourseModule!.Course!.TeacherUserId == UserId, cancellationToken);
        var video = lesson is null ? null : FindVideoResource(lesson);
        if (video is null) return NotFound();
        var content = await storage.OpenPrivateReadAsync(video.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, video.ContentType, enableRangeProcessing: true);
    }

    [HttpPost("lessons/{lessonId:guid}/resource-links")]
    public async Task<IActionResult> AddResourceLink(Guid lessonId, AddLessonResourceLinkRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Trim().Length > 240
            || !Uri.TryCreate(request.ExternalUrl, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps)
            return BadRequest(new { message = "Provide a short display name and an HTTPS resource link." });
        var added = await courses.AddLessonResourceLinkAsync(UserId, new AddLessonResourceLinkCommand(lessonId, request.DisplayName, request.ExternalUrl), cancellationToken);
        return added ? NoContent() : Forbid();
    }

    [HttpGet("resources/{resourceId:guid}")]
    public async Task<IActionResult> DownloadResource(Guid resourceId, CancellationToken cancellationToken)
    {
        var resource = await db.LessonResources.AsNoTracking().Include(x => x.Lesson).ThenInclude(x => x!.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == resourceId && x.Lesson!.CourseModule!.Course!.TeacherUserId == UserId, cancellationToken);
        if (resource is null) return NotFound();
        if (resource.ExternalUrl is not null) return Redirect(resource.ExternalUrl);
        var content = await storage.OpenPrivateReadAsync(resource.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, resource.ContentType, resource.DisplayName, enableRangeProcessing: true);
    }

    [HttpPost("outcomes")]
    public async Task<IActionResult> AddOutcome(AddOutcomeCommand command, CancellationToken cancellationToken) => await courses.AddOutcomeAsync(UserId, command, cancellationToken) ? NoContent() : Forbid();

    [HttpPost("{courseId:guid}/submit")]
    public async Task<IActionResult> Submit(Guid courseId, CancellationToken cancellationToken)
    {
        var result = await courses.SubmitForReviewAsync(UserId, courseId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<CreateCourseCommand> NormalizeCreateCommandAsync(CreateCourseCommand command, CancellationToken cancellationToken)
    {
        var arabicTitle = command.ArabicTitle?.Trim() ?? string.Empty;
        var arabicDescription = command.ArabicDescription?.Trim() ?? string.Empty;
        var trackId = command.LearningTrackId;
        if (trackId == Guid.Empty)
        {
            trackId = await db.LearningTracks.AsNoTracking()
                .Where(track => track.IsVisible)
                .OrderByDescending(track => track.IsBtecFocused)
                .ThenBy(track => track.SortOrder)
                .Select(track => track.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return command with
        {
            ArabicTitle = arabicTitle,
            EnglishTitle = string.IsNullOrWhiteSpace(command.EnglishTitle) ? arabicTitle : command.EnglishTitle.Trim(),
            ArabicDescription = arabicDescription,
            EnglishDescription = string.IsNullOrWhiteSpace(command.EnglishDescription) ? arabicDescription : command.EnglishDescription.Trim(),
            LearningTrackId = trackId
        };
    }

    private async Task<bool> HasValidTaxonomyAsync(CreateCourseCommand command, CancellationToken cancellationToken)
    {
        if (!await db.LearningTracks.AsNoTracking().AnyAsync(track => track.Id == command.LearningTrackId && track.IsVisible, cancellationToken))
            return false;
        if (command.GradeId.HasValue && !await db.Grades.AsNoTracking().AnyAsync(grade => grade.Id == command.GradeId && grade.IsVisible && grade.LearningTrackId == command.LearningTrackId, cancellationToken))
            return false;
        if (command.SpecializationId.HasValue && !await db.Specializations.AsNoTracking().AnyAsync(specialization => specialization.Id == command.SpecializationId && specialization.IsVisible && specialization.LearningTrackId == command.LearningTrackId, cancellationToken))
            return false;
        if (!command.SubjectId.HasValue) return true;

        var subject = await db.Subjects.AsNoTracking().SingleOrDefaultAsync(item => item.Id == command.SubjectId.Value, cancellationToken);
        return subject is not null
            && (subject.IsVisible || subject.CreatedByUserId == UserId)
            && (!command.SpecializationId.HasValue || subject.SpecializationId is null || subject.SpecializationId == command.SpecializationId);
    }

    private static bool IsAllowedResource(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension is ".pdf" or ".doc" or ".docx" or ".ppt" or ".pptx" or ".xls" or ".xlsx" or ".txt" or ".zip" or ".mp4" or ".webm" or ".mp3" or ".wav" or ".jpg" or ".jpeg" or ".png" or ".webp";
    }

    private static bool TryGetVideoContentType(string fileName, out string contentType)
    {
        contentType = Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            _ => string.Empty
        };
        return contentType.Length > 0;
    }

    private static Betcco.Domain.Learning.LessonResource? FindVideoResource(Betcco.Domain.Learning.Lesson lesson) =>
        Guid.TryParse(lesson.VideoReference, out var resourceId)
            ? lesson.Resources.SingleOrDefault(resource => resource.Id == resourceId
                && resource.ScanStatus == Betcco.Domain.Common.UploadScanStatus.Clean
                && resource.ContentType is "video/mp4" or "video/webm")
            : null;

    private static object? VideoView(Betcco.Domain.Learning.Lesson lesson)
    {
        var video = FindVideoResource(lesson);
        return video is null ? null : new { video.Id, video.DisplayName, video.ContentType };
    }

    private static object CourseView(Betcco.Domain.Learning.Course course) => new
    {
        course.Id,
        course.ArabicTitle,
        course.EnglishTitle,
        course.ArabicDescription,
        course.EnglishDescription,
        status = course.Status.ToString(),
        course.Price,
        course.IsFree,
        hasCover = course.CoverImageKey != null,
        course.SeoTitle,
        course.SeoDescription,
        course.QualificationVersionId,
        isBtecFocused = course.LearningTrack?.IsBtecFocused == true,
        outcomes = course.LearningOutcomes.OrderBy(x => x.SortOrder).Select(x => new { x.Id, x.ArabicText, x.EnglishText, x.SortOrder }),
        modules = course.Modules.OrderBy(x => x.SortOrder).Select(module => new
        {
            module.Id,
            module.UnitDefinitionId,
            ArabicTitle = module.UnitDefinition?.ArabicTitle ?? module.ArabicTitle,
            EnglishTitle = module.UnitDefinition?.EnglishTitle ?? module.EnglishTitle,
            UnitCode = module.UnitDefinition?.Code ?? module.UnitCode,
            module.ArabicDescription,
            module.EnglishDescription,
            module.GuidedLearningHours,
            module.Credits,
            module.QualificationLevel,
            publicationStatus = module.PublicationStatus.ToString(),
            module.AvailableFromUtc,
            module.SortOrder,
            learningAims = module.LearningAims.OrderBy(aim => aim.SortOrder).Select(aim => new
            {
                aim.Id,
                Code = aim.LearningAimDefinition?.Code ?? aim.Code,
                ArabicTitle = aim.LearningAimDefinition?.ArabicTitle ?? aim.ArabicTitle,
                EnglishTitle = aim.LearningAimDefinition?.EnglishTitle ?? aim.EnglishTitle,
                ArabicDescription = aim.LearningAimDefinition?.ArabicDescription ?? aim.ArabicDescription,
                EnglishDescription = aim.LearningAimDefinition?.EnglishDescription ?? aim.EnglishDescription,
                aim.LearningAimDefinitionId,
                publicationStatus = aim.PublicationStatus.ToString(),
                aim.AvailableFromUtc,
                aim.SortOrder,
                topics = aim.Topics.OrderBy(topic => topic.SortOrder).Select(topic => new
                {
                    topic.Id,
                    topic.ArabicTitle,
                    topic.EnglishTitle,
                    topic.ArabicDescription,
                    topic.EnglishDescription,
                    publicationStatus = topic.PublicationStatus.ToString(),
                    topic.AvailableFromUtc,
                    topic.SortOrder
                })
            }),
            criteria = module.Criteria.OrderBy(criterion => criterion.SortOrder).Select(criterion => new
            {
                criterion.Id,
                criterion.BtecLearningAimId,
                Code = criterion.AssessmentCriterionDefinition?.Code ?? criterion.Code,
                band = (criterion.AssessmentCriterionDefinition?.Band ?? criterion.Band).ToString(),
                ArabicDescription = criterion.AssessmentCriterionDefinition?.ArabicDescription ?? criterion.ArabicDescription,
                EnglishDescription = criterion.AssessmentCriterionDefinition?.EnglishDescription ?? criterion.EnglishDescription,
                criterion.AssessmentCriterionDefinitionId,
                criterion.ArabicEvidenceGuidance,
                criterion.EnglishEvidenceGuidance,
                publicationStatus = criterion.PublicationStatus.ToString(),
                criterion.SortOrder
            }),
            lessons = module.Lessons.OrderBy(x => x.SortOrder).Select(lesson => new
            {
                lesson.Id,
                lesson.BtecLearningAimId,
                lesson.BtecTopicId,
                lesson.ArabicTitle,
                lesson.EnglishTitle,
                lesson.ArabicBody,
                lesson.EnglishBody,
                type = lesson.Type.ToString(),
                lesson.DurationSeconds,
                lesson.IsPreview,
                publicationStatus = lesson.PublicationStatus.ToString(),
                lesson.AvailableFromUtc,
                lesson.SortOrder,
                video = VideoView(lesson),
                resources = lesson.Resources.OrderBy(x => x.DisplayName).Select(resource => new { resource.Id, resource.DisplayName, resource.ContentType, resource.ExternalUrl, scanStatus = resource.ScanStatus.ToString(), resource.IsDownloadable })
            })
        })
    };
}

public sealed record AddLessonResourceLinkRequest(string DisplayName, string ExternalUrl);
