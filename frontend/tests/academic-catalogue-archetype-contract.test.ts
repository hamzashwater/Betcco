import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import baseline from "./fixtures/ui-d01-15-academic-catalogue-baseline.json";
import { catalogueContracts } from "./helpers/academic-catalogue-contracts";
import {
  projectCatalogueBoundary,
  withoutCatalogueAdditions,
} from "./helpers/academic-catalogue-projection";
import { directFetchCalls } from "./helpers/academic-catalog-management-contracts";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  source = read(baseline.path),
  original = read("tests/fixtures/academic-catalogue-original.txt");
describe("Slice 10 exact catalogue contracts and independent boundaries", () => {
  it("pins the actual preflight main and source; keeps exact query/mutation/type/validation/mapping contracts", () => {
    expect(baseline.base).toBe("84acc7ea50af4d10a5b92552d4e4b1de36cc34d0");
    expect(hash(JSON.stringify(baseline))).toBe(
      "ccdd256ed127e06db2115bfcb682e5b2ef3aeab2237937df5b9fc5001a3d90ee",
    );
    expect(hash(original)).toBe(baseline.originalHash);
    expect(hash(source)).toBe(baseline.approvedHash);
    expect(catalogueContracts(source)).toEqual(catalogueContracts(original));
    expect(source.match(/useQuery\(/g)).toHaveLength(2);
    expect(source.match(/useMutation\(/g)).toHaveLength(4);
    expect(source.match(/retry: false/g)).toHaveLength(2);
    expect(source).toContain(
      "{versions.isSuccess ? <AcademicCatalogManagement /> : null}",
    );
    expect(source).not.toMatch(
      /\.sort\(|\.toSorted\(|setQueryData|optimistic|"DELETE"|"PATCH"|latestVersion|useEffect|localStorage/,
    );
    expect(directFetchCalls(source)).toEqual([]);
  });
  it.each([
    ['["academic-catalogue", "versions"]', '["wrong"]'],
    ["/admin/academic-catalogue/versions", "/wrong/versions"],
    ["retry: false", "retry: true"],
    [
      'chosenVersionId || versions.data?.[0]?.id || ""',
      'versions.data?.find(v => v.isActive)?.id || ""',
    ],
    ['["academic-catalogue", versionId]', '["academic-catalogue"]'],
    ["Boolean(versionId)", "true"],
    ["definitions/${id}/publish", "definitions/other/publish"],
    ["scopes/${id}/activate", "scopes/other/activate"],
    ["isActive: !unit.isActive", "isActive: true"],
    [
      "JSON.stringify({ arabicTitle })",
      "JSON.stringify({ arabicTitle: arabicTitle.trim() })",
    ],
    ["delete next[id]", "delete next.other"],
    ['issueKeys[issue] ?? "invalidMapping"', '"ready"'],
    ["issues.length > 0", "issues.length > 99"],
    ["!definition.isActive", "definition.isActive"],
    ["!scope.isActive", "scope.isActive"],
    ["!arabicDrafts[unit.id]?.trim()", "false"],
    ["aims.get(id)?.code", 'aims.get("invented")?.code'],
    ["criteria.get(id)?.code", 'criteria.get("invented")?.code'],
  ])(
    "rejects wire/selection/validation/identity drift: %s",
    (before, after) => {
      expect(source).toContain(before);
      const bad = source.replace(before, after);
      expect(catalogueContracts(bad)).not.toEqual(catalogueContracts(original));
      expect(projectCatalogueBoundary(bad, baseline.path)).toBe(bad);
    },
  );
  it("accepts only exact owner/guard/copy seams and rejects changed/missing/duplicate content", () => {
    for (const p of [baseline.path, "C:/workspace/" + baseline.path])
      expect(projectCatalogueBoundary(source, p)).toBe(original);
    expect(
      projectCatalogueBoundary(source, "src/other/academic-catalogue.tsx"),
    ).toBe(source);
    for (const bad of ["", source + source, source.replace(/\S/, "#")])
      expect(projectCatalogueBoundary(bad, baseline.path)).toBe(bad);
    for (const [p, seam] of Object.entries(baseline.guards)) {
      expect(projectCatalogueBoundary(read(p), p)).toBe(seam.previous);
      for (const bad of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(projectCatalogueBoundary(bad, p)).toBe(bad);
    }
  });
  it.each(Object.entries(baseline.protected))(
    "freezes Slice 9 child, previous owners, backend, dependencies and historical guards: %s",
    (p, expected) =>
      expect(hash(projectCatalogueBoundary(read(p), p))).toBe(expected),
  );
  it.each(["en", "ar"] as const)(
    "retains old %s copy and permits only 14 exact paired additions",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        copy = JSON.parse(raw),
        old = JSON.parse(projectCatalogueBoundary(raw, p));
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(14);
      expect(withoutCatalogueAdditions(JSON.parse(raw))).toEqual(old);
      for (const [k, v] of Object.entries(baseline.additions[locale])) {
        expect(copy.academicCatalogue[k]).toBe(v);
        const bad = JSON.parse(raw);
        bad.academicCatalogue[k] += "changed";
        expect(() => withoutCatalogueAdditions(bad)).toThrow();
      }
      const extra = JSON.parse(raw);
      extra.academicCatalogue.unapproved = "kept";
      expect(withoutCatalogueAdditions(extra)).toMatchObject({
        academicCatalogue: { unapproved: "kept" },
      });
    },
  );
  it("uses scoped opaque roles, DC03 weights, logical layout and reachable 44px controls without styling the child", () => {
    const css = read("src/features/admin/academic-catalogue.module.css"),
      global = read("src/app/globals.css");
    expect(source).not.toMatch(
      /font-black|font-extrabold|disabled:opacity|animate-pulse/,
    );
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)|\.workspace\s+(:is|input|button|select|h\d)/,
    );
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    for (const term of [
      "min-height: 44px",
      "outline-offset: 2px",
      "overflow-wrap: anywhere",
      "border-inline-start",
    ])
      expect(css).toContain(term);
  });
});
