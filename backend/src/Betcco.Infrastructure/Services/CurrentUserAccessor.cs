using System.Security.Claims;
using Betcco.Application.Common;
using Microsoft.AspNetCore.Http;

namespace Betcco.Infrastructure.Services;

public sealed class CurrentUserAccessor(IHttpContextAccessor accessor) : ICurrentUserAccessor
{
    public CurrentUser? User
    {
        get
        {
            var principal = accessor.HttpContext?.User;
            var id = principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            var email = principal?.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(email)) return null;
            return new CurrentUser(id, email, principal!.FindAll(ClaimTypes.Role).Select(x => x.Value).ToArray());
        }
    }
}
