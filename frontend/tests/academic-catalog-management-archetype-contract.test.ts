import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { projectCatalogueBoundary } from "./helpers/academic-catalogue-projection";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-academic-catalog-management-baseline.json";
import {
  academicCatalogContracts,
  directFetchCalls,
} from "./helpers/academic-catalog-management-contracts";
import {
  projectAcademicCatalogBoundary,
  withoutAcademicCatalogAdditions,
} from "./helpers/academic-catalog-management-projection";

const read = (p: string) =>
    projectCatalogueBoundary(readFileSync(p, "utf8").replace(/\r\n/g, "\n"), p),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  source = read(baseline.path),
  previous = read("tests/fixtures/academic-catalog-management-original.txt");
describe("Slice 9 independently frozen academic authoring contracts", () => {
  it("pins the preflight original and exact presentation seam", () => {
    expect(baseline.base).toBe("2431f36dffc96dd420c602167caf5c4c1d4db24a");
    expect(hash(previous)).toBe(baseline.originalHash);
    expect(hash(source)).toBe(baseline.approvedHash);
    expect(hash(JSON.stringify(baseline))).toBe(
      "a069e3761dbac89d9a8810794413428955e2922cd8b541df9175f5e4a6110a63",
    );
    expect(academicCatalogContracts(source)).toEqual(
      academicCatalogContracts(previous),
    );
    expect(source.match(/useQuery\(/g)).toHaveLength(4);
    expect(source.match(/useMutation\(/g)).toHaveLength(1);
    expect(source).not.toMatch(
      /\.sort\(|\.toSorted\(|"DELETE"|"PATCH"|setQueryData|optimistic|useEffect|latestVersion|localStorage/,
    );
    expect(directFetchCalls(source)).toEqual([]);
    expect(source.match(/if \(!trackId\) return;/g)).toHaveLength(2);
    expect(source).toContain("if (write.isPending) return;");
  });
  it.each([
    'fetch("/api/example")',
    'window.fetch("/api/example")',
    'globalThis.fetch("/api/example")',
    'globalThis["fetch"]("/api/example")',
    '(fetch)("/api/example")',
    'fetch /* comment */ ("/api/example")',
    'window?.fetch?.("/api/example")',
    'fetch!("/api/example")',
  ])("detects prohibited direct fetch call: %s", (call) => {
    expect(directFetchCalls(call)).toHaveLength(1);
    expect(directFetchCalls(source + "\n" + call)).toHaveLength(1);
  });
  it.each([
    "query.refetch()",
    "refetch()",
    "prefetch()",
    "queryClient.prefetchQuery()",
    "fetchRecords()",
    "myfetch()",
    'const fetchLabel = "fetch(\\\"/api/example\\\")";',
    '// fetch("/api/example")',
  ])("accepts refetch, prefetch and non-call text: %s", (expression) => {
    expect(directFetchCalls(expression)).toEqual([]);
  });
  it.each([
    ['["admin-catalog-tracks"]', '["wrong"]'],
    ["/taxonomy?locale=en", "/taxonomy?locale=ar"],
    ["(item) => item.isBtecFocused", "(item) => true"],
    ["Array.isArray(value.tracks) ? value.tracks : []", "value.tracks"],
    ["Array.isArray(value) ? value : []", "value"],
    ["/admin/academic-taxonomy/specializations", "/changed/specs"],
    ["/admin/academic-taxonomy/grades", "/changed/grades"],
    ["/qualification-registry", "/academic-catalogue"],
    ["sortOrder: 100", "sortOrder: 1"],
    ["learningTrackId: trackId", 'learningTrackId: "other"'],
    ['specializationId: ""', 'specializationId: "other"'],
    ["item.isVisible && item.learningTrackId === trackId", "item.isVisible"],
    ['item.isActive && item.source === "AdminCustom"', "item.isActive"],
    ['v.source === "AdminCustom"', 'v.source === "AdminCustom" && v.isActive'],
    ["isVisible: !item.isVisible", "isVisible: true"],
    ["effectiveUntilUtc: null", 'effectiveUntilUtc: "invented"'],
    ["new Date(", "String("],
    ["minLength={10}", "minLength={1}"],
    [
      "arabicTitle: unit.arabicTitle || unit.englishTitle",
      "arabicTitle: unit.arabicTitle.trim() || unit.englishTitle",
    ],
    ["isActive: !item.isActive", "isActive: true"],
    ["isActive: !v.isActive", "isActive: true"],
    ["/admin/academic-records/versions/${v.id}/status", "/changed/${v.id}"],
    ['["academic-catalogue"]', '["wrong"]'],
    ['["delivery-planning-versions"]', '["wrong"]'],
  ])(
    "rejects transport/identity/eligibility/validation mutation: %s",
    (before, after) => {
      expect(source).toContain(before);
      const changed = source.replace(before, after);
      expect(academicCatalogContracts(changed)).not.toEqual(
        academicCatalogContracts(previous),
      );
      expect(
        hash(projectAcademicCatalogBoundary(changed, baseline.path)),
      ).not.toBe(baseline.originalHash);
    },
  );
  it("projects only this exact owner and rejects unknown paths, missing, duplicated and edited sources", () => {
    for (const p of [baseline.path, "C:/workspace/" + baseline.path])
      expect(projectAcademicCatalogBoundary(source, p)).toBe(previous);
    expect(
      projectAcademicCatalogBoundary(
        source,
        "src/other/academic-catalog-management.tsx",
      ),
    ).toBe(source);
    for (const bad of ["", source + source, source.replace(/\S/, "#")])
      expect(projectAcademicCatalogBoundary(bad, baseline.path)).toBe(bad);
  });
  it.each(Object.entries(baseline.protected))(
    "keeps previous owners, Delivery Planning, parent, backend, packages and old guards unchanged: %s",
    (p, expected) => expect(hash(read(p))).toBe(expected),
  );
  it.each(["en", "ar"] as const)(
    "permits exactly 25 paired %s leaves and keeps all old values and unknown keys",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        seam = baseline.messageSeams[locale];
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(25);
      expect(
        JSON.stringify(withoutAcademicCatalogAdditions(JSON.parse(raw))),
      ).toBe(
        JSON.stringify(JSON.parse(projectAcademicCatalogBoundary(raw, p))),
      );
      for (const [k, v] of Object.entries(baseline.additions[locale])) {
        expect(
          JSON.parse(raw).adminWorkspace.academicCatalogManagement[k],
        ).toBe(v);
        const bad = JSON.parse(raw);
        bad.adminWorkspace.academicCatalogManagement[k] += "changed";
        expect(() => withoutAcademicCatalogAdditions(bad)).toThrow();
      }
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ]) {
        const changed = raw.replace(seam.approved, replacement);
        expect(projectAcademicCatalogBoundary(changed, p)).toBe(changed);
      }
      const extra = JSON.parse(raw);
      extra.adminWorkspace.academicCatalogManagement.unapproved = "kept";
      expect(
        (
          withoutAcademicCatalogAdditions(extra)
            .adminWorkspace as typeof extra.adminWorkspace
        ).academicCatalogManagement.unapproved,
      ).toBe("kept");
    },
  );
  it("uses existing semantic tokens, DC03 weights, visible labels, logical RTL, opaque panels and focus", () => {
    const css = read(
        "src/features/admin/academic-catalog-management.module.css",
      ),
      global = read("src/app/globals.css");
    expect(source).not.toMatch(
      /font-black|font-extrabold|animate-pulse|disabled:opacity|bg-primary/,
    );
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)/,
    );
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    expect(source.match(/<label\b/g)).toHaveLength(19);
    for (const s of [
      "min-height: 44px",
      "outline-offset: 2px",
      "overflow-wrap: anywhere",
      "border-inline-start",
    ])
      expect(css).toContain(s);
  });
});
