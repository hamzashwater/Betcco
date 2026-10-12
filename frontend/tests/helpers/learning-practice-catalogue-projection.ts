import baseline from "../fixtures/learning-practice-i18n-baseline.json";
import { digest, leaves } from "./admin-final-i18n-audit";

const frozenDigests = {
  ar: "63546d0380f06ffe04a39e354f2e955469136fcf4f8ebca503c7381b4b64ad60",
  en: "78822a17783c0066e9690dc5226f6564505c8f56fea92f73cc710159e49c4d33",
};
const expectedLeaves = (["ar", "en"] as const).map((locale) => {
  if (
    digest(JSON.stringify(baseline.catalogues[locale].additions)) !==
    frozenDigests[locale]
  )
    throw new Error("Changed independently frozen learning practice fixture");
  return JSON.stringify(leaves(baseline.catalogues[locale].additions));
});

// Historical proofs can project away only the exact reviewed A6.5 additions.
export function withoutLearningPracticeAdditions(
  value: Record<string, unknown>,
) {
  if (!expectedLeaves.includes(JSON.stringify(leaves(value.learningPractice))))
    throw new Error("Unverified learning practice additions");
  delete value.learningPractice;
  return value;
}
