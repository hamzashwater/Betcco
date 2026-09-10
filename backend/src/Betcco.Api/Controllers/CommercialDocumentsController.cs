using Betcco.Application.Commerce;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "FinanceAdmin")]
[Route("api/v1/admin/commercial-documents")]
public sealed class CommercialDocumentsController(ICommercialDocumentService documents, BetccoDbContext db) : ControllerBase
{
    [HttpPost("invoices/{paymentId:guid}/issue")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> IssueInvoice(Guid paymentId, CancellationToken cancellationToken)
    {
        var result = await documents.IssueInvoiceAsync(UserId, paymentId, cancellationToken);
        if (result.Document is null) return BadRequest(new { code = result.FailureCode, message = result.FailureMessage });
        return result.IsIdempotentReplay ? Ok(result.Document) : StatusCode(StatusCodes.Status201Created, result.Document);
    }

    [HttpPost("credit-notes/{refundId:guid}/issue")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> IssueCreditNote(Guid refundId, CancellationToken cancellationToken)
    {
        var result = await documents.IssueCreditNoteAsync(UserId, refundId, cancellationToken);
        if (result.Document is null) return BadRequest(new { code = result.FailureCode, message = result.FailureMessage });
        return result.IsIdempotentReplay ? Ok(result.Document) : StatusCode(StatusCodes.Status201Created, result.Document);
    }

    [HttpGet("invoices")]
    public async Task<IActionResult> ListInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var invoices = await db.Invoices.AsNoTracking().Include(item => item.Lines).OrderByDescending(item => item.IssuedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(invoices.Select(ToView));
    }

    [HttpGet("invoices/{id:guid}")]
    public async Task<IActionResult> GetInvoice(Guid id, CancellationToken cancellationToken) =>
        await db.Invoices.AsNoTracking().Include(item => item.Lines).SingleOrDefaultAsync(item => item.Id == id, cancellationToken) is { } invoice ? Ok(ToView(invoice)) : NotFound();

    [HttpGet("credit-notes")]
    public async Task<IActionResult> ListCreditNotes([FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var notes = await db.CreditNotes.AsNoTracking().OrderByDescending(item => item.IssuedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(notes.Select(ToView));
    }

    [HttpGet("credit-notes/{id:guid}")]
    public async Task<IActionResult> GetCreditNote(Guid id, CancellationToken cancellationToken) =>
        await db.CreditNotes.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id, cancellationToken) is { } note ? Ok(ToView(note)) : NotFound();

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static InvoiceView ToView(Betcco.Domain.Commerce.Invoice invoice) => new(invoice.Id, invoice.PaymentId, invoice.Number, invoice.CustomerUserId, invoice.IssuedAtUtc, invoice.Status.ToString(), invoice.Subtotal, invoice.Discount, invoice.Tax, invoice.Total, invoice.Currency, invoice.CorrelationReference, invoice.Lines.OrderBy(line => line.Sequence).Select(line => new InvoiceLineView(line.Sequence, line.ItemType, line.ItemReferenceId, line.Amount, line.SnapshotJson)).ToArray());
    private static CreditNoteView ToView(Betcco.Domain.Commerce.CreditNote note) => new(note.Id, note.InvoiceId, note.RefundId, note.Number, note.IssuedAtUtc, note.Status.ToString(), note.Amount, note.Currency, note.CorrelationReference);
}
