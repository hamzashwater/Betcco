import { hasLocale } from "next-intl";
import { routing } from "./routing";

export function getAlternateLocale(locale: string) {
  return routing.locales.find((candidate) => candidate !== locale) ?? locale;
}

export function getLocaleSwitchPathname(
  pathname: string,
  currentLocale: string,
  targetLocale: string,
) {
  if (
    !hasLocale(routing.locales, currentLocale) ||
    !hasLocale(routing.locales, targetLocale)
  ) {
    return pathname;
  }

  const currentPrefix = `/${currentLocale}`;
  if (pathname === currentPrefix) return `/${targetLocale}`;
  if (!pathname.startsWith(`${currentPrefix}/`)) return pathname;

  const suffix = pathname.slice(currentPrefix.length);
  const nextSegment = suffix.slice(1).split("/")[0];
  if (hasLocale(routing.locales, nextSegment)) return pathname;

  return `/${targetLocale}${suffix}`;
}
