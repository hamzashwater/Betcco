using System.Net;
using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Configuration;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Betcco.IntegrationTests;

public sealed class JoFotaraFiscalAdapterFoundationTests
{
    [Fact]
    public async Task Eligible_issued_invoice_reaches_provider_from_immutable_snapshot_and_is_accepted_once()
    {
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db); var provider = new TestProvider(TestOutcome.Accepted);
        var service = new FiscalSubmissionService(db, provider);
        var result = await service.SubmitInvoiceAsync("finance", invoice.Id);
        var replay = await service.SubmitInvoiceAsync("finance", invoice.Id);

        Assert.Equal(FiscalSubmissionStatus.Accepted.ToString(), result.Submission!.Status);
        Assert.True(replay.IsIdempotentReplay); Assert.Equal(1, provider.Calls);
        Assert.Equal(invoice.Total, provider.Request!.Total); Assert.Equal(invoice.Tax, provider.Request.Tax); Assert.Equal(invoice.Currency, provider.Request.Currency);
        Assert.Single(await db.FiscalDocumentSubmissions.ToListAsync()); Assert.Equal(2, await db.FiscalDocumentSubmissionTransitions.CountAsync());
        Assert.Contains(db.AuditLogs, x => x.Action == "FiscalSubmissionAccepted");
    }

    [Fact]
    public async Task Non_paid_invoice_is_rejected_without_submission()
    {
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db, PaymentStatus.Failed); var provider = new TestProvider(TestOutcome.Accepted);
        var result = await new FiscalSubmissionService(db, provider).SubmitInvoiceAsync("finance", invoice.Id);
        Assert.Equal("FISCAL_INVOICE_NOT_ELIGIBLE", result.FailureCode); Assert.Equal(0, provider.Calls); Assert.Empty(await db.FiscalDocumentSubmissions.ToListAsync());
    }

    [Fact]
    public async Task Rejection_preserves_invoice_and_creates_no_financial_effects()
    {
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db); var provider = new TestProvider(TestOutcome.Rejected);
        var result = await new FiscalSubmissionService(db, provider).SubmitInvoiceAsync("finance", invoice.Id);
        Assert.Equal(FiscalSubmissionStatus.Rejected.ToString(), result.Submission!.Status); Assert.Equal("TEST_REJECTED", result.Submission.FailureCode);
        Assert.Equal(0, await db.WalletTransactions.CountAsync()); Assert.Equal(0, await db.LedgerTransactions.CountAsync());
        Assert.Equal(95m, (await db.Invoices.SingleAsync()).Total);
    }

    [Fact]
    public async Task Timeout_is_unknown_and_is_never_blindly_resubmitted()
    {
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db); var provider = new TestProvider(TestOutcome.Unknown); var service = new FiscalSubmissionService(db, provider);
        var first = await service.SubmitInvoiceAsync("finance", invoice.Id); var replay = await service.SubmitInvoiceAsync("finance", invoice.Id);
        Assert.Equal(FiscalSubmissionStatus.ProviderResultUnknown.ToString(), first.Submission!.Status); Assert.True(replay.IsIdempotentReplay); Assert.Equal(1, provider.Calls);
    }

    [Fact]
    public async Task Official_transport_uses_backend_only_headers_and_never_claims_acceptance_from_unconfirmed_response()
    {
        var handler = new CapturingHandler();
        var options = Options.Create(new JoFotaraOptions { Enabled = true, Environment = "Production", BaseUrl = "https://backend.jofotara.gov.jo", ClientId = "client-test", SecretKey = "secret-test" });
        var provider = new JoFotaraFiscalInvoiceProvider(new HttpClient(handler) { BaseAddress = new Uri("https://backend.jofotara.gov.jo/") }, options);
        var result = await provider.SubmitEncodedInvoiceAsync("officially-approved-encoded-document");
        Assert.Equal("Client-Id", handler.HeaderNames.Single(x => x.Equals("Client-Id", StringComparison.OrdinalIgnoreCase))); Assert.Contains("Secret-Key", handler.HeaderNames);
        Assert.False(result.IsAccepted); Assert.True(result.RequiresReview); Assert.DoesNotContain("secret-test", Json(result));
    }

    [Fact]
    public async Task Missing_official_ubl_tax_mapping_fails_closed_and_credit_note_submission_has_no_route()
    {
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db);
        var options = Options.Create(new JoFotaraOptions { Enabled = true, Environment = "Production", BaseUrl = "https://backend.jofotara.gov.jo", ClientId = "client-test", SecretKey = "secret-test" });
        var result = await new FiscalSubmissionService(db, new JoFotaraFiscalInvoiceProvider(new HttpClient(new CapturingHandler()) { BaseAddress = new Uri("https://backend.jofotara.gov.jo/") }, options)).SubmitInvoiceAsync("finance", invoice.Id);
        Assert.Equal(FiscalSubmissionStatus.RequiresReview.ToString(), result.Submission!.Status); Assert.Equal("JOFOtARA_UBL_MAPPING_REQUIRES_APPROVED_BUSINESS_DATA", result.Submission.FailureCode);
        Assert.DoesNotContain(typeof(FiscalSubmissionsController).GetMethods(), method => method.Name.Contains("Credit", StringComparison.Ordinal));
    }

    [Fact]
    public void Production_enabled_without_credentials_fails_closed_without_disclosing_them()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Postgres"] = "Host=db;Database=x;Username=x;Password=not-logged", ["APP_PUBLIC_URL"] = "https://betcco.test", ["AllowedOrigins:0"] = "https://betcco.test", ["DataProtection:KeysPath"] = "/tmp/keys", ["Storage:ScannerProvider"] = "ClamAv", ["Payments:Provider"] = "PayTabs", ["PayTabs:ProfileId"] = "1", ["PayTabs:ServerKey"] = "payment-secret", ["PayTabs:BaseUrl"] = "https://secure-jordan.paytabs.com", ["PayTabs:Environment"] = "Test", ["Payouts:Provider"] = "Real", ["JoFotara:Enabled"] = "true", ["JoFotara:Environment"] = "Production", ["JoFotara:BaseUrl"] = "https://backend.jofotara.gov.jo", ["JoFotara:ClientId"] = "", ["JoFotara:SecretKey"] = "" }).Build();
        var exception = Assert.Throws<InvalidOperationException>(() => StartupConfigurationValidator.ThrowIfInvalid(config, new ProductionEnvironment()));
        Assert.Contains("JoFotara:ClientId", exception.Message); Assert.DoesNotContain("payment-secret", exception.Message);
    }

    [Fact]
    public async Task Finance_admin_only_surface_and_submission_history_are_immutable()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(FiscalSubmissionsController).GetCustomAttributes(typeof(AuthorizeAttribute), true))); Assert.Equal("FinanceAdmin", authorization.Policy);
        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageFinance); var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.Student)], "Test")), null); await new PlatformPermissionAuthorizationHandler().HandleAsync(context); Assert.False(context.HasSucceeded);
        await using var db = CreateDb(); var invoice = await AddEligibleInvoiceAsync(db); var service = new FiscalSubmissionService(db, new TestProvider(TestOutcome.Accepted)); await service.SubmitInvoiceAsync("finance", invoice.Id);
        var submission = await db.FiscalDocumentSubmissions.SingleAsync(); submission.BusinessIdentity = "rewritten"; await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    private static async Task<Invoice> AddEligibleInvoiceAsync(BetccoDbContext db, PaymentStatus paymentStatus = PaymentStatus.Paid)
    {
        var payment = new Payment { UserId = "student", Purpose = "CourseCart", ReferenceId = Guid.NewGuid(), Status = paymentStatus, Subtotal = 100m, Discount = 10m, Tax = 5m, Total = 95m, Currency = "JOD", LineItemsJson = "[]" }; db.Payments.Add(payment);
        var invoice = new Invoice { PaymentId = payment.Id, Number = $"BET-INV-{Guid.NewGuid():N}", CustomerUserId = "student", Subtotal = 100m, Discount = 10m, Tax = 5m, Total = 95m, Currency = "JOD", CorrelationReference = $"invoice:{payment.Id:N}" }; invoice.Lines.Add(new InvoiceLine { Sequence = 1, ItemType = "CourseCart", ItemReferenceId = payment.ReferenceId, Amount = 100m, SnapshotJson = "[]" }); db.Invoices.Add(invoice); await db.SaveChangesAsync(); return invoice;
    }
    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static string Json(object value) => System.Text.Json.JsonSerializer.Serialize(value);
    private enum TestOutcome { Accepted, Rejected, Unknown }
    private sealed class TestProvider(TestOutcome outcome) : IFiscalInvoiceProvider { public string ProviderName => "JoFotara"; public int Calls { get; private set; } public FiscalInvoiceSubmissionRequest? Request { get; private set; } public Task<FiscalProviderSubmissionResult> SubmitInvoiceAsync(FiscalInvoiceSubmissionRequest request, CancellationToken cancellationToken = default) { Calls++; Request = request; return outcome switch { TestOutcome.Accepted => Task.FromResult(new FiscalProviderSubmissionResult("JoFotara", "official-ref", "ACCEPTED", true, false, false)), TestOutcome.Rejected => Task.FromResult(new FiscalProviderSubmissionResult("JoFotara", null, "REJECTED", false, true, false, "TEST_REJECTED")), _ => Task.FromException<FiscalProviderSubmissionResult>(new FiscalProviderResultUnknownException("timeout")) }; } }
    private sealed class CapturingHandler : HttpMessageHandler { public List<string> HeaderNames { get; } = []; protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) { HeaderNames.AddRange(request.Headers.Select(x => x.Key)); return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") }); } }
    private sealed class ProductionEnvironment : IHostEnvironment { public string EnvironmentName { get; set; } = Environments.Production; public string ApplicationName { get; set; } = "Tests"; public string ContentRootPath { get; set; } = ""; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider(); }
}
