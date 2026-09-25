using Betcco.Application.Common;
using Betcco.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;

namespace Betcco.Api.Authorization;

public static class StaffMfaPolicy
{
    private static readonly HashSet<string> EnforcedRoles = new(StringComparer.Ordinal)
    {
        PlatformRoles.Admin,
        PlatformRoles.SystemAdmin,
        PlatformRoles.SupportAdmin,
        PlatformRoles.FinanceAdmin
    };

    public static bool RequiresStaffMfa(IEnumerable<string> roles) => roles.Any(EnforcedRoles.Contains);

    public static async Task<bool> RequiresEnrollmentAsync(UserManager<ApplicationUser> users, ApplicationUser user)
        => RequiresStaffMfa(await users.GetRolesAsync(user)) && !await users.GetTwoFactorEnabledAsync(user);
}

// Endpoint metadata keeps the enrollment exception tied to specific actions.
[AttributeUsage(AttributeTargets.Method)]
public sealed class StaffMfaBootstrapAttribute : Attribute;

public sealed class StaffMfaEnrollmentMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, UserManager<ApplicationUser> users)
    {
        var endpoint = context.GetEndpoint();
        if (endpoint?.Metadata.GetMetadata<IAuthorizeData>() is null
            || endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null
            || context.User.Identity?.IsAuthenticated != true
            || endpoint.Metadata.GetMetadata<StaffMfaBootstrapAttribute>() is not null)
        {
            await next(context);
            return;
        }

        var user = await users.GetUserAsync(context.User);
        if (user is null || user.IsFrozen)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        if (await StaffMfaPolicy.RequiresEnrollmentAsync(users, user))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new
            {
                code = "MFA_ENROLLMENT_REQUIRED",
                message = "Multi-factor authentication must be configured before continuing."
            });
            return;
        }

        await next(context);
    }
}
