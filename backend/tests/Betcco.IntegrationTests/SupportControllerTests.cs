using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class SupportControllerTests
{
    [Fact]
    public async Task Student_can_list_and_reply_only_to_their_own_tickets()
    {
        await using var db = CreateDb();
        var ownTicket = new SupportTicket { OwnerUserId = "student-1", Subject = "Need help", Category = "General" };
        var otherTicket = new SupportTicket { OwnerUserId = "student-2", Subject = "Private", Category = "General" };
        db.SupportTickets.AddRange(ownTicket, otherTicket);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "student-1");

        var list = await controller.List(1, 25, CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(list);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(ownTicket.Id.ToString(), items[0].GetProperty("id").GetString());

        var reply = await controller.Reply(ownTicket.Id, new TicketReplyRequest("Here is more detail."), CancellationToken.None);

        Assert.IsType<NoContentResult>(reply);
        Assert.Single(db.TicketMessages);
        Assert.Equal(SupportTicketStatus.Open, (await db.SupportTickets.SingleAsync(ticket => ticket.Id == ownTicket.Id)).Status);
        Assert.Contains(db.AuditLogs, item => item.Action == "SupportTicketOwnerReplied" && item.ActorUserId == "student-1");
        Assert.IsType<NotFoundResult>(await controller.Reply(otherTicket.Id, new TicketReplyRequest("Not allowed"), CancellationToken.None));
    }

    [Fact]
    public async Task Admin_can_change_ticket_status_and_the_owner_is_notified()
    {
        await using var db = CreateDb();
        var ticket = new SupportTicket { OwnerUserId = "student-1", Subject = "Need help", Category = "General" };
        db.SupportTickets.Add(ticket);
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "admin-1", "Admin");

        var result = await controller.ChangeStatus(ticket.Id, new ChangeTicketStatusRequest("Resolved"), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal(SupportTicketStatus.Resolved, (await db.SupportTickets.SingleAsync(item => item.Id == ticket.Id)).Status);
        Assert.Contains(db.Notifications, item => item.UserId == "student-1" && item.Type == NotificationType.Support);
        Assert.Contains(db.AuditLogs, item => item.Action == "SupportTicketStatusChanged:Resolved" && item.ActorUserId == "admin-1");
        Assert.IsType<BadRequestObjectResult>(await controller.ChangeStatus(ticket.Id, new ChangeTicketStatusRequest("Open"), CancellationToken.None));
    }

    private static SupportController ControllerFor(BetccoDbContext db, string userId, string? role = null) => new(db)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    role is null
                        ? [new Claim(ClaimTypes.NameIdentifier, userId)]
                        : [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)], "Test"))
            }
        }
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
