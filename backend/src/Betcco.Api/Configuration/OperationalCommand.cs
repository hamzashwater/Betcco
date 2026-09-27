namespace Betcco.Api.Configuration;

public enum OperationalCommand { Serve, Migrate, BootstrapAdmin }

public static class OperationalCommandParser
{
    public static (OperationalCommand Command, string[] ApplicationArguments) Parse(string[] args)
    {
        var migrate = args.Count(argument => string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase));
        var bootstrap = args.Count(argument => string.Equals(argument, "--bootstrap-admin", StringComparison.OrdinalIgnoreCase));
        if (migrate + bootstrap > 1) throw new InvalidOperationException("INCOMPATIBLE_OPERATION_ARGUMENTS");
        return (bootstrap == 1 ? OperationalCommand.BootstrapAdmin : migrate == 1 ? OperationalCommand.Migrate : OperationalCommand.Serve,
            args.Where(argument => !string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(argument, "--bootstrap-admin", StringComparison.OrdinalIgnoreCase)).ToArray());
    }
}
