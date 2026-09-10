using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Api.Controllers;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class LegalDocumentApiTests
{
    [Fact]
    public async Task Required_documents_return_current_versions_in_the_requested_locale()
    {
        await using var db = CreateDb();
        db.LegalDocuments.AddRange(
            Document("terms", "1.0", "الشروط والأحكام", "Terms and conditions"),
            Document("privacy", "1.0", "سياسة الخصوصية", "Privacy policy"),
            Document("cookies", "1.0", "ملفات تعريف الارتباط", "Cookie policy"));
        await db.SaveChangesAsync();

        var result = await new LegalController(db).GetRequired("en");

        var response = Assert.IsType<OkObjectResult>(result);
        var documents = Assert.IsAssignableFrom<IEnumerable<LegalDocumentSummary>>(response.Value).OrderBy(document => document.Slug).ToArray();
        Assert.Collection(
            documents,
            document =>
            {
                Assert.Equal("privacy", document.Slug);
                Assert.Equal("1.0", document.Version);
                Assert.Equal("Privacy policy", document.Title);
            },
            document =>
            {
                Assert.Equal("terms", document.Slug);
                Assert.Equal("1.0", document.Version);
                Assert.Equal("Terms and conditions", document.Title);
            });
    }

    [Fact]
    public async Task Published_document_is_available_in_arabic_but_unpublished_document_is_not()
    {
        await using var db = CreateDb();
        db.LegalDocuments.Add(Document("terms", "1.1", "الشروط والأحكام", "Terms and conditions"));
        db.LegalDocuments.Add(Document("draft", "1.0", "مسودة", "Draft", isPublished: false));
        await db.SaveChangesAsync();

        var published = await new LegalController(db).Get("terms", "ar");
        var missing = await new LegalController(db).Get("draft", "ar");

        var response = Assert.IsType<OkObjectResult>(published);
        var document = Assert.IsType<LegalDocumentView>(response.Value);
        Assert.Equal("الشروط والأحكام", document.Title);
        Assert.Equal("نص عربي", document.Content);
        Assert.IsType<NotFoundResult>(missing);
    }

    [Fact]
    public async Task Publishing_version_two_preserves_version_one_and_its_acceptance_reference()
    {
        await using var db = CreateDb();
        var versionOne = Document("terms", "1.0", "الشروط", "Terms", englishContent: "Version one text");
        db.LegalDocuments.Add(versionOne);
        await db.SaveChangesAsync();
        db.LegalAcceptances.Add(new LegalAcceptance
        {
            UserId = "existing-user",
            LegalDocumentId = versionOne.Id,
            Version = versionOne.Version
        });
        await db.SaveChangesAsync();

        var publish = await AdminController(db).Upsert("terms", VersionRequest("2.0", "Version two text", requiresReacceptance: true), CancellationToken.None);
        Assert.IsType<NoContentResult>(publish);

        var versions = await db.LegalDocuments.Where(document => document.Slug == "terms").OrderBy(document => document.Version).ToListAsync();
        Assert.Collection(versions,
            version =>
            {
                Assert.Equal("1.0", version.Version);
                Assert.Equal("Version one text", version.EnglishContent);
                Assert.True(version.IsPublished);
                Assert.False(version.IsCurrent);
            },
            version =>
            {
                Assert.Equal("2.0", version.Version);
                Assert.Equal("Version two text", version.EnglishContent);
                Assert.True(version.IsPublished);
                Assert.True(version.IsCurrent);
                Assert.True(version.RequiresReacceptance);
            });

        var acceptance = await db.LegalAcceptances.SingleAsync();
        Assert.Equal(versionOne.Id, acceptance.LegalDocumentId);
        Assert.Equal("1.0", acceptance.Version);

        var overwrite = await AdminController(db).Upsert("terms", VersionRequest("1.0", "Silently changed text"), CancellationToken.None);
        Assert.IsType<ConflictObjectResult>(overwrite);
    }

    [Fact]
    public async Task Current_version_reacceptance_status_is_evaluated_against_the_specific_accepted_version()
    {
        await using var db = CreateDb();
        var versionOne = Document("terms", "1.0", "الشروط", "Terms");
        db.LegalDocuments.Add(versionOne);
        await db.SaveChangesAsync();
        db.LegalAcceptances.Add(new LegalAcceptance
        {
            UserId = "existing-user",
            LegalDocumentId = versionOne.Id,
            Version = versionOne.Version
        });
        await db.SaveChangesAsync();

        Assert.IsType<NoContentResult>(await AdminController(db).Upsert("terms", VersionRequest("2.0", "Version two text", requiresReacceptance: true), CancellationToken.None));
        var versionTwo = await db.LegalDocuments.SingleAsync(document => document.Slug == "terms" && document.Version == "2.0");

        var existingStatus = await UserController(db, "existing-user").GetRequiredAcceptanceStatus(CancellationToken.None);
        var existingTerms = Assert.Single(Assert.IsAssignableFrom<IEnumerable<RequiredLegalAcceptanceStatus>>(Assert.IsType<OkObjectResult>(existingStatus).Value));
        Assert.True(existingTerms.RequiresReacceptance);
        Assert.False(existingTerms.HasAcceptedCurrentVersion);
        Assert.True(existingTerms.RequiresAcceptance);

        db.LegalAcceptances.Add(new LegalAcceptance
        {
            UserId = "new-user",
            LegalDocumentId = versionTwo.Id,
            Version = versionTwo.Version
        });
        await db.SaveChangesAsync();

        var newUserStatus = await UserController(db, "new-user").GetRequiredAcceptanceStatus(CancellationToken.None);
        var newUserTerms = Assert.Single(Assert.IsAssignableFrom<IEnumerable<RequiredLegalAcceptanceStatus>>(Assert.IsType<OkObjectResult>(newUserStatus).Value));
        Assert.True(newUserTerms.HasAcceptedCurrentVersion);
        Assert.False(newUserTerms.RequiresAcceptance);
    }

    [Fact]
    public async Task Current_version_without_reacceptance_does_not_mark_existing_users_as_needing_acceptance()
    {
        await using var db = CreateDb();
        var versionOne = Document("privacy", "1.0", "الخصوصية", "Privacy");
        db.LegalDocuments.Add(versionOne);
        await db.SaveChangesAsync();
        db.LegalAcceptances.Add(new LegalAcceptance
        {
            UserId = "existing-user",
            LegalDocumentId = versionOne.Id,
            Version = versionOne.Version
        });
        await db.SaveChangesAsync();

        Assert.IsType<NoContentResult>(await AdminController(db).Upsert("privacy", VersionRequest("2.0", "Clarified text"), CancellationToken.None));

        var status = await UserController(db, "existing-user").GetRequiredAcceptanceStatus(CancellationToken.None);
        var privacy = Assert.Single(Assert.IsAssignableFrom<IEnumerable<RequiredLegalAcceptanceStatus>>(Assert.IsType<OkObjectResult>(status).Value));
        Assert.False(privacy.HasAcceptedCurrentVersion);
        Assert.False(privacy.RequiresReacceptance);
        Assert.False(privacy.RequiresAcceptance);
    }

    [Fact]
    public async Task Accepted_version_content_cannot_be_silently_overwritten_through_the_db_context()
    {
        await using var db = CreateDb();
        var document = Document("privacy", "1.0", "الخصوصية", "Privacy");
        db.LegalDocuments.Add(document);
        await db.SaveChangesAsync();
        db.LegalAcceptances.Add(new LegalAcceptance
        {
            UserId = "learner",
            LegalDocumentId = document.Id,
            Version = document.Version
        });
        await db.SaveChangesAsync();

        document.EnglishContent = "Replacement content";

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public void Legal_version_publication_requires_the_admin_authorization_policy()
    {
        var action = typeof(LegalController).GetMethod(nameof(LegalController.Upsert));

        var authorization = Assert.Single(action!.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).Cast<AuthorizeAttribute>());

        Assert.Equal("Admin", authorization.Policy);
    }

    [Fact]
    public async Task Non_admin_user_cannot_satisfy_the_legal_version_publication_policy()
    {
        var requirement = new RolesAuthorizationRequirement([PlatformRoles.Admin]);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);

        await requirement.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private static LegalDocument Document(string slug, string version, string arabicTitle, string englishTitle, bool isPublished = true, string englishContent = "English text") => new()
    {
        Slug = slug,
        Version = version,
        ArabicTitle = arabicTitle,
        EnglishTitle = englishTitle,
        ArabicContent = "نص عربي",
        EnglishContent = englishContent,
        IsPublished = isPublished,
        IsCurrent = isPublished
    };

    private static LegalController AdminController(BetccoDbContext db) => ControllerFor(db, "admin", "Admin");

    private static LegalController UserController(BetccoDbContext db, string userId) => ControllerFor(db, userId, "Student");

    private static LegalController ControllerFor(BetccoDbContext db, string userId, string role) => new(db)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)], "Test"))
            }
        }
    };

    private static UpdateLegalDocumentRequest VersionRequest(string version, string englishContent, bool requiresReacceptance = false) => new(
        version,
        "نص عربي",
        "Terms",
        "نص عربي",
        englishContent,
        DateTimeOffset.Parse("2026-09-07T00:00:00Z"),
        true,
        requiresReacceptance);

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
