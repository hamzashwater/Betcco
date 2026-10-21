import baseline from "../fixtures/ui-d01-08-player-baseline.json";
import {
  projectEvaluationPresentationSource,
  withoutEvaluationPresentationAdditions,
} from "./evaluation-presentation-projection";
import {
  projectPracticeClaritySource,
  withoutPracticeClarityAdditions,
} from "./practice-clarity-projection";

// Reverse only exact reviewed UI-D01-08 presentation seams. All missing,
// duplicated or altered hunks remain unprojected and fail the historical proofs.
export function projectPlayerWorkspaceSource(source: string, path: string) {
  source = projectEvaluationPresentationSource(source, path);
  source = projectPracticeClaritySource(source, path);
  const file = baseline.files[path as keyof typeof baseline.files];
  if (!file) return source;
  const original = source.replace(/\r\n/g, "\n");
  let result = original;
  for (const { approved, previous } of file.seams) {
    if (result.split(approved).length !== 2) return original;
    result = result.replace(approved, previous);
  }
  return result;
}

export function withoutPlayerWorkspaceAdditions(
  value: Record<string, unknown>,
) {
  withoutEvaluationPresentationAdditions(value);
  withoutPracticeClarityAdditions(value);
  if (!Object.hasOwn(value, "studentPlayerWorkspace")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) === JSON.stringify(value.studentPlayerWorkspace),
    )
  )
    throw new Error("Unverified player workspace copy additions");
  delete value.studentPlayerWorkspace;
  return value;
}
