using Betcco.Application.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Identity;

public enum AdminBootstrapResult { Created, AlreadyCompleted }

public sealed class ProductionAdminBootstrapper(
    BetccoDbContext db,
    UserManager<ApplicationUser> users,
    RoleManager<IdentityRole<Guid>> roles)
{
    public async Task<AdminBootstrapResult> BootstrapAsync(string? email, string? password, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email)) throw new InvalidOperationException("ADMIN_BOOTSTRAP_EMAIL_REQUIRED");
        if (string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException("ADMIN_BOOTSTRAP_PASSWORD_REQUIRED");
        email = email.Trim();

        if ((await db.Database.GetPendingMigrationsAsync(cancellationToken)).Any())
            throw new InvalidOperationException("ADMIN_BOOTSTRAP_PENDING_MIGRATIONS");

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // All bootstrap processes serialize on this transaction-scoped PostgreSQL lock.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(25761020260927)", cancellationToken);

        if (await db.UserRoles.AnyAsync(link => db.Roles.Any(role => role.Id == link.RoleId
                && role.NormalizedName == PlatformRoles.Admin.ToUpper()), cancellationToken))
            return AdminBootstrapResult.AlreadyCompleted;

        if (await users.FindByEmailAsync(email) is not null)
            throw new InvalidOperationException("ADMIN_BOOTSTRAP_EMAIL_ALREADY_IN_USE");

        // These are the only roles assigned by current registration and staff provisioning paths.
        foreach (var roleName in new[] { PlatformRoles.Admin, PlatformRoles.Student, PlatformRoles.Teacher, PlatformRoles.SupportAdmin })
        {
            if (await roles.RoleExistsAsync(roleName)) continue;
            var roleResult = await roles.CreateAsync(new IdentityRole<Guid>(roleName));
            if (!roleResult.Succeeded) throw new InvalidOperationException("ADMIN_BOOTSTRAP_ROLE_CREATION_FAILED");
        }

        var admin = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DisplayName = "BETCCO Administrator",
            MustChangePassword = true
        };
        var creation = await users.CreateAsync(admin, password);
        if (!creation.Succeeded)
            throw new InvalidOperationException("ADMIN_BOOTSTRAP_IDENTITY_VALIDATION_FAILED: "
                + string.Join(",", creation.Errors.Select(error => error.Code)));

        var assignment = await users.AddToRoleAsync(admin, PlatformRoles.Admin);
        if (!assignment.Succeeded) throw new InvalidOperationException("ADMIN_BOOTSTRAP_ROLE_ASSIGNMENT_FAILED");

        db.AuditLogs.Add(new AuditLog
        {
            Action = "ProductionAdminBootstrapped",
            EntityType = nameof(ApplicationUser),
            EntityId = admin.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return AdminBootstrapResult.Created;
    }
}
