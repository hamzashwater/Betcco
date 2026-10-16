import baseline from "../fixtures/metadata-i18n-baseline.json";
import { digest, leaves } from "./admin-final-i18n-audit";

const frozen = {
  ar: "ffbc3c9c3e0dd13097122eeb08069cf11fa5dafdc524141cb5a68248ba1fb9d5",
  en: "dbf03026eb87b7cf5b8fb8851815884a50ea46423b977c6af64fb182dd1edc43",
};
const expected = (["ar", "en"] as const).map((locale) => {
  const additions = baseline.catalogues[locale].additions;
  if (digest(JSON.stringify(additions)) !== frozen[locale])
    throw new Error("Changed independently frozen metadata additions");
  return JSON.stringify(leaves(additions));
});

export function withoutMetadataAdditions(value: Record<string, unknown>) {
  if (!expected.includes(JSON.stringify(leaves(value.siteMetadata))))
    throw new Error("Unverified metadata additions");
  delete value.siteMetadata;
  return value;
}
