import { readFileSync } from "node:fs";
import ts from "typescript";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import baseline from "./fixtures/admin-governance-gradebook-copy-baseline.json";
import {
  audit,
  contractHash,
  files,
  hash,
  parse,
  sections,
  type File,
} from "./helpers/admin-governance-gradebook-i18n-audit";

const completed: File[] = ["internal-verification-plan-management"];
const sources = Object.fromEntries(
  files.map((name) => [
    name,
    readFileSync(`src/features/admin/${name}.tsx`, "utf8"),
  ]),
) as Record<File, string>;
function leaves(value: unknown, prefix = ""): string[] {
  return typeof value === "string"
    ? [prefix]
    : Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
        leaves(v, `${prefix}.${key}`),
      );
}
describe("Governance/gradebook per-file copy audit and pre-batch freeze", () => {
  it.each(completed)(
    "has zero static or unclassified UI independently in %s",
    (name) => {
      expect(
        audit(sources[name], name, baseline.files[name].allowed),
      ).toMatchObject({
        findings: [],
        staticArabic: 0,
        staticEnglish: 0,
        staticBilingual: 0,
        inlineBilingual: 0,
        dataBranches: name === "qualification-registry-management" ? 3 : 0,
      });
    },
  );
  it.each(files)(
    "freezes the complete technical AST independently in %s",
    (name) => {
      expect(contractHash(sources[name], name)).toBe(
        baseline.files[name].contractHash,
      );
    },
  );
  it.each(completed)("classifies every retained locale use in %s", (name) => {
    expect(
      audit(sources[name], name, baseline.files[name].allowed).localeUses,
    ).toEqual(baseline.files[name].before.localeUses);
    expect(sources[name]).toContain("const locale = useLocale()");
  });
  it.each(completed)(
    "uses precisely the original wording keys without dead copy in %s",
    (name) => {
      expect(
        [
          ...new Set(
            audit(sources[name], name, baseline.files[name].allowed).keys,
          ),
        ].sort(),
      ).toEqual(baseline.files[name].cases.map((c) => c.key).sort());
    },
  );
  it.each(["ar", "en"] as const)(
    "preserves every original and earlier-commit wording in %s",
    (locale) => {
      const t = createTranslator({
        locale,
        messages: locale === "ar" ? ar : en,
        namespace: "adminWorkspace",
      });
      for (const name of completed)
        for (const c of baseline.files[name].cases)
          expect(t(c.key as Parameters<typeof t>[0]), c.key).toBe(c[locale]);
    },
  );
  it.each(["ar", "en"] as const)(
    "freezes the ENTIRE pre-batch catalogue in %s",
    (locale) => {
      const catalogue = JSON.parse(JSON.stringify(locale === "ar" ? ar : en));
      for (const section of Object.values(sections))
        delete catalogue.adminWorkspace[section];
      expect(hash(catalogue)).toBe(baseline.catalogueHashes[locale]);
    },
  );
  it("has exact AR/EN structural parity and no duplicate JSON keys", () => {
    expect(leaves(ar).sort()).toEqual(leaves(en).sort());
    for (const locale of ["ar", "en"]) {
      const duplicates: string[] = [];
      const sf = ts.parseJsonText(
        `${locale}.json`,
        readFileSync(`messages/${locale}.json`, "utf8"),
      );
      function visit(n: ts.Node) {
        if (ts.isObjectLiteralExpression(n)) {
          const names = n.properties
            .filter(ts.isPropertyAssignment)
            .map((p) => p.name.getText(sf));
          names.forEach((key, i) => {
            if (names.indexOf(key) !== i) duplicates.push(key);
          });
        }
        ts.forEachChild(n, visit);
      }
      visit(sf);
      expect(duplicates).toEqual([]);
    }
  });
  it.each(completed)(
    "rejects newly hardcoded UI independently in %s",
    (name) => {
      const key = baseline.files[name].cases.find((c) =>
        c.key.endsWith(".title"),
      )!.key;
      for (const replacement of [
        '"New English UI"',
        '"نص واجهة جديد"',
        'ar ? "عنوان" : "Title"',
        '({ar:"عنوان",en:"Title"}).en',
      ])
        expect(
          audit(
            sources[name].replace(`t("${key}")`, replacement),
            name,
            baseline.files[name].allowed,
          ).findings.length,
        ).toBeGreaterThan(0);
    },
  );
  it.each(files)(
    "rejects endpoint, raw-data, DOM and state contract drift in %s",
    (name) => {
      const sf = parse(sources[name]);
      const mutations: [number, number, string][] = [];
      function visit(n: ts.Node) {
        if (
          ts.isStringLiteral(n) &&
          (n.text.startsWith("/") ||
            n.text === "POST" ||
            n.parent.getText().startsWith("className="))
        )
          mutations.push([
            n.getStart(sf),
            n.end,
            JSON.stringify(n.text + "-drift"),
          ]);
        if (ts.isNumericLiteral(n) && ["10", "2000", "4000"].includes(n.text))
          mutations.push([n.getStart(sf), n.end, "9"]);
        ts.forEachChild(n, visit);
      }
      visit(sf);
      expect(mutations.length).toBeGreaterThan(10);
      for (const [start, end, replacement] of mutations)
        expect(
          contractHash(
            sources[name].slice(0, start) +
              replacement +
              sources[name].slice(end),
            name,
          ),
        ).not.toBe(baseline.files[name].contractHash);
    },
  );
});
