using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/engagement")]
public sealed class PublicEngagementController(BetccoDbContext db) : ControllerBase
{
    [HttpPost("leads")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> CreateLead(CreateLeadRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Contact) || string.IsNullOrWhiteSpace(request.Message) || !request.Consent) return BadRequest(new { message = "Name, contact, message, and consent are required." });
        db.Leads.Add(new Lead { Name = request.Name.Trim(), Contact = request.Contact.Trim(), Message = request.Message.Trim(), Category = request.Category.Trim(), Consent = true });
        await db.SaveChangesAsync(cancellationToken);
        return Accepted();
    }
}

public sealed record CreateLeadRequest(string Name, string Contact, string Message, string Category, bool Consent);
