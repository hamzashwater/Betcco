export function academicText(
  locale: string,
  arabic: string | null | undefined,
  english: string | null | undefined,
): string {
  const arabicText = arabic?.trim() ?? "";
  const englishText = english?.trim() ?? "";
  return locale.startsWith("ar")
    ? arabicText || englishText
    : englishText || arabicText;
}

export function academicUnitLabel(
  locale: string,
  code: string,
  arabicTitle: string | null | undefined,
  englishTitle: string | null | undefined,
): string {
  const prefix = locale.startsWith("ar") ? "الوحدة" : "Unit";
  return `${prefix} ${code} — ${academicText(locale, arabicTitle, englishTitle)}`;
}
