import {
  normalizeBrandLocale,
  resolveBrandSettings,
  type BrandSettings,
} from "@/lib/brand";

export const PUBLIC_BRAND_SETTINGS_TIMEOUT_MS = 3_000;

export async function getPublicBrandSettings(
  locale: string,
): Promise<BrandSettings> {
  const normalizedLocale = normalizeBrandLocale(locale);
  const apiBaseUrl = process.env.BETCCO_API_URL ?? "http://localhost:5085";
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PUBLIC_BRAND_SETTINGS_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, "")}/api/v1/settings/public?locale=${normalizedLocale}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) return resolveBrandSettings(normalizedLocale);

    const settings = (await response.json()) as BrandSettings;
    return resolveBrandSettings(normalizedLocale, settings);
  } catch {
    return resolveBrandSettings(normalizedLocale);
  } finally {
    clearTimeout(timeoutId);
  }
}
