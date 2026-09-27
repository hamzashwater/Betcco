using Betcco.Domain.Commerce;

namespace Betcco.UnitTests;

public sealed class RefundAccountingCalculatorTests
{
    [Fact]
    public void Cumulative_tax_and_original_split_converge_to_full_refund()
    {
        var id = Guid.NewGuid();
        var original = new RefundAllocationSnapshot(id, 100m, 30m, 70m, 0m, 0m, 0m);
        var first = RefundAccountingCalculator.Calculate("JOD", 116m, 16m, 0m, 0m, 20m, [original]);
        var firstPlan = Assert.IsType<RefundAccountingPlan>(first.Plan);
        Assert.Equal((2.759m, 17.241m), (firstPlan.TaxComponent, firstPlan.RevenueComponent));

        var firstAllocation = Assert.Single(firstPlan.Allocations);
        var second = RefundAccountingCalculator.Calculate("JOD", 116m, 16m, 20m, 17.241m, 30m,
            [original with { PriorNet = firstAllocation.NetAmount, PriorPlatform = firstAllocation.PlatformCommission,
                PriorTeacher = firstAllocation.TeacherEarning }]);
        var secondPlan = Assert.IsType<RefundAccountingPlan>(second.Plan);
        Assert.Equal((4.138m, 25.862m, 6.897m),
            (secondPlan.TaxComponent, secondPlan.RevenueComponent, secondPlan.CumulativeTax));

        var secondAllocation = Assert.Single(secondPlan.Allocations);
        var final = RefundAccountingCalculator.Calculate("JOD", 116m, 16m, 50m, 43.103m, 66m,
            [original with { PriorNet = firstAllocation.NetAmount + secondAllocation.NetAmount,
                PriorPlatform = firstAllocation.PlatformCommission + secondAllocation.PlatformCommission,
                PriorTeacher = firstAllocation.TeacherEarning + secondAllocation.TeacherEarning }]);
        var finalPlan = Assert.IsType<RefundAccountingPlan>(final.Plan);
        Assert.Equal((16m, 100m), (finalPlan.CumulativeTax, finalPlan.CumulativeRevenue));
        Assert.Equal((100m, 30m, 70m),
            (firstAllocation.NetAmount + secondAllocation.NetAmount + finalPlan.Allocations[0].NetAmount,
             firstAllocation.PlatformCommission + secondAllocation.PlatformCommission + finalPlan.Allocations[0].PlatformCommission,
             firstAllocation.TeacherEarning + secondAllocation.TeacherEarning + finalPlan.Allocations[0].TeacherEarning));
    }

    [Fact]
    public void Residual_is_assigned_once_in_stable_allocation_order()
    {
        var firstId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var secondId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var result = RefundAccountingCalculator.Calculate("JOD", 100m, 0m, 0m, 0m, 20.001m,
            [new(secondId, 50m, 15m, 35m, 0m, 0m, 0m),
             new(firstId, 50m, 15m, 35m, 0m, 0m, 0m)]);
        var plan = Assert.IsType<RefundAccountingPlan>(result.Plan);
        Assert.Equal((firstId, 10m), (plan.Allocations[0].Id, plan.Allocations[0].NetAmount));
        Assert.Equal((secondId, 10.001m), (plan.Allocations[1].Id, plan.Allocations[1].NetAmount));
        Assert.Equal(20.001m, plan.Allocations.Sum(item => item.NetAmount));
    }

    [Fact]
    public void Extra_precision_historical_snapshot_is_review_required()
    {
        var result = RefundAccountingCalculator.Calculate("JOD", 116m, 16m, 0m, 0m, 20m,
            [new(Guid.NewGuid(), 100.0001m, 30m, 70m, 0m, 0m, 0m)]);
        Assert.Null(result.Plan);
        Assert.Equal("REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED", result.FailureCode);
    }

    [Fact]
    public void Minor_unit_sequence_remains_monotone_and_capped_through_full_reversal()
    {
        var first = new RefundAllocationSnapshot(Guid.NewGuid(), 0.009m, 0.003m, 0.006m, 0m, 0m, 0m);
        var second = new RefundAllocationSnapshot(Guid.NewGuid(), 0.011m, 0.004m, 0.007m, 0m, 0m, 0m);
        var states = new[] { first, second };
        decimal previousRevenue = 0m;
        for (var unit = 1; unit <= 20; unit++)
        {
            var result = RefundAccountingCalculator.Calculate("JOD", 0.020m, 0m, (unit - 1) * 0.001m,
                previousRevenue, 0.001m, states);
            var plan = Assert.IsType<RefundAccountingPlan>(result.Plan);
            Assert.Equal(0.001m, plan.Allocations.Sum(item => item.NetAmount));
            states = states.Select(state =>
            {
                var delta = Assert.Single(plan.Allocations, item => item.Id == state.Id);
                var next = state with
                {
                    PriorNet = state.PriorNet + delta.NetAmount,
                    PriorPlatform = state.PriorPlatform + delta.PlatformCommission,
                    PriorTeacher = state.PriorTeacher + delta.TeacherEarning
                };
                Assert.InRange(next.PriorNet, state.PriorNet, state.NetAmount);
                Assert.InRange(next.PriorPlatform, state.PriorPlatform, state.PlatformCommission);
                Assert.InRange(next.PriorTeacher, state.PriorTeacher, state.TeacherEarning);
                Assert.Equal(next.PriorNet, next.PriorPlatform + next.PriorTeacher);
                return next;
            }).ToArray();
            previousRevenue = plan.CumulativeRevenue;
        }

        Assert.Equal((first.NetAmount, first.PlatformCommission, first.TeacherEarning),
            (states[0].PriorNet, states[0].PriorPlatform, states[0].PriorTeacher));
        Assert.Equal((second.NetAmount, second.PlatformCommission, second.TeacherEarning),
            (states[1].PriorNet, states[1].PriorPlatform, states[1].PriorTeacher));
    }
}
