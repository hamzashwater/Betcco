using System.Security.Claims;
using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QRCoder;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Student")]
[Route("api/v1/student-tools")]
public sealed class StudentLearningToolsController(
    BetccoDbContext db,
    UserManager<ApplicationUser> users,
    IEmailNotificationService emailNotifications,
    ICourseAssignmentDeadlineResolver? deadlineResolver = null) : ControllerBase
{
    private readonly ICourseAssignmentDeadlineResolver deadlineResolverService = deadlineResolver ?? new CourseAssignmentDeadlineResolver(db);
    [HttpGet("overview")]
    public async Task<IActionResult> Overview([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var studentId = UserId!;
        var notes = await db.LessonNotes.AsNoTracking().Include(x => x.Lesson!).ThenInclude(x => x.CourseModule).Where(x => x.StudentUserId == studentId).OrderByDescending(x => x.UpdatedAtUtc).Select(x => new
        {
            x.Id,
            x.LessonId,
            x.Lesson!.CourseModule!.CourseId,
            lessonTitle = Localize(locale, x.Lesson!.ArabicTitle, x.Lesson.EnglishTitle),
            body = x.Body,
            x.UpdatedAtUtc
        }).ToListAsync(cancellationToken);
        var bookmarks = await db.LessonBookmarks.AsNoTracking().Include(x => x.Lesson!).ThenInclude(x => x.CourseModule).Where(x => x.StudentUserId == studentId).OrderByDescending(x => x.CreatedAtUtc).Select(x => new
        {
            x.Id,
            x.LessonId,
            x.Lesson!.CourseModule!.CourseId,
            lessonTitle = Localize(locale, x.Lesson.ArabicTitle, x.Lesson.EnglishTitle),
            x.CreatedAtUtc
        }).ToListAsync(cancellationToken);
        var courseIds = await db.Enrollments.AsNoTracking().Where(x => x.StudentUserId == studentId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow)).Select(x => x.CourseId).ToArrayAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var assignmentRows = await (
            from assignment in db.CourseAssignments.AsNoTracking()
            join course in db.Courses.AsNoTracking() on assignment.CourseId equals course.Id
            join submission in db.CourseAssignmentSubmissions.AsNoTracking().Where(item => item.StudentUserId == studentId)
                on assignment.Id equals submission.CourseAssignmentId into assignmentSubmissions
            from submission in assignmentSubmissions.DefaultIfEmpty()
            where courseIds.Contains(assignment.CourseId)
                && course.Status == CourseStatus.Published
                && assignment.IsPublished
                && (!assignment.AvailableFromUtc.HasValue || assignment.AvailableFromUtc <= now)
                && assignment.PublicationStatus == ContentPublicationStatus.Published
                && assignment.DueAtUtc.HasValue
            select new
            {
                assignment.Id,
                assignment.CourseId,
                assignment.LessonId,
                title = Localize(locale, assignment.ArabicTitle, assignment.EnglishTitle),
                courseTitle = Localize(locale, course.ArabicTitle, course.EnglishTitle),
                assignment.DueAtUtc,
                submissionStatus = submission == null ? null : submission.Status.ToString()
            })
            .ToListAsync(cancellationToken);
        var assignmentDeadlines = await deadlineResolverService.ResolveManyAsync(assignmentRows
            .Select(item => new CourseAssignmentDeadlineTarget(item.Id, studentId, item.DueAtUtc)).ToArray(), cancellationToken);
        var upcomingAssignments = assignmentRows
            .Select(item => new
            {
                item.Id,
                item.CourseId,
                item.LessonId,
                item.title,
                item.courseTitle,
                dueAtUtc = assignmentDeadlines[(item.Id, studentId)].EffectiveDueAtUtc,
                item.submissionStatus
            })
            .Where(item => item.dueAtUtc >= now)
            .OrderBy(item => item.dueAtUtc)
            .Take(6).ToArray();
        var unreadNotifications = await db.Notifications.AsNoTracking()
            .CountAsync(notification => notification.UserId == studentId && notification.ReadAtUtc == null, cancellationToken);
        var personalEntries = await db.PersonalCalendarEntries.AsNoTracking().Where(x => x.StudentUserId == studentId).OrderBy(x => x.StartsAtUtc).Select(x => new { id = $"personal:{x.Id}", personalEntryId = (Guid?)x.Id, title = x.Title, details = (string?)x.Details, x.StartsAtUtc, endsAtUtc = x.EndsAtUtc, isLiveSession = false, eventType = "Personal" }).ToListAsync(cancellationToken);
        var liveSessions = await db.LiveSessions.AsNoTracking().Include(x => x.Course).Where(x => x.IsPublished && x.StartsAtUtc >= DateTimeOffset.UtcNow && (x.CourseId == null || courseIds.Contains(x.CourseId.Value))).OrderBy(x => x.StartsAtUtc).Select(x => new
        {
            id = $"live:{x.Id}",
            personalEntryId = (Guid?)null,
            title = Localize(locale, x.ArabicTitle, x.EnglishTitle),
            details = x.CourseId == null ? null : Localize(locale, x.Course!.ArabicTitle, x.Course.EnglishTitle),
            x.StartsAtUtc,
            endsAtUtc = (DateTimeOffset?)x.EndsAtUtc,
            isLiveSession = true,
            eventType = "LiveSession"
        }).ToListAsync(cancellationToken);
        var calendarAssignments = await (
            from assignment in db.CourseAssignments.AsNoTracking()
            join course in db.Courses.AsNoTracking() on assignment.CourseId equals course.Id
            where courseIds.Contains(assignment.CourseId)
                && course.Status == CourseStatus.Published
                && assignment.IsPublished
                && assignment.DueAtUtc != null
            select new
            {
                assignment.Id,
                title = Localize(locale, assignment.ArabicTitle, assignment.EnglishTitle),
                courseTitle = Localize(locale, course.ArabicTitle, course.EnglishTitle),
                assignment.DueAtUtc
            }).ToListAsync(cancellationToken);
        var calendarDeadlines = await deadlineResolverService.ResolveManyAsync(calendarAssignments
            .Select(item => new CourseAssignmentDeadlineTarget(item.Id, studentId, item.DueAtUtc)).ToArray(), cancellationToken);
        var assignmentEvents = calendarAssignments.Select(assignment => new
        {
            id = $"assignment:{assignment.Id}",
            personalEntryId = (Guid?)null,
            title = assignment.title,
            details = (string?)assignment.courseTitle,
            StartsAtUtc = calendarDeadlines[(assignment.Id, studentId)].EffectiveDueAtUtc!.Value,
            endsAtUtc = (DateTimeOffset?)null,
            isLiveSession = false,
            eventType = "Assignment"
        }).ToArray();
        var quizEvents = await db.Quizzes.AsNoTracking()
            .Where(quiz => courseIds.Contains(quiz.CourseId) && quiz.IsPublished && (quiz.AvailableFromUtc != null || quiz.AvailableUntilUtc != null))
            .Select(quiz => new
            {
                id = $"quiz:{quiz.Id}",
                personalEntryId = (Guid?)null,
                title = Localize(locale, quiz.ArabicTitle, quiz.EnglishTitle),
                details = (string?)(quiz.AvailableUntilUtc == null ? "Quiz opens" : "Quiz deadline"),
                StartsAtUtc = quiz.AvailableUntilUtc ?? quiz.AvailableFromUtc!.Value,
                endsAtUtc = (DateTimeOffset?)null,
                isLiveSession = false,
                eventType = "Quiz"
            })
            .ToListAsync(cancellationToken);
        var certificates = await db.CourseCertificates.AsNoTracking().Include(x => x.Course).Where(x => x.StudentUserId == studentId).OrderByDescending(x => x.IssuedAtUtc).Select(x => new
        {
            x.VerificationCode,
            title = Localize(locale, x.Course!.ArabicTitle, x.Course.EnglishTitle),
            x.IssuedAtUtc
        }).ToListAsync(cancellationToken);
        var completedLessonsCount = await (
            from progress in db.LessonProgresses.AsNoTracking()
            join lesson in db.Lessons.AsNoTracking() on progress.LessonId equals lesson.Id
            join module in db.CourseModules.AsNoTracking() on lesson.CourseModuleId equals module.Id
            where progress.StudentUserId == studentId
                && progress.IsCompleted
                && module.IsPublished
                && courseIds.Contains(module.CourseId)
            select progress.Id).CountAsync(cancellationToken);
        var submittedAssignmentsCount = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Include(item => item.CourseAssignment)
            .CountAsync(item => item.StudentUserId == studentId
                && item.Status != CourseAssignmentSubmissionStatus.Draft
                && courseIds.Contains(item.CourseAssignment!.CourseId), cancellationToken);
        var achievements = new[]
        {
            LearningAchievement.Create(
                "FIRST_LESSON",
                Localize(locale, "أول درس مكتمل", "First lesson complete"),
                Localize(locale, "أكمل درسًا منشورًا داخل إحدى دوراتك.", "Complete a published lesson in one of your courses."),
                completedLessonsCount,
                1),
            LearningAchievement.Create(
                "FIRST_ASSIGNMENT",
                Localize(locale, "أول مهمة مُرسلة", "First assignment submitted"),
                Localize(locale, "أرسل مهمة للمراجعة من خلال المنصة.", "Submit coursework for review through the platform."),
                submittedAssignmentsCount,
                1),
            LearningAchievement.Create(
                "FIRST_CERTIFICATE",
                Localize(locale, "أول شهادة إكمال", "First completion certificate"),
                Localize(locale, "أكمل دورة واطلب شهادة الإكمال الخاصة بها.", "Finish a course and issue its completion certificate."),
                certificates.Count,
                1)
        };
        return Ok(new
        {
            notes,
            bookmarks,
            calendar = personalEntries.Concat(liveSessions).Concat(assignmentEvents).Concat(quizEvents).OrderBy(x => x.StartsAtUtc),
            certificates,
            upcomingAssignments,
            unreadNotifications,
            achievements
        });
    }

    [HttpPost("notes")]
    public async Task<IActionResult> UpsertNote(NoteRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Trim().Length > 5000) return BadRequest(new { message = "A note must contain up to 5000 characters." });
        if (!await OwnsLessonAsync(request.LessonId, cancellationToken)) return NotFound();
        var studentId = UserId!;
        var note = await db.LessonNotes.SingleOrDefaultAsync(x => x.StudentUserId == studentId && x.LessonId == request.LessonId, cancellationToken);
        if (note is null)
        {
            note = new LessonNote { StudentUserId = studentId, LessonId = request.LessonId, Body = request.Body.Trim() };
            db.LessonNotes.Add(note);
        }
        else note.Body = request.Body.Trim();
        db.AuditLogs.Add(Audit("LessonNoteSaved", nameof(LessonNote), note.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { note.Id, note.Body });
    }

    [HttpGet("purchases")]
    public async Task<IActionResult> Purchases([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 50)
            return BadRequest(new { message = "Use a page of 1 to 50 purchase records." });

        var payments = db.Payments.AsNoTracking().Where(payment => payment.UserId == UserId);
        var totalCount = await payments.CountAsync(cancellationToken);
        var items = await payments
            .OrderByDescending(payment => payment.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(payment => new
            {
                payment.Id,
                payment.Purpose,
                status = payment.Status.ToString(),
                payment.Subtotal,
                payment.Discount,
                payment.Tax,
                payment.Total,
                payment.Currency,
                method = payment.Method.ToString(),
                payment.Provider,
                payment.PaidAtUtc,
                payment.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);
        return Ok(new { items, page, pageSize, totalCount });
    }

    [HttpDelete("notes/{lessonId:guid}")]
    public async Task<IActionResult> DeleteNote(Guid lessonId, CancellationToken cancellationToken)
    {
        var note = await db.LessonNotes.SingleOrDefaultAsync(x => x.StudentUserId == UserId && x.LessonId == lessonId, cancellationToken);
        if (note is null) return NotFound();
        db.LessonNotes.Remove(note);
        db.AuditLogs.Add(Audit("LessonNoteDeleted", nameof(LessonNote), note.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("bookmarks/{lessonId:guid}")]
    public async Task<IActionResult> AddBookmark(Guid lessonId, CancellationToken cancellationToken)
    {
        if (!await OwnsLessonAsync(lessonId, cancellationToken)) return NotFound();
        var bookmark = await db.LessonBookmarks.SingleOrDefaultAsync(x => x.StudentUserId == UserId && x.LessonId == lessonId, cancellationToken);
        if (bookmark is not null) return Ok(new { bookmark.Id, isBookmarked = true });
        bookmark = new LessonBookmark { StudentUserId = UserId!, LessonId = lessonId };
        db.LessonBookmarks.Add(bookmark);
        db.AuditLogs.Add(Audit("LessonBookmarked", nameof(LessonBookmark), bookmark.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/student-tools/bookmarks/{lessonId}", new { bookmark.Id, isBookmarked = true });
    }

    [HttpDelete("bookmarks/{lessonId:guid}")]
    public async Task<IActionResult> RemoveBookmark(Guid lessonId, CancellationToken cancellationToken)
    {
        var bookmark = await db.LessonBookmarks.SingleOrDefaultAsync(x => x.StudentUserId == UserId && x.LessonId == lessonId, cancellationToken);
        if (bookmark is null) return NotFound();
        db.LessonBookmarks.Remove(bookmark);
        db.AuditLogs.Add(Audit("LessonBookmarkRemoved", nameof(LessonBookmark), bookmark.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("calendar")]
    public async Task<IActionResult> CreateCalendarEntry(CalendarEntryRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 180 || request.StartsAtUtc < DateTimeOffset.UtcNow.AddYears(-1) || request.StartsAtUtc > DateTimeOffset.UtcNow.AddYears(5) || request.EndsAtUtc is not null && request.EndsAtUtc < request.StartsAtUtc) return BadRequest(new { message = "Enter a valid calendar entry." });
        var entry = new PersonalCalendarEntry { StudentUserId = UserId!, Title = request.Title.Trim(), Details = TrimOrNull(request.Details, 1000), StartsAtUtc = request.StartsAtUtc, EndsAtUtc = request.EndsAtUtc };
        db.PersonalCalendarEntries.Add(entry);
        db.AuditLogs.Add(Audit("CalendarEntryCreated", nameof(PersonalCalendarEntry), entry.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/student-tools/calendar/{entry.Id}", new { entry.Id });
    }

    [HttpDelete("calendar/{entryId:guid}")]
    public async Task<IActionResult> DeleteCalendarEntry(Guid entryId, CancellationToken cancellationToken)
    {
        var entry = await db.PersonalCalendarEntries.SingleOrDefaultAsync(x => x.Id == entryId && x.StudentUserId == UserId, cancellationToken);
        if (entry is null) return NotFound();
        db.PersonalCalendarEntries.Remove(entry);
        db.AuditLogs.Add(Audit("CalendarEntryDeleted", nameof(PersonalCalendarEntry), entry.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("courses/{courseId:guid}/certificates")]
    public async Task<IActionResult> IssueCertificate(Guid courseId, CancellationToken cancellationToken)
    {
        var studentId = UserId!;
        if (!await db.Enrollments.AnyAsync(x => x.StudentUserId == studentId && x.CourseId == courseId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return NotFound();
        var lessonIds = await db.Lessons.AsNoTracking().Include(x => x.CourseModule).Where(x => x.CourseModule!.CourseId == courseId && x.IsPublished && x.CourseModule.IsPublished).Select(x => x.Id).ToArrayAsync(cancellationToken);
        if (lessonIds.Length == 0 || await db.LessonProgresses.CountAsync(x => x.StudentUserId == studentId && x.IsCompleted && lessonIds.Contains(x.LessonId), cancellationToken) != lessonIds.Length) return Conflict(new { message = "Complete every published lesson before issuing a certificate." });
        var certificate = await db.CourseCertificates.SingleOrDefaultAsync(x => x.StudentUserId == studentId && x.CourseId == courseId, cancellationToken);
        var issued = false;
        if (certificate is null)
        {
            certificate = new CourseCertificate
            {
                StudentUserId = studentId,
                CourseId = courseId,
                VerificationCode = $"BETCCO-{DateTimeOffset.UtcNow:yyyy}-{Guid.NewGuid():N}".ToUpperInvariant()
            };
            db.CourseCertificates.Add(certificate);
            db.AuditLogs.Add(Audit("CourseCertificateIssued", nameof(CourseCertificate), certificate.Id));
            await db.SaveChangesAsync(cancellationToken);
            issued = true;
        }
        if (issued)
        {
            var student = await users.FindByIdAsync(studentId);
            if (student is { EmailConfirmed: true, Email: { Length: > 0 } email })
            {
                await emailNotifications.SendAsync(
                    new PlatformEmailNotification(
                        "CertificateIssued",
                        email,
                        "BETCCO completion certificate issued",
                        "Your completion certificate is ready",
                        $"Your BETCCO completion certificate is ready. Verification ID: {certificate.VerificationCode}"),
                    CancellationToken.None);
            }
        }
        return Ok(new { certificate.VerificationCode, certificate.IssuedAtUtc });
    }

    [HttpGet("my-certificates/{verificationCode}")]
    public async Task<IActionResult> MyCertificate(string verificationCode, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var certificate = await db.CourseCertificates.AsNoTracking()
            .Include(item => item.Course)
            .SingleOrDefaultAsync(item => item.StudentUserId == UserId && item.VerificationCode == verificationCode.ToUpperInvariant(), cancellationToken);
        if (certificate is null) return NotFound();
        var student = await users.FindByIdAsync(UserId!);
        return Ok(new
        {
            studentName = student?.DisplayName ?? string.Empty,
            courseTitle = Localize(locale, certificate.Course!.ArabicTitle, certificate.Course.EnglishTitle),
            certificate.IssuedAtUtc,
            certificate.VerificationCode
        });
    }

    [HttpGet("courses/{courseId:guid}/announcements")]
    public async Task<IActionResult> CourseAnnouncements(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var studentId = UserId!;
        if (!await db.Enrollments.AsNoTracking().AnyAsync(item => item.CourseId == courseId && item.StudentUserId == studentId && (item.AccessEndsAtUtc == null || item.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return NotFound();
        var announcements = await db.CourseAnnouncements.AsNoTracking().Include(item => item.CourseModule).ThenInclude(module => module!.UnitDefinition).Include(item => item.Recipients)
            .Where(item => item.CourseId == courseId && item.IsPublished
                && (item.Audience != AnnouncementAudience.SelectedStudents || item.Recipients.Any(recipient => recipient.StudentUserId == studentId)))
            .OrderByDescending(item => item.PublishedAtUtc).Take(50).ToListAsync(cancellationToken);
        return Ok(announcements.Select(item => new
        {
            item.Id,
            title = Localize(locale, item.ArabicTitle, item.EnglishTitle),
            body = Localize(locale, item.ArabicBody, item.EnglishBody),
            unitTitle = item.CourseModule is null ? null : Localize(locale,
                item.CourseModule.UnitDefinition?.ArabicTitle ?? item.CourseModule.ArabicTitle,
                item.CourseModule.UnitDefinition?.EnglishTitle ?? item.CourseModule.EnglishTitle),
            audience = item.Audience.ToString(),
            item.PublishedAtUtc
        }));
    }

    [AllowAnonymous]
    [HttpGet("certificates/{verificationCode}")]
    public async Task<IActionResult> VerifyCertificate(string verificationCode, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var certificate = await db.CourseCertificates.AsNoTracking().Include(x => x.Course).SingleOrDefaultAsync(x => x.VerificationCode == verificationCode.ToUpperInvariant(), cancellationToken);
        if (certificate is null) return NotFound();
        var student = await users.FindByIdAsync(certificate.StudentUserId);
        return Ok(new { studentName = student?.DisplayName ?? "", courseTitle = Localize(locale, certificate.Course!.ArabicTitle, certificate.Course.EnglishTitle), certificate.IssuedAtUtc, certificate.VerificationCode });
    }

    [AllowAnonymous]
    [HttpGet("certificates/{verificationCode}/qr")]
    public async Task<IActionResult> CertificateQr(string verificationCode, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(verificationCode) || verificationCode.Length > 128) return NotFound();
        var normalizedCode = verificationCode.ToUpperInvariant();
        if (!await db.CourseCertificates.AsNoTracking().AnyAsync(item => item.VerificationCode == normalizedCode, cancellationToken)) return NotFound();
        var configuredOrigin = Environment.GetEnvironmentVariable("APP_PUBLIC_URL");
        var origin = string.IsNullOrWhiteSpace(configuredOrigin)
            ? $"{Request.Scheme}://{Request.Host}"
            : configuredOrigin.Trim().TrimEnd('/');
        var verificationUrl = $"{origin}/ar/certificates/{Uri.EscapeDataString(normalizedCode)}";
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(verificationUrl, QRCodeGenerator.ECCLevel.Q);
        var png = new PngByteQRCode(data).GetGraphic(8);
        return File(png, "image/png");
    }

    private async Task<bool> OwnsLessonAsync(Guid lessonId, CancellationToken cancellationToken) => await db.Lessons.Include(x => x.CourseModule).AnyAsync(x => x.Id == lessonId && x.IsPublished && x.CourseModule!.IsPublished && db.Enrollments.Any(enrollment => enrollment.StudentUserId == UserId && enrollment.CourseId == x.CourseModule.CourseId && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow)), cancellationToken);
    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);
    private AuditLog Audit(string action, string entityType, Guid entityId) => new() { ActorUserId = UserId, Action = action, EntityType = entityType, EntityId = entityId.ToString(), Outcome = "Success" };
    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;
    private static string? TrimOrNull(string? value, int max) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];
}

public sealed record NoteRequest(Guid LessonId, string Body);
public sealed record CalendarEntryRequest(string Title, string? Details, DateTimeOffset StartsAtUtc, DateTimeOffset? EndsAtUtc);
public sealed record LearningAchievement(string Code, string Title, string Description, int CurrentValue, int TargetValue, bool IsCompleted)
{
    public static LearningAchievement Create(string code, string title, string description, int currentValue, int targetValue) => new(
        code,
        title,
        description,
        Math.Min(currentValue, targetValue),
        targetValue,
        currentValue >= targetValue);
}

[ApiController]
[Authorize]
[Route("api/v1/course-community")]
public sealed class CourseCommunityController(BetccoDbContext db, UserManager<ApplicationUser> users) : ControllerBase
{
    [HttpGet("courses/{courseId:guid}/questions")]
    public async Task<IActionResult> Questions(Guid courseId, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        if (!await CanAccessCourseAsync(courseId, cancellationToken)) return NotFound();
        var userId = UserId!;
        var teacherOrAdmin = User.IsInRole("Teacher") || User.IsInRole("Admin");
        var questions = await db.CourseQuestions.AsNoTracking().Include(x => x.Lesson).Include(x => x.Replies).Where(x => x.CourseId == courseId && (teacherOrAdmin || x.StudentUserId == userId)).OrderByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        var authorIds = questions.Select(x => x.StudentUserId).Concat(questions.SelectMany(x => x.Replies).Select(x => x.AuthorUserId)).Distinct().ToArray();
        var displayNames = (await users.Users.Where(x => authorIds.Contains(x.Id.ToString())).Select(x => new { Id = x.Id.ToString(), x.DisplayName }).ToListAsync(cancellationToken)).ToDictionary(x => x.Id, x => x.DisplayName);
        return Ok(questions.Select(question => new
        {
            question.Id,
            question.LessonId,
            lessonTitle = question.Lesson is null ? null : Localize(locale, question.Lesson.ArabicTitle, question.Lesson.EnglishTitle),
            question.Body,
            question.IsResolved,
            question.CreatedAtUtc,
            studentName = displayNames.GetValueOrDefault(question.StudentUserId, "Student"),
            replies = question.Replies.OrderBy(x => x.CreatedAtUtc).Select(reply => new { reply.Id, reply.Body, reply.CreatedAtUtc, authorName = displayNames.GetValueOrDefault(reply.AuthorUserId, "BETCCO") })
        }));
    }

    [Authorize(Policy = "Student")]
    [HttpPost("courses/{courseId:guid}/questions")]
    public async Task<IActionResult> Ask(Guid courseId, AskCourseQuestionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Trim().Length > 2000 || !await IsEnrolledAsync(courseId, cancellationToken)) return BadRequest(new { message = "Enter a question for a course you are enrolled in." });
        if (request.LessonId is not null && !await db.Lessons.Include(x => x.CourseModule).AnyAsync(x => x.Id == request.LessonId && x.CourseModule!.CourseId == courseId, cancellationToken)) return BadRequest(new { message = "The selected lesson does not belong to this course." });
        var question = new CourseQuestion { CourseId = courseId, LessonId = request.LessonId, StudentUserId = UserId!, Body = request.Body.Trim() };
        db.CourseQuestions.Add(question);
        db.AuditLogs.Add(Audit("CourseQuestionAsked", nameof(CourseQuestion), question.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/course-community/questions/{question.Id}", new { question.Id });
    }

    [Authorize(Policy = "TeacherOrAdmin")]
    [HttpPost("questions/{questionId:guid}/replies")]
    public async Task<IActionResult> Reply(Guid questionId, ReplyCourseQuestionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Trim().Length > 4000) return BadRequest(new { message = "Enter a reply of up to 4000 characters." });
        var question = await db.CourseQuestions.SingleOrDefaultAsync(x => x.Id == questionId, cancellationToken);
        if (question is null || !await CanManageCourseAsync(question.CourseId, cancellationToken)) return NotFound();
        var reply = new CourseQuestionReply { CourseQuestionId = questionId, AuthorUserId = UserId!, Body = request.Body.Trim() };
        question.IsResolved = request.Resolve;
        db.CourseQuestionReplies.Add(reply);
        db.Notifications.Add(new Notification { UserId = question.StudentUserId, Title = "Course question answered", Body = "Your course question has a new reply.", Type = NotificationType.Course, DeepLink = $"/student/learn/{question.CourseId}" });
        db.AuditLogs.Add(Audit("CourseQuestionReplied", nameof(CourseQuestion), question.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/course-community/questions/{questionId}/replies/{reply.Id}", new { reply.Id });
    }

    private async Task<bool> CanAccessCourseAsync(Guid courseId, CancellationToken cancellationToken) => User.IsInRole("Admin") || User.IsInRole("Teacher") && await db.Courses.AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken) || await IsEnrolledAsync(courseId, cancellationToken);
    private async Task<bool> CanManageCourseAsync(Guid courseId, CancellationToken cancellationToken) => User.IsInRole("Admin") || User.IsInRole("Teacher") && await db.Courses.AnyAsync(x => x.Id == courseId && x.TeacherUserId == UserId, cancellationToken);
    private async Task<bool> IsEnrolledAsync(Guid courseId, CancellationToken cancellationToken) => await db.Enrollments.AnyAsync(x => x.CourseId == courseId && x.StudentUserId == UserId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);
    private AuditLog Audit(string action, string entityType, Guid entityId) => new() { ActorUserId = UserId, Action = action, EntityType = entityType, EntityId = entityId.ToString(), Outcome = "Success" };
    private static string Localize(string locale, string arabic, string english) =>
        locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? string.IsNullOrWhiteSpace(arabic) ? english : arabic
            : string.IsNullOrWhiteSpace(english) ? arabic : english;
}

public sealed record AskCourseQuestionRequest(string Body, Guid? LessonId);
public sealed record ReplyCourseQuestionRequest(string Body, bool Resolve);
