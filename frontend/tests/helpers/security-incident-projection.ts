import baseline from "../fixtures/ui-d01-15-security-incident-baseline.json";
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
export function projectSecurityIncidentBoundary(source: string, path: string) {
  const key = path.replaceAll("\\", "/");
  if (
    /(?:^|\/)src\/features\/admin\/security-incident-management\.tsx$/.test(key)
  )
    return reverse(source, baseline.seams);
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) return reverse(source, baseline.messageSeams[locale]);
  const seams = baseline.guardSeams[key as keyof typeof baseline.guardSeams];
  return seams ? reverse(source, seams) : source;
}
export function withoutSecurityIncidentAdditions(
  value: Record<string, unknown>,
) {
  const target = (
    value.adminWorkspace as Record<string, Record<string, unknown>> | undefined
  )?.securityIncidents;
  if (
    !target ||
    !Object.keys(baseline.additions.en).some((k) => Object.hasOwn(target, k))
  )
    return value;
  if (
    !Object.values(baseline.additions).some((copy) =>
      Object.entries(copy).every(([k, expected]) => target[k] === expected),
    )
  )
    throw Error("Unverified Security Incident presentation copy");
  for (const k of Object.keys(baseline.additions.en)) delete target[k];
  return value;
}
