import baseline from "../fixtures/public-purchase-i18n-baseline.json";
import { digest, leaves } from "./admin-final-i18n-audit";
import { withoutLearningPracticeAdditions } from "./learning-practice-catalogue-projection";

// Only exact A6.4 additions can be projected out of earlier wave catalogues.
export function withoutPublicPurchaseAdditions(value: Record<string, unknown>) {
  withoutLearningPracticeAdditions(value);
  const frozenDigests = {
    ar: "e6afbc5400fdbb130062136b5170522e9b34a8e138ca2664d364bd0dbd064e0b",
    en: "29665cbbf2e923240b6d56accd9e28675d151a3d11d02fdb07b3b600ad1c680e",
  };
  for (const locale of ["ar", "en"] as const)
    if (
      digest(JSON.stringify(baseline.catalogues[locale].additions)) !==
      frozenDigests[locale]
    )
      throw new Error("Changed independently frozen public purchase fixture");
  const actual = JSON.stringify(leaves(value.publicPurchase));
  if (
    ![baseline.catalogues.ar.additions, baseline.catalogues.en.additions].some(
      (expected) => JSON.stringify(leaves(expected)) === actual,
    )
  )
    throw new Error("Unverified public purchase additions");
  delete value.publicPurchase;
  return value;
}
