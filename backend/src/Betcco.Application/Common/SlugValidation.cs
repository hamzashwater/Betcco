namespace Betcco.Application.Common;

public static class SlugValidation
{
    public const int MaximumLength = 120;

    public static bool IsAsciiKebabCase(string? value)
    {
        if (value is null || value.Length is < 1 or > MaximumLength)
            return false;

        var previousWasHyphen = true;
        foreach (var character in value)
        {
            if (character is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                previousWasHyphen = false;
                continue;
            }

            if (character != '-' || previousWasHyphen)
                return false;

            previousWasHyphen = true;
        }

        return !previousWasHyphen;
    }
}
