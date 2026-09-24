using System.Security.Cryptography;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Betcco.Infrastructure.Identity;

// Keep Identity's recovery-code generation, redemption, and token table. Only protect
// the recovery-code token value before it reaches the existing EF Identity store.
public sealed class ProtectedRecoveryCodeUserStore(
    BetccoDbContext context,
    IDataProtectionProvider dataProtectionProvider)
    : UserStore<ApplicationUser, IdentityRole<Guid>, BetccoDbContext, Guid>(context)
{
    private const string RecoveryCodeProvider = "[AspNetUserStore]";
    private const string RecoveryCodeToken = "RecoveryCodes";
    private const string ProtectedVersion = "dp:v1:";
    private readonly IDataProtector protector = dataProtectionProvider.CreateProtector("BETCCO.Identity.RecoveryCodes.v1");

    public override Task SetTokenAsync(ApplicationUser user, string loginProvider, string name, string? value, CancellationToken cancellationToken)
    {
        if (IsRecoveryCodeToken(loginProvider, name) && value is not null)
            value = ProtectedVersion + protector.Protect(value);

        return base.SetTokenAsync(user, loginProvider, name, value, cancellationToken);
    }

    public override async Task<string?> GetTokenAsync(ApplicationUser user, string loginProvider, string name, CancellationToken cancellationToken)
    {
        var value = await base.GetTokenAsync(user, loginProvider, name, cancellationToken);
        if (!IsRecoveryCodeToken(loginProvider, name) || value is null)
            return value;

        if (!value.StartsWith(ProtectedVersion, StringComparison.Ordinal))
            throw new CryptographicException("The stored recovery-code set is not protected.");

        return protector.Unprotect(value[ProtectedVersion.Length..]);
    }

    private static bool IsRecoveryCodeToken(string loginProvider, string name) =>
        string.Equals(loginProvider, RecoveryCodeProvider, StringComparison.Ordinal) &&
        string.Equals(name, RecoveryCodeToken, StringComparison.Ordinal);
}
