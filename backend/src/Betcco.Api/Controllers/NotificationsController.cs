using System.Security.Claims;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/notifications")]
public sealed class NotificationsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int take = 12, CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 50);
        var notifications = await db.Notifications.AsNoTracking()
            .Where(x => x.UserId == UserId)
            .OrderBy(x => x.ReadAtUtc.HasValue)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Take(take)
            .Select(x => new { x.Id, x.Title, x.Body, type = x.Type.ToString(), x.DeepLink, x.ReadAtUtc, x.CreatedAtUtc })
            .ToListAsync(cancellationToken);
        return Ok(notifications);
    }

    [HttpPost("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId, CancellationToken cancellationToken)
    {
        var notification = await db.Notifications.SingleOrDefaultAsync(x => x.Id == notificationId && x.UserId == UserId, cancellationToken);
        if (notification is null) return NotFound();
        if (notification.ReadAtUtc.HasValue) return NoContent();

        notification.ReadAtUtc = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(Audit("NotificationMarkedRead", notification.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken)
    {
        var unread = await db.Notifications.Where(x => x.UserId == UserId && !x.ReadAtUtc.HasValue).ToListAsync(cancellationToken);
        if (unread.Count == 0) return NoContent();

        var now = DateTimeOffset.UtcNow;
        foreach (var notification in unread) notification.ReadAtUtc = now;
        db.AuditLogs.Add(Audit("NotificationsMarkedRead", null));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private AuditLog Audit(string action, Guid? notificationId) => new()
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(Notification),
        EntityId = notificationId?.ToString(),
        Outcome = "Success"
    };

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
