using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Identity;

namespace Betcco.Infrastructure.Identity;

/// <summary>
/// Resolves an assigned evaluator against the actual Identity account at the
/// server boundary. Client-side teacher lists are convenience only and never
/// authorize an assignment.
/// </summary>
public sealed class AssessorEligibilityService(UserManager<ApplicationUser> userManager) : IAssessorEligibilityService
{
    public async Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(userId, out var parsedUserId)) return false;
        var user = await userManager.FindByIdAsync(parsedUserId.ToString());
        if (user is null || user.IsFrozen) return false;

        return await userManager.IsInRoleAsync(user, PlatformRoles.Teacher)
            || await userManager.IsInRoleAsync(user, PlatformRoles.Assessor);
    }

    public async Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(userId, out var parsedUserId)) return false;
        var user = await userManager.FindByIdAsync(parsedUserId.ToString());
        if (user is null || user.IsFrozen) return false;

        if (await userManager.IsInRoleAsync(user, PlatformRoles.InternalVerifier)
            || await userManager.IsInRoleAsync(user, PlatformRoles.LeadInternalVerifier))
            return true;

        // Existing deployments may still use the legacy Admin role while staff
        // are transitioned to least-privilege verifier roles.
        return await userManager.IsInRoleAsync(user, PlatformRoles.Admin);
    }

    public async Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(userId, out var parsedUserId)) return false;
        var user = await userManager.FindByIdAsync(parsedUserId.ToString());
        if (user is null || user.IsFrozen) return false;

        if (await userManager.IsInRoleAsync(user, PlatformRoles.LeadInternalVerifier)) return true;

        // Existing deployments can continue a controlled migration from the
        // legacy Admin role, but ordinary verifiers cannot create samples.
        return await userManager.IsInRoleAsync(user, PlatformRoles.Admin);
    }
}
