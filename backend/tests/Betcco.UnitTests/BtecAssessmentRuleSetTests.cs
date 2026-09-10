using Betcco.Application.Evaluations;
using Betcco.Domain.Common;

namespace Betcco.UnitTests;

public sealed class BtecAssessmentRuleSetTests
{
    [Fact]
    public void Default_rules_award_distinction_only_when_all_required_bands_are_achieved()
    {
        Assert.True(BtecAssessmentRuleSet.TryRead(BtecAssessmentRuleSet.DefaultJson, out var rules));

        var result = EvaluationAssessmentCalculator.Calculate(
            [
                new CriterionSubmission("A.P1", "Achieved", null, null),
                new CriterionSubmission("A.M1", "Achieved", null, null),
                new CriterionSubmission("A.D1", "Achieved", null, null)
            ],
            rules);

        Assert.Equal(EvaluationGrade.Distinction, result.Grade);
        var section = Assert.Single(result.Sections);
        Assert.Equal("Distinction", section.Grade);
    }

    [Fact]
    public void Missing_merit_criterion_prevents_distinction_even_when_a_distinction_criterion_is_achieved()
    {
        Assert.True(BtecAssessmentRuleSet.TryRead(BtecAssessmentRuleSet.DefaultJson, out var rules));

        var result = EvaluationAssessmentCalculator.Calculate(
            [
                new CriterionSubmission("A.P1", "Achieved", null, null),
                new CriterionSubmission("A.M1", "NotAchieved", null, null),
                new CriterionSubmission("A.D1", "Achieved", null, null)
            ],
            rules);

        Assert.Equal(EvaluationGrade.Pass, result.Grade);
    }

    [Fact]
    public void Every_section_must_meet_its_own_rules_and_the_lowest_section_sets_the_outcome()
    {
        Assert.True(BtecAssessmentRuleSet.TryRead(BtecAssessmentRuleSet.DefaultJson, out var rules));

        var result = EvaluationAssessmentCalculator.Calculate(
            [
                new CriterionSubmission("A.P1", "Achieved", null, null),
                new CriterionSubmission("A.M1", "Achieved", null, null),
                new CriterionSubmission("A.D1", "Achieved", null, null),
                new CriterionSubmission("B.P1", "Achieved", null, null),
                new CriterionSubmission("B.M1", "PartiallyAchieved", null, null),
                new CriterionSubmission("B.D1", "NotAchieved", null, null)
            ],
            rules);

        Assert.Equal(EvaluationGrade.Pass, result.Grade);
        Assert.Contains(result.Sections, section => section.Section == "A" && section.Grade == "Distinction");
        Assert.Contains(result.Sections, section => section.Section == "B" && section.Grade == "Pass");
    }

    [Fact]
    public void Plan_validation_rejects_an_incomplete_distinction_plan()
    {
        Assert.True(BtecAssessmentRuleSet.TryRead(BtecAssessmentRuleSet.DefaultJson, out var rules));

        Assert.False(rules.HasValidPlan(["A.P1", "A.D1"]));
        Assert.True(rules.HasValidPlan(["A.P1", "A.M1", "A.D1"]));
        Assert.False(rules.HasValidPlan(["A.P1", "B.M1"]));
    }
}
