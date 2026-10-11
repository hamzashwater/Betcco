import baseline from "../fixtures/public-discovery-i18n-baseline.json";
import { leaves } from "./admin-final-i18n-audit";
import { withoutPublicTrustAdditions } from "./public-trust-catalogue-projection";

// Project only the exact frozen T7-A6.2 additions. Altered or additional values
// must fail; no namespace-wide wildcard is accepted by historical hash audits.
export function withoutPublicDiscoveryAdditions(
  value: Record<string, unknown>,
) {
  withoutPublicTrustAdditions(value);
  const actual = JSON.stringify(leaves(value.publicDiscovery));
  if (
    ![baseline.catalogues.ar.additions, baseline.catalogues.en.additions].some(
      (expected) => JSON.stringify(leaves(expected)) === actual,
    )
  )
    throw new Error("Unverified public discovery additions");
  delete value.publicDiscovery;
  return value;
}
