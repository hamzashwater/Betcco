import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import baseline from "../fixtures/ui-d01-15-academic-catalogue-baseline.json";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function projectCatalogueBoundary(source: string, path: string) {
  const key = path.replaceAll("\\", "/"),
    s = source.replace(/\r\n/g, "\n");
  if (/(?:^|\/)src\/features\/admin\/academic-catalogue\.tsx$/.test(key)) {
    const previous = readFileSync(
      "tests/fixtures/academic-catalogue-original.txt",
      "utf8",
    ).replace(/\r\n/g, "\n");
    return hash(s) === baseline.approvedHash &&
      hash(previous) === baseline.originalHash
      ? previous
      : source;
  }
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  const seam = locale
    ? baseline.messages[locale]
    : baseline.guards[key as keyof typeof baseline.guards];
  return seam && s.split(seam.approved).length === 2
    ? s.replace(seam.approved, seam.previous)
    : source;
}
export function withoutCatalogueAdditions(value: Record<string, unknown>) {
  const target = value.academicCatalogue as Record<string, unknown> | undefined;
  if (
    !target ||
    !Object.keys(baseline.additions.en).some((k) => Object.hasOwn(target, k))
  )
    return value;
  if (
    !Object.values(baseline.additions).some((copy) =>
      Object.entries(copy).every(([k, v]) => target[k] === v),
    )
  )
    throw Error("Unverified Academic Catalogue copy");
  for (const k of Object.keys(baseline.additions.en)) delete target[k];
  return value;
}
