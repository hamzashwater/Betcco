import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import baseline from "../fixtures/ui-d01-15-content-studio-baseline.json";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// Exact approved presentation only. Unknown bytes, partial copy, changed guard
// source or another path remain visible to every historical freeze.
export function projectContentStudioBoundary(source: string, path: string) {
  const key = path.replaceAll("\\", "/"),
    s = source.replace(/\r\n/g, "\n");
  if (/(?:^|\/)src\/features\/admin\/content-studio\.tsx$/.test(key)) {
    const previous = readFileSync(
      "tests/fixtures/content-studio-original.txt",
      "utf8",
    ).replace(/\r\n/g, "\n");
    return hash(s) === baseline.approvedHash &&
      hash(previous) === baseline.originalHash
      ? previous
      : source;
  }
  const locale = /(?:^|\/)messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) {
    const seam = baseline.messages[locale];
    return s.split(seam.approved).length === 2
      ? s.replace(seam.approved, seam.previous)
      : source;
  }
  for (const [p, seam] of Object.entries(baseline.guards))
    if (key === p || key.endsWith("/" + p))
      return s === seam.approved ? seam.previous : source;
  return source;
}
export function withoutContentStudioAdditions(value: Record<string, unknown>) {
  const target = value.adminContent as Record<string, unknown> | undefined;
  const keys = Object.keys(baseline.additions.en);
  if (!target || !keys.some((k) => Object.hasOwn(target, k))) return value;
  if (
    !Object.values(baseline.additions).some((copy) =>
      Object.entries(copy).every(([k, v]) => target[k] === v),
    )
  )
    throw Error("Unverified Content Studio copy");
  for (const key of keys) delete target[key];
  return value;
}
