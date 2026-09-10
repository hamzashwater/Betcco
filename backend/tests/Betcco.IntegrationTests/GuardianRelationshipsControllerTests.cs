using System.Security.Claims;
using System.Text.RegularExpressions;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Betcco.IntegrationTests;

public sealed class GuardianRelationshipsControllerTests
{
    [Fact]
    public async Task Valid_invitation_acceptance_creates_a_pending_relationship_for_a_separate_guardian_account()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var invitation = await fixture.CreateInvitationAsync();

        var accepted = await fixture.ControllerFor(fixture.Guardian).AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None);

        var view = Assert.IsType<GuardianRelationshipView>(Assert.IsType<OkObjectResult>(accepted).Value);
        Assert.Equal(GuardianRelationshipStatus.Pending, view.Status);
        var relationship = await fixture.Db.GuardianRelationships.SingleAsync();
        Assert.Equal(fixture.Student.Id.ToString(), relationship.StudentUserId);
        Assert.Equal(fixture.Guardian.Id.ToString(), relationship.GuardianUserId);
        Assert.NotEqual(relationship.StudentUserId, relationship.GuardianUserId);
        Assert.Equal(GuardianInvitationStatus.Accepted, (await fixture.Db.GuardianInvitations.SingleAsync()).Status);
        Assert.Contains(fixture.Db.AuditLogs, audit => audit.Action == "GuardianInvitationAccepted");
    }

    [Fact]
    public async Task Expired_invitation_is_rejected_and_audited()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var invitation = await fixture.CreateInvitationAsync();
        var stored = await fixture.Db.GuardianInvitations.SingleAsync();
        stored.ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        await fixture.Db.SaveChangesAsync();

        var result = await fixture.ControllerFor(fixture.Guardian).AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(GuardianInvitationStatus.Expired, (await fixture.Db.GuardianInvitations.SingleAsync()).Status);
        Assert.Contains(fixture.Db.AuditLogs, audit => audit.Action == "GuardianInvitationExpired");
        Assert.Empty(await fixture.Db.GuardianRelationships.ToListAsync());
    }

    [Fact]
    public async Task Revoked_invitation_is_rejected_and_cannot_be_accepted()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var invitation = await fixture.CreateInvitationAsync();

        var revoked = await fixture.ControllerFor(fixture.Student).RevokeInvitation(
            invitation.Id,
            new RevokeGuardianInvitationRequest("Invitation was sent to the wrong address."),
            CancellationToken.None);
        var accepted = await fixture.ControllerFor(fixture.Guardian).AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None);

        Assert.IsType<NoContentResult>(revoked);
        Assert.IsType<ConflictObjectResult>(accepted);
        Assert.Equal(GuardianInvitationStatus.Revoked, (await fixture.Db.GuardianInvitations.SingleAsync()).Status);
        Assert.Contains(fixture.Db.AuditLogs, audit => audit.Action == "GuardianInvitationRevoked");
    }

    [Fact]
    public async Task Invitation_cannot_be_reused_after_acceptance()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var invitation = await fixture.CreateInvitationAsync();
        var controller = fixture.ControllerFor(fixture.Guardian);

        Assert.IsType<OkObjectResult>(await controller.AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None));
        var reuse = await controller.AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(reuse);
        Assert.Single(await fixture.Db.GuardianRelationships.ToListAsync());
    }

    [Fact]
    public async Task Invitation_cannot_be_accepted_by_an_unconfirmed_recipient_account()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var invitation = await fixture.CreateInvitationAsync();
        fixture.Guardian.EmailConfirmed = false;
        Assert.True((await fixture.Users.UpdateAsync(fixture.Guardian)).Succeeded);

        var result = await fixture.ControllerFor(fixture.Guardian).AcceptInvitation(
            new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token), CancellationToken.None);

        Assert.IsType<UnauthorizedResult>(result);
        Assert.Equal(GuardianInvitationStatus.Issued, (await fixture.Db.GuardianInvitations.SingleAsync()).Status);
        Assert.Empty(await fixture.Db.GuardianRelationships.ToListAsync());
    }

    [Fact]
    public async Task Valid_guardian_consent_activates_relationship_and_authorizes_only_the_explicit_capability()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var relationship = await fixture.AcceptInvitationAsync();
        var legalDocument = await fixture.CreateLegalDocumentAsync();

        var recorded = await fixture.ControllerFor(fixture.Guardian).RecordConsent(
            relationship.Id,
            new RecordGuardianConsentRequest(
                GuardianAccessCapabilities.RelationshipManagement,
                GuardianConsentDecision.Granted,
                null,
                legalDocument.Id,
                legalDocument.Version),
            CancellationToken.None);

        var view = Assert.IsType<GuardianRelationshipView>(Assert.IsType<OkObjectResult>(recorded).Value);
        Assert.Equal(GuardianRelationshipStatus.Active, view.Status);
        var consent = await fixture.Db.GuardianConsents.SingleAsync();
        Assert.Equal(fixture.Student.Id.ToString(), consent.StudentUserId);
        Assert.Equal(fixture.Guardian.Id.ToString(), consent.GuardianUserId);
        Assert.Equal(legalDocument.Id, consent.LegalDocumentId);
        Assert.Equal(legalDocument.Version, consent.LegalDocumentVersion);
        Assert.Contains(fixture.Db.AuditLogs, audit => audit.Action == "GuardianConsentRecorded");

        var authorizer = new GuardianAccessAuthorizer(fixture.Db);
        Assert.True(await authorizer.CanAccessAsync(
            fixture.Guardian.Id.ToString(),
            fixture.Student.Id.ToString(),
            GuardianAccessCapabilities.RelationshipManagement));
        Assert.False(await authorizer.CanAccessAsync(
            fixture.Guardian.Id.ToString(),
            fixture.Student.Id.ToString(),
            "guardian.student.profile"));

        legalDocument.EnglishContent = "Attempted replacement";
        await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Db.SaveChangesAsync());
    }

    [Fact]
    public async Task Revoked_relationship_loses_guardian_access_and_an_unrelated_guardian_is_denied()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var relationship = await fixture.AcceptAndConsentAsync();
        var authorizer = new GuardianAccessAuthorizer(fixture.Db);

        Assert.False(await authorizer.CanAccessAsync(
            fixture.Guardian.Id.ToString(),
            fixture.UnrelatedUser.Id.ToString(),
            GuardianAccessCapabilities.RelationshipManagement));

        var revoked = await fixture.ControllerFor(fixture.Student).RevokeRelationship(
            relationship.Id,
            new RevokeGuardianRelationshipRequest("Guardian relationship withdrawn by the student."),
            CancellationToken.None);

        Assert.IsType<NoContentResult>(revoked);
        Assert.False(await authorizer.CanAccessAsync(
            fixture.Guardian.Id.ToString(),
            fixture.Student.Id.ToString(),
            GuardianAccessCapabilities.RelationshipManagement));
        Assert.Contains(fixture.Db.AuditLogs, audit => audit.Action == "GuardianRelationshipRevoked");
    }

    [Fact]
    public async Task Unrelated_authenticated_user_cannot_manage_another_guardian_relationship()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var relationship = await fixture.AcceptAndConsentAsync();
        var controller = fixture.ControllerFor(fixture.UnrelatedUser);

        var consentAttempt = await controller.RecordConsent(
            relationship.Id,
            new RecordGuardianConsentRequest(
                GuardianAccessCapabilities.RelationshipManagement,
                GuardianConsentDecision.Withdrawn,
                "An unrelated account must not control this relationship.",
                null,
                null),
            CancellationToken.None);
        var revocationAttempt = await controller.RevokeRelationship(
            relationship.Id,
            new RevokeGuardianRelationshipRequest("An unrelated account must not revoke this relationship."),
            CancellationToken.None);

        Assert.IsType<NotFoundResult>(consentAttempt);
        Assert.IsType<NotFoundResult>(revocationAttempt);
        Assert.Equal(GuardianRelationshipStatus.Active, (await fixture.Db.GuardianRelationships.SingleAsync()).Status);
        Assert.True(await new GuardianAccessAuthorizer(fixture.Db).CanAccessAsync(
            fixture.Guardian.Id.ToString(),
            fixture.Student.Id.ToString(),
            GuardianAccessCapabilities.RelationshipManagement));
    }

    [Fact]
    public async Task Guardian_consent_history_is_preserved_when_consent_is_withdrawn()
    {
        await using var fixture = await GuardianFixture.CreateAsync();
        var relationship = await fixture.AcceptAndConsentAsync();

        var withdrawal = await fixture.ControllerFor(fixture.Guardian).RecordConsent(
            relationship.Id,
            new RecordGuardianConsentRequest(
                GuardianAccessCapabilities.RelationshipManagement,
                GuardianConsentDecision.Withdrawn,
                "The guardian withdrew relationship consent.",
                null,
                null),
            CancellationToken.None);

        var view = Assert.IsType<GuardianRelationshipView>(Assert.IsType<OkObjectResult>(withdrawal).Value);
        Assert.Equal(GuardianRelationshipStatus.Pending, view.Status);
        var history = await fixture.Db.GuardianConsents.OrderBy(item => item.DecidedAtUtc).ToListAsync();
        Assert.Collection(history,
            granted => Assert.Equal(GuardianConsentDecision.Granted, granted.Decision),
            withdrawn =>
            {
                Assert.Equal(GuardianConsentDecision.Withdrawn, withdrawn.Decision);
                Assert.Equal("The guardian withdrew relationship consent.", withdrawn.DecisionReason);
            });

        history[0].DecisionReason = "Attempted rewrite";
        await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Db.SaveChangesAsync());
    }

    private sealed class GuardianFixture : IAsyncDisposable
    {
        private readonly ServiceProvider services;
        private readonly CapturingEmailSender emailSender;
        private readonly IConfiguration configuration;

        public BetccoDbContext Db { get; }
        public UserManager<ApplicationUser> Users { get; }
        public ApplicationUser Student { get; }
        public ApplicationUser Guardian { get; }
        public ApplicationUser UnrelatedUser { get; }

        private GuardianFixture(
            ServiceProvider services,
            CapturingEmailSender emailSender,
            IConfiguration configuration,
            BetccoDbContext db,
            UserManager<ApplicationUser> users,
            ApplicationUser student,
            ApplicationUser guardian,
            ApplicationUser unrelatedUser)
        {
            this.services = services;
            this.emailSender = emailSender;
            this.configuration = configuration;
            Db = db;
            Users = users;
            Student = student;
            Guardian = guardian;
            UnrelatedUser = unrelatedUser;
        }

        public GuardianRelationshipsController ControllerFor(ApplicationUser user) => new(Db, Users, emailSender, configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    RequestServices = services,
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], "Test"))
                }
            }
        };

        public async Task<(Guid Id, string Token)> CreateInvitationAsync()
        {
            var result = await ControllerFor(Student).CreateInvitation(
                new CreateGuardianInvitationRequest(Guardian.Email!),
                CancellationToken.None);
            var view = Assert.IsType<GuardianInvitationView>(Assert.IsType<AcceptedResult>(result).Value);
            return (view.Id, ExtractToken(emailSender.HtmlBody));
        }

        public async Task<GuardianRelationshipView> AcceptInvitationAsync()
        {
            var invitation = await CreateInvitationAsync();
            var result = await ControllerFor(Guardian).AcceptInvitation(
                new AcceptGuardianInvitationRequest(invitation.Id, invitation.Token),
                CancellationToken.None);
            return Assert.IsType<GuardianRelationshipView>(Assert.IsType<OkObjectResult>(result).Value);
        }

        public async Task<GuardianRelationshipView> AcceptAndConsentAsync()
        {
            var relationship = await AcceptInvitationAsync();
            var result = await ControllerFor(Guardian).RecordConsent(
                relationship.Id,
                new RecordGuardianConsentRequest(
                    GuardianAccessCapabilities.RelationshipManagement,
                    GuardianConsentDecision.Granted,
                    null,
                    null,
                    null),
                CancellationToken.None);
            return Assert.IsType<GuardianRelationshipView>(Assert.IsType<OkObjectResult>(result).Value);
        }

        public async Task<LegalDocument> CreateLegalDocumentAsync()
        {
            var document = new LegalDocument
            {
                Slug = $"guardian-consent-{Guid.NewGuid():N}",
                Version = "1.0",
                ArabicTitle = "سياسة موافقة ولي الأمر",
                EnglishTitle = "Guardian consent policy",
                ArabicContent = "نص تجريبي",
                EnglishContent = "Test text",
                IsPublished = true,
                IsCurrent = true
            };
            Db.LegalDocuments.Add(document);
            await Db.SaveChangesAsync();
            return document;
        }

        public static async Task<GuardianFixture> CreateAsync()
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDbContext<BetccoDbContext>(options => options.UseInMemoryDatabase(Guid.NewGuid().ToString()));
            services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 12;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
            })
                .AddRoles<IdentityRole<Guid>>()
                .AddEntityFrameworkStores<BetccoDbContext>();
            var provider = services.BuildServiceProvider();
            var db = provider.GetRequiredService<BetccoDbContext>();
            var users = provider.GetRequiredService<UserManager<ApplicationUser>>();
            var roles = provider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(PlatformRoles.Student))).Succeeded);

            var student = new ApplicationUser
            {
                UserName = "student.guardian@betcco.test",
                Email = "student.guardian@betcco.test",
                DisplayName = "Student",
                EmailConfirmed = true
            };
            var guardian = new ApplicationUser
            {
                UserName = "guardian@betcco.test",
                Email = "guardian@betcco.test",
                DisplayName = "Guardian",
                EmailConfirmed = true
            };
            var unrelatedUser = new ApplicationUser
            {
                UserName = "unrelated@betcco.test",
                Email = "unrelated@betcco.test",
                DisplayName = "Unrelated account",
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(student, "T!estPassword123")).Succeeded);
            Assert.True((await users.CreateAsync(guardian, "T!estPassword123")).Succeeded);
            Assert.True((await users.CreateAsync(unrelatedUser, "T!estPassword123")).Succeeded);
            Assert.True((await users.AddToRoleAsync(student, PlatformRoles.Student)).Succeeded);
            Assert.True((await users.AddToRoleAsync(unrelatedUser, PlatformRoles.Student)).Succeeded);

            var email = new CapturingEmailSender();
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APP_PUBLIC_URL"] = "http://frontend.betcco.test",
                    ["Privacy:GuardianInvitationLifetimeHours"] = "168"
                })
                .Build();
            return new GuardianFixture(provider, email, configuration, db, users, student, guardian, unrelatedUser);
        }

        public async ValueTask DisposeAsync() => await services.DisposeAsync();

        private static string ExtractToken(string? htmlBody)
        {
            var match = Regex.Match(htmlBody ?? string.Empty, "token=([^\"&]+)");
            Assert.True(match.Success, "The guardian invitation email must contain an opaque token.");
            return Uri.UnescapeDataString(match.Groups[1].Value);
        }
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public string? HtmlBody { get; private set; }

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            HtmlBody = htmlBody;
            return Task.CompletedTask;
        }
    }
}
