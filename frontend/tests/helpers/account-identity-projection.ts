import baseline from "../fixtures/ui-d01-15-account-identity-baseline.json";
// Reverse exact, unique reviewed presentation seams for this owner only.
// Unknown paths, altered/missing/duplicate seams fail closed. This leaves
// historical source/translation baselines intact; direct invariants are separate.
export function projectAccountIdentitySource(source: string, path: string) {
  const original = source.replace(/\r\n/g, "\n");
  if (
    !/(?:^|\/)src\/features\/admin\/account-identity-management\.tsx$/.test(
      path.replaceAll("\\", "/"),
    )
  )
    return original;
  let result = original;
  for (const seam of baseline.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
