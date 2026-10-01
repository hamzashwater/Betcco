export type BrandSettings = Record<string, string>;

export type BrandLocale = "ar" | "en";

export type BrandAssetRole =
  "wordmark" | "primary" | "onDark" | "mark" | "email" | "favicon";

export type BrandAssetDimensions = { width: number; height: number };
export type BrandAsset = BrandAssetDimensions & { src: string };
export type BrandIdentity = {
  name: string;
  shortName: string;
  assets: Record<BrandAssetRole, BrandAsset>;
};

/* Presentation roles adapt the existing string settings without changing the
   Settings API. Optional dimension keys describe intrinsic pixels, not a
   permanent display size. Callers can also supply a typed identity directly. */
const assetRoles: Record<
  BrandAssetRole,
  { key: string; dimensions: BrandAssetDimensions }
> = {
  wordmark: { key: "Logo", dimensions: { width: 1600, height: 500 } },
  primary: { key: "PrimaryLogo", dimensions: { width: 1200, height: 900 } },
  onDark: { key: "DarkModeLogo", dimensions: { width: 1600, height: 500 } },
  mark: { key: "BrandMark", dimensions: { width: 512, height: 512 } },
  email: { key: "EmailLogo", dimensions: { width: 1600, height: 500 } },
  favicon: { key: "Favicon", dimensions: { width: 512, height: 512 } },
};

const sharedDefaultBrand: BrandSettings = {
  BrandName: "BETCCO",
  BrandShortName: "BETCCO",
  Logo: "/brand/BETCCO-logo-horizontal.svg",
  PrimaryLogo: "/brand/BETCCO-logo-primary.svg",
  DarkModeLogo: "/brand/BETCCO-logo-white.svg",
  EmailLogo: "/brand/BETCCO-logo-horizontal.svg",
  Favicon: "/brand/BETCCO-icon.svg",
  BrandPrimaryColor: "#1B4F72",
  BrandNavyColor: "#0D1B2A",
  BrandTealColor: "#21C1A6",
  BrandMintColor: "#E6F7F5",
  BrandSurfaceColor: "#F5F6F8",
  SupportEmail: "support@example.test",
  LegalOwnerName: "HAMZA QAHIR ALSHWATER",
  LegalRegistrationNumber: "Complete before publication",
  LegalAddress: "Complete before publication",
  PrivacyEmail: "privacy@example.test",
  ComplaintsEmail: "complaints@example.test",
  CopyrightEmail: "copyright@example.test",
  SecurityEmail: "security@example.test",
  LegalPackageVersion: "1.0",
};

const localizedDefaultBrand: Record<BrandLocale, BrandSettings> = {
  ar: {
    BrandTagline: "BETCCO — تعلّم. طبّق. حقق المعايير.",
    BrandSecondaryMessage:
      "من الدرس إلى المهمة، ومن المهمة إلى تحقيق المعايير — كل ما يحتاجه طالب BTEC في مكان واحد.",
    BtecDisclaimer:
      "BETCCO منصة تعليمية مستقلة تقدم مواد مساندة للدارسين في برامج ومساقات BTEC. لا تمثل المنصة Pearson ولا تدّعي أنها Pearson BTEC Approved Centre أو أنها جهة مانحة لشهادات Pearson، ما لم يتم الإعلان صراحة عن اعتماد رسمي موثق.",
    LegalLastUpdated: "25/08/2026",
    LegalJurisdiction: "المملكة الأردنية الهاشمية",
  },
  en: {
    BrandTagline: "BETCCO — Learn. Apply. Achieve.",
    BrandSecondaryMessage:
      "From learning to assignments and assessment criteria — everything a BTEC student needs in one place.",
    BtecDisclaimer:
      "BETCCO is an independent educational platform that provides supporting materials to learners in BTEC programmes and courses. It does not represent Pearson, claim to be a Pearson BTEC Approved Centre, or award Pearson certificates unless a documented official accreditation is expressly announced.",
    LegalLastUpdated: "2026-08-25",
    LegalJurisdiction: "Hashemite Kingdom of Jordan",
  },
};

export function normalizeBrandLocale(locale: string): BrandLocale {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getDefaultBrand(locale: string): BrandSettings {
  return {
    ...sharedDefaultBrand,
    ...localizedDefaultBrand[normalizeBrandLocale(locale)],
  };
}

export function resolveBrandSettings(
  locale: string,
  settings?: Record<string, unknown>,
): BrandSettings {
  const validSettings = Object.fromEntries(
    Object.entries(settings ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  return { ...getDefaultBrand(locale), ...validSettings };
}

export function publicBrandSettingsQueryKey(locale: string) {
  return ["settings", normalizeBrandLocale(locale)] as const;
}

export function resolveBrandDimensions(
  dimensions: Partial<BrandAssetDimensions>,
  fallback: BrandAssetDimensions,
): BrandAssetDimensions {
  // A partial/invalid pair cannot establish an aspect ratio. Keep the pair
  // together so a supplied width is never combined with an unrelated height.
  const { width, height } = dimensions;
  return typeof width === "number" &&
    typeof height === "number" &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : { ...fallback };
}

export function resolveBrandIdentity(
  locale: string,
  settings?: Record<string, unknown>,
): BrandIdentity {
  const brand = resolveBrandSettings(locale, settings);
  const name = brand.BrandName.trim() || getDefaultBrand(locale).BrandName;
  const configuredShortName = settings?.BrandShortName;
  const shortName =
    typeof configuredShortName === "string" && configuredShortName.trim()
      ? configuredShortName.trim()
      : name;
  const assets = {} as Record<BrandAssetRole, BrandAsset>;

  for (const role of Object.keys(assetRoles) as BrandAssetRole[]) {
    const { key, dimensions } = assetRoles[role];
    // A separately configured mark may have a different ratio from a favicon.
    // Existing settings with only Favicon keep their current icon fallback.
    const sourceKey = role === "mark" && !(key in brand) ? "Favicon" : key;
    assets[role] = {
      src: brand[sourceKey].trim(),
      ...resolveBrandDimensions(
        {
          width: Number(brand[`${sourceKey}Width`]),
          height: Number(brand[`${sourceKey}Height`]),
        },
        dimensions,
      ),
    };
  }

  return { name, shortName, assets };
}

export const defaultBrand = getDefaultBrand("ar");
