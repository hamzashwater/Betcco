using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Identity;

/// <summary>
/// Runtime authorization check for guardian access. This boundary intentionally
/// authorizes no student-data endpoint itself; future endpoints must call it
/// with their explicit capability before reading any student resource.
/// </summary>
public sealed class GuardianAccessAuthorizer(BetccoDbContext db) : IGuardianAccessAuthorizer
{
    public async Task<bool> CanAccessAsync(
        string guardianUserId,
        string studentUserId,
        string capability,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(guardianUserId) ||
            string.IsNullOrWhiteSpace(studentUserId) ||
            string.Equals(guardianUserId, studentUserId, StringComparison.Ordinal) ||
            !GuardianAccessCapabilities.IsSupported(capability))
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow;
        var relationship = await db.GuardianRelationships.AsNoTracking()
            .SingleOrDefaultAsync(item =>
                item.GuardianUserId == guardianUserId &&
                item.StudentUserId == studentUserId &&
                item.Status == GuardianRelationshipStatus.Active &&
                (item.ExpiresAtUtc == null || item.ExpiresAtUtc > now), cancellationToken);
        if (relationship is null) return false;

        var latestConsent = await db.GuardianConsents.AsNoTracking()
            .Where(item => item.GuardianRelationshipId == relationship.Id && item.Capability == capability)
            .OrderByDescending(item => item.DecidedAtUtc)
            .ThenByDescending(item => item.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (latestConsent?.Decision != GuardianConsentDecision.Granted) return false;

        if (latestConsent.LegalDocumentId is null) return true;

        var acceptedDocument = await db.LegalDocuments.AsNoTracking()
            .SingleOrDefaultAsync(document =>
                document.Id == latestConsent.LegalDocumentId &&
                document.Version == latestConsent.LegalDocumentVersion,
                cancellationToken);
        if (acceptedDocument is null) return false;

        // A new version only affects the decision when the policy owner has
        // explicitly marked that version as requiring renewed acceptance.
        var currentDocument = await db.LegalDocuments.AsNoTracking()
            .SingleOrDefaultAsync(document => document.Slug == acceptedDocument.Slug && document.IsPublished && document.IsCurrent,
                cancellationToken);
        return currentDocument is null || !currentDocument.RequiresReacceptance || currentDocument.Id == acceptedDocument.Id;
    }
}
