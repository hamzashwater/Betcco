import { withoutPlatformRatingAdditions } from "./platform-rating-projection";
import baseline from "../fixtures/ui-d01-13-admin-home-baseline.json";
import { projectAssessmentOperationsSource } from "./assessment-operations-projection";
import { withoutQualificationRegistryAdditions } from "./qualification-registry-projection";
// Exact reviewed UI13 seams only; absent, altered or duplicate hunks fail closed.
export function projectAdminHomeSource(source: string, path = baseline.path) {
  const original = projectAssessmentOperationsSource(source, path);
  if (path !== baseline.path) return original;
  let result = original;
  for (const seam of baseline.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
export function withoutAdminHomeAdditions(value: Record<string, unknown>) {
  withoutPlatformRatingAdditions(value);
  withoutQualificationRegistryAdditions(value);
  if (!Object.hasOwn(value, "adminHomePresentation")) return value;
  if (
    !Object.values(baseline.additions).some(
      (copy) =>
        JSON.stringify(copy) === JSON.stringify(value.adminHomePresentation),
    )
  )
    throw new Error("Unverified Admin home copy");
  delete value.adminHomePresentation;
  return value;
}
