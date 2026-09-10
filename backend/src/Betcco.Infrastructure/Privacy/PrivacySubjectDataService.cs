using Betcco.Application.Privacy;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Privacy;

/// <summary>
/// One owner-scoped source for the supported Access and Portability domains.
/// It deliberately omits identity credentials, sessions, tokens, audit logs,
/// staff-only records, and all educational, financial, and security data.
/// </summary>
public sealed class PrivacySubjectDataService(BetccoDbContext db) : IPrivacySubjectDataService
{
    public async Task<PrivacySubjectDataSnapshot?> GetSupportedDataAsync(string subjectUserId, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(subjectUserId, out var userId)) return null;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null) return null;

        var legalAcceptances = await (
            from acceptance in db.LegalAcceptances.AsNoTracking()
            join document in db.LegalDocuments.AsNoTracking() on acceptance.LegalDocumentId equals document.Id
            where acceptance.UserId == subjectUserId
            orderby acceptance.AcceptedAtUtc descending
            select new PrivacySubjectLegalAcceptanceData(document.Slug, acceptance.Version, acceptance.AcceptedAtUtc))
            .ToListAsync(cancellationToken);
        var consentHistory = await db.ConsentRecords.AsNoTracking()
            .Where(item => item.UserId == subjectUserId)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new PrivacySubjectConsentData(item.Purpose, item.Decision, item.PolicyVersion, item.CaptureMethod, item.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return new(
            new(user.DisplayName, user.Email, user.PhoneDisplay, user.CountryCode, user.Gender, user.DateOfBirth),
            new(user.MarketingConsent, user.MarketingConsentAtUtc),
            legalAcceptances,
            consentHistory);
    }
}
