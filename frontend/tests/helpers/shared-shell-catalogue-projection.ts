import baseline from "../fixtures/shared-shell-i18n-baseline.json";
import { leaves } from "./admin-final-i18n-audit";

// Remove only the exact, independently frozen additions from T7-A6.1 so older
// catalogue hash tests continue detecting every old-value/unrelated-key drift.
export function withoutSharedShellAdditions(value: Record<string, unknown>) {
  for (const [path, expected] of Object.entries(
    baseline.catalogues.en.additions,
  )) {
    const parts = path.split(".");
    let parent = value;
    for (const part of parts.slice(0, -1)) {
      const child = parent[part];
      if (!child || typeof child !== "object")
        throw new Error(`Missing scoped namespace ${path}`);
      parent = child as Record<string, unknown>;
    }
    const key = parts.at(-1)!;
    const actual = parent[key];
    const arExpected =
      baseline.catalogues.ar.additions[
        path as keyof typeof baseline.catalogues.ar.additions
      ];
    if (
      ![expected, arExpected].some(
        (candidate) =>
          JSON.stringify(leaves(candidate)) === JSON.stringify(leaves(actual)),
      )
    )
      throw new Error(`Unverified shared shell additions: ${path}`);
    delete parent[key];
  }
  // These parents did not exist at base; unrelated keys remain visible to hashes.
  for (const namespace of ["forms"])
    if (Object.keys(value[namespace] as Record<string, unknown>).length === 0)
      delete value[namespace];
  return value;
}
