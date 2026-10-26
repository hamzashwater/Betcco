import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import baseline from "../fixtures/ui-d01-15-academic-catalog-management-baseline.json";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function projectAcademicCatalogBoundary(source: string, path: string) {
  const original = source.replace(/\r\n/g, "\n"),
    key = path.replaceAll("\\", "/");
  if (
    /(?:^|\/)src\/features\/admin\/academic-catalog-management\.tsx$/.test(key)
  ) {
    if (hash(original) !== baseline.approvedHash) return source;
    const previous = readFileSync(
      "tests/fixtures/academic-catalog-management-original.txt",
      "utf8",
    ).replace(/\r\n/g, "\n");
    return hash(previous) === baseline.originalHash ? previous : source;
  }
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) {
    const seam = baseline.messageSeams[locale];
    if (original.split(seam.approved).length !== 2) return source;
    return original.replace(seam.approved, seam.previous);
  }
  return source;
}
export function withoutAcademicCatalogAdditions(
  value: Record<string, unknown>,
) {
  const target = (
    value.adminWorkspace as Record<string, Record<string, unknown>> | undefined
  )?.academicCatalogManagement;
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
    throw Error("Unverified Academic Catalog Management copy");
  for (const k of Object.keys(baseline.additions.en)) delete target[k];
  return value;
}
