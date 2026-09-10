using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

public sealed class PrivacyPortabilityControllerTests
{
    [Fact]
    public async Task Unverified_portability_request_cannot_generate_an_export()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = new DataSubjectRequest
        {
            OwnerUserId = owner.Id.ToString(),
            RequestType = DataSubjectRequestType.Portability,
            Status = DataSubjectRequestStatus.InReview
        };
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await ControllerFor(db, new MemoryPrivateFileStorage(), PrivacyAdminId).Generate(request.Id, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        Assert.Empty(await db.DataPortabilityExports.ToListAsync());
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
    }

    [Fact]
    public async Task Released_export_is_owner_scoped_private_and_excludes_sensitive_or_other_user_data()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        owner.PasswordHash = "owner-secret-password-hash";
        var other = User("Other", "other@betcco.test");
        db.Users.AddRange(owner, other);
        var request = Request(owner);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();
        var storage = new MemoryPrivateFileStorage();
        var staff = ControllerFor(db, storage, PrivacyAdminId);

        var generated = Assert.IsType<DataPortabilityExportView>(Assert.IsType<OkObjectResult>(await staff.Generate(request.Id, CancellationToken.None)).Value);
        var released = Assert.IsType<DataPortabilityExportView>(Assert.IsType<OkObjectResult>(await staff.Release(request.Id, CancellationToken.None)).Value);
        var storedJson = storage.SingleContent();

        Assert.Equal(owner.Id.ToString(), generated.SubjectUserId);
        Assert.Equal(DataPortabilityExportStatus.Released, released.Status);
        Assert.DoesNotContain("StorageKey", JsonSerializer.Serialize(released), StringComparison.Ordinal);
        Assert.Contains("owner@betcco.test", storedJson, StringComparison.Ordinal);
        Assert.DoesNotContain("other@betcco.test", storedJson, StringComparison.Ordinal);
        Assert.DoesNotContain("owner-secret-password-hash", storedJson, StringComparison.Ordinal);
        Assert.DoesNotContain("PasswordHash", storedJson, StringComparison.Ordinal);
        Assert.DoesNotContain("SecurityStamp", storedJson, StringComparison.Ordinal);
        Assert.DoesNotContain("Token", storedJson, StringComparison.Ordinal);

        Assert.IsType<NotFoundResult>(await ControllerFor(db, storage, other.Id.ToString()).Download(request.Id, CancellationToken.None));
        Assert.IsType<FileStreamResult>(await ControllerFor(db, storage, owner.Id.ToString()).Download(request.Id, CancellationToken.None));
        var export = await db.DataPortabilityExports.SingleAsync();
        Assert.Equal(1, export.DownloadCount);
        Assert.Equal(owner.Id.ToString(), export.DownloadedByUserId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataPortabilityExportGenerated" && audit.ActorUserId == PrivacyAdminId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataPortabilityExportReleased" && audit.ActorUserId == PrivacyAdminId);
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataPortabilityExportDownloaded" && audit.ActorUserId == owner.Id.ToString());
    }

    [Fact]
    public async Task Expired_export_cannot_be_downloaded()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner);
        db.DataSubjectRequests.Add(request);
        var storage = new MemoryPrivateFileStorage();
        var key = await storage.SavePrivateAsync(new MemoryStream(Encoding.UTF8.GetBytes("{}")), "application/json");
        db.DataPortabilityExports.Add(new DataPortabilityExport
        {
            DataSubjectRequestId = request.Id,
            SubjectUserId = owner.Id.ToString(),
            Status = DataPortabilityExportStatus.Released,
            RequestedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            RequestedByUserId = PrivacyAdminId,
            GeneratedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            GeneratedByUserId = PrivacyAdminId,
            ExportFormat = "application/json",
            ExportVersion = "betcco-portability-v1",
            StorageKey = key,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
            ReleasedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            ReleasedByUserId = PrivacyAdminId
        });
        await db.SaveChangesAsync();

        var result = await ControllerFor(db, storage, owner.Id.ToString()).Download(request.Id, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.Equal(0, (await db.DataPortabilityExports.SingleAsync()).DownloadCount);
        Assert.DoesNotContain(db.AuditLogs, audit => audit.Action == "DataPortabilityExportDownloaded");
    }

    [Fact]
    public async Task Storage_generation_failure_is_recorded_without_a_fulfillment_artifact()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await ControllerFor(db, new UnavailablePrivateFileStorage(), PrivacyAdminId).Generate(request.Id, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        var export = await db.DataPortabilityExports.SingleAsync();
        Assert.Equal(DataPortabilityExportStatus.GenerationFailed, export.Status);
        Assert.NotNull(export.FailureReason);
        Assert.Empty(await db.DataSubjectFulfillments.ToListAsync());
        Assert.Contains(db.AuditLogs, audit => audit.Action == "DataPortabilityExportGenerationFailed" && audit.Outcome == "Failure");
    }

    [Fact]
    public async Task Repeated_generation_is_idempotent_and_completion_requires_released_fulfillment_evidence()
    {
        await using var db = CreateDb();
        var owner = User("Owner", "owner@betcco.test");
        db.Users.Add(owner);
        var request = Request(owner);
        db.DataSubjectRequests.Add(request);
        await db.SaveChangesAsync();
        var storage = new MemoryPrivateFileStorage();
        var controller = ControllerFor(db, storage, PrivacyAdminId);

        Assert.IsType<ConflictObjectResult>(await PrivacyControllerFor(db, PrivacyAdminId).Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "No portability artifact has been released.", false), CancellationToken.None));
        var first = Assert.IsType<DataPortabilityExportView>(Assert.IsType<OkObjectResult>(await controller.Generate(request.Id, CancellationToken.None)).Value);
        var repeated = Assert.IsType<DataPortabilityExportView>(Assert.IsType<OkObjectResult>(await controller.Generate(request.Id, CancellationToken.None)).Value);

        Assert.Equal(first.Id, repeated.Id);
        Assert.Single(await db.DataPortabilityExports.ToListAsync());
        Assert.Single(await db.DataSubjectFulfillments.ToListAsync());
        Assert.Equal(1, storage.Count);
        Assert.IsType<OkObjectResult>(await controller.Release(request.Id, CancellationToken.None));
        var completed = await PrivacyControllerFor(db, PrivacyAdminId).Review(request.Id,
            new(DataSubjectRequestStatus.Completed, "Private JSON portability export released.", false), CancellationToken.None);
        Assert.Equal(DataSubjectRequestStatus.Completed, Assert.IsType<PrivacyRequestView>(Assert.IsType<OkObjectResult>(completed).Value).Status);
    }

    [Fact]
    public async Task Portability_generation_and_release_require_privacy_administrator_and_download_requires_authentication()
    {
        var classAuthorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyPortabilityController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Null(classAuthorization.Policy);
        foreach (var methodName in new[] { nameof(PrivacyPortabilityController.Generate), nameof(PrivacyPortabilityController.Release) })
        {
            var attribute = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PrivacyPortabilityController)
                .GetMethod(methodName)!.GetCustomAttributes(typeof(AuthorizeAttribute), true)));
            Assert.Equal("PrivacyAdmin", attribute.Policy);
        }

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private const string PrivacyAdminId = "privacy-admin";

    private static ApplicationUser User(string displayName, string email) => new()
    {
        Id = Guid.NewGuid(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        DisplayName = displayName,
        PhoneDisplay = "+962700000000",
        CountryCode = "JO",
        Gender = "PreferNotToSay",
        DateOfBirth = new DateOnly(2000, 1, 1)
    };

    private static DataSubjectRequest Request(ApplicationUser owner) => new()
    {
        OwnerUserId = owner.Id.ToString(),
        RequestType = DataSubjectRequestType.Portability,
        Status = DataSubjectRequestStatus.InReview,
        IdentityVerifiedAtUtc = DateTimeOffset.UtcNow,
        IdentityVerifiedByUserId = PrivacyAdminId
    };

    private static PrivacyPortabilityController ControllerFor(BetccoDbContext db, IFileStorage storage, string userId) => new(
        new DataPortabilityExportService(db, storage, new PrivacySubjectDataService(db), Configuration()))
    {
        ControllerContext = ControllerContextFor(userId)
    };

    private static PrivacyController PrivacyControllerFor(BetccoDbContext db, string userId) => new(db)
    {
        ControllerContext = ControllerContextFor(userId)
    };

    private static ControllerContext ControllerContextFor(string userId) => new()
    {
        HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, PlatformRoles.SystemAdmin)], "Test"))
        }
    };

    private static IConfiguration Configuration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Privacy:PortabilityExportLifetimeHours"] = "24" })
        .Build();

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private sealed class MemoryPrivateFileStorage : IFileStorage
    {
        private readonly Dictionary<string, byte[]> contents = new(StringComparer.Ordinal);
        public int Count => contents.Count;

        public async Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            await using var copy = new MemoryStream();
            await content.CopyToAsync(copy, cancellationToken);
            var key = Guid.NewGuid().ToString("N");
            contents.Add(key, copy.ToArray());
            return key;
        }

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(contents.TryGetValue(storageKey, out var content) ? new MemoryStream(content, writable: false) : null);

        public string SingleContent() => Encoding.UTF8.GetString(Assert.Single(contents).Value);
    }

    private sealed class UnavailablePrivateFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) =>
            throw new IOException("Storage is unavailable.");

        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream?>(null);
    }
}
