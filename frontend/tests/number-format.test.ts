import { describe, expect, it } from "vitest";
import {
  formatLocalizedCurrency,
  formatLocalizedNumber,
  formatLocalizedPercentage,
  getNumberIntlLocale,
} from "@/i18n/number-format";

describe("BETCCO number formatting policy", () => {
  it("maps Arabic and English application locales deliberately", () => {
    expect(getNumberIntlLocale("ar")).toBe("ar-JO");
    expect(getNumberIntlLocale("en")).toBe("en-JO");
    expect(getNumberIntlLocale("fr")).toBe("ar-JO");
  });

  it.each([
    ["ar", "ar-JO"],
    ["en", "en-JO"],
  ])("formats decimals using the %s BETCCO locale", (locale, intlLocale) => {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    expect(formatLocalizedNumber(1234.5, locale, options)).toBe(
      new Intl.NumberFormat(intlLocale, options).format(1234.5),
    );
  });

  it.each([
    ["ar", "ar-JO"],
    ["en", "en-JO"],
  ])(
    "formats JOD with visible code and three decimals for %s",
    (locale, intlLocale) => {
      const options = {
        style: "currency" as const,
        currency: "JOD",
        currencyDisplay: "code" as const,
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      };
      const formatted = formatLocalizedCurrency(5, "JOD", locale);
      expect(formatted).toBe(
        new Intl.NumberFormat(intlLocale, options).format(5),
      );
      expect(formatted).toContain("JOD");
    },
  );

  it("uses the supplied non-JOD currency", () => {
    const options = {
      style: "currency" as const,
      currency: "USD",
      currencyDisplay: "code" as const,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    };
    const formatted = formatLocalizedCurrency(5, "USD", "en");
    expect(formatted).toBe(new Intl.NumberFormat("en-JO", options).format(5));
    expect(formatted).toContain("USD");
    expect(formatted).not.toContain("JOD");
  });

  it.each([5, -5, 0])(
    "formats signed currency value %s without manual signs",
    (value) => {
      const options = {
        style: "currency" as const,
        currency: "JOD",
        currencyDisplay: "code" as const,
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      };
      expect(formatLocalizedCurrency(value, "JOD", "en")).toBe(
        new Intl.NumberFormat("en-JO", options).format(value),
      );
    },
  );

  it.each([
    ["ar", "ar-JO"],
    ["en", "en-JO"],
  ])(
    "formats 70 percentage points as 70 percent in %s",
    (locale, intlLocale) => {
      const options = { style: "percent" as const, maximumFractionDigits: 3 };
      expect(formatLocalizedPercentage(70, locale)).toBe(
        new Intl.NumberFormat(intlLocale, options).format(0.7),
      );
    },
  );

  it("returns an empty display for missing, non-finite, or invalid values", () => {
    expect(formatLocalizedNumber(null, "en")).toBe("");
    expect(formatLocalizedNumber(Number.NaN, "en")).toBe("");
    expect(formatLocalizedCurrency(Number.POSITIVE_INFINITY, "JOD", "en")).toBe(
      "",
    );
    expect(formatLocalizedCurrency(5, "not-a-currency", "en")).toBe("");
    expect(formatLocalizedPercentage(undefined, "en")).toBe("");
  });
});
