using System.Text;
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
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] string? outcome,
        [FromQuery] DateTimeOffset? fromUtc,
        [FromQuery] DateTimeOffset? toUtc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        if (fromUtc.HasValue && toUtc.HasValue
            && (fromUtc > toUtc || toUtc.Value - fromUtc.Value > TimeSpan.FromDays(366)))
            return BadRequest(new { message = "Use a valid audit date range no longer than 366 days." });

        search = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        action = string.IsNullOrWhiteSpace(action) ? null : action.Trim();
        entityType = string.IsNullOrWhiteSpace(entityType) ? null : entityType.Trim();
        outcome = string.IsNullOrWhiteSpace(outcome) ? null : outcome.Trim();
        if (new[] { search, action, entityType, outcome }.Any(value => value?.Length > 120))
            return BadRequest(new { message = "Audit filter text is too long." });

        var logs = db.AuditLogs.AsNoTracking();
        if (search is not null)
        {
            logs = logs.Where(log => log.Action.Contains(search)
                || log.EntityType.Contains(search)
                || (log.EntityId != null && log.EntityId.Contains(search))
                || (log.ActorUserId != null && log.ActorUserId.Contains(search)));
        }
        if (action is not null)
            logs = logs.Where(log => log.Action.Contains(action));
        if (entityType is not null)
            logs = logs.Where(log => log.EntityType.Contains(entityType));
        if (outcome is not null)
            logs = logs.Where(log => log.Outcome == outcome);
        if (fromUtc.HasValue)
            logs = logs.Where(log => log.CreatedAtUtc >= fromUtc.Value);
        if (toUtc.HasValue)
            logs = logs.Where(log => log.CreatedAtUtc <= toUtc.Value);
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

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? search,
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] string? outcome,
        [FromQuery] DateTimeOffset? fromUtc,
        [FromQuery] DateTimeOffset? toUtc,
        CancellationToken cancellationToken = default)
    {
        if (fromUtc.HasValue && toUtc.HasValue
            && (fromUtc > toUtc || toUtc.Value - fromUtc.Value > TimeSpan.FromDays(366)))
            return BadRequest(new { message = "Use a valid audit date range no longer than 366 days." });

        search = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        action = string.IsNullOrWhiteSpace(action) ? null : action.Trim();
        entityType = string.IsNullOrWhiteSpace(entityType) ? null : entityType.Trim();
        outcome = string.IsNullOrWhiteSpace(outcome) ? null : outcome.Trim();
        if (new[] { search, action, entityType, outcome }.Any(value => value?.Length > 120))
            return BadRequest(new { message = "Audit filter text is too long." });

        var logs = db.AuditLogs.AsNoTracking();
        if (search is not null)
            logs = logs.Where(log => log.Action.Contains(search)
                || log.EntityType.Contains(search)
                || (log.EntityId != null && log.EntityId.Contains(search))
                || (log.ActorUserId != null && log.ActorUserId.Contains(search)));
        if (action is not null)
            logs = logs.Where(log => log.Action.Contains(action));
        if (entityType is not null)
            logs = logs.Where(log => log.EntityType.Contains(entityType));
        if (outcome is not null)
            logs = logs.Where(log => log.Outcome == outcome);
        if (fromUtc.HasValue)
            logs = logs.Where(log => log.CreatedAtUtc >= fromUtc.Value);
        if (toUtc.HasValue)
            logs = logs.Where(log => log.CreatedAtUtc <= toUtc.Value);

        var rows = await logs.OrderByDescending(log => log.CreatedAtUtc)
            .ThenByDescending(log => log.Id)
            .Take(5_001)
            .Select(log => new
            {
                log.ActorUserId,
                log.Action,
                log.EntityType,
                log.Outcome,
                log.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        if (rows.Count > 5_000)
            return BadRequest(new { message = "Narrow the filters before exporting more than 5000 audit events." });

        var actorIds = rows.Where(log => log.ActorUserId != null)
            .Select(log => log.ActorUserId!)
            .Distinct()
            .ToArray();
        var names = await db.Users.AsNoTracking()
            .Where(user => actorIds.Contains(user.Id.ToString()))
            .ToDictionaryAsync(user => user.Id.ToString(), user => user.DisplayName, cancellationToken);

        var csv = new StringBuilder();
        csv.AppendLine("CreatedAtUtc,Actor,Action,EntityType,Outcome");
        foreach (var row in rows)
        {
            var actorName = row.ActorUserId is null
                ? "System"
                : names.GetValueOrDefault(row.ActorUserId, "Deleted user");
            csv.Append(Csv(row.CreatedAtUtc.ToString("O"))).Append(',')
                .Append(Csv(actorName)).Append(',')
                .Append(Csv(row.Action)).Append(',')
                .Append(Csv(row.EntityType)).Append(',')
                .Append(Csv(row.Outcome)).AppendLine();
        }

        var fileName = $"betcco-audit-log-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.csv";
        return File(Encoding.UTF8.GetBytes("\uFEFF" + csv), "text/csv; charset=utf-8", fileName);
    }

    private static string Csv(string value)
    {
        var safe = string.IsNullOrEmpty(value)
            ? string.Empty
            : "=+-@\t\r\n".Contains(value[0]) ? "'" + value : value;
        return $"\"{safe.Replace("\"", "\"\"")}\"";
    }
}
