import { createHash } from "node:crypto";
import { projectPrivacyRequestBoundary } from "./helpers/privacy-request-projection";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-commission-baseline.json";
import { commissionContracts } from "./helpers/commission-contracts";
import {
  projectCommissionBoundary,
  withoutCommissionAdditions,
} from "./helpers/commission-projection";
const read = (p: string) =>
    projectPrivacyRequestBoundary(
      readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
      p,
    ),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  path = baseline.path,
  source = read(path);
describe("Slice 5 independent financial boundary", () => {
  it("pins live-main pre-edit source, executable snapshot and exact reviewed fixture", () => {
    expect(baseline.base).toBe("f7b87b4fb6e7132cb30d57a6cd48c2219745e559");
    expect(baseline.originalHash).toBe(
      "0438d0e301a2f8cd775286e5baacc618b0cce5a6c90e308b3dac2c95da5d5f45",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "cab840bac3b665e134c358c6fe3cae9936643849f950ffd6a78ca2d39df95a59",
    );
    expect(commissionContracts(source)).toEqual(baseline.invariants);
    expect(source).not.toMatch(
      /localStorage|sessionStorage|useEffect|useMemo|setTimeout|debounce|optimistic|currency|effectiveDate|reason:|\.sort\(|\.filter\(/,
    );
    expect(source.match(/useQuery\(/g)).toHaveLength(2);
    expect(source.match(/useMutation\(/g)).toHaveLength(2);
    expect(source.match(/window\.confirm\(/g)).toHaveLength(2);
  });
  it("restores only unique exact owner seams with relative/absolute paths and fails closed", () => {
    for (const p of [path, "C:/workspace/" + path])
      expect(hash(projectCommissionBoundary(source, p))).toBe(
        baseline.originalHash,
      );
    expect(
      projectCommissionBoundary(
        source,
        "src/features/other/commission-settings.tsx",
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
            projectCommissionBoundary(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each([
    ['["platform-commission"]', '["changed-commission"]'],
    ['["sales-tax"]', '["changed-tax"]'],
    ['["admin-wallet"]', '["wallet"]'],
    ['"/admin/commerce-catalog/commission"', '"/commission"'],
    ['"/admin/commerce-catalog/sales-tax"', '"/tax"'],
    ['method: "PUT"', 'method: "POST"'],
    [
      "JSON.stringify({ platformCommissionPercent })",
      "JSON.stringify({ platformCommissionPercent, teacherSharePercent: 70 })",
    ],
    [
      "JSON.stringify({ salesTaxPercent })",
      'JSON.stringify({ salesTaxPercent, country: "JO" })',
    ],
    ["setDraft(undefined)", 'setDraft("0")'],
    ["setTaxDraft(undefined)", 'setTaxDraft("0")'],
    ['window.confirm(t("commissionConfirm"))', "true"],
    ['window.confirm(t("taxConfirm"))', "true"],
    ["Number.isFinite(value)", "true"],
    ["Number.isFinite(taxValue)", "true"],
    ["value <= 100", "value <= 99"],
    ["taxValue >= 0", "taxValue >= 1"],
    ["100 - value", "99 - value"],
    ["commission.data?.teacherSharePercent", "0"],
    ["draft ?? commission.data", "commission.data"],
    ["taxDraft ?? salesTax.data", "salesTax.data"],
    ['step="0.001"', 'step="0.01"'],
    [
      "!valid || save.isPending || commission.isPending",
      "!valid || save.isPending",
    ],
    [
      "!taxIsValid || saveTax.isPending || salesTax.isPending",
      "!taxIsValid || saveTax.isPending",
    ],
    ["minimumFractionDigits: 3", "minimumFractionDigits: 2"],
    ["maximumFractionDigits: 3", "maximumFractionDigits: 2"],
  ])("rejects financial contract drift at %s", (from, to) => {
    const changed = source.replace(from, to);
    expect(changed).not.toBe(source);
    expect(commissionContracts(changed)).not.toEqual(baseline.invariants);
    expect(hash(projectCommissionBoundary(changed, path))).not.toBe(
      baseline.originalHash,
    );
  });
  it.each(Object.entries(baseline.protected))(
    "freezes previous owners, backend, wallet, dependencies and historical fixtures: %s",
    (p, expected) => {
      expect(hash(projectCommissionBoundary(read(p), p)), p).toBe(expected);
    },
  );
  it.each(["en", "ar"] as const)(
    "permits only eleven exact paired factual %s messages, preserving all prior values",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw),
        projected = withoutCommissionAdditions(JSON.parse(raw));
      expect(hash(projectCommissionBoundary(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(JSON.stringify(projected)).toBe(
        JSON.stringify(JSON.parse(projectCommissionBoundary(raw, p))),
      );
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(11);
      for (const [key, value] of Object.entries(baseline.additions[locale])) {
        expect(m.commerceCatalog[key]).toBe(value);
        const changed = JSON.parse(raw);
        changed.commerceCatalog[key] += " changed";
        expect(() => withoutCommissionAdditions(changed)).toThrow();
      }
      const unrelated = JSON.parse(raw);
      unrelated.commerceCatalog.futureRule = "UNAPPROVED";
      expect(
        withoutCommissionAdditions(unrelated).commerceCatalog,
      ).toHaveProperty("futureRule");
    },
  );
  it.each(Object.entries(baseline.guardSeams))(
    "allows only exact test-only alignment seams in %s",
    (p, seams) => {
      expect(hash(projectCommissionBoundary(read(p), p))).toBe(
        baseline.protected[p as keyof typeof baseline.protected],
      );
      for (const seam of seams)
        expect(
          projectCommissionBoundary(
            read(p).replace(seam.approved, seam.approved + "changed"),
            p,
          ),
        ).not.toBe(projectCommissionBoundary(read(p), p));
    },
  );
  it("owns factual results, hides unknown preview without fabricating fallback and retains locked DC03/DC04/semantic controls", () => {
    for (const owner of ["commission", "tax"])
      for (const kind of ["success", "error"])
        expect(source).toContain(
          `setNoticeContext({ owner: "${owner}", kind: "${kind}" })`,
        );
    expect(source).toContain('noticeContext?.owner === "commission"');
    expect(source).toContain('noticeContext?.owner === "tax"');
    expect(source).toContain(
      "commission.data === undefined && draft === undefined",
    );
    expect(source).not.toMatch(
      /font-black|font-extrabold|text-red-|bg-primary|disabled:opacity/,
    );
    const css = read("src/features/admin/commission-settings.module.css");
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)/,
    );
    for (const weight of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(weight[1]));
    for (const token of [
      "--ui-surface-canvas",
      "--ui-surface-panel",
      "--ui-surface-inset",
      "--ui-border-control",
      "--ui-action-primary-surface",
      "--ui-action-primary-foreground",
      "--ui-action-disabled",
      "--ui-action-disabled-text",
      "--ui-focus-ring",
    ])
      expect(css).toContain(token);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("border-inline-start");
    expect(source.match(/strokeWidth=\{2\}/g)).toHaveLength(3);
  });
});
