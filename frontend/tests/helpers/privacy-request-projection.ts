import baseline from "../fixtures/ui-d01-15-privacy-request-baseline.json";
import {
  projectSecurityIncidentBoundary,
  withoutSecurityIncidentAdditions,
} from "./security-incident-projection";
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
// Exact unique reviewed Privacy owner/copy/guard seams, no broad omission.
export function projectPrivacyRequestBoundary(source: string, path: string) {
  source = projectSecurityIncidentBoundary(source, path);
  const key = path.replaceAll("\\", "/");
  if (
    /(?:^|\/)src\/features\/admin\/privacy-request-management\.tsx$/.test(key)
  )
    return reverse(source, baseline.seams);
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) return reverse(source, baseline.messageSeams[locale]);
  const seams = baseline.guardSeams[key as keyof typeof baseline.guardSeams];
  return seams ? reverse(source, seams) : source;
}
export function withoutPrivacyRequestAdditions(value: Record<string, unknown>) {
  withoutSecurityIncidentAdditions(value);
  const target = (
    value.adminWorkspace as Record<string, Record<string, unknown>> | undefined
  )?.privacyRequests;
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
    throw Error("Unverified Privacy Request presentation copy");
  for (const key of Object.keys(baseline.additions.en)) delete target[key];
  return value;
}
