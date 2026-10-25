import { createHash } from "node:crypto";
import { projectSecurityIncidentBoundary } from "./helpers/security-incident-projection";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-privacy-request-baseline.json";
import { privacyRequestContracts } from "./helpers/privacy-request-contracts";
import {
  projectPrivacyRequestBoundary,
  withoutPrivacyRequestAdditions,
} from "./helpers/privacy-request-projection";
const read = (p: string) =>
    projectSecurityIncidentBoundary(
      readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
      p,
    ),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  path = baseline.path,
  source = read(path);
describe("Slice 6 independent human-review boundary", () => {
  it("pins pre-edit live main, independently frozen exact fixture and all executable contracts", () => {
    expect(baseline.base).toBe("dc248acdb4b9dc960b273a0140827d219039ffc6");
    expect(baseline.originalHash).toBe(
      "45fdbf0ff5ee245d5eb1391b413455c4b72026d351bbe4e9812a4a55a0c90a4d",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "452cd9ff642f5d9bfffeba1cfc427b0b699aa5029744323e076f77e2781e25ae",
    );
    expect(privacyRequestContracts(source)).toEqual(baseline.invariants);
  });
  it("has one query and review only, no identity exposure, execution, transition inference, sort/filter/search/fan-out or persistence", () => {
    expect(source.match(/useQuery\(/g)).toHaveLength(1);
    expect(source.match(/useMutation\(/g)).toHaveLength(1);
    expect(source.match(/\bapi</g)).toHaveLength(2);
    expect(source).not.toMatch(
      /OwnerUserId|ownerUserId|IdentityVerifiedByUserId|identityVerifiedByUserId|email|phone|address|profile|localStorage|sessionStorage|useEffect|useMemo|\.sort\(|\.toSorted\(|\.filter\(|\.slice\(|\.reduce\(|CanTransition|canTransition|fulfillmentStatus|readyToComplete|selectAll|bulk|\b(?:execute|download|exportData|eraseData)\s*\(/i,
    );
    expect(source).toContain("query.data.items.map((item)");
    expect(source).toContain("query.data.totalCount");
  });
  it("restores only exact unique relative/absolute owner seams and fails closed", () => {
    for (const p of [path, "C:/workspace/" + path])
      expect(hash(projectPrivacyRequestBoundary(source, p))).toBe(
        baseline.originalHash,
      );
    expect(
      projectPrivacyRequestBoundary(
        source,
        "src/features/other/privacy-request-management.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(
          hash(
            projectPrivacyRequestBoundary(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each([
    ['["admin-privacy-requests", status]', '["privacy-requests"]'],
    ["requests?pageSize=50", "requests?pageSize=100"],
    ["&status=${status}", "&filter=${status}"],
    ["retry: false", "retry: true"],
    ['method: "PUT"', 'method: "POST"'],
    ["requests/${selected.id}", "requests/other"],
    ["status: nextStatus", 'status: "Completed"'],
    ["resolutionSummary.trim() || null", "resolutionSummary || null"],
    ["markIdentityVerified: identityVerified", "markIdentityVerified: true"],
    ["setSelected(updated)", "setSelected(selected)"],
    ['updated.resolutionSummary ?? ""', '""'],
    ["Boolean(updated.identityVerifiedAtUtc)", "true"],
    ["void query.refetch()", "void 0"],
    ['item.status === "Submitted" ? "InReview" : item.status', '"InReview"'],
    ["review.reset()", "void 0"],
    ['item.resolutionSummary ?? ""', '""'],
    ["Boolean(item.identityVerifiedAtUtc)", "true"],
    ['["Completed", "Rejected", "Cancelled"]', '["Completed", "Rejected"]'],
    ["disabled={isFinal}", "disabled={false}"],
    ["isFinal || Boolean(selected.identityVerifiedAtUtc)", "isFinal"],
    ["disabled={review.isPending}", "disabled={false}"],
    ["maxLength={2000}", "maxLength={2001}"],
    ['"Portability"', '"Export"'],
    ['"Cancelled";', '"Deleted";'],
    ["selected, setSelected]", "selected, overrideSelected]"],
  ])(
    "rejects transport/transition/selection/identity/final/precision drift at %s",
    (from, to) => {
      const changed = source.replace(from, to);
      expect(changed).not.toBe(source);
      expect(privacyRequestContracts(changed)).not.toEqual(baseline.invariants);
      expect(hash(projectPrivacyRequestBoundary(changed, path))).not.toBe(
        baseline.originalHash,
      );
    },
  );
  it.each(Object.entries(baseline.protected))(
    "preserves previous owners, privacy/security producers, dependencies and historical fixtures: %s",
    (p, expected) =>
      expect(hash(projectPrivacyRequestBoundary(read(p), p)), p).toBe(expected),
  );
  it.each(["en", "ar"] as const)(
    "allows only twelve exact paired factual %s leaves; old legal/static copy remains frozen",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw);
      expect(hash(projectPrivacyRequestBoundary(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(
        JSON.stringify(withoutPrivacyRequestAdditions(JSON.parse(raw))),
      ).toBe(JSON.stringify(JSON.parse(projectPrivacyRequestBoundary(raw, p))));
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(12);
      for (const [key, value] of Object.entries(baseline.additions[locale])) {
        expect(m.adminWorkspace.privacyRequests[key]).toBe(value);
        const changed = JSON.parse(raw);
        changed.adminWorkspace.privacyRequests[key] += " changed";
        expect(() => withoutPrivacyRequestAdditions(changed)).toThrow();
      }
      const extra = JSON.parse(raw);
      extra.adminWorkspace.privacyRequests.unapproved = "preserve";
      expect(
        (
          withoutPrivacyRequestAdditions(extra)
            .adminWorkspace as typeof m.adminWorkspace
        ).privacyRequests.unapproved,
      ).toBe("preserve");
    },
  );
  it.each(Object.entries(baseline.guardSeams))(
    "allows only exact reviewed test-only guard seams in %s",
    (p, seams) => {
      expect(hash(projectPrivacyRequestBoundary(read(p), p))).toBe(
        baseline.protected[p as keyof typeof baseline.protected],
      );
      for (const seam of seams)
        expect(
          projectPrivacyRequestBoundary(
            read(p).replace(seam.approved, seam.approved + "changed"),
            p,
          ),
        ).not.toBe(projectPrivacyRequestBoundary(read(p), p));
    },
  );
  it("locks DC03, existing semantic tokens, opaque local surfaces, noncolor selection, focus, wrapping and 44px controls", () => {
    const css = read(
        "src/features/admin/privacy-request-management.module.css",
      ),
      global = read("src/app/globals.css");
    expect(source).not.toMatch(
      /font-black|font-extrabold|disabled:opacity|bg-primary|text-red-/,
    );
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)/,
    );
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("border-inline-start");
    expect(source).toContain("aria-pressed={selected?.id === item.id}");
    expect(source).toContain('t("privacyRequests.selectedRequest")');
    expect(css).toContain('.row[aria-pressed="true"]:hover');
  });
  it("retains PrivacyAdmin, server final/transition/identity/evidence/order/audit authority and human-review-only boundary", () => {
    const backend = read(
      "../backend/src/Betcco.Api/Controllers/PrivacyController.cs",
    );
    for (const text of [
      '[Authorize(Policy = "PrivacyAdmin")]',
      "PRIVACY_REQUEST_FINAL",
      "PRIVACY_TRANSITION_INVALID",
      "PRIVACY_IDENTITY_VERIFICATION_REQUIRED",
      "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED",
      "DataSubjectFulfillmentStatus.Released",
      "DataSubjectFulfillmentStatus.Applied",
      "OrderByDescending(item => item.CreatedAtUtc).ThenByDescending(item => item.Id)",
      "PrivacyRequestAdminListRead",
      "PrivacyRequestAdminDetailRead",
      "PrivacyRequestReviewed",
      "it intentionally never performs irreversible erasure or exports",
    ])
      expect(backend).toContain(text);
  });
});
