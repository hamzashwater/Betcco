using Betcco.Domain.Common;

namespace Betcco.Domain.Commerce;

public sealed record RefundAllocationSnapshot(
    Guid Id, decimal NetAmount, decimal PlatformCommission, decimal TeacherEarning,
    decimal PriorNet, decimal PriorPlatform, decimal PriorTeacher);

public sealed record RefundAllocationDelta(Guid Id, decimal NetAmount, decimal PlatformCommission, decimal TeacherEarning);

public sealed record RefundAccountingPlan(
    decimal TaxComponent, decimal RevenueComponent, decimal CumulativeTax,
    decimal CumulativeRevenue, IReadOnlyList<RefundAllocationDelta> Allocations);

/// <summary>Pure, provider-independent cumulative accounting for a course-payment refund.</summary>
public static class RefundAccountingCalculator
{
    public static (RefundAccountingPlan? Plan, string? FailureCode) Calculate(
        string currency, decimal originalTotal, decimal originalTax, decimal priorRefunded,
        decimal priorRevenueReversed, decimal currentRefund, IReadOnlyCollection<RefundAllocationSnapshot> allocations)
    {
        const string historical = "REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED";
        const string allocationFailure = "REFUND_ALLOCATION_POLICY_REQUIRED";
        if (!MoneyPolicy.IsSupportedCurrency(currency)) return (null, "REFUND_CURRENCY_UNSUPPORTED");
        if (!MoneyPolicy.IsRepresentable(currency, originalTotal)
            || !MoneyPolicy.IsRepresentable(currency, originalTax)
            || !MoneyPolicy.IsRepresentable(currency, priorRefunded)
            || !MoneyPolicy.IsRepresentable(currency, priorRevenueReversed)
            || allocations.Any(item => !MoneyPolicy.IsRepresentable(currency, item.NetAmount)
                || !MoneyPolicy.IsRepresentable(currency, item.PlatformCommission)
                || !MoneyPolicy.IsRepresentable(currency, item.TeacherEarning)
                || !MoneyPolicy.IsRepresentable(currency, item.PriorNet)
                || !MoneyPolicy.IsRepresentable(currency, item.PriorPlatform)
                || !MoneyPolicy.IsRepresentable(currency, item.PriorTeacher)))
            return (null, historical);

        var originalRevenue = originalTotal - originalTax;
        if (originalTotal <= 0m || originalTax < 0m || originalRevenue <= 0m
            || priorRefunded < 0m || priorRefunded > originalTotal
            || currentRefund <= 0m || currentRefund > originalTotal - priorRefunded)
            return (null, allocationFailure);

        var ordered = allocations.OrderBy(item => item.Id).ToArray();
        if (ordered.Length == 0 || ordered.Sum(item => item.NetAmount) != originalRevenue
            || ordered.Any(item => item.NetAmount < 0m || item.PlatformCommission < 0m || item.TeacherEarning < 0m
                || item.PlatformCommission + item.TeacherEarning != item.NetAmount
                || item.PriorNet < 0m || item.PriorPlatform < 0m || item.PriorTeacher < 0m
                || item.PriorNet > item.NetAmount || item.PriorPlatform > item.PlatformCommission
                || item.PriorTeacher > item.TeacherEarning || item.PriorPlatform + item.PriorTeacher != item.PriorNet)
            || ordered.Sum(item => item.PriorNet) != priorRevenueReversed)
            return (null, allocationFailure);

        try
        {
            var cumulativeRefund = priorRefunded + currentRefund;
            var cumulativeTax = cumulativeRefund == originalTotal
                ? originalTax
                : MoneyPolicy.RoundCalculated(currency, originalTax * cumulativeRefund / originalTotal);
            var priorTax = priorRefunded - priorRevenueReversed;
            var expectedPriorTax = priorRefunded == originalTotal
                ? originalTax
                : MoneyPolicy.RoundCalculated(currency, originalTax * priorRefunded / originalTotal);
            var taxComponent = cumulativeTax - priorTax;
            var revenueComponent = currentRefund - taxComponent;
            var cumulativeRevenue = cumulativeRefund - cumulativeTax;
            if (priorTax != expectedPriorTax || taxComponent < 0m || taxComponent > currentRefund
                || cumulativeTax > originalTax || cumulativeRevenue > originalRevenue)
                return (null, allocationFailure);
            if (revenueComponent == 0m) return (null, "REFUND_TAX_ONLY_INCREMENT_REQUIRES_REVIEW");
            if (revenueComponent < 0m || cumulativeRevenue - priorRevenueReversed != revenueComponent)
                return (null, allocationFailure);

            var netTargets = AllocateTargets(currency, cumulativeRevenue, originalRevenue,
                ordered.Select(item => item.NetAmount).ToArray(), ordered.Select(item => item.PriorNet).ToArray());
            var deltas = new List<RefundAllocationDelta>(ordered.Length);
            for (var index = 0; index < ordered.Length; index++)
            {
                var item = ordered[index];
                var split = item.NetAmount == 0m
                    ? new[] { 0m, 0m }
                    : AllocateTargets(currency, netTargets[index], item.NetAmount,
                        [item.PlatformCommission, item.TeacherEarning], [item.PriorPlatform, item.PriorTeacher]);
                deltas.Add(new(item.Id, netTargets[index] - item.PriorNet,
                    split[0] - item.PriorPlatform, split[1] - item.PriorTeacher));
            }

            if (deltas.Sum(item => item.NetAmount) != revenueComponent
                || deltas.Any(item => item.NetAmount < 0m || item.PlatformCommission < 0m || item.TeacherEarning < 0m
                    || item.PlatformCommission + item.TeacherEarning != item.NetAmount))
                return (null, allocationFailure);
            return (new(taxComponent, revenueComponent, cumulativeTax, cumulativeRevenue, deltas), null);
        }
        catch (OverflowException)
        {
            return (null, allocationFailure);
        }
        catch (InvalidOperationException)
        {
            return (null, allocationFailure);
        }
    }

    private static decimal[] AllocateTargets(string currency, decimal target, decimal originalTotal,
        decimal[] originals, decimal[] previous)
    {
        if (target == originalTotal) return [.. originals];
        var ideal = new decimal[originals.Length];
        var assigned = new decimal[originals.Length];
        for (var index = 0; index < originals.Length; index++)
        {
            ideal[index] = target * originals[index] / originalTotal;
            assigned[index] = Math.Clamp(MoneyPolicy.RoundCalculated(currency, ideal[index]), previous[index], originals[index]);
        }

        var residual = target - assigned.Sum();
        if (residual > 0m)
        {
            foreach (var index in Enumerable.Range(0, originals.Length)
                .OrderByDescending(index => ideal[index] - assigned[index]).ThenBy(index => index))
            {
                var addition = Math.Min(residual, originals[index] - assigned[index]);
                assigned[index] += addition;
                residual -= addition;
                if (residual == 0m) break;
            }
        }
        else if (residual < 0m)
        {
            foreach (var index in Enumerable.Range(0, originals.Length)
                .OrderByDescending(index => assigned[index] - ideal[index]).ThenBy(index => index))
            {
                var reduction = Math.Min(-residual, assigned[index] - previous[index]);
                assigned[index] -= reduction;
                residual += reduction;
                if (residual == 0m) break;
            }
        }

        if (residual != 0m || assigned.Sum() != target)
            throw new InvalidOperationException("Cumulative refund targets cannot be reconciled.");
        return assigned;
    }
}
