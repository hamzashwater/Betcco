import baseline from "../fixtures/support-i18n-baseline.json";
import { digest, leaves } from "./admin-final-i18n-audit";
const frozenDigests = {
  ar: "7f0e9381ae1911d7991dc3f8a5c45c1dff5631059786ef4defc20ccad3e52f2f",
  en: "1d5f3519633b0355af1f5f1ace71a9266f930d60d0beace52e44af7f41f0ed9b",
};
const expected = (["ar", "en"] as const).map((locale) => {
  if (
    digest(JSON.stringify(baseline.catalogues[locale].additions)) !==
    frozenDigests[locale]
  )
    throw new Error("Changed independently frozen Support fixture");
  return JSON.stringify(leaves(baseline.catalogues[locale].additions));
});
export function withoutSupportAdditions(value: Record<string, unknown>) {
  if (!expected.includes(JSON.stringify(leaves(value.supportWorkspace))))
    throw new Error("Unverified Support additions");
  delete value.supportWorkspace;
  return value;
}
