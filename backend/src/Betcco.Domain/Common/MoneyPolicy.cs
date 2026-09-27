namespace Betcco.Domain.Common;

/// <summary>
/// Precision contract for currencies explicitly supported by BETCCO financial operations.
/// Requested amounts must be representable; rounding is only for calculated values.
/// </summary>
public static class MoneyPolicy
{
    public static bool IsSupportedCurrency(string? currency) =>
        string.Equals(currency?.Trim(), "JOD", StringComparison.OrdinalIgnoreCase);

    public static decimal MinorUnit(string? currency)
    {
        EnsureSupportedCurrency(currency);
        return 0.001m;
    }

    public static bool IsRepresentable(string? currency, decimal amount) =>
        amount == RoundCalculated(currency, amount);

    public static decimal RoundCalculated(string? currency, decimal amount)
    {
        EnsureSupportedCurrency(currency);
        return Math.Round(amount, 3, MidpointRounding.AwayFromZero);
    }

    private static void EnsureSupportedCurrency(string? currency)
    {
        if (!IsSupportedCurrency(currency))
            throw new ArgumentException("Currency precision is not configured.", nameof(currency));
    }
}
