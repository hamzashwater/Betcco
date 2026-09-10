using Betcco.Domain.Common;

namespace Betcco.Application.Privacy;

/// <summary>
/// The intentionally small set of account and privacy-history domains that
/// BETCCO can currently attribute to one authenticated data subject without
/// including credentials, security records, staff material, or other users.
/// </summary>
public sealed record PrivacySubjectDataSnapshot(
    PrivacySubjectProfileData Profile,
    PrivacySubjectPreferencesData PrivacyPreferences,
    IReadOnlyCollection<PrivacySubjectLegalAcceptanceData> LegalAcceptances,
    IReadOnlyCollection<PrivacySubjectConsentData> OptionalConsentHistory);

public sealed record PrivacySubjectProfileData(string DisplayName, string? Email, string? PhoneDisplay, string? CountryCode, string? Gender, DateOnly? DateOfBirth);
public sealed record PrivacySubjectPreferencesData(bool MarketingConsent, DateTimeOffset? MarketingConsentAtUtc);
public sealed record PrivacySubjectLegalAcceptanceData(string DocumentSlug, string Version, DateTimeOffset AcceptedAtUtc);
public sealed record PrivacySubjectConsentData(ConsentPurpose Purpose, ConsentDecision Decision, string PolicyVersion, string CaptureMethod, DateTimeOffset RecordedAtUtc);

public interface IPrivacySubjectDataService
{
    Task<PrivacySubjectDataSnapshot?> GetSupportedDataAsync(string subjectUserId, CancellationToken cancellationToken = default);
}
