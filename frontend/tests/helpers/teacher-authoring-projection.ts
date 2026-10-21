import baseline from "../fixtures/ui-d01-12-authoring-baseline.json";
// Exact reviewed presentation seams only. Missing/altered/duplicate hunks
// stay visible to all historical hash/behavior proofs; no old hash is replaced.
export function projectTeacherAuthoringSource(source: string, path: string) {
  const original = source.replace(/\r\n/g, "\n"),
    file = baseline.files[path as keyof typeof baseline.files];
  if (!file) return original;
  let result = original;
  for (const seam of file.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
export function withoutTeacherAuthoringAdditions(
  value: Record<string, unknown>,
) {
  if (!Object.hasOwn(value, "teacherAuthoringPresentation")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) ===
        JSON.stringify(value.teacherAuthoringPresentation),
    )
  )
    throw new Error("Unverified Teacher authoring copy");
  delete value.teacherAuthoringPresentation;
  return value;
}
