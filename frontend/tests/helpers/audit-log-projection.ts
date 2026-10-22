import baseline from "../fixtures/ui-d01-15-audit-log-baseline.json";
// The old whole-Admin DOM/i18n freeze predates this explicitly authorized
// presentation slice. Reverse only exact, unique reviewed Audit Log seams.
// Changed, missing or duplicate seams fail closed; other owners are untouched.
export function projectAuditLogSource(source: string, path: string) {
  const original = source.replace(/\r\n/g, "\n");
  if (!path.replaceAll("\\", "/").endsWith("/audit-log.tsx")) return original;
  let result = original;
  for (const seam of baseline.seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
