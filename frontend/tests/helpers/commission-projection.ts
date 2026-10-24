import baseline from "../fixtures/ui-d01-15-commission-baseline.json";
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
// Exact reviewed owner/copy/guard seams; absent, altered, duplicated or unknown
// seams fail closed. Historical fixtures and every financial rule stay frozen.
export function projectCommissionBoundary(source: string, path: string) {
  const key = path.replaceAll("\\", "/");
  if (/(?:^|\/)src\/features\/admin\/commission-settings\.tsx$/.test(key))
    return reverse(source, baseline.seams);
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) return reverse(source, baseline.messageSeams[locale]);
  const seams = baseline.guardSeams[key as keyof typeof baseline.guardSeams];
  return seams ? reverse(source, seams) : source;
}
export function withoutCommissionAdditions(value: Record<string, unknown>) {
  const target = value.commerceCatalog as Record<string, unknown> | undefined;
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
    throw Error("Unverified Commission presentation copy");
  for (const key of Object.keys(baseline.additions.en)) delete target[key];
  return value;
}
