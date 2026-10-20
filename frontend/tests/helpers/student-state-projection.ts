import baseline from "../fixtures/ui-d01-04-student-baseline.json";
import { projectStudentContinuitySource } from "./student-continuity-projection";

// Reverse only the exact reviewed Student presentation hunks. Any missing,
// duplicate or modified hunk leaves the full source unprojected and fails proofs.
export function projectStudentStateSource(source: string) {
  const normalized = projectStudentContinuitySource(
    source,
    "src/features/student/student-area.tsx",
  );
  let result = normalized;
  for (const { approved, previous } of baseline.seams) {
    if (result.split(approved).length !== 2) return normalized;
    result = result.replace(approved, previous);
  }
  return result;
}

// Only the three paired Student state leaves are new. Existing catalogue values
// and every other namespace remain in all historical full-catalogue proofs.
export function withoutStudentStateAdditions(value: Record<string, unknown>) {
  const workspace = value.studentWorkspace as
    | {
        gradebook: Record<string, unknown>;
        coursework: Record<string, unknown>;
      }
    | undefined;
  if (!workspace) return value;
  const { gradebook, coursework } = workspace;
  const additions = {
    gradebook: {
      loadError: gradebook.loadError,
      emptyCriteria: gradebook.emptyCriteria,
    },
    coursework: { empty: coursework.empty },
  };
  const count = [
    gradebook.loadError,
    gradebook.emptyCriteria,
    coursework.empty,
  ].filter((item) => item !== undefined).length;
  if (!count) return value;
  if (
    !Object.values(baseline.additions).some(
      (expected) => JSON.stringify(expected) === JSON.stringify(additions),
    )
  )
    throw new Error("Unverified Student query-state additions");
  delete gradebook.loadError;
  delete gradebook.emptyCriteria;
  delete coursework.empty;
  return value;
}
