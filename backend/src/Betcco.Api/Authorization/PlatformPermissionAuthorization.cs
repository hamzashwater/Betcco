using System.Security.Claims;
using Betcco.Application.Common;
using Microsoft.AspNetCore.Authorization;

namespace Betcco.Api.Authorization;

public sealed record PlatformPermissionRequirement(string Permission) : IAuthorizationRequirement;

/// <summary>
/// A small centralized role-to-capability map. The legacy Admin role remains a
/// deliberate temporary superuser role so existing deployments do not lose
/// access while staff are progressively assigned least-privilege roles.
/// </summary>
public sealed class PlatformPermissionAuthorizationHandler : AuthorizationHandler<PlatformPermissionRequirement>
{
    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> PermissionsByRole =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.Ordinal)
        {
            [PlatformRoles.Student] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.Learn },
            [PlatformRoles.Teacher] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.CourseAuthor, PlatformPermissions.Assess },
            [PlatformRoles.Assessor] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.Assess },
            [PlatformRoles.InternalVerifier] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.VerifyAssessments },
            [PlatformRoles.LeadInternalVerifier] = new HashSet<string>(StringComparer.Ordinal)
            {
                PlatformPermissions.VerifyAssessments,
                PlatformPermissions.PlanInternalVerification,
                PlatformPermissions.ReviewAssessmentAppeals
            },
            [PlatformRoles.CourseReviewer] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.ReviewCourses },
            [PlatformRoles.FinanceAdmin] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.ManageFinance },
            [PlatformRoles.SupportAdmin] = new HashSet<string>(StringComparer.Ordinal) { PlatformPermissions.ManageSupport, PlatformPermissions.FreezeStudentTeacher },
            [PlatformRoles.SystemAdmin] = new HashSet<string>(StringComparer.Ordinal)
            {
                PlatformPermissions.ManageUsers,
                PlatformPermissions.FreezeStudentTeacher,
                PlatformPermissions.ManagePrivacy,
                PlatformPermissions.ManageSecurityIncidents
            }
        };

    public static bool HasPermission(ClaimsPrincipal user, string permission)
    {
        var roles = user.FindAll(ClaimTypes.Role).Select(claim => claim.Value);
        foreach (var role in roles)
        {
            if (string.Equals(role, PlatformRoles.Admin, StringComparison.Ordinal)
                || (PermissionsByRole.TryGetValue(role, out var permissions) && permissions.Contains(permission)))
            {
                return true;
            }
        }
        return false;
    }

    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PlatformPermissionRequirement requirement)
    {
        if (HasPermission(context.User, requirement.Permission))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
