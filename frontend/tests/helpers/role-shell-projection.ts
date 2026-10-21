import baseline from "../fixtures/ui-d01-05-role-shell-baseline.json";
import { withoutPlayerWorkspaceAdditions } from "./player-workspace-projection";
import {
  projectTeacherWorkloadSource,
  withoutTeacherWorkloadAdditions,
} from "./teacher-workload-projection";

// Missing, duplicate or altered reviewed hunks leave the entire source intact.
// Historical proofs retain their original hashes and all unrelated bytes.
export function projectRoleShellSource(source: string, path: string) {
  const original = projectTeacherWorkloadSource(source, path).replace(
    /\r\n/g,
    "\n",
  );
  const file = baseline.files[path as keyof typeof baseline.files];
  if (!file) return original;
  let result = original;
  for (const { approved, previous } of file.seams) {
    if (result.split(approved).length !== 2) return original;
    result = result.replace(approved, previous);
  }
  return result;
}

export function withoutRoleShellAdditions(value: Record<string, unknown>) {
  withoutTeacherWorkloadAdditions(value);
  withoutPlayerWorkspaceAdditions(value);
  const navigation = value.navigation as Record<string, unknown> | undefined;
  if (!navigation || !Object.hasOwn(navigation, "roleShell")) return value;
  if (
    !Object.values(baseline.additions).some(
      (pair) => JSON.stringify(pair) === JSON.stringify(navigation.roleShell),
    )
  )
    throw new Error("Unverified role shell copy additions");
  delete navigation.roleShell;
  return value;
}
