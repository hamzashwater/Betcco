using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/courses/{courseId:guid}/announcements")]
public sealed class TeacherAnnouncementsController(
    BetccoDbContext db,
    UserManager<ApplicationUser> users,
    IEmailNotificationService emailNotifications) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await OwnsCourseAsync(courseId, cancellationToken)) return NotFound();
        var announcements = await db.CourseAnnouncements.AsNoTracking().Include(item => item.CourseModule).Include(item => item.Recipients)
            .Where(item => item.CourseId == courseId).OrderByDescending(item => item.PublishedAtUtc ?? item.CreatedAtUtc).ToListAsync(cancellationToken);
        return Ok(announcements.Select(item => new
        {
            item.Id,
            item.CourseModuleId,
            unitTitle = item.CourseModule is null ? null : item.CourseModule.ArabicTitle,
            item.ArabicTitle,
            item.EnglishTitle,
            item.ArabicBody,
            item.EnglishBody,
            audience = item.Audience.ToString(),
            selectedStudentIds = item.Recipients.Select(recipient => recipient.StudentUserId),
            item.IsPublished,
            item.PublishedAtUtc
        }));
    }

    [HttpGet("students")]
    public async Task<IActionResult> Students(Guid courseId, CancellationToken cancellationToken)
    {
        if (!await OwnsCourseAsync(courseId, cancellationToken)) return NotFound();
        var studentIds = await db.Enrollments.AsNoTracking().Where(item => item.CourseId == courseId).Select(item => item.StudentUserId).ToArrayAsync(cancellationToken);
        var students = await users.Users.AsNoTracking().Where(user => studentIds.Contains(user.Id.ToString()))
            .OrderBy(user => user.DisplayName).Select(user => new { id = user.Id.ToString(), user.DisplayName }).ToListAsync(cancellationToken);
        return Ok(students);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid courseId, SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        var validation = await ValidateAsync(courseId, request, cancellationToken);
        if (!validation.IsValid) return BadRequest(new { message = "Provide a valid title, body, audience, unit, and selected enrolled students." });
        var announcement = new CourseAnnouncement
        {
            CourseId = courseId,
            CourseModuleId = validation.Audience == AnnouncementAudience.Unit ? request.CourseModuleId : null,
            TeacherUserId = UserId,
            ArabicTitle = request.ArabicTitle.Trim(),
            EnglishTitle = request.EnglishTitle.Trim(),
            ArabicBody = request.ArabicBody.Trim(),
            EnglishBody = request.EnglishBody.Trim(),
            Audience = validation.Audience,
            IsPublished = false
        };
        foreach (var studentId in validation.Recipients) announcement.Recipients.Add(new CourseAnnouncementRecipient { StudentUserId = studentId });
        db.CourseAnnouncements.Add(announcement);
        db.AuditLogs.Add(Audit("CourseAnnouncementCreated", announcement.Id));
        await db.SaveChangesAsync(cancellationToken);
        if (request.Publish && !await PublishAsync(announcement, validation.Recipients, cancellationToken)) return BadRequest(new { message = "The announcement could not be published." });
        return Created($"/api/v1/teacher/courses/{courseId}/announcements/{announcement.Id}", new { announcement.Id });
    }

    [HttpPut("{announcementId:guid}")]
    public async Task<IActionResult> Update(Guid courseId, Guid announcementId, SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        var announcement = await db.CourseAnnouncements.Include(item => item.Recipients).SingleOrDefaultAsync(item => item.Id == announcementId && item.CourseId == courseId && item.TeacherUserId == UserId && !item.IsPublished, cancellationToken);
        var validation = await ValidateAsync(courseId, request, cancellationToken);
        if (announcement is null || !validation.IsValid) return BadRequest(new { message = "Only a valid unpublished announcement can be edited." });
        announcement.CourseModuleId = validation.Audience == AnnouncementAudience.Unit ? request.CourseModuleId : null;
        announcement.ArabicTitle = request.ArabicTitle.Trim();
        announcement.EnglishTitle = request.EnglishTitle.Trim();
        announcement.ArabicBody = request.ArabicBody.Trim();
        announcement.EnglishBody = request.EnglishBody.Trim();
        announcement.Audience = validation.Audience;
        db.CourseAnnouncementRecipients.RemoveRange(announcement.Recipients);
        announcement.Recipients.Clear();
        foreach (var studentId in validation.Recipients) announcement.Recipients.Add(new CourseAnnouncementRecipient { StudentUserId = studentId });
        db.AuditLogs.Add(Audit("CourseAnnouncementUpdated", announcement.Id));
        await db.SaveChangesAsync(cancellationToken);
        if (request.Publish && !await PublishAsync(announcement, validation.Recipients, cancellationToken)) return BadRequest(new { message = "The announcement could not be published." });
        return NoContent();
    }

    [HttpPost("{announcementId:guid}/publish")]
    public async Task<IActionResult> Publish(Guid courseId, Guid announcementId, CancellationToken cancellationToken)
    {
        var announcement = await db.CourseAnnouncements.Include(item => item.Recipients).SingleOrDefaultAsync(item => item.Id == announcementId && item.CourseId == courseId && item.TeacherUserId == UserId && !item.IsPublished, cancellationToken);
        if (announcement is null) return NotFound();
        var recipients = await ResolveRecipientsAsync(courseId, announcement.Audience, announcement.CourseModuleId, announcement.Recipients.Select(item => item.StudentUserId), cancellationToken);
        return await PublishAsync(announcement, recipients, cancellationToken) ? NoContent() : BadRequest(new { message = "No enrolled recipients are available for this announcement." });
    }

    [HttpDelete("{announcementId:guid}")]
    public async Task<IActionResult> Delete(Guid courseId, Guid announcementId, CancellationToken cancellationToken)
    {
        var announcement = await db.CourseAnnouncements.SingleOrDefaultAsync(item => item.Id == announcementId && item.CourseId == courseId && item.TeacherUserId == UserId && !item.IsPublished, cancellationToken);
        if (announcement is null) return NotFound();
        db.CourseAnnouncements.Remove(announcement);
        db.AuditLogs.Add(Audit("CourseAnnouncementDeleted", announcementId));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<AnnouncementValidation> ValidateAsync(Guid courseId, SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        var audience = default(AnnouncementAudience);
        IReadOnlyCollection<string> recipients = [];
        if (!await OwnsCourseAsync(courseId, cancellationToken) || string.IsNullOrWhiteSpace(request.ArabicTitle) || request.ArabicTitle.Trim().Length > 180
            || string.IsNullOrWhiteSpace(request.EnglishTitle) || request.EnglishTitle.Trim().Length > 180
            || string.IsNullOrWhiteSpace(request.ArabicBody) || request.ArabicBody.Trim().Length > 6000
            || string.IsNullOrWhiteSpace(request.EnglishBody) || request.EnglishBody.Trim().Length > 6000
            || !Enum.TryParse<AnnouncementAudience>(request.Audience, true, out audience)) return new(false, default, []);
        if (audience == AnnouncementAudience.Unit && (request.CourseModuleId is null || !await db.CourseModules.AnyAsync(item => item.Id == request.CourseModuleId && item.CourseId == courseId, cancellationToken))) return new(false, default, []);
        recipients = await ResolveRecipientsAsync(courseId, audience, request.CourseModuleId, request.SelectedStudentIds ?? [], cancellationToken);
        return new(audience != AnnouncementAudience.SelectedStudents || recipients.Count > 0, audience, recipients);
    }

    private async Task<IReadOnlyCollection<string>> ResolveRecipientsAsync(Guid courseId, AnnouncementAudience audience, Guid? courseModuleId, IEnumerable<string> selectedStudentIds, CancellationToken cancellationToken)
    {
        var enrolled = await db.Enrollments.AsNoTracking().Where(item => item.CourseId == courseId).Select(item => item.StudentUserId).ToArrayAsync(cancellationToken);
        if (audience != AnnouncementAudience.SelectedStudents) return enrolled;
        var selected = selectedStudentIds.Where(item => !string.IsNullOrWhiteSpace(item)).Distinct(StringComparer.Ordinal).Take(500).ToHashSet(StringComparer.Ordinal);
        return enrolled.Where(selected.Contains).ToArray();
    }

    private async Task<bool> PublishAsync(CourseAnnouncement announcement, IReadOnlyCollection<string> recipients, CancellationToken cancellationToken)
    {
        if (recipients.Count == 0) return false;
        announcement.IsPublished = true;
        announcement.PublishedAtUtc = DateTimeOffset.UtcNow;
        foreach (var studentId in recipients)
        {
            db.Notifications.Add(new Notification { UserId = studentId, Title = "New course announcement", Body = announcement.EnglishTitle, Type = NotificationType.Course, DeepLink = $"/student/learn/{announcement.CourseId}" });
        }
        db.AuditLogs.Add(Audit("CourseAnnouncementPublished", announcement.Id));
        await db.SaveChangesAsync(cancellationToken);
        var emails = await users.Users.AsNoTracking().Where(user => recipients.Contains(user.Id.ToString())).Select(user => user.Email).ToArrayAsync(cancellationToken);
        await Task.WhenAll(emails.Where(email => !string.IsNullOrWhiteSpace(email)).Select(email => emailNotifications.SendAsync(new PlatformEmailNotification("CourseAnnouncement", email!, "BETCCO course announcement", announcement.EnglishTitle, announcement.EnglishBody), cancellationToken)));
        return true;
    }

    private Task<bool> OwnsCourseAsync(Guid courseId, CancellationToken cancellationToken) => db.Courses.AnyAsync(course => course.Id == courseId && course.TeacherUserId == UserId, cancellationToken);
    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private AuditLog Audit(string action, Guid entityId) => new() { ActorUserId = UserId, Action = action, EntityType = nameof(CourseAnnouncement), EntityId = entityId.ToString(), Outcome = "Success" };
}

internal sealed record AnnouncementValidation(bool IsValid, AnnouncementAudience Audience, IReadOnlyCollection<string> Recipients);

public sealed record SaveAnnouncementRequest(string ArabicTitle, string EnglishTitle, string ArabicBody, string EnglishBody, string Audience, Guid? CourseModuleId, IReadOnlyCollection<string>? SelectedStudentIds, bool Publish);
