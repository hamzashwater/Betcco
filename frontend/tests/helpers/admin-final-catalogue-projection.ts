import baseline from "../fixtures/admin-a5-5-10-15-copy-baseline.json";
import ts from "typescript";

export function restorePrebatchAdminFunctions(source: string) {
  const file = ts.createSourceFile(
    "admin-area.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  for (const fn of file.statements.filter(ts.isFunctionDeclaration).reverse()) {
    const name = fn.name?.text;
    if (name === "AdminWallet" || name === "SchoolIntegrations")
      source =
        source.slice(0, fn.getStart(file)) +
        baseline.prebatchAdminFunctions[name] +
        source.slice(fn.end);
  }
  return source;
}

// Historical audits project away only the independently frozen final-batch
// additions. Existing values and every earlier slice remain in their hashes.
export function withoutFinalAdminAdditions(catalogue: Record<string, unknown>) {
  const workspace = catalogue.adminWorkspace as Record<string, unknown>;
  for (const section of [
    "academicCatalogManagement",
    "privacyRequests",
    "securityIncidents",
    "platformRatingModeration",
    "wallet",
    "schoolIntegrations",
    "legacyRetakes",
  ])
    delete workspace[section];
  for (const namespace of ["academicCatalogue", "deliveryPlanning"] as const) {
    const target = catalogue[namespace] as Record<string, unknown>;
    for (const c of baseline.scopes[namespace].cases) delete target[c.key];
  }
  return catalogue;
}
