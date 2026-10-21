import baseline from "../fixtures/ui-d01-10-evaluation-baseline.json";

// Reverse exact reviewed UI-D01-10 presentation seams only. No historical hash
// or behavior expression is replaced; missing/altered/duplicate seams fail closed.
export function projectEvaluationPresentationSource(
  source: string,
  path: string,
) {
  const file = baseline.files[path as keyof typeof baseline.files];
  if (!file) return source;
  const original = source.replace(/\r\n/g, "\n");
  let result = original;
  for (const seam of file.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
export function withoutEvaluationPresentationAdditions(
  value: Record<string, unknown>,
) {
  if (!Object.hasOwn(value, "studentEvaluationPresentation")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) ===
        JSON.stringify(value.studentEvaluationPresentation),
    )
  )
    throw new Error("Unverified evaluation presentation copy");
  delete value.studentEvaluationPresentation;
  return value;
}
