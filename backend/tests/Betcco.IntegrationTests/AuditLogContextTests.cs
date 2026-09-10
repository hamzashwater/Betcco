using System.Net;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class AuditLogContextTests
{
    [Fact]
    public async Task Saving_an_audit_event_enriches_it_with_safe_request_context()
    {
        var request = new DefaultHttpContext();
        request.TraceIdentifier = "request-correlation";
        request.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.17");
        request.Request.Headers.UserAgent = "BETCCO-test-agent";
        var accessor = new HttpContextAccessor { HttpContext = request };
        var options = new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        await using var db = new BetccoDbContext(options, accessor);
        db.AuditLogs.Add(new AuditLog
        {
            Action = "SensitiveOperation",
            EntityType = "TestEntity",
            Outcome = "Success",
            OldValuesJson = "  {\"isFrozen\":false}  ",
            NewValuesJson = "  {\"isFrozen\":true}  "
        });

        await db.SaveChangesAsync();

        var stored = Assert.Single(await db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Equal("request-correlation", stored.CorrelationId);
        Assert.Equal("203.0.113.17", stored.IpAddress);
        Assert.Equal("BETCCO-test-agent", stored.UserAgent);
        Assert.Equal("{\"isFrozen\":false}", stored.OldValuesJson);
        Assert.Equal("{\"isFrozen\":true}", stored.NewValuesJson);
    }
}
