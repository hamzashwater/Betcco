using Betcco.Application.Common;

namespace Betcco.UnitTests;

public sealed class SlugValidationTests
{
    [Theory]
    [InlineData("course")]
    [InlineData("course2")]
    [InlineData("course-2-intro")]
    [InlineData("a")]
    public void Accepts_ascii_kebab_case_slugs(string value)
    {
        Assert.True(SlugValidation.IsAsciiKebabCase(value));
    }

    [Fact]
    public void Accepts_a_120_character_slug()
    {
        Assert.True(SlugValidation.IsAsciiKebabCase(new string('a', SlugValidation.MaximumLength)));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("course slug")]
    [InlineData("Course")]
    [InlineData("course_slug")]
    [InlineData("-course")]
    [InlineData("course-")]
    [InlineData("course--slug")]
    [InlineData("café")]
    [InlineData("course\n")]
    public void Rejects_values_outside_the_ascii_kebab_case_grammar(string? value)
    {
        Assert.False(SlugValidation.IsAsciiKebabCase(value));
    }

    [Fact]
    public void Rejects_a_121_character_slug()
    {
        Assert.False(SlugValidation.IsAsciiKebabCase(new string('a', SlugValidation.MaximumLength + 1)));
    }

    [Fact]
    public void Rejects_a_near_match_with_an_invalid_suffix()
    {
        var value = new string('a', SlugValidation.MaximumLength - 1) + "!";

        Assert.False(SlugValidation.IsAsciiKebabCase(value));
    }
}
