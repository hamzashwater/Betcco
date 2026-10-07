import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import messages from "../messages/en.json";
import {
  contractHash,
  scopedFunctions,
  scopedNames,
  staticCopyFindings,
} from "./helpers/admin-dashboard-i18n-audit";
const source = readFileSync("src/features/admin/admin-area.tsx", "utf8");
function leaves(value: unknown, prefix = ""): string[] {
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) =>
        leaves(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];
}
describe("scoped Admin Dashboard translation and contract AST audit", () => {
  it("covers exactly the three scoped functions with zero Arabic, English UI or locale-copy branches", () => {
    expect(
      scopedFunctions(source).functions.map((fn) => fn.name!.text),
    ).toEqual(scopedNames);
    expect(staticCopyFindings(source)).toEqual([]);
  });
  it.each([
    ['t("dashboard.title")', '"Admin dashboard"'],
    ['t("dashboard.title")', '"لوحة الأدمن"'],
    ['t("shared.open")', 'locale === "ar" ? "فتح" : "Open"'],
    ['t("dashboard.metrics.students")', '"Students"'],
  ])("rejects reintroduced static copy: %s -> %s", (before, after) => {
    expect(source).toContain(before);
    expect(
      staticCopyFindings(source.replace(before, after)).length,
    ).toBeGreaterThan(0);
  });
  it("uses all 75 new catalogue leaves and preserves existing academic/delivery namespaces", () => {
    const { file, functions } = scopedFunctions(source);
    const used: string[] = [];
    for (const fn of functions) {
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "t"
        ) {
          expect(node.arguments).toHaveLength(1);
          expect(ts.isStringLiteral(node.arguments[0])).toBe(true);
          used.push((node.arguments[0] as ts.StringLiteral).text);
        }
        ts.forEachChild(node, visit);
      }
      visit(fn);
    }
    expect(leaves(messages.adminWorkspace)).toHaveLength(75);
    expect([...new Set(used)].sort()).toEqual(
      leaves(messages.adminWorkspace).sort(),
    );
    for (const expression of [
      'academicT("title")',
      'academicT("description")',
      'deliveryT("title")',
      'deliveryT("description")',
    ])
      expect(functions[0].getText(file)).toContain(expression);
  });
  it("preserves the baseline technical AST after erasing only migrated copy", () => {
    expect(scopedFunctions(source).functions.map(contractHash)).toEqual(
      BASELINE_HASHES,
    );
  });
  it.each([
    ['useState("30d")', 'useState("7d")'],
    ["T23:59:59.999Z", "T00:00:00.000Z"],
    ["(value / maximum) * 100", "(value / maximum) * 90"],
    ['"JOD", locale', '"USD", locale'],
    ["/${locale}/admin/${href}", "/${locale}/teacher/${href}"],
  ])("detects technical contract drift: %s", (before, after) => {
    expect(source).toContain(before);
    expect(
      scopedFunctions(source.replace(before, after)).functions.map(
        contractHash,
      ),
    ).not.toEqual(BASELINE_HASHES);
  });
  it("classifies every remaining locale identifier as formatter, route or wiring", () => {
    const { file, functions } = scopedFunctions(source);
    const classifications: string[] = [];
    for (const fn of functions) {
      function visit(node: ts.Node) {
        if (ts.isIdentifier(node) && node.text === "locale") {
          const parent = node.parent;
          if (
            ts.isCallExpression(parent) &&
            parent.expression.getText(file).startsWith("formatLocalized")
          )
            classifications.push("FORMATTER");
          else if (
            ts.isJsxExpression(parent) &&
            ts.isJsxAttribute(parent.parent) &&
            parent.parent.name.getText(file) === "locale"
          )
            classifications.push("FORMATTER");
          else if (ts.isTemplateSpan(parent)) classifications.push("ROUTE");
          else if (
            ts.isVariableDeclaration(parent) ||
            ts.isBindingElement(parent) ||
            ts.isPropertySignature(parent) ||
            ts.isJsxAttribute(parent)
          )
            classifications.push("OTHER: binding/type/prop name");
          else
            throw new Error(`Unclassified locale use: ${parent.getText(file)}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(fn);
    }
    expect(
      classifications.filter((value) => value === "FORMATTER"),
    ).toHaveLength(7);
    expect(classifications.filter((value) => value === "ROUTE")).toHaveLength(
      1,
    );
    expect(
      classifications.filter((value) => value.startsWith("OTHER")),
    ).toHaveLength(5);
  });
});
// Generated from live main 4a454267968ffa8a352c264416cd4116fd4ba3dc.
const BASELINE_HASHES = [
  "181668e51270943b5ee951e47976a026e1e399ce8b67f0ae276b19adc9d377a5",
  "26c03b9c16a0aec1bbfb449c12cc752ed93406c4958d733794fa12cc55e2d2a6",
  "a8332cd8ff4f32948d635e09a3fbd937a28e88f7e463851134e81089b36f876c",
];
