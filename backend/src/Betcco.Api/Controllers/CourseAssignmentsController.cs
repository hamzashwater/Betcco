using System.Security.Claims;
using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1")]
public sealed class CourseAssignmentsController(
    ICourseAssignmentService assignments,
    IFileStorage storage,
    IStorageLifecycleCoordinator storageLifecycle,
    IFileSecurityScanner scanner,
    BetccoDbContext db,
    IContentAccessService contentAccess,
    ICourseAssignmentDeadlineResolver deadlineResolver,
    ICourseAssignmentDeadlineExtensionService deadlineExtensions) : ControllerBase
{
    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}/assignments")]
    public async Task<IActionResult> TeacherList(Guid courseId, CancellationToken cancellationToken)
    {
        var rows = await db.CourseAssignments.AsNoTracking()
            .Include(assignment => assignment.Criteria)
            .Include(assignment => assignment.Resources)
            .Where(assignment => assignment.CourseId == courseId && assignment.Course!.TeacherUserId == UserId
                && assignment.Purpose == CourseAssignmentPurpose.Coursework)
            .OrderBy(assignment => assignment.DueAtUtc)
            .ToListAsync(cancellationToken);
        return Ok(rows.Select(assignment => AssignmentView(assignment)));
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments")]
    public async Task<IActionResult> Create(CreateCourseAssignmentCommand command, CancellationToken cancellationToken)
    {
        var id = await assignments.CreateAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "The assignment must belong to one of your active courses and contain complete instructions." }) : Ok(new { id });
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/practice")]
    public async Task<IActionResult> CreatePractice(CreateLearningAimPracticeCommand command, CancellationToken cancellationToken)
    {
        var id = await assignments.CreatePracticeAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Choose one canonical aim in your course and provide complete practice instructions." }) : Ok(new { id });
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/comprehensive-practice")]
    public async Task<IActionResult> CreateComprehensivePractice(CreateComprehensivePracticeCommand command, CancellationToken cancellationToken)
    {
        var result = await assignments.CreateComprehensivePracticeAsync(UserId, command, cancellationToken);
        return result.Status switch
        {
            PracticeCreateStatus.Created => Ok(new { id = result.Id }),
            PracticeCreateStatus.Conflict => Conflict(new { code = "COMPREHENSIVE_PRACTICE_EXISTS" }),
            _ => BadRequest(new { message = "Choose a canonical Unit in your course and provide complete practice instructions." })
        };
    }

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}/comprehensive-practice")]
    public async Task<IActionResult> TeacherComprehensivePractice(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Courses.AsNoTracking().AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken)) return NotFound();
        var rows = await db.CourseAssignments.AsNoTracking()
            .Include(x => x.Criteria).Include(x => x.Resources)
            .Where(x => x.CourseId == courseId && x.Purpose == CourseAssignmentPurpose.ComprehensivePractice)
            .OrderBy(x => x.CourseModuleId).ToArrayAsync(cancellationToken);
        return Ok(rows.Select(x => AssignmentView(x)));
    }

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}/comprehensive-practice/submissions")]
    public async Task<IActionResult> TeacherComprehensiveSubmissions(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Courses.AsNoTracking().AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken)) return NotFound();
        var rows = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(x => x.CourseAssignment!.CourseId == courseId
                && x.CourseAssignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && db.Enrollments.Any(enrollment => enrollment.CourseId == courseId
                    && enrollment.StudentUserId == x.StudentUserId))
            .OrderByDescending(x => x.SubmittedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.CourseAssignmentId,
                x.StudentUserId,
                Status = x.Status.ToString(),
                TrainingOutcome = x.TrainingOutcome == null ? null : x.TrainingOutcome.ToString(),
                x.TrainingStrengths,
                x.TrainingGaps,
                x.TrainingImprovementGuidance,
                x.SubmittedAtUtc,
                Files = x.Versions.Where(v => v.VersionNumber == x.CurrentVersionNumber)
                    .SelectMany(v => v.Files).Select(file => new { file.Id, file.OriginalFileName, file.ContentType, file.LengthBytes })
            }).ToArrayAsync(cancellationToken);
        return Ok(rows);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/comprehensive-practice/submissions/{submissionId:guid}/review")]
    public async Task<IActionResult> ReviewComprehensivePractice(Guid submissionId, ReviewLearningAimPracticeCommand command, CancellationToken cancellationToken) =>
        await assignments.ReviewComprehensivePracticeAsync(UserId, submissionId, command, cancellationToken) switch
        {
            PracticeReviewResult.Finalized => NoContent(),
            PracticeReviewResult.Conflict => Conflict(new { code = "PRACTICE_REVIEW_CONFLICT" }),
            _ => BadRequest(new { message = "A submitted Unit Practice, authorized teacher, outcome and complete feedback are required." })
        };

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}/practice")]
    public async Task<IActionResult> TeacherPractice(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Courses.AsNoTracking().AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken)) return NotFound();
        var rows = await db.CourseAssignments.AsNoTracking()
            .Where(x => x.CourseId == courseId && x.Purpose == CourseAssignmentPurpose.LearningAimPractice)
            .OrderBy(x => x.CourseModuleId).ThenBy(x => x.BtecLearningAimId)
            .Select(x => new
            {
                x.Id,
                x.BtecLearningAimId,
                x.ArabicTitle,
                x.EnglishTitle,
                x.ArabicInstructions,
                x.EnglishInstructions,
                x.DueAtUtc
            })
            .ToArrayAsync(cancellationToken);
        return Ok(rows);
    }

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/courses/{courseId:guid}/practice/submissions")]
    public async Task<IActionResult> TeacherPracticeSubmissions(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Courses.AsNoTracking().AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken)) return NotFound();
        var rows = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(x => x.CourseAssignment!.CourseId == courseId
                && x.CourseAssignment.Purpose == CourseAssignmentPurpose.LearningAimPractice
                && db.Enrollments.Any(enrollment => enrollment.CourseId == courseId
                    && enrollment.StudentUserId == x.StudentUserId))
            .OrderByDescending(x => x.SubmittedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.CourseAssignmentId,
                x.StudentUserId,
                Status = x.Status.ToString(),
                TrainingOutcome = x.TrainingOutcome == null ? null : x.TrainingOutcome.ToString(),
                x.TrainingStrengths,
                x.TrainingGaps,
                x.TrainingImprovementGuidance,
                x.SubmittedAtUtc,
                Files = x.Versions.Where(v => v.VersionNumber == x.CurrentVersionNumber)
                    .SelectMany(v => v.Files).Select(file => new { file.Id, file.OriginalFileName, file.ContentType, file.LengthBytes })
            })
            .ToArrayAsync(cancellationToken);
        return Ok(rows);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/practice/submissions/{submissionId:guid}/review")]
    public async Task<IActionResult> ReviewPractice(Guid submissionId, ReviewLearningAimPracticeCommand command, CancellationToken cancellationToken) =>
        await assignments.ReviewPracticeAsync(UserId, submissionId, command, cancellationToken) switch
        {
            PracticeReviewResult.Finalized => NoContent(),
            PracticeReviewResult.Conflict => Conflict(new { code = "PRACTICE_REVIEW_CONFLICT", message = "This practice review is no longer available for finalization." }),
            _ => BadRequest(new { message = "A submitted practice activity, authorized teacher, outcome and complete feedback are required." })
        };

    [Authorize(Policy = "Student")]
    [HttpGet("student/courses/{courseId:guid}/learning-aim-practice")]
    public async Task<IActionResult> StudentPractice(Guid courseId, CancellationToken cancellationToken)
    {
        if (!(await contentAccess.CanAccessCourseAsync(UserId, courseId, cancellationToken)).IsAvailable) return NotFound();
        var modules = await db.CourseModules.AsNoTracking()
            .Where(x => x.CourseId == courseId && x.IsPublished && x.UnitDefinitionId != null)
            .OrderBy(x => x.SortOrder).Select(x => new
            {
                x.Id,
                ArabicTitle = x.UnitDefinition!.ArabicTitle,
                EnglishTitle = x.UnitDefinition.EnglishTitle
            })
            .ToArrayAsync(cancellationToken);
        var progress = new LearningAimPracticeProgressService(db);
        var result = new List<object>();
        foreach (var module in modules)
        {
            var unitAccess = await contentAccess.CanAccessAsync(UserId, courseId, LearningContentType.Unit, module.Id, cancellationToken);
            var aims = await progress.GetAsync(UserId, module.Id, cancellationToken);
            if (!unitAccess.IsAvailable)
                aims = aims.Select(x => x with
                {
                    IsUnlocked = false,
                    PracticeAvailable = false,
                    ArabicInstructions = null,
                    EnglishInstructions = null,
                    TrainingOutcome = null,
                    Strengths = null,
                    Gaps = null,
                    ImprovementGuidance = null
                }).ToArray();
            var finalAssignment = await db.CourseAssignments.AsNoTracking()
                .Where(x => x.CourseModuleId == module.Id && x.Purpose == CourseAssignmentPurpose.ComprehensivePractice)
                .Select(x => new
                {
                    x.Id,
                    x.ArabicTitle,
                    x.EnglishTitle,
                    x.ArabicInstructions,
                    x.EnglishInstructions,
                    x.DueAtUtc,
                    Resources = x.Resources.Where(resource => resource.ScanStatus == UploadScanStatus.Clean)
                        .Select(resource => new { resource.Id, resource.DisplayName }).ToArray(),
                    Criteria = x.Criteria.OrderBy(criterion => criterion.SortOrder)
                        .Select(criterion => new { criterion.Code, criterion.ArabicDescription, criterion.EnglishDescription }).ToArray()
                })
                .SingleOrDefaultAsync(cancellationToken);
            var finalSubmission = finalAssignment is null ? null : await db.CourseAssignmentSubmissions.AsNoTracking()
                .Where(x => x.CourseAssignmentId == finalAssignment.Id && x.StudentUserId == UserId)
                .Select(x => new { x.Status, x.TrainingOutcome, x.TrainingStrengths, x.TrainingGaps, x.TrainingImprovementGuidance })
                .SingleOrDefaultAsync(cancellationToken);
            var allAimsComplete = aims.Count > 0 && aims.All(x => x.IsComplete);
            var finalAvailable = finalAssignment is not null && unitAccess.IsAvailable && allAimsComplete
                && (await contentAccess.CanAccessAsync(UserId, courseId, LearningContentType.Assignment, finalAssignment.Id, cancellationToken)).IsAvailable;
            var finalDeadline = finalAssignment is null ? null : await deadlineResolver.ResolveAsync(finalAssignment.Id, UserId, finalAssignment.DueAtUtc, cancellationToken);
            var reviewed = finalSubmission?.Status == CourseAssignmentSubmissionStatus.Finalized && finalSubmission.TrainingOutcome is not null;
            result.Add(new
            {
                module.Id,
                module.ArabicTitle,
                module.EnglishTitle,
                Aims = aims,
                FinalPractice = new
                {
                    AssignmentId = finalAssignment?.Id,
                    ArabicTitle = finalAssignment?.ArabicTitle,
                    EnglishTitle = finalAssignment?.EnglishTitle,
                    ArabicInstructions = finalAvailable ? finalAssignment?.ArabicInstructions : null,
                    EnglishInstructions = finalAvailable ? finalAssignment?.EnglishInstructions : null,
                    EffectiveDueAtUtc = finalDeadline?.EffectiveDueAtUtc,
                    Resources = finalAvailable ? finalAssignment?.Resources : null,
                    Criteria = finalAvailable ? finalAssignment?.Criteria : null,
                    IsAvailable = finalAvailable,
                    Status = finalSubmission?.Status.ToString() ?? (finalAssignment is null ? "NotConfigured" : finalAvailable ? "Available" : "Locked"),
                    TrainingOutcome = reviewed && unitAccess.IsAvailable ? finalSubmission?.TrainingOutcome?.ToString() : null,
                    Strengths = reviewed && unitAccess.IsAvailable ? finalSubmission?.TrainingStrengths : null,
                    Gaps = reviewed && unitAccess.IsAvailable ? finalSubmission?.TrainingGaps : null,
                    ImprovementGuidance = reviewed && unitAccess.IsAvailable ? finalSubmission?.TrainingImprovementGuidance : null,
                    IsTrainingComplete = unitAccess.IsAvailable && allAimsComplete && reviewed
                }
            });
        }
        return Ok(result);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPut("teacher/assignments/{assignmentId:guid}")]
    public async Task<IActionResult> Update(Guid assignmentId, UpdateCourseAssignmentCommand command, CancellationToken cancellationToken) => await assignments.UpdateAsync(UserId, assignmentId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "Published assignments cannot be structurally edited." });

    [Authorize(Policy = "Teacher")]
    [HttpDelete("teacher/assignments/{assignmentId:guid}")]
    public async Task<IActionResult> Delete(Guid assignmentId, CancellationToken cancellationToken) => await assignments.DeleteAsync(UserId, assignmentId, cancellationToken) ? NoContent() : BadRequest(new { message = "Only an unpublished assignment without student work can be deleted." });

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/assignments/{assignmentId:guid}/deadline-extensions")]
    public async Task<IActionResult> DeadlineExtensionHistory(Guid assignmentId, CancellationToken cancellationToken)
    {
        var history = await deadlineExtensions.HistoryAsync(UserId, assignmentId, cancellationToken);
        return history is null ? NotFound() : Ok(history);
    }

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/assignments/{assignmentId:guid}/deadline-extensions/eligible-students")]
    public async Task<IActionResult> DeadlineExtensionEligibleStudents(Guid assignmentId, CancellationToken cancellationToken)
    {
        var students = await deadlineExtensions.EligibleStudentsAsync(UserId, assignmentId, cancellationToken);
        return students is null ? NotFound() : Ok(students);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/{assignmentId:guid}/deadline-extensions")]
    public async Task<IActionResult> GrantDeadlineExtension(Guid assignmentId, GrantCourseAssignmentDeadlineExtension request, CancellationToken cancellationToken)
    {
        var result = await deadlineExtensions.GrantAsync(UserId, assignmentId, request, cancellationToken);
        return DeadlineExtensionResponse(result);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/{assignmentId:guid}/deadline-extensions/{extensionId:guid}/revoke")]
    public async Task<IActionResult> RevokeDeadlineExtension(Guid assignmentId, Guid extensionId, RevokeCourseAssignmentDeadlineExtension request, CancellationToken cancellationToken)
    {
        var result = await deadlineExtensions.RevokeAsync(UserId, assignmentId, extensionId, request, cancellationToken);
        return DeadlineExtensionResponse(result);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/criteria")]
    public async Task<IActionResult> AddCriterion(AddCourseAssignmentCriterionCommand command, CancellationToken cancellationToken)
    {
        var id = await assignments.AddCriterionAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Use a valid assignment criterion or a BTEC criterion from this course." }) : Ok(new { id });
    }

    [Authorize(Policy = "Teacher")]
    [HttpDelete("teacher/assignments/criteria/{criterionId:guid}")]
    public async Task<IActionResult> DeleteCriterion(Guid criterionId, CancellationToken cancellationToken) => await assignments.DeleteCriterionAsync(UserId, criterionId, cancellationToken) ? NoContent() : BadRequest(new { message = "Published assignment criteria cannot be deleted." });

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/{assignmentId:guid}/publish")]
    public async Task<IActionResult> Publish(Guid assignmentId, PublishAssignmentRequest request, CancellationToken cancellationToken) => await assignments.PublishAsync(UserId, assignmentId, request.Publish, cancellationToken) ? NoContent() : BadRequest(new { message = "A published assignment needs criteria. An assignment with submitted work cannot be unpublished." });

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/{assignmentId:guid}/publication")]
    public async Task<IActionResult> SetPublication(Guid assignmentId, SetAssignmentPublicationRequest request, CancellationToken cancellationToken) =>
        await assignments.SetPublicationStatusAsync(UserId, assignmentId, request.PublicationStatus, request.AvailableFromUtc, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "Use a valid publication state. A scheduled assignment needs a future opening date and published coursework needs criteria." });

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/{assignmentId:guid}/resources")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(110L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110L * 1024 * 1024)]
    public async Task<IActionResult> UploadResource(Guid assignmentId, IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > 100L * 1024 * 1024 || !IsAllowedAssignmentResource(file.FileName))
            return BadRequest(new { message = "Use an approved assignment resource type no larger than 100 MB." });
        await using var stream = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(stream, file.FileName, out var validation))
            return BadRequest(new { message = "The resource content does not match its approved file type." });
        var scan = await scanner.ScanAsync(stream, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected)
            return BadRequest(new { message = "The resource was rejected by the security scanner." });
        if (!scan.IsClean)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." });
        stream.Position = 0;
        var staged = await storage.StagePrivateAsync(stream, validation.DetectedContentType!, cancellationToken);
        var finalization = storageLifecycle.EnqueueFinalization(staged);
        var added = await assignments.AddResourceAsync(UserId, assignmentId, file.FileName, staged.StorageKey, validation.DetectedContentType!, cancellationToken);
        if (!added)
        {
            await storageLifecycle.DiscardStagedAsync(staged, cancellationToken);
            return NotFound();
        }
        await storageLifecycle.TryProcessNowAsync(finalization.Id, cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "Teacher")]
    [HttpDelete("teacher/assignments/resources/{resourceId:guid}")]
    public async Task<IActionResult> DeleteResource(Guid resourceId, CancellationToken cancellationToken) =>
        await assignments.DeleteResourceAsync(UserId, resourceId, cancellationToken) ? NoContent() : NotFound();

    [Authorize(Policy = "Teacher")]
    [HttpGet("teacher/assignments/submissions")]
    public async Task<IActionResult> TeacherSubmissions([FromQuery] Guid? courseId, CancellationToken cancellationToken)
    {
        var data = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(submission => submission.CourseAssignment!.Course!.TeacherUserId == UserId
                && submission.CourseAssignment.Purpose == CourseAssignmentPurpose.Coursework
                && (!courseId.HasValue || submission.CourseAssignment.CourseId == courseId))
            .OrderByDescending(submission => submission.UpdatedAtUtc)
            .Select(submission => new
            {
                submission.Id,
                assignmentId = submission.CourseAssignmentId,
                courseId = submission.CourseAssignment!.CourseId,
                submission.CourseAssignment.ArabicTitle,
                submission.CourseAssignment.EnglishTitle,
                submission.StudentUserId,
                status = submission.Status.ToString(),
                calculatedGrade = submission.CalculatedGrade == null ? null : submission.CalculatedGrade.ToString(),
                submission.CurrentVersionNumber,
                submission.SubmittedAtUtc,
                files = submission.Versions.Where(version => version.VersionNumber == submission.CurrentVersionNumber).SelectMany(version => version.Files).Select(file => new { file.Id, file.OriginalFileName, file.ContentType, file.LengthBytes, scanStatus = file.ScanStatus.ToString() }),
                feedback = submission.FeedbackItems.OrderBy(item => item.CreatedAtUtc).Select(item => new { item.Body, item.RequestsResubmission, item.IsPrivate, item.CreatedAtUtc })
            })
            .ToListAsync(cancellationToken);
        return Ok(data);
    }

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/submissions/{submissionId:guid}/grade")]
    public async Task<IActionResult> Grade(Guid submissionId, AssignmentGradeCommand command, CancellationToken cancellationToken) => await assignments.GradeAsync(UserId, submissionId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "Assess every criterion exactly once before saving the calculated result." });

    [Authorize(Policy = "Teacher")]
    [HttpPost("teacher/assignments/submissions/{submissionId:guid}/revision")]
    public async Task<IActionResult> RequestRevision(Guid submissionId, RequestAssignmentRevision request, CancellationToken cancellationToken) => await assignments.RequestRevisionAsync(UserId, submissionId, request.Feedback, cancellationToken) ? NoContent() : BadRequest(new { message = "A submitted assignment and revision feedback are required." });

    [Authorize(Policy = "Student")]
    [HttpGet("student/courses/{courseId:guid}/assignments")]
    public async Task<IActionResult> StudentList(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await db.Enrollments.AnyAsync(enrollment => enrollment.CourseId == courseId && enrollment.StudentUserId == UserId && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return NotFound();
        var rows = await db.CourseAssignments.AsNoTracking()
            .Include(assignment => assignment.Criteria)
            .Include(assignment => assignment.Resources)
            .Where(assignment => assignment.CourseId == courseId && assignment.IsPublished
                && assignment.Purpose == CourseAssignmentPurpose.Coursework
                && assignment.PublicationStatus == ContentPublicationStatus.Published)
            .OrderBy(assignment => assignment.DueAtUtc)
            .ToListAsync(cancellationToken);
        var deadlines = await deadlineResolver.ResolveManyAsync(rows.Select(row => new CourseAssignmentDeadlineTarget(row.Id, UserId, row.DueAtUtc)).ToArray(), cancellationToken);
        return Ok(rows.Select(row => AssignmentView(row, deadlines[(row.Id, UserId)])));
    }

    [Authorize(Policy = "Student")]
    [HttpPost("student/assignments/{assignmentId:guid}/submissions")]
    public async Task<IActionResult> StartSubmission(Guid assignmentId, StartAssignmentSubmissionRequest request, CancellationToken cancellationToken)
    {
        var target = await db.CourseAssignments.AsNoTracking().Where(item => item.Id == assignmentId).Select(item => new { item.CourseId }).SingleOrDefaultAsync(cancellationToken);
        if (target is null || !(await contentAccess.CanAccessAsync(UserId, target.CourseId, LearningContentType.Assignment, assignmentId, cancellationToken)).IsAvailable) return NotFound();
        var submission = await assignments.StartSubmissionAsync(UserId, assignmentId, request.Comment, cancellationToken);
        return submission is null ? BadRequest(new { message = "You need an active enrollment, an open assignment, and an available submission attempt." }) : Ok(submission);
    }

    [Authorize(Policy = "Student")]
    [HttpPost("student/assignments/submissions/{submissionId:guid}/files")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(110L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110L * 1024 * 1024)]
    public async Task<IActionResult> UploadFile(Guid submissionId, IFormFile file, CancellationToken cancellationToken)
    {
        var allowed = new[] { "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "image/jpeg", "image/png", "image/webp", "application/zip" };
        if (file.Length is <= 0 or > 100L * 1024 * 1024) return BadRequest(new { message = "Use an approved file type no larger than 100 MB." });
        await using var content = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(content, file.FileName, out var validation)
            || validation.DetectedContentType is null
            || !allowed.Contains(validation.DetectedContentType, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "The file content does not match an approved file type." });
        var result = await assignments.AddFileAsync(UserId, submissionId, file.FileName, validation.DetectedContentType!, file.Length, content, cancellationToken);
        return result switch
        {
            CourseAssignmentFileAddStatus.Added => NoContent(),
            CourseAssignmentFileAddStatus.Rejected => BadRequest(new { message = "The file was rejected by the security scanner." }),
            CourseAssignmentFileAddStatus.ScannerUnavailable => StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." }),
            CourseAssignmentFileAddStatus.RejectedByAssignmentPolicy => BadRequest(new { message = "This file type or size is not allowed for this assignment." }),
            _ => NotFound()
        };
    }

    [Authorize(Policy = "Student")]
    [HttpPost("student/assignments/submissions/{submissionId:guid}/submit")]
    public async Task<IActionResult> Submit(Guid submissionId, CancellationToken cancellationToken) => await assignments.SubmitAsync(UserId, submissionId, cancellationToken) ? NoContent() : BadRequest(new { message = "Attach a clean file before submitting and submit before the deadline." });

    [Authorize(Policy = "Student")]
    [HttpGet("student/assignments/mine")]
    public async Task<IActionResult> Mine(CancellationToken cancellationToken)
    {
        var data = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Include(submission => submission.CriterionResults).ThenInclude(result => result.CourseAssignmentCriterion)
            .Include(submission => submission.FeedbackItems)
            .Include(submission => submission.Versions).ThenInclude(version => version.Files)
            .Where(submission => submission.StudentUserId == UserId
                && (submission.CourseAssignment!.Purpose == CourseAssignmentPurpose.Coursework
                    || db.Enrollments.Any(enrollment => enrollment.CourseId == submission.CourseAssignment.CourseId
                        && enrollment.StudentUserId == UserId
                        && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow))))
            .OrderByDescending(submission => submission.UpdatedAtUtc)
            .ToListAsync(cancellationToken);
        return Ok(data.Select(submission => new
        {
            submission.Id,
            assignmentId = submission.CourseAssignmentId,
            status = submission.Status.ToString(),
            submission.CurrentVersionNumber,
            calculatedGrade = submission.CalculatedGrade == null ? null : submission.CalculatedGrade.ToString(),
            submission.SubmittedAtUtc,
            submission.GradedAtUtc,
            versions = submission.Versions.OrderBy(version => version.VersionNumber).Select(version => new { version.VersionNumber, version.StudentComment, version.SubmittedAtUtc, files = version.Files.Select(file => new { file.Id, file.OriginalFileName, file.ContentType, file.LengthBytes, scanStatus = file.ScanStatus.ToString() }) }),
            results = submission.Status is CourseAssignmentSubmissionStatus.Graded or CourseAssignmentSubmissionStatus.Finalized ? submission.CriterionResults.OrderBy(result => result.CourseAssignmentCriterion!.SortOrder).Select(result => new { result.CourseAssignmentCriterion!.Code, band = result.CourseAssignmentCriterion.Band.ToString(), achievement = result.Achievement.ToString(), result.Feedback }) : [],
            feedback = submission.FeedbackItems.Where(item => !item.IsPrivate).OrderBy(item => item.CreatedAtUtc).Select(item => new { item.Body, item.RequestsResubmission, item.CreatedAtUtc })
        }));
    }

    [HttpGet("assignments/{assignmentId:guid}/resources/{resourceId:guid}")]
    public async Task<IActionResult> DownloadResource(Guid assignmentId, Guid resourceId, CancellationToken cancellationToken)
    {
        var resource = await db.CourseAssignmentResources.AsNoTracking()
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Course)
            .SingleOrDefaultAsync(item => item.Id == resourceId && item.CourseAssignmentId == assignmentId && item.ScanStatus == UploadScanStatus.Clean, cancellationToken);
        if (resource is null) return NotFound();
        var assignment = resource.CourseAssignment!;
        var studentEnrollment = await db.Enrollments.AsNoTracking().AnyAsync(item =>
            item.CourseId == assignment.CourseId && item.StudentUserId == UserId
            && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
        var studentMayAccess = studentEnrollment
            && assignment.PublicationStatus == ContentPublicationStatus.Published
            && (await contentAccess.CanAccessAsync(UserId, assignment.CourseId, LearningContentType.Assignment, assignment.Id, cancellationToken)).IsAvailable;
        var permitted = User.IsInRole(PlatformRoles.Admin)
            || assignment.Course!.TeacherUserId == UserId
            || studentMayAccess;
        if (!permitted) return NotFound();
        var content = await storage.OpenPrivateReadAsync(resource.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, resource.ContentType, resource.DisplayName, enableRangeProcessing: true);
    }

    [HttpGet("assignments/submissions/{submissionId:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DownloadFile(Guid submissionId, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await db.CourseAssignmentSubmissionFiles.AsNoTracking().Include(item => item.CourseAssignmentSubmissionVersion).ThenInclude(item => item!.CourseAssignmentSubmission).ThenInclude(item => item!.CourseAssignment).ThenInclude(item => item!.Course).SingleOrDefaultAsync(item => item.Id == fileId && item.CourseAssignmentSubmissionVersion!.CourseAssignmentSubmissionId == submissionId, cancellationToken);
        if (file is null) return NotFound();
        var submission = file.CourseAssignmentSubmissionVersion!.CourseAssignmentSubmission!;
        if (!User.IsInRole(PlatformRoles.Admin) && submission.StudentUserId != UserId && submission.CourseAssignment!.Course!.TeacherUserId != UserId) return NotFound();
        if (submission.StudentUserId == UserId
            && submission.CourseAssignment!.Purpose is CourseAssignmentPurpose.LearningAimPractice or CourseAssignmentPurpose.ComprehensivePractice
            && !await db.Enrollments.AsNoTracking().AnyAsync(x => x.CourseId == submission.CourseAssignment.CourseId
                && x.StudentUserId == UserId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return NotFound();
        var content = await storage.OpenPrivateReadAsync(file.StorageKey, cancellationToken);
        return content is null ? NotFound() : File(content, file.ContentType, file.OriginalFileName, enableRangeProcessing: true);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static IActionResult DeadlineExtensionResponse(DeadlineExtensionWriteResult result) => result.Status switch
    {
        DeadlineExtensionWriteStatus.Success => new OkObjectResult(result.Extension),
        DeadlineExtensionWriteStatus.NotFound => new NotFoundResult(),
        DeadlineExtensionWriteStatus.Conflict => new ConflictObjectResult(new { message = "An active extension already exists or this extension has already been revoked." }),
        _ => new BadRequestObjectResult(new { message = "Use an enrolled student, an assignment with a deadline, a later extension date, and a staff rationale of at most 500 characters." })
    };

    private static object AssignmentView(Betcco.Domain.Assessments.CourseAssignment assignment, CourseAssignmentDeadlineValue? deadline = null) => new
    {
        assignment.Id,
        assignment.CourseId,
        assignment.CourseModuleId,
        assignment.LessonId,
        assignment.BtecLearningAimId,
        assignment.ArabicTitle,
        assignment.EnglishTitle,
        assignment.ArabicInstructions,
        assignment.EnglishInstructions,
        assignment.AvailableFromUtc,
        assignment.DueAtUtc,
        baseDueAtUtc = assignment.DueAtUtc,
        effectiveDueAtUtc = deadline?.EffectiveDueAtUtc ?? assignment.DueAtUtc,
        hasDeadlineExtension = deadline?.HasDeadlineExtension ?? false,
        assignment.MaxSubmissionAttempts,
        assignment.AllowResubmission,
        assignment.MaxFileSizeBytes,
        allowedFileExtensions = System.Text.Json.JsonSerializer.Deserialize<string[]>(assignment.AllowedFileExtensionsJson) ?? [],
        assignment.MaxScore,
        isPublished = assignment.IsPublished,
        publicationStatus = assignment.PublicationStatus.ToString(),
        resources = assignment.Resources.OrderBy(resource => resource.DisplayName).Select(resource => new { resource.Id, resource.DisplayName, resource.ContentType, resource.ScanStatus }),
        criteria = assignment.Criteria.OrderBy(criterion => criterion.SortOrder).Select(criterion => new { criterion.Id, criterion.BtecCriterionId, criterion.Code, band = criterion.Band.ToString(), criterion.ArabicDescription, criterion.EnglishDescription, criterion.SortOrder })
    };

    private static bool IsAllowedAssignmentResource(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() is ".pdf" or ".doc" or ".docx" or ".ppt" or ".pptx" or ".xls" or ".xlsx" or ".txt" or ".zip" or ".jpg" or ".jpeg" or ".png" or ".webp";
}

public sealed record PublishAssignmentRequest(bool Publish);
public sealed record SetAssignmentPublicationRequest(string PublicationStatus, DateTimeOffset? AvailableFromUtc);
public sealed record StartAssignmentSubmissionRequest(string? Comment);
public sealed record RequestAssignmentRevision(string Feedback);
