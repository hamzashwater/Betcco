import baseline from "../fixtures/ui-d01-15-qualification-registry-baseline.json";

// Exact reviewed, unique owner seams only; unknown/changed/duplicate seams
// return untouched source and therefore fail the historical baseline guards.
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
export function projectQualificationRegistrySource(
  source: string,
  path: string,
) {
  if (
    !/(?:^|\/)src\/features\/admin\/qualification-registry-management\.tsx$/.test(
      path.replaceAll("\\", "/"),
    )
  )
    return source;
  return reverse(source, baseline.seams);
}
export function projectQualificationRegistryCopy(source: string, path: string) {
  const locale = /(?:^|\/)messages\/(en|ar)\.json$/.exec(
    path.replaceAll("\\", "/"),
  )?.[1] as "en" | "ar" | undefined;
  return locale ? reverse(source, baseline.messageSeams[locale]) : source;
}
// Slice 2 freezes Slice 1's test source as well. Reverse only the precise
// import/copy-projection alignment in that guard; all its assertions remain.
export function projectQualificationRegistryGuard(
  source: string,
  path: string,
) {
  const seams =
    baseline.guardSeams[
      path.replaceAll("\\", "/") as keyof typeof baseline.guardSeams
    ];
  return seams ? reverse(source, seams) : source;
}
export function withoutQualificationRegistryAdditions(
  value: Record<string, unknown>,
) {
  const workspace = value.adminWorkspace as
    Record<string, Record<string, unknown>> | undefined;
  const target = workspace?.qualificationRegistry;
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
    throw new Error("Unverified Qualification Registry copy");
  for (const key of Object.keys(baseline.additions.en)) delete target[key];
  return value;
}
