using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;

namespace Betcco.Api.Controllers;

internal static class EmailChangeProof
{
    private const string StudentPurpose = "BETCCO.StudentEmailChange.v1";
    private const string ManagedPurpose = "BETCCO.ManagedEmailChange.v1";

    public static string Protect(IDataProtectionProvider provider, string mode, string identityToken) =>
        provider.CreateProtector(Purpose(mode)).ToTimeLimitedDataProtector()
            .Protect(identityToken, TimeSpan.FromHours(1));

    public static string? Unprotect(IDataProtectionProvider provider, string mode, string proof)
    {
        try
        {
            return provider.CreateProtector(Purpose(mode)).ToTimeLimitedDataProtector().Unprotect(proof);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private static string Purpose(string mode) => mode switch
    {
        "student" => StudentPurpose,
        "managed" => ManagedPurpose,
        _ => throw new ArgumentOutOfRangeException(nameof(mode))
    };
}
