using Microsoft.AspNetCore.Identity;

namespace Betcco.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public required string DisplayName { get; set; }
    public string? PhoneDisplay { get; set; }
    public string? CountryCode { get; set; }
    public string? Gender { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public bool IsFrozen { get; set; }
    public bool MustChangePassword { get; set; }
    public DateTimeOffset? SessionsInvalidBeforeUtc { get; set; }
    public string? TermsVersionAccepted { get; set; }
    public string? PrivacyVersionAccepted { get; set; }
    public DateTimeOffset? LegalAcceptedAtUtc { get; set; }
    public bool MarketingConsent { get; set; }
    public DateTimeOffset? MarketingConsentAtUtc { get; set; }
}
