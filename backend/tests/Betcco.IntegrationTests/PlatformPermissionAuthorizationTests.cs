using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Application.Common;
using Microsoft.AspNetCore.Authorization;

namespace Betcco.IntegrationTests;

public sealed class PlatformPermissionAuthorizationTests
{
    [Theory]
    [InlineData(PlatformRoles.Admin, PlatformPermissions.ManageUsers, true)]
    [InlineData(PlatformRoles.SystemAdmin, PlatformPermissions.ManageUsers, true)]
    [InlineData(PlatformRoles.SystemAdmin, PlatformPermissions.ManagePrivacy, true)]
    [InlineData(PlatformRoles.SystemAdmin, PlatformPermissions.ManageSecurityIncidents, true)]
    [InlineData(PlatformRoles.SupportAdmin, PlatformPermissions.ManagePrivacy, false)]
    [InlineData(PlatformRoles.InternalVerifier, PlatformPermissions.VerifyAssessments, true)]
    [InlineData(PlatformRoles.InternalVerifier, PlatformPermissions.PlanInternalVerification, false)]
    [InlineData(PlatformRoles.LeadInternalVerifier, PlatformPermissions.PlanInternalVerification, true)]
    [InlineData(PlatformRoles.LeadInternalVerifier, PlatformPermissions.ReviewAssessmentAppeals, true)]
    [InlineData(PlatformRoles.Assessor, PlatformPermissions.VerifyAssessments, false)]
    [InlineData(PlatformRoles.Student, PlatformPermissions.ManageFinance, false)]
    public async Task Role_capabilities_are_evaluated_in_one_central_policy(string role, string permission, bool expected)
    {
        var requirement = new PlatformPermissionRequirement(permission);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);

        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.Equal(expected, context.HasSucceeded);
    }

    [Fact]
    public async Task Support_administrator_cannot_authorize_an_article_20_notification_decision()
    {
        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageSecurityIncidents);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Role, PlatformRoles.SupportAdmin)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);

        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }
}
