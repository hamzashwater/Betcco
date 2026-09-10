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
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Betcco.IntegrationTests;

public sealed class PayoutExecutionFoundationTests
{
    [Fact]
    public async Task Approval_authorizes_execution_but_does_not_claim_external_payment()
    {
        await using var db = CreateDb();
        var provider = new TestPayoutProvider(TestOutcome.Success);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedPayoutAsync(db, wallet);

        Assert.True(await wallet.ApprovePayoutAsync("finance", payout.Id, "Approved"));

        var stored = await db.PayoutRequests.SingleAsync();
        Assert.Equal(PayoutStatus.Approved, stored.Status);
        Assert.Null(stored.ProviderPayoutReference);
        Assert.Null(stored.PaidAtUtc);
        Assert.Equal(0, provider.Calls);
        Assert.Single(await db.PayoutStatusTransitions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Fake_execution_confirms_once_preserves_reservation_and_requires_internal_settlement()
    {
        await using var db = CreateDb();
        var provider = new TestPayoutProvider(TestOutcome.Success);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedAndApprovedPayoutAsync(db, wallet);
        var availableBeforeExecution = (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance;

        var executed = await wallet.ExecutePayoutAsync("finance", payout.Id);
        var replay = await wallet.ExecutePayoutAsync("finance", payout.Id);

        Assert.NotNull(executed);
        Assert.Equal("Paid", executed.Status);
        Assert.Equal("Paid", replay!.Status);
        Assert.Equal(1, provider.Calls);
        Assert.Equal(availableBeforeExecution, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);
        var stored = await db.PayoutRequests.SingleAsync();
        Assert.StartsWith("fake_test_payout_", stored.ProviderPayoutReference);
        Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReserved").ToListAsync());
        Assert.Empty(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type != "PayoutReserved").ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());

        var settled = await wallet.SettlePayoutAsync("finance", payout.Id);
        var settledReplay = await wallet.SettlePayoutAsync("finance", payout.Id);
        var settledExecutionReplay = await wallet.ExecutePayoutAsync("finance", payout.Id);
        Assert.Equal("Settled", settled!.Status);
        Assert.Equal("Settled", settledReplay!.Status);
        Assert.Equal("Settled", settledExecutionReplay!.Status);
        Assert.Equal(1, provider.Calls);
        var history = Assert.IsAssignableFrom<IReadOnlyCollection<PayoutTransitionView>>(await wallet.GetPayoutHistoryAsync(payout.Id));
        Assert.Equal(["Approved", "Processing", "Paid", "Settled"], history.Select(item => item.NewStatus).ToArray());
    }

    [Fact]
    public async Task Definite_execution_failure_releases_the_exact_reservation_once_and_preserves_immutable_evidence()
    {
        await using var db = CreateDb();
        var provider = new TestPayoutProvider(TestOutcome.DefiniteFailure);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedAndApprovedPayoutAsync(db, wallet);
        Assert.Equal(50m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);

        var result = await wallet.ExecutePayoutAsync("finance", payout.Id);
        var replay = await wallet.ExecutePayoutAsync("finance", payout.Id);

        Assert.Equal("Failed", result!.Status);
        Assert.Equal("Failed", replay!.Status);
        Assert.Equal(1, provider.Calls);
        var stored = await db.PayoutRequests.SingleAsync();
        Assert.Equal("TEST_DECLINED", stored.ExecutionFailureCode);
        Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReserved").ToListAsync());
        var reversal = Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReversal").ToListAsync());
        Assert.Equal(50m, reversal.Amount);
        Assert.Equal(100m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);
        Assert.Single(await db.WalletTransactions.Where(item => item.UserId == "teacher" && item.Type == "TeacherCourseEarning").ToListAsync());
        Assert.Single(await db.PayoutStatusTransitions.Where(item => item.NewStatus == PayoutStatus.Failed).ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "TeacherPayoutExecutionFailed");
    }

    [Fact]
    public async Task Ambiguous_execution_result_is_durable_and_cannot_blindly_retry()
    {
        await using var db = CreateDb();
        var provider = new TestPayoutProvider(TestOutcome.Unknown);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedAndApprovedPayoutAsync(db, wallet);

        var result = await wallet.ExecutePayoutAsync("finance", payout.Id);
        var replay = await wallet.ExecutePayoutAsync("finance", payout.Id);

        Assert.Equal("ProviderResultUnknown", result!.Status);
        Assert.Equal("ProviderResultUnknown", replay!.Status);
        Assert.Equal(1, provider.Calls);
        var stored = await db.PayoutRequests.SingleAsync();
        Assert.NotNull(stored.ProviderResultUnknownAtUtc);
        Assert.Null(stored.PaidAtUtc);
        Assert.Equal(50m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);
        Assert.Empty(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReversal").ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "TeacherPayoutProviderResultUnknown");
        Assert.Single(await db.PayoutStatusTransitions.Where(item => item.NewStatus == PayoutStatus.ProviderResultUnknown).ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Rejected_payout_cannot_execute_and_execution_history_is_append_only()
    {
        await using var db = CreateDb();
        var provider = new TestPayoutProvider(TestOutcome.Success);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedPayoutAsync(db, wallet);
        Assert.True(await wallet.RejectPayoutAsync("finance", payout.Id, "Rejected"));

        Assert.Null(await wallet.ExecutePayoutAsync("finance", payout.Id));
        Assert.Equal(0, provider.Calls);
        Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReserved").ToListAsync());
        Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReversal" && item.Amount == 50m).ToListAsync());
        Assert.Equal(100m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);
        var transition = Assert.Single(await db.PayoutStatusTransitions.ToListAsync());
        transition.ResultCode = "rewritten";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(transition).State = EntityState.Unchanged;
        db.PayoutStatusTransitions.Remove(transition);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Concurrent_execution_attempt_with_definite_failure_creates_one_reversal_and_never_releases_while_processing()
    {
        await using var db = CreateDb();
        var provider = new BlockingPayoutProvider(TestOutcome.DefiniteFailure);
        var wallet = CreateWallet(db, provider);
        var payout = await RequestedAndApprovedPayoutAsync(db, wallet);

        var first = wallet.ExecutePayoutAsync("finance", payout.Id);
        await provider.Started.Task;
        var second = await wallet.ExecutePayoutAsync("finance", payout.Id);
        Assert.False(await wallet.RejectPayoutAsync("finance", payout.Id, "Too late"));
        Assert.Null(await wallet.SettlePayoutAsync("finance", payout.Id));
        Assert.Empty(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReversal").ToListAsync());
        provider.Complete();
        var firstResult = await first;

        Assert.Equal("Processing", second!.Status);
        Assert.Equal("Failed", firstResult!.Status);
        Assert.Equal(1, provider.Calls);
        Assert.Single(await db.PayoutStatusTransitions.Where(item => item.NewStatus == PayoutStatus.Processing).ToListAsync());
        Assert.Single(await db.PayoutStatusTransitions.Where(item => item.NewStatus == PayoutStatus.Failed).ToListAsync());
        Assert.Single(await db.WalletTransactions.Where(item => item.PayoutRequestId == payout.Id && item.Type == "PayoutReversal" && item.Amount == 50m).ToListAsync());
        Assert.Equal(100m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Arbitrary_payout_status_change_is_rejected_without_transition_evidence()
    {
        await using var db = CreateDb();
        var wallet = CreateWallet(db, new TestPayoutProvider(TestOutcome.Success));
        var payout = await RequestedPayoutAsync(db, wallet);
        var stored = await db.PayoutRequests.SingleAsync(item => item.Id == payout.Id);

        stored.Status = PayoutStatus.Paid;

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        Assert.Empty(await db.PayoutStatusTransitions.ToListAsync());
    }

    [Fact]
    public async Task Production_without_a_real_provider_fails_closed_and_fake_provider_is_rejected_by_startup_validation()
    {
        await using var db = CreateDb();
        var wallet = CreateWallet(db, new UnconfiguredPayoutProvider());
        var payout = await RequestedAndApprovedPayoutAsync(db, wallet);

        await Assert.ThrowsAsync<PayoutProviderUnavailableException>(() => wallet.ExecutePayoutAsync("finance", payout.Id));
        Assert.Equal(PayoutStatus.Approved, (await db.PayoutRequests.SingleAsync()).Status);
        Assert.Empty(await db.PayoutStatusTransitions.Where(item => item.NewStatus == PayoutStatus.Processing).ToListAsync());

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Postgres"] = "Host=localhost;Database=betcco;Username=user;Password=not-used",
            ["APP_PUBLIC_URL"] = "https://betcco.test",
            ["AllowedOrigins:0"] = "https://betcco.test",
            ["DataProtection:KeysPath"] = "/tmp/keys",
            ["Storage:ScannerProvider"] = "ClamAv",
            ["Payouts:Provider"] = "Fake"
        }).Build();
        await Assert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => StartupConfigurationValidator.ThrowIfInvalid(configuration, new ProductionEnvironment())));
    }

    [Fact]
    public async Task Finance_admin_controls_execution_and_no_arbitrary_status_endpoint_exists()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(AdminWalletController).GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("FinanceAdmin", authorization.Policy);
        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageFinance);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.Teacher)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
        Assert.False(context.HasSucceeded);

        var methods = typeof(AdminWalletController).GetMethods().Select(method => method.Name).ToArray();
        Assert.DoesNotContain("UpdateStatus", methods);
        Assert.DoesNotContain("ForcePaid", methods);
        Assert.DoesNotContain("DebitWallet", methods);
    }

    private static async Task<TeacherPayoutView> RequestedAndApprovedPayoutAsync(BetccoDbContext db, WalletService wallet)
    {
        var payout = await RequestedPayoutAsync(db, wallet);
        Assert.True(await wallet.ApprovePayoutAsync("finance", payout.Id, "Approved"));
        return payout;
    }

    private static async Task<TeacherPayoutView> RequestedPayoutAsync(BetccoDbContext db, WalletService wallet)
    {
        db.WalletTransactions.Add(new WalletTransaction { UserId = "teacher", Type = "TeacherCourseEarning", Amount = 100m, Currency = "JOD", Description = "Verified teacher earning" });
        await db.SaveChangesAsync();
        return Assert.IsType<TeacherPayoutView>(await wallet.CreatePayoutRequestAsync("teacher", new CreatePayoutRequest(50m, "BankTransfer", "JO00TESTACCOUNT1234", $"payout-{Guid.NewGuid():N}")));
    }

    private static WalletService CreateWallet(BetccoDbContext db, IPayoutProvider provider)
    {
        var keys = Path.Combine(Path.GetTempPath(), $"betcco-payout-execution-{Guid.NewGuid():N}");
        return new WalletService(db, DataProtectionProvider.Create(new DirectoryInfo(keys)), provider);
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);

    private enum TestOutcome { Success, DefiniteFailure, Unknown }

    private sealed class TestPayoutProvider(TestOutcome outcome) : IPayoutProvider
    {
        public string ProviderName => "FakeTestPayout";
        public bool IsAvailable => true;
        public int Calls { get; private set; }

        public Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default)
        {
            Calls++;
            return outcome switch
            {
                TestOutcome.Success => Task.FromResult(new PayoutTransferResult(ProviderName, $"fake_test_payout_{idempotencyReference}", "TEST_CONFIRMED", true, false)),
                TestOutcome.DefiniteFailure => Task.FromResult(new PayoutTransferResult(ProviderName, null, "TEST_DECLINED", false, true)),
                _ => Task.FromException<PayoutTransferResult>(new PayoutProviderResultUnknownException("Simulated timeout after submission."))
            };
        }
    }

    private sealed class BlockingPayoutProvider(TestOutcome outcome) : IPayoutProvider
    {
        private readonly TaskCompletionSource<PayoutTransferResult> completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<bool> Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public string ProviderName => "FakeTestPayout";
        public bool IsAvailable => true;
        public int Calls { get; private set; }

        public Task<PayoutTransferResult> SendAsync(string destination, decimal amount, string currency, string idempotencyReference, CancellationToken cancellationToken = default)
        {
            Calls++;
            Started.TrySetResult(true);
            return completion.Task;
        }

        public void Complete() => completion.TrySetResult(outcome switch
        {
            TestOutcome.Success => new PayoutTransferResult(ProviderName, "fake_test_payout_blocking", "TEST_CONFIRMED", true, false),
            TestOutcome.DefiniteFailure => new PayoutTransferResult(ProviderName, null, "TEST_DECLINED", false, true),
            _ => throw new InvalidOperationException("Blocking provider does not model an ambiguous completion.")
        });
    }

    private sealed class ProductionEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "BETCCO";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
