import baseline from "../fixtures/ui-d01-04-admin-baseline.json";
import {
  projectAdminHomeSource,
  withoutAdminHomeAdditions,
} from "./admin-home-projection";

// Only exact reviewed Admin state hunks may return to the merged main source.
// Missing, duplicated or altered hunks leave the complete source unprojected.
export function projectAdminStateSource(source: string) {
  const original = projectAdminHomeSource(source).replace(/\r\n/g, "\n");
  let result = original;
  for (const { approved, previous } of baseline.seams) {
    if (result.split(approved).length !== 2) return original;
    result = result.replace(approved, previous);
  }
  return result;
}

// Historical audits also pass partial namespace partitions. Remove only an
// exact approved leaf when present; unrelated/mutated additions stay rejected.
export function withoutAdminStateAdditions(value: Record<string, unknown>) {
  withoutAdminHomeAdditions(value);
  const workspace = value.adminWorkspace as
    Record<string, Record<string, unknown>> | undefined;
  for (const [section, key] of [
    ["dashboard", "requestError"],
    ["courseApprovals", "signIn"],
  ] as const) {
    const record = workspace?.[section];
    if (!record || !Object.hasOwn(record, key)) continue;
    const expected = Object.values(baseline.additions).map((pair) =>
      section === "dashboard"
        ? pair.dashboard.requestError
        : pair.courseApprovals.signIn,
    );
    if (!expected.some((text) => text === record[key]))
      throw new Error("Unverified Admin state addition");
    delete record[key];
  }
  return value;
}
