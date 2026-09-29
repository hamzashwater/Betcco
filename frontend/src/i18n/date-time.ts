import { hasLocale } from "next-intl";
import { routing } from "./routing";

export type LocalizedDateValue = Date | number | string | null | undefined;

/** BETCCO uses Jordanian Arabic and UK English date conventions. */
export function getDateTimeIntlLocale(locale: string) {
  const appLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  return appLocale === "ar" ? "ar-JO" : "en-GB";
}

function toValidDate(value: LocalizedDateValue) {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatLocalizedDate(
  value: LocalizedDateValue,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  const date = toValidDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(getDateTimeIntlLocale(locale), options).format(
    date,
  );
}

export function formatLocalizedDateTime(
  value: LocalizedDateValue,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  const date = toValidDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(getDateTimeIntlLocale(locale), options).format(
    date,
  );
}
