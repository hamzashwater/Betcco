using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/support")]
public sealed class SupportController(BetccoDbContext db) : ControllerBase
{
    [HttpPost("tickets")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateTicketRequest request, CancellationToken cancellationToken)
    {
        if (!IsValidTicketText(request.Subject, 200) || !IsValidTicketText(request.Category, 80) || !IsValidTicketText(request.Message, 4000))
            return BadRequest(new { message = "Enter a subject, category, and message within the allowed length." });
        var ticket = new SupportTicket { OwnerUserId = UserId, Subject = request.Subject.Trim(), Category = request.Category.Trim() };
        ticket.Messages.Add(new TicketMessage { SenderUserId = UserId, Body = request.Message.Trim() });
        db.SupportTickets.Add(ticket);
        db.AuditLogs.Add(Audit("SupportTicketCreated", ticket.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { ticket.Id, ticket.Status });
    }

    [HttpGet("tickets")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 50)
            return BadRequest(new { message = "Use a page size between 1 and 50." });
        var isSupportStaff = IsSupportStaff;
        var tickets = db.SupportTickets.AsNoTracking();
        if (!isSupportStaff) tickets = tickets.Where(ticket => ticket.OwnerUserId == UserId);
        var totalCount = await tickets.CountAsync(cancellationToken);
        var items = await tickets
            .OrderByDescending(ticket => ticket.UpdatedAtUtc)
            .ThenByDescending(ticket => ticket.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(ticket => new
            {
                ticket.Id,
                ticket.Subject,
                ticket.Category,
                status = ticket.Status.ToString(),
                ticket.CreatedAtUtc,
                ticket.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);
        return Ok(new { items, page, pageSize, totalCount });
    }

    [HttpGet("tickets/{ticketId:guid}")]
    public async Task<IActionResult> Get(Guid ticketId, CancellationToken cancellationToken)
    {
        var ticket = await db.SupportTickets.Include(x => x.Messages).AsNoTracking().SingleOrDefaultAsync(x => x.Id == ticketId, cancellationToken);
        if (ticket is null || (!IsSupportStaff && ticket.OwnerUserId != UserId)) return NotFound();
        return Ok(new
        {
            ticket.Id,
            ticket.Subject,
            ticket.Category,
            status = ticket.Status.ToString(),
            ticket.CreatedAtUtc,
            ticket.UpdatedAtUtc,
            messages = ticket.Messages.OrderBy(x => x.CreatedAtUtc).Select(x => new { x.Id, x.Body, x.CreatedAtUtc, isFromCurrentUser = x.SenderUserId == UserId })
        });
    }

    [HttpPost("tickets/{ticketId:guid}/messages")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Reply(Guid ticketId, TicketReplyRequest request, CancellationToken cancellationToken)
    {
        var ticket = await db.SupportTickets.SingleOrDefaultAsync(x => x.Id == ticketId, cancellationToken);
        if (ticket is null || (!IsSupportStaff && ticket.OwnerUserId != UserId)) return NotFound();
        if (!IsValidTicketText(request.Message, 4000)) return BadRequest(new { message = "Enter a message of up to 4000 characters." });
        if (ticket.Status == Betcco.Domain.Common.SupportTicketStatus.Closed)
            return Conflict(new { message = "This support ticket is closed." });
        db.TicketMessages.Add(new TicketMessage { SupportTicketId = ticketId, SenderUserId = UserId, Body = request.Message.Trim() });
        ticket.Status = IsSupportStaff
            ? Betcco.Domain.Common.SupportTicketStatus.WaitingForStudent
            : Betcco.Domain.Common.SupportTicketStatus.Open;
        ticket.UpdatedAtUtc = DateTimeOffset.UtcNow;
        var isSupportStaff = IsSupportStaff;
        if (isSupportStaff)
        {
            db.Notifications.Add(new Notification
            {
                UserId = ticket.OwnerUserId,
                Title = "Support reply received",
                Body = "BETCCO support replied to your ticket.",
                Type = Betcco.Domain.Common.NotificationType.Support,
                DeepLink = "/student/support"
            });
        }
        db.AuditLogs.Add(Audit(isSupportStaff ? "SupportTicketAdminReplied" : "SupportTicketOwnerReplied", ticket.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "SupportAdmin")]
    [HttpPost("tickets/{ticketId:guid}/status")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ChangeStatus(Guid ticketId, ChangeTicketStatusRequest request, CancellationToken cancellationToken)
    {
        if (!IsSupportStaff) return Forbid();
        if (!Enum.TryParse<Betcco.Domain.Common.SupportTicketStatus>(request.Status, true, out var status)
            || status is not (Betcco.Domain.Common.SupportTicketStatus.InProgress or Betcco.Domain.Common.SupportTicketStatus.Resolved or Betcco.Domain.Common.SupportTicketStatus.Closed))
            return BadRequest(new { message = "Use InProgress, Resolved, or Closed." });

        var ticket = await db.SupportTickets.SingleOrDefaultAsync(ticket => ticket.Id == ticketId, cancellationToken);
        if (ticket is null) return NotFound();
        if (ticket.Status == status) return NoContent();

        ticket.Status = status;
        ticket.UpdatedAtUtc = DateTimeOffset.UtcNow;
        db.Notifications.Add(new Notification
        {
            UserId = ticket.OwnerUserId,
            Title = "Support ticket updated",
            Body = $"Your support ticket status is now {status}.",
            Type = Betcco.Domain.Common.NotificationType.Support,
            DeepLink = "/student/support"
        });
        db.AuditLogs.Add(Audit($"SupportTicketStatusChanged:{status}", ticket.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private bool IsSupportStaff => User.IsInRole(PlatformRoles.Admin) || User.IsInRole(PlatformRoles.SupportAdmin);
    private AuditLog Audit(string action, Guid ticketId) => new()
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(SupportTicket),
        EntityId = ticketId.ToString(),
        Outcome = "Success"
    };
    private static bool IsValidTicketText(string? value, int maxLength) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maxLength;
}

public sealed record CreateTicketRequest(string Subject, string Category, string Message);
public sealed record TicketReplyRequest(string Message);
public sealed record ChangeTicketStatusRequest(string Status);
