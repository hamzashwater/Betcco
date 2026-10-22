import baseline from "../fixtures/ui-d01-14-assessment-operations-baseline.json";
// Reverse only the exact reviewed presentation seams. Unknown paths and any
// absent, altered or duplicate seam stay unprojected and fail historical guards.
export function projectAssessmentOperationsSource(
  source: string,
  path: string,
) {
  const original = source.replace(/\r\n/g, "\n");
  const key = path
    .replaceAll("\\", "/")
    .replace(/^.*?(?=src\/features\/admin\/)/, "");
  const file = baseline.files[key as keyof typeof baseline.files];
  if (!file) return original;
  let result = original;
  for (const seam of file.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
