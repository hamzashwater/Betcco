import baseline from "../fixtures/public-trust-i18n-baseline.json";
import { digest, leaves } from "./admin-final-i18n-audit";

// Historical projections may remove only independently frozen A6.3 additions.
// Any changed value, removed key or unrelated addition remains mutation-sensitive.
export function withoutPublicTrustAdditions(value: Record<string, unknown>) {
  const frozenDigests = {
    ar: "70ad785c0e5b531c533b4c31e4d4749910406301d45d50ccac9e36d31b37adb9",
    en: "45c8984a7988a29693ea548d055f98189523adf25f54e3d144806b29ded86627",
  };
  for (const locale of ["ar", "en"] as const)
    if (
      digest(JSON.stringify(baseline.catalogues[locale].additions)) !==
      frozenDigests[locale]
    )
      throw new Error("Changed independently frozen public trust fixture");
  const actual = JSON.stringify(leaves(value.publicTrust));
  if (
    ![baseline.catalogues.ar.additions, baseline.catalogues.en.additions].some(
      (expected) => JSON.stringify(leaves(expected)) === actual,
    )
  )
    throw new Error("Unverified public trust additions");
  delete value.publicTrust;
  return value;
}
