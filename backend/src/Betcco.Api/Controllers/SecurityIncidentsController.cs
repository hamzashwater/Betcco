using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Restricted incident register for security and privacy staff. It records the
/// facts and the human legal decision, but deliberately never sends legal
/// notifications or declares that a breach is reportable by itself.
/// </summary>
[ApiController]
[Authorize(Policy = "SecurityIncidentAdmin")]
[Route("api/v1/security-incidents")]
public sealed class SecurityIncidentsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] SecurityIncidentStatus? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        if (!IsBoundedPage(page, pageSize)) return BadRequest(new { code = "INCIDENT_PAGE_INVALID", message = "Use a page size between 1 and 50." });
        if (status.HasValue && !Enum.IsDefined(status.Value)) return BadRequest(new { code = "INCIDENT_STATUS_INVALID", message = "Select a valid incident status." });

        var query = db.SecurityIncidents.AsNoTracking().Include(item => item.BreachAssessment).ThenInclude(item => item!.NotificationDeadlines).AsQueryable();
        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(item => item.DetectedAtUtc).ThenByDescending(item => item.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        var result = new SecurityIncidentPage(items.Select(ToView).ToArray(), page, pageSize, totalCount);
        Audit("SecurityIncidentAdminListRead", null, new
        {
            authorizationPolicy = "SecurityIncidentAdmin",
            readScope = "incident-list",
            status = status?.ToString(),
            page,
            pageSize,
            resultCount = result.Items.Count
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(result);
    }

    [HttpGet("{incidentId:guid}")]
    public async Task<IActionResult> Get(Guid incidentId, CancellationToken cancellationToken)
    {
        var incident = await IncidentQuery(false).SingleOrDefaultAsync(item => item.Id == incidentId, cancellationToken);
        if (incident is null) return NotFound();
        Audit("SecurityIncidentAdminDetailRead", incident, new
        {
            authorizationPolicy = "SecurityIncidentAdmin",
            incident.Status,
            severity = incident.Severity.ToString(),
            hasBreachAssessment = incident.BreachAssessment is not null
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(incident));
    }

    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateSecurityIncidentRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.Severity) || !IsRequiredText(request.Title, 240) || !IsRequiredText(request.Summary, 4_000) || !IsRequiredText(request.ReasonCode, 80))
            return BadRequest(new { code = "INCIDENT_INPUT_INVALID", message = "Provide an incident title, concise summary, severity, and reason code." });
        var title = request.Title!.Trim();
        var summary = request.Summary!.Trim();
        var reasonCode = request.ReasonCode!.Trim();
        var detectedAtUtc = request.DetectedAtUtc ?? DateTimeOffset.UtcNow;
        if (detectedAtUtc > DateTimeOffset.UtcNow.AddMinutes(5) || detectedAtUtc < DateTimeOffset.UtcNow.AddDays(-365))
            return BadRequest(new { code = "INCIDENT_DETECTION_TIME_INVALID", message = "Use a plausible UTC detection time." });

        var incident = new SecurityIncident
        {
            Title = title,
            Summary = summary,
            ReasonCode = reasonCode,
            Severity = request.Severity,
            DetectedAtUtc = detectedAtUtc,
            CreatedByUserId = UserId,
            BreachAssessment = new BreachAssessment { PotentialPersonalDataImpact = request.PotentialPersonalDataImpact }
        };
        db.SecurityIncidents.Add(incident);
        Audit("SecurityIncidentCreated", incident, new { severity = incident.Severity.ToString(), incident.ReasonCode, request.PotentialPersonalDataImpact });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { incidentId = incident.Id }, ToView(incident));
    }

    [HttpPut("{incidentId:guid}")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Review(Guid incidentId, ReviewSecurityIncidentRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.Status) || !IsRequiredText(request.ReasonCode, 80) || !IsOptionalText(request.LegalDecisionSummary, 2_000) || !IsOptionalText(request.ClosureSummary, 2_000))
            return BadRequest(new { code = "INCIDENT_INPUT_INVALID", message = "Use a valid status, reason code, and bounded notes." });
        var reasonCode = request.ReasonCode!.Trim();
        if (request.MarkLegalConfirmation && string.IsNullOrWhiteSpace(request.LegalDecisionSummary))
            return BadRequest(new { code = "INCIDENT_LEGAL_DECISION_REQUIRED", message = "Record the Article 20 trigger-assessment reason before confirming the decision." });
        if (request.LegalNotificationRequired && !request.PotentialPersonalDataImpact)
            return BadRequest(new { code = "INCIDENT_NOTIFICATION_INCONSISTENT", message = "A notification cannot be required when no potential personal-data impact is recorded." });

        var incident = await IncidentQuery(true).SingleOrDefaultAsync(item => item.Id == incidentId, cancellationToken);
        if (incident is null) return NotFound();
        if (incident.Status == SecurityIncidentStatus.Closed)
            return Conflict(new { code = "INCIDENT_FINAL", message = "A closed incident cannot be changed. Create a linked follow-up incident if needed." });
        if (!CanTransition(incident.Status, request.Status))
            return Conflict(new { code = "INCIDENT_TRANSITION_INVALID", message = "That incident-state transition is not allowed." });

        var assessment = incident.BreachAssessment!;
        var decisionAlreadyRecorded = assessment.LegalConfirmedAtUtc is not null;
        var decisionReason = request.LegalDecisionSummary?.Trim();
        if (decisionAlreadyRecorded &&
            (request.PotentialPersonalDataImpact != assessment.PotentialPersonalDataImpact
             || request.LegalNotificationRequired != assessment.LegalNotificationRequired
             || !string.Equals(decisionReason, assessment.LegalDecisionSummary, StringComparison.Ordinal)))
        {
            return Conflict(new
            {
                code = "INCIDENT_LEGAL_DECISION_FINAL",
                message = "The recorded Article 20 trigger decision cannot be changed. Record a linked follow-up incident if the assessment must be reconsidered."
            });
        }

        assessment.PotentialPersonalDataImpact = request.PotentialPersonalDataImpact;
        assessment.LegalNotificationRequired = request.LegalNotificationRequired;
        assessment.LegalDecisionSummary = decisionReason;
        var decisionRecorded = request.MarkLegalConfirmation && !decisionAlreadyRecorded;
        if (decisionRecorded)
        {
            assessment.LegalConfirmedAtUtc = DateTimeOffset.UtcNow;
            assessment.LegalConfirmedByUserId = UserId;
        }
        EnsureArticle20Deadlines(assessment, incident.DetectedAtUtc);

        if (request.Status == SecurityIncidentStatus.Closed)
        {
            if (string.IsNullOrWhiteSpace(request.ClosureSummary))
                return BadRequest(new { code = "INCIDENT_CLOSURE_SUMMARY_REQUIRED", message = "A closure summary is required." });
            if (assessment.PotentialPersonalDataImpact && assessment.LegalConfirmedAtUtc is null)
                return Conflict(new { code = "INCIDENT_LEGAL_CONFIRMATION_REQUIRED", message = "Record the legal review before closing a potential personal-data incident." });
            if (assessment.LegalNotificationRequired && assessment.NotificationDeadlines.Any(deadline => deadline.RecordedAtUtc is null))
                return Conflict(new { code = "INCIDENT_NOTIFICATION_RECORD_REQUIRED", message = "Record the required external notification actions before closing this incident." });
            incident.ClosureSummary = request.ClosureSummary.Trim();
        }
        if (request.Status == SecurityIncidentStatus.Contained && incident.ContainedAtUtc is null)
            incident.ContainedAtUtc = DateTimeOffset.UtcNow;
        incident.Status = request.Status;
        incident.AssignedToUserId = UserId;
        incident.ReasonCode = reasonCode;
        if (decisionRecorded)
        {
            Audit("SecurityIncidentArticle20NotificationDecisionRecorded", incident, new
            {
                triggerDecision = assessment.LegalNotificationRequired ? "Article20TriggerApplies" : "Article20TriggerDoesNotApply",
                decisionAtUtc = assessment.LegalConfirmedAtUtc,
                decisionReasonRecorded = true,
                notificationDeadlineCount = assessment.NotificationDeadlines.Count
            });
        }
        Audit("SecurityIncidentReviewed", incident, new
        {
            status = incident.Status.ToString(),
            incident.ReasonCode,
            assessment.PotentialPersonalDataImpact,
            assessment.LegalNotificationRequired,
            legalConfirmed = assessment.LegalConfirmedAtUtc.HasValue,
            article20TriggerDecision = assessment.LegalConfirmedAtUtc is null
                ? "Pending"
                : assessment.LegalNotificationRequired ? "Article20TriggerApplies" : "Article20TriggerDoesNotApply"
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(incident));
    }

    [HttpPost("{incidentId:guid}/notification-deadlines/{deadlineId:guid}/record")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> RecordNotificationAction(Guid incidentId, Guid deadlineId, RecordNotificationActionRequest request, CancellationToken cancellationToken)
    {
        if (!IsRequiredText(request.Note, 1_000))
            return BadRequest(new { code = "INCIDENT_NOTIFICATION_NOTE_REQUIRED", message = "Record a concise notification-action note." });
        var note = request.Note!.Trim();
        var incident = await IncidentQuery(true).SingleOrDefaultAsync(item => item.Id == incidentId, cancellationToken);
        if (incident is null || incident.Status == SecurityIncidentStatus.Closed) return NotFound();
        var assessment = incident.BreachAssessment!;
        var deadline = assessment.NotificationDeadlines.SingleOrDefault(item => item.Id == deadlineId);
        if (deadline is null) return NotFound();
        if (!assessment.LegalNotificationRequired || assessment.LegalConfirmedAtUtc is null)
            return Conflict(new { code = "INCIDENT_NOTIFICATION_NOT_AUTHORIZED", message = "A confirmed legal decision is required before recording a notification action." });
        if (deadline.RecordedAtUtc is not null)
            return Conflict(new { code = "INCIDENT_NOTIFICATION_ALREADY_RECORDED", message = "This notification action is already recorded." });

        deadline.RecordedAtUtc = DateTimeOffset.UtcNow;
        deadline.RecordedByUserId = UserId;
        deadline.RecordNote = note;
        Audit("SecurityIncidentNotificationActionRecorded", incident, new { deadline.Audience, deadline.DueAtUtc });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private IQueryable<SecurityIncident> IncidentQuery(bool tracking) =>
        (tracking ? db.SecurityIncidents : db.SecurityIncidents.AsNoTracking())
            .Include(item => item.BreachAssessment)
            .ThenInclude(item => item!.NotificationDeadlines);

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private void Audit(string action, SecurityIncident? incident, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(SecurityIncident),
        EntityId = incident?.Id.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private void EnsureArticle20Deadlines(BreachAssessment assessment, DateTimeOffset detectedAtUtc)
    {
        if (assessment.LegalConfirmedAtUtc is null || !assessment.LegalNotificationRequired) return;
        if (!assessment.NotificationDeadlines.Any(item => item.Audience == BreachNotificationAudience.AffectedIndividuals))
            AddNotificationDeadline(assessment, BreachNotificationAudience.AffectedIndividuals, detectedAtUtc.AddHours(24));
        if (!assessment.NotificationDeadlines.Any(item => item.Audience == BreachNotificationAudience.RegulatoryAuthority))
            AddNotificationDeadline(assessment, BreachNotificationAudience.RegulatoryAuthority, detectedAtUtc.AddHours(72));
    }

    private void AddNotificationDeadline(BreachAssessment assessment, BreachNotificationAudience audience, DateTimeOffset dueAtUtc)
    {
        var deadline = new BreachNotificationDeadline
        {
            BreachAssessmentId = assessment.Id,
            Audience = audience,
            DueAtUtc = dueAtUtc
        };
        assessment.NotificationDeadlines.Add(deadline);
        db.BreachNotificationDeadlines.Add(deadline);
    }

    private static bool CanTransition(SecurityIncidentStatus current, SecurityIncidentStatus next) => current == next || current switch
    {
        SecurityIncidentStatus.Open => next is SecurityIncidentStatus.Assessing or SecurityIncidentStatus.Contained,
        SecurityIncidentStatus.Assessing => next is SecurityIncidentStatus.Contained or SecurityIncidentStatus.Closed,
        SecurityIncidentStatus.Contained => next == SecurityIncidentStatus.Closed,
        _ => false
    };

    private static bool IsBoundedPage(int page, int pageSize) => page >= 1 && pageSize is >= 1 and <= 50;
    private static bool IsRequiredText(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum;
    private static bool IsOptionalText(string? value, int maximum) => value is null || value.Trim().Length <= maximum;

    private static SecurityIncidentView ToView(SecurityIncident incident)
    {
        var assessment = incident.BreachAssessment;
        return new SecurityIncidentView(
            incident.Id,
            incident.Title,
            incident.Summary,
            incident.ReasonCode,
            incident.Severity,
            incident.Status,
            incident.DetectedAtUtc,
            incident.ContainedAtUtc,
            incident.ClosureSummary,
            assessment is null ? null : new BreachAssessmentView(
                assessment.PotentialPersonalDataImpact,
                assessment.LegalConfirmationRequired,
                assessment.LegalNotificationRequired,
                assessment.LegalConfirmedAtUtc,
                assessment.LegalConfirmedByUserId,
                assessment.LegalDecisionSummary,
                assessment.NotificationDeadlines.OrderBy(item => item.DueAtUtc).Select(item => new BreachNotificationDeadlineView(item.Id, item.Audience, item.DueAtUtc, item.RecordedAtUtc)).ToArray()),
            incident.CreatedAtUtc,
            incident.UpdatedAtUtc);
    }
}

public sealed record CreateSecurityIncidentRequest(
    [param: StringLength(240)] string? Title,
    [param: StringLength(4_000)] string? Summary,
    [param: StringLength(80)] string? ReasonCode,
    SecurityIncidentSeverity Severity,
    bool PotentialPersonalDataImpact,
    DateTimeOffset? DetectedAtUtc);

public sealed record ReviewSecurityIncidentRequest(
    SecurityIncidentStatus Status,
    bool PotentialPersonalDataImpact,
    bool LegalNotificationRequired,
    bool MarkLegalConfirmation,
    [param: StringLength(2_000)] string? LegalDecisionSummary,
    [param: StringLength(2_000)] string? ClosureSummary,
    [param: StringLength(80)] string? ReasonCode);

public sealed record RecordNotificationActionRequest([param: StringLength(1_000)] string? Note);
public sealed record SecurityIncidentPage(IReadOnlyCollection<SecurityIncidentView> Items, int Page, int PageSize, int TotalCount);
public sealed record SecurityIncidentView(Guid Id, string Title, string Summary, string ReasonCode, SecurityIncidentSeverity Severity, SecurityIncidentStatus Status, DateTimeOffset DetectedAtUtc, DateTimeOffset? ContainedAtUtc, string? ClosureSummary, BreachAssessmentView? BreachAssessment, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc);
public sealed record BreachAssessmentView(bool PotentialPersonalDataImpact, bool LegalConfirmationRequired, bool LegalNotificationRequired, DateTimeOffset? LegalConfirmedAtUtc, string? LegalConfirmedByUserId, string? LegalDecisionSummary, IReadOnlyCollection<BreachNotificationDeadlineView> NotificationDeadlines);
public sealed record BreachNotificationDeadlineView(Guid Id, BreachNotificationAudience Audience, DateTimeOffset DueAtUtc, DateTimeOffset? RecordedAtUtc);
