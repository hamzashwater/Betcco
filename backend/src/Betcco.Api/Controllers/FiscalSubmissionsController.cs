using System.Security.Claims;
using Betcco.Application.Commerce;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/fiscal-submissions")]
public sealed class FiscalSubmissionsController(IFiscalSubmissionService submissions, BetccoDbContext db) : ControllerBase
{
    [HttpPost("invoices/{invoiceId:guid}/submit")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> SubmitInvoice(Guid invoiceId, CancellationToken cancellationToken)
    {
        var result = await submissions.SubmitInvoiceAsync(UserId, invoiceId, cancellationToken);
        if (result.Submission is null) return BadRequest(new { code = result.FailureCode, message = result.FailureMessage });
        return result.IsIdempotentReplay ? Ok(result.Submission) : StatusCode(StatusCodes.Status202Accepted, result.Submission);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var items = await db.FiscalDocumentSubmissions.AsNoTracking().OrderByDescending(x => x.AttemptedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(items.Select(View));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        await db.FiscalDocumentSubmissions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) is { } item ? Ok(View(item)) : NotFound();

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static FiscalSubmissionView View(Betcco.Domain.Commerce.FiscalDocumentSubmission x) => new(x.Id, x.InvoiceId, x.CreditNoteId, x.Provider, x.DocumentType.ToString(), x.Status.ToString(), x.AttemptedAtUtc, x.ConfirmedAtUtc, x.ProviderReference, x.ProviderStatusCode, x.FailureCode, x.CorrelationReference);
}
