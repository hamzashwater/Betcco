namespace Betcco.Api.Configuration;

public enum OperationalCommand { Serve, Migrate, BootstrapAdmin, MigrationPreflight }

public static class OperationalCommandParser
{
    public static (OperationalCommand Command, string[] ApplicationArguments, bool AllowLegacyQuizDataRemoval) Parse(string[] args)
    {
        var migrate = args.Count(argument => string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase));
        var bootstrap = args.Count(argument => string.Equals(argument, "--bootstrap-admin", StringComparison.OrdinalIgnoreCase));
        var preflight = args.Count(argument => string.Equals(argument, "--migration-preflight", StringComparison.OrdinalIgnoreCase));
        var allowLegacyQuizDataRemoval = args.Count(argument => string.Equals(argument, "--allow-legacy-quiz-data-removal", StringComparison.OrdinalIgnoreCase));
        if (migrate > 1 || bootstrap > 1 || preflight > 1 || allowLegacyQuizDataRemoval > 1
            || migrate + bootstrap + preflight > 1
            || (allowLegacyQuizDataRemoval == 1 && migrate != 1))
            throw new InvalidOperationException("INCOMPATIBLE_OPERATION_ARGUMENTS");

        return (bootstrap == 1 ? OperationalCommand.BootstrapAdmin
                : preflight == 1 ? OperationalCommand.MigrationPreflight
                : migrate == 1 ? OperationalCommand.Migrate
                : OperationalCommand.Serve,
            args.Where(argument => !string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(argument, "--bootstrap-admin", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(argument, "--migration-preflight", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(argument, "--allow-legacy-quiz-data-removal", StringComparison.OrdinalIgnoreCase)).ToArray(),
            allowLegacyQuizDataRemoval == 1);
    }
}
