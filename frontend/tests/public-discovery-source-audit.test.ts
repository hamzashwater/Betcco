import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/public-discovery-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import {
  auditDiscovery,
  assertDiscoveryProductionScope,
  discoveryContract,
  scopedFiles,
} from "./helpers/public-discovery-i18n-audit";
import { withoutPublicDiscoveryAdditions } from "./helpers/public-discovery-catalogue-projection";

const read = (p: string) => readFileSync(p, "utf8");
const messages = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};
describe("T7-A6.2 public discovery and catalogue", () => {
  it("pins exactly the seven reviewed production files and original 101/2/0 records to reviewed base hashes", () => {
    const reviewedHashes = [
      "154863e226483b405ac79c98faab7ac8159344962b941595cb69ba29f29ff64b",
      "f69fee22ced712282699c54a0ca3a8a78f69de254e9eca0d2cdb76046f0af466",
      "59299c3a096b424f51185b4cc0253e17060e12eb268b24ecdd6e7bc99d16d320",
      "7f667f459a253a09e14b8f600b968db75d2df27c683de98d4ceee3a1e9013c4f",
      "95bcd90b01ec15fbd31603256d8c8db60253ba816d6acf5836df1bd4d5423e49",
      "cb8c5c923e8bee8c18415f526e2c02ea3fc61369ec567a20c8e56ae46c151c0e",
      "7139060da2ed22da4a2e61fa0d6e06118446b4e400932e43506cc8d37c651d5d",
    ];
    expect(Object.keys(baseline.sources)).toEqual(scopedFiles);
    expect(scopedFiles.map((path) => digest(baseline.sources[path]))).toEqual(
      reviewedHashes,
    );
    for (const path of scopedFiles) {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      expect(
        baseline.replacements[path]
          .map((edit) => normalize(edit.original))
          .sort(),
      ).toEqual(
        baseline.records[path]
          .map((record) =>
            normalize(
              record.context ===
                'error instanceof Error ? error.message : "Unable to add course."'
                ? '"Unable to add course."'
                : record.context,
            ),
          )
          .sort(),
      );
      for (const record of baseline.records[path])
        expect(baseline.sources[path].replace(/\s+/g, " ")).toContain(
          record.context,
        );
    }
    const records = Object.values(baseline.records).flat();
    expect(records.filter((r) => r.category === "STATIC_UI")).toHaveLength(101);
    expect(
      records.filter((r) => r.category === "ACCESSIBILITY_STATIC_UI"),
    ).toHaveLength(2);
    expect(records.filter((r) => r.category === "UNCLASSIFIED")).toHaveLength(
      0,
    );
    const authorized = scopedFiles.map((path) => `frontend/${path}`);
    expect(() => assertDiscoveryProductionScope(authorized)).not.toThrow();
    expect(() =>
      assertDiscoveryProductionScope([
        ...authorized,
        "frontend/src/features/student/student-area.tsx",
      ]),
    ).toThrow("Unexpected T7-A6.2 production scope");
  });
  it.each(scopedFiles)(
    "has zero residuals and preserves complete non-copy syntax in %s",
    (path) => {
      const source = read(path),
        report = auditDiscovery(source, path);
      expect(report.findings).toEqual([]);
      expect(report.counts).toEqual({
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      });
      expect(discoveryContract(source, path)).toBe(
        discoveryContract(baseline.sources[path], path, true),
      );
      const flat = {
        ar: leaves(messages.ar.value),
        en: leaves(messages.en.value),
      };
      for (const ref of report.references)
        for (const locale of ["ar", "en"] as const)
          expect(
            typeof flat[locale][
              [ref.namespace, ref.key].filter(Boolean).join(".")
            ],
          ).toBe("string");
    },
  );
  it("retains both server-owned outcome/skill bilingual branches", () => {
    expect(
      auditDiscovery(read(scopedFiles[5]), scopedFiles[5]).retained,
    ).toEqual([
      {
        category: "SERVER_BILINGUAL_DATA",
        text: 'locale === "ar" ? item.arabic : item.english',
      },
      {
        category: "SERVER_BILINGUAL_DATA",
        text: 'locale === "ar" ? item.arabic : item.english',
      },
    ]);
  });
  it("has exact AR/EN parity and zero duplicate JSON keys", () => {
    expect(Object.keys(leaves(messages.ar.value)).sort()).toEqual(
      Object.keys(leaves(messages.en.value)).sort(),
    );
    expect(messages.ar.duplicates).toEqual([]);
    expect(messages.en.duplicates).toEqual([]);
  });
  it.each(["ar", "en"] as const)(
    "adds exactly 97 reviewed %s keys and changes no existing value",
    (locale) => {
      const value = messages[locale].value as Record<string, unknown>;
      expect(leaves(value.publicDiscovery)).toEqual(
        leaves(baseline.catalogues[locale].additions),
      );
      expect(Object.keys(leaves(value.publicDiscovery))).toHaveLength(97);
      expect(
        digest(
          JSON.stringify(
            withoutPublicDiscoveryAdditions(structuredClone(value)),
          ),
        ),
      ).toBe(baseline.catalogues[locale].baseCatalogueHash);
    },
  );
  it.each([
    "<p>Hardcoded English UI</p>",
    "<p>نص عربي ثابت</p>",
    '<button aria-label="Accessible action"/>',
    '<input placeholder="Search here"/>',
    '<p>{locale === "ar" ? "ثابت" : "Static"}</p>',
    'const helper = () => "Helper copy";',
    'const map = {ar:"ثابت",en:"Static"};',
    'setNotice("Local error fallback");',
    "copy(key);",
  ])("detects injected copy/unknown keys: %s", (mutation) => {
    const source = read(scopedFiles[4]);
    expect(
      auditDiscovery(
        source + `\nfunction Mutation(){${mutation}}`,
        scopedFiles[4],
      ).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ['"POST"', '"GET"'],
    ["error.message", '"Replaced server error"'],
    ['roles.includes("Student")', 'roles.includes("Teacher")'],
    ["add.isPending || user.isPending", "add.isPending"],
  ])("detects contract drift from %s", (from, to) => {
    const path = scopedFiles[4],
      source = read(path);
    expect(source).toContain(from);
    expect(discoveryContract(source.replace(from, to), path)).not.toBe(
      discoveryContract(source, path),
    );
  });
  it("does not mask new keys or altered frozen additions", () => {
    const value = structuredClone(messages.en.value) as Record<string, unknown>;
    (value.publicDiscovery as Record<string, unknown>).unrelated = "Drift";
    expect(() => withoutPublicDiscoveryAdditions(value)).toThrow(
      "Unverified public discovery additions",
    );
  });
});
