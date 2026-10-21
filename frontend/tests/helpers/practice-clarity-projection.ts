import baseline from "../fixtures/ui-d01-09-practice-baseline.json";

// Accept only the exact UI-D01-09 presentation seams. Historical source hashes
// and all transport, teacher, AI and unrelated presentation bytes stay frozen.
export function projectPracticeClaritySource(source: string, path: string) {
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

export function withoutPracticeClarityAdditions(
  value: Record<string, unknown>,
) {
  if (!Object.hasOwn(value, "studentPracticeWorkspace")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) === JSON.stringify(value.studentPracticeWorkspace),
    )
  )
    throw new Error("Unverified formative practice copy additions");
  delete value.studentPracticeWorkspace;
  return value;
}
