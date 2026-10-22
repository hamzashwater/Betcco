import baseline from "../fixtures/ui-d01-11-teacher-workload-baseline.json";
import {
  projectTeacherAuthoringSource,
  withoutTeacherAuthoringAdditions,
} from "./teacher-authoring-projection";
// Reverse only exact, independently pinned UI-D01-11 presentation hunks.
// Missing, modified and duplicate hunks remain visible to historical proofs.
export function projectTeacherWorkloadSource(source: string, path: string) {
  const original = projectTeacherAuthoringSource(source, path).replace(
    /\r\n/g,
    "\n",
  );
  const file = baseline.files[path as keyof typeof baseline.files];
  if (!file) return original;
  let result = original;
  for (const seam of file.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
export function withoutTeacherWorkloadAdditions(
  value: Record<string, unknown>,
) {
  withoutTeacherAuthoringAdditions(value);
  if (!Object.hasOwn(value, "teacherWorkloadPresentation")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) ===
        JSON.stringify(value.teacherWorkloadPresentation),
    )
  )
    throw new Error("Unverified Teacher workload copy");
  delete value.teacherWorkloadPresentation;
  return value;
}
