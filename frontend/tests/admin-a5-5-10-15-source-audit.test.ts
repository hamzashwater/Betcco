import { readFileSync } from "node:fs";
import ts from "typescript";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import {
  audit,
  contractHash,
  hash,
  outsideAdminArea,
  scopes,
  type Scope,
} from "./helpers/admin-a5-5-10-15-i18n-audit";
import { withoutFinalAdminAdditions } from "./helpers/admin-final-catalogue-projection";

const completed: Scope[] = ["academicCatalogManagement", "academicCatalogue"];
const names = Object.keys(scopes) as Scope[];
const source = (name: Scope) =>
  readFileSync(`src/features/admin/${scopes[name][0]}.tsx`, "utf8");
function leaves(v: unknown, prefix = ""): string[] {
  return typeof v === "string"
    ? [prefix]
    : Object.entries(v as Record<string, unknown>).flatMap(([k, x]) =>
        leaves(x, `${prefix}.${k}`),
      );
}
describe("Final Admin batch: independently frozen nine scopes", () => {
  it.each(names)("freezes all technical behavior and DOM in %s", (name) => {
    expect(contractHash(source(name), name, baseline.scopes[name].cases)).toBe(
      baseline.scopes[name].contractHash,
    );
  });
  it("freezes every admin-area function/import outside the two authorized bodies", () => {
    expect(outsideAdminArea(source("wallet"))).toBe(baseline.outsideAdminArea);
    expect(
      outsideAdminArea(
        source("wallet").replace(
          "function CommissionSettings",
          "function ChangedCommissionSettings",
        ),
      ),
    ).toBe(baseline.outsideAdminArea);
    expect(
      outsideAdminArea(
        source("wallet").replace(
          "function AdminDashboard",
          "function ChangedAdminDashboard",
        ),
      ),
    ).not.toBe(baseline.outsideAdminArea);
  });
  it.each(completed)("has zero static or unclassified UI in %s", (name) => {
    expect(
      audit(source(name), name, baseline.scopes[name].cases),
    ).toMatchObject({
      findings: [],
      staticArabic: 0,
      staticEnglish: 0,
      staticBilingual: 0,
      unclassified: 0,
    });
    expect(
      [
        ...new Set(audit(source(name), name, baseline.scopes[name].cases).keys),
      ].sort(),
    ).toEqual(baseline.scopes[name].cases.map((c) => c.key).sort());
  });
  it.each(["ar", "en"] as const)(
    "freezes every old catalogue value and new wording in %s",
    (locale) => {
      const messages = locale === "ar" ? ar : en;
      expect(
        hash(withoutFinalAdminAdditions(JSON.parse(JSON.stringify(messages)))),
      ).toBe(baseline.catalogueHashes[locale]);
      for (const name of completed) {
        const t = createTranslator({
          locale,
          messages,
          namespace: scopes[name][1],
        });
        for (const c of baseline.scopes[name].cases) {
          const values = { count: "2", date: "DATE", user: "USER" };
          expect(t(c.key as Parameters<typeof t>[0], values), c.key).toBe(
            c[locale].replace(
              /\{(count|date|user)\}/g,
              (_, k: keyof typeof values) => values[k],
            ),
          );
        }
      }
    },
  );
  it("checks structural parity and duplicate JSON keys", () => {
    expect(leaves(ar).sort()).toEqual(leaves(en).sort());
    for (const locale of ["ar", "en"]) {
      const sf = ts.parseJsonText(
          `${locale}.json`,
          readFileSync(`messages/${locale}.json`, "utf8"),
        ),
        duplicates: string[] = [];
      function visit(n: ts.Node) {
        if (ts.isObjectLiteralExpression(n)) {
          const keys = n.properties
            .filter(ts.isPropertyAssignment)
            .map((p) => p.name.getText(sf));
          keys.forEach((k, i) => {
            if (keys.indexOf(k) !== i) duplicates.push(k);
          });
        }
        ts.forEachChild(n, visit);
      }
      visit(sf);
      expect(duplicates).toEqual([]);
    }
  });
  it.each(completed)(
    "rejects restored bilingual copy, raw UI and contract drift in %s",
    (name) => {
      const s = source(name),
        c = baseline.scopes[name].cases.find((c) =>
          s.includes(`t("${c.key}")`),
        )!;
      for (const replacement of ['ar ? "عنوان" : "Title"', '"Unexpected UI"']) {
        const changed = s.replace(`t("${c.key}")`, replacement);
        expect(
          audit(changed, name, baseline.scopes[name].cases).findings.length >
            0 ||
            contractHash(changed, name, baseline.scopes[name].cases) !==
              baseline.scopes[name].contractHash,
        ).toBe(true);
      }
      expect(
        contractHash(
          s.replace('className="', 'className="drift '),
          name,
          baseline.scopes[name].cases,
        ),
      ).not.toBe(baseline.scopes[name].contractHash);
    },
  );
});
