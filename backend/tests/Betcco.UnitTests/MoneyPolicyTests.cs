using Betcco.Domain.Common;

namespace Betcco.UnitTests;

public sealed class MoneyPolicyTests
{
    [Fact]
    public void Jod_amounts_at_supported_precision_are_representable()
    {
        foreach (var amount in new[] { 0m, 0.001m, 1.234m, 25.123m, 115.999m, 1.2340m })
            Assert.True(MoneyPolicy.IsRepresentable("JOD", amount));
    }

    [Fact]
    public void Jod_amounts_beyond_supported_precision_are_not_representable()
    {
        foreach (var amount in new[] { 0.0001m, 1.2345m, 25.1234m })
            Assert.False(MoneyPolicy.IsRepresentable("JOD", amount));
    }

    [Fact]
    public void Calculated_jod_values_round_away_from_zero_at_midpoints()
    {
        Assert.Equal(1.234m, MoneyPolicy.RoundCalculated("JOD", 1.2344m));
        Assert.Equal(1.235m, MoneyPolicy.RoundCalculated("JOD", 1.2345m));
        Assert.Equal(-1.235m, MoneyPolicy.RoundCalculated("JOD", -1.2345m));
    }

    [Fact]
    public void Jod_is_the_only_configured_currency()
    {
        Assert.True(MoneyPolicy.IsSupportedCurrency(" jod "));
        Assert.Equal(0.001m, MoneyPolicy.MinorUnit("JOD"));
        Assert.False(MoneyPolicy.IsSupportedCurrency("USD"));
        Assert.Throws<ArgumentException>(() => MoneyPolicy.MinorUnit("USD"));
        Assert.Throws<ArgumentException>(() => MoneyPolicy.IsRepresentable("USD", 1m));
        Assert.Throws<ArgumentException>(() => MoneyPolicy.RoundCalculated("USD", 1m));
    }
}
