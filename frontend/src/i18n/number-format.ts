import { hasLocale } from "next-intl";
import { routing } from "./routing";

export type LocalizedNumberValue = number | null | undefined;

/** BETCCO uses Jordanian number conventions for both supported app locales. */
export function getNumberIntlLocale(locale: string) {
  const appLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  return appLocale === "ar" ? "ar-JO" : "en-JO";
}

function isFiniteNumber(value: LocalizedNumberValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatLocalizedNumber(
  value: LocalizedNumberValue,
  locale: string,
  options: Intl.NumberFormatOptions = {},
) {
  if (!isFiniteNumber(value)) return "";
  return new Intl.NumberFormat(getNumberIntlLocale(locale), options).format(
    value,
  );
}

export function formatLocalizedCurrency(
  value: LocalizedNumberValue,
  currency: string | null | undefined,
  locale: string,
  options: Omit<
    Intl.NumberFormatOptions,
    "style" | "currency" | "currencyDisplay"
  > = {},
) {
  if (!isFiniteNumber(value) || !currency) return "";

  try {
    return new Intl.NumberFormat(getNumberIntlLocale(locale), {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
      ...options,
    }).format(value);
  } catch (error) {
    if (error instanceof RangeError) return "";
    throw error;
  }
}

/** Accepts percentage points (70 means 70%), not a ratio (0.7). */
export function formatLocalizedPercentage(
  percentageValue: LocalizedNumberValue,
  locale: string,
  options: Omit<Intl.NumberFormatOptions, "style"> = {},
) {
  if (!isFiniteNumber(percentageValue)) return "";
  return new Intl.NumberFormat(getNumberIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 3,
    ...options,
  }).format(percentageValue / 100);
}
