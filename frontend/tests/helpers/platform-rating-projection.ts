import baseline from "../fixtures/ui-d01-15-platform-rating-baseline.json";
import {
  projectCommissionBoundary,
  withoutCommissionAdditions,
} from "./commission-projection";
function reverse(
  source: string,
  seams: { approved: string; previous: string }[],
) {
  const original = source.replace(/\r\n/g, "\n");
  let result = original;
  for (const seam of seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
// Exact owner/copy and test-guard alignment seams only. No baseline rewrite,
// wildcard omission or projection of unknown/missing/duplicate/changed seams.
export function projectPlatformRatingBoundary(source: string, path: string) {
  source = projectCommissionBoundary(source, path);
  const key = path.replaceAll("\\", "/");
  if (
    /(?:^|\/)src\/features\/admin\/platform-rating-moderation\.tsx$/.test(key)
  )
    return reverse(source, baseline.seams);
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) return reverse(source, baseline.messageSeams[locale]);
  const seams = baseline.guardSeams[key as keyof typeof baseline.guardSeams];
  return seams ? reverse(source, seams) : source;
}
export function withoutPlatformRatingAdditions(value: Record<string, unknown>) {
  withoutCommissionAdditions(value);
  const workspace = value.adminWorkspace as
      Record<string, Record<string, unknown>> | undefined,
    target = workspace?.platformRatingModeration;
  if (
    !target ||
    !Object.keys(baseline.additions.en).some((key) =>
      Object.hasOwn(target, key),
    )
  )
    return value;
  if (
    !Object.values(baseline.additions).some((copy) =>
      Object.entries(copy).every(([key, expected]) => target[key] === expected),
    )
  )
    throw new Error("Unverified Platform Rating presentation copy");
  for (const key of Object.keys(baseline.additions.en)) delete target[key];
  return value;
}
