using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/v1/admin/audit-logs")]
public sealed class AdminAuditLogsController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var logs = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (term.Length > 120) return BadRequest(new { message = "Search text is too long." });
            logs = logs.Where(log => log.Action.Contains(term)
                || log.EntityType.Contains(term)
                || (log.EntityId != null && log.EntityId.Contains(term))
                || (log.ActorUserId != null && log.ActorUserId.Contains(term)));
        }
        var totalCount = await logs.CountAsync(cancellationToken);
        var pageItems = await logs.OrderByDescending(log => log.CreatedAtUtc)
            .ThenByDescending(log => log.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(log => new
            {
                log.Id,
                log.ActorUserId,
                log.Action,
                log.EntityType,
                log.EntityId,
                log.CorrelationId,
                log.IpAddress,
                log.UserAgent,
                log.Outcome,
                log.MetadataJson,
                log.OldValuesJson,
                log.NewValuesJson,
                log.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);
        var actorIds = pageItems.Where(log => log.ActorUserId != null)
            .Select(log => log.ActorUserId!)
            .Distinct()
            .ToArray();
        var names = await db.Users.AsNoTracking()
            .Where(user => actorIds.Contains(user.Id.ToString()))
            .ToDictionaryAsync(user => user.Id.ToString(), user => user.DisplayName, cancellationToken);
        return Ok(new
        {
            items = pageItems.Select(log => new
            {
                log.Id,
                log.ActorUserId,
                actorName = log.ActorUserId is null ? "System" : names.GetValueOrDefault(log.ActorUserId, "Deleted user"),
                log.Action,
                log.EntityType,
                log.EntityId,
                log.CorrelationId,
                log.IpAddress,
                log.UserAgent,
                log.Outcome,
                log.MetadataJson,
                log.OldValuesJson,
                log.NewValuesJson,
                log.CreatedAtUtc
            }),
            page,
            pageSize,
            totalCount
        });
    }
}
