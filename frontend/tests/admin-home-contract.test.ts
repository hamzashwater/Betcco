import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-13-admin-home-baseline.json";
import {
  projectAdminHomeSource,
  withoutAdminHomeAdditions,
} from "./helpers/admin-home-projection";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
describe("UI-D01-13 exact Admin home presentation boundary", () => {
  it("pins the independent live-main baseline and exact approved seams", () => {
    expect(baseline.base).toBe("03bdc8f84342309832e887c36376b95e379f83c5");
    expect(hash(JSON.stringify(baseline))).toBe(
      "88e97046b950bbfa26ef4817f4ae9e002b9009b67dbf8580537d50fc1dc814a1",
    );
    const source = read(baseline.path);
    expect(hash(projectAdminHomeSource(source))).toBe(baseline.hash);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "!"),
      ])
        expect(
          hash(
            projectAdminHomeSource(source.replace(seam.approved, replacement)),
          ),
        ).not.toBe(baseline.hash);
  });
  it("independently freezes actual state/query/API/mutation calls, mechanical props, supplied metric fields and unrelated statements", () => {
    const source = read(baseline.path),
      sf = ts.createSourceFile(
        baseline.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      calls: string[] = [],
      mechanics: string[] = [],
      fields: string[] = [],
      frozen: Record<string, string> = {};
    function visit(n: ts.Node) {
      if (
        ts.isCallExpression(n) &&
        [
          "api",
          "useQuery",
          "useMutation",
          "client.invalidateQueries",
          "router.push",
          "router.replace",
          "useState",
          "useEffect",
          "useRef",
        ].includes(n.expression.getText(sf))
      )
        calls.push(n.getText(sf).replace(/\s+/g, " "));
      if (
        ts.isJsxAttribute(n) &&
        n.parent.parent.tagName.getText(sf) !== "MetricCard" &&
        /^(on[A-Z].*|disabled|required|multiple|accept|type|name|value|checked|min|max|minLength|maxLength|key|aria-pressed)$/.test(
          n.name.getText(sf),
        )
      )
        mechanics.push(n.getText(sf).replace(/\s+/g, " "));
      if (
        ts.isPropertyAccessExpression(n) &&
        n.expression.getText(sf) === "result.data"
      )
        fields.push(n.name.text);
      ts.forEachChild(n, visit);
    }
    visit(sf);
    for (const n of sf.statements)
      if (
        !ts.isImportDeclaration(n) &&
        !(
          ts.isFunctionDeclaration(n) &&
          ["AdminDashboard", "AdminAnalyticsTrend", "AdminLink"].includes(
            n.name?.text || "",
          )
        )
      ) {
        const named = n as ts.Node & { name?: ts.Node };
        frozen[
          ts.SyntaxKind[n.kind] +
            ":" +
            (named.name?.getText(sf) || n.getText(sf).slice(0, 50))
        ] = hash(n.getText(sf));
      }
    expect(calls).toEqual(baseline.calls);
    expect(mechanics).toEqual(baseline.mechanics);
    expect(fields.sort()).toEqual(baseline.fields);
    expect(frozen).toEqual(baseline.frozen);
    for (const [p, h] of Object.entries(baseline.protectedFiles))
      expect(hash(read(p)), p).toBe(h);
    expect(hash(read("../" + baseline.producer.path))).toBe(
      baseline.producer.hash,
    );
  });
  it.each(["en", "ar"] as const)(
    "allows only exact paired %s additions and retains all old catalogue values",
    (locale) => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      expect(m.adminHomePresentation).toEqual(baseline.additions[locale]);
      expect(
        hash(JSON.stringify(withoutAdminHomeAdditions(structuredClone(m)))),
      ).toBe(baseline.catalogueHashes[locale]);
      m.adminHomePresentation.extra = "Unexpected";
      expect(() => withoutAdminHomeAdditions(m)).toThrow();
    },
  );
  it("uses catalogue-owned visible text and defined semantic CSS with locked routine weights", () => {
    const source = read(baseline.path),
      sf = ts.createSourceFile(
        baseline.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
    for (const n of sf.statements)
      if (
        ts.isFunctionDeclaration(n) &&
        ["AdminDashboard", "AdminAnalyticsTrend", "AdminLink"].includes(
          n.name?.text || "",
        )
      ) {
        const visible: string[] = [];
        function visit(v: ts.Node) {
          if (ts.isJsxText(v) && v.text.trim()) visible.push(v.text.trim());
          if (
            ts.isJsxExpression(v) &&
            v.expression &&
            ts.isStringLiteralLike(v.expression) &&
            v.expression.text.trim()
          )
            visible.push(v.expression.text);
          if (
            ts.isJsxAttribute(v) &&
            /^(label|text|title|description|eyebrow|placeholder|alt|aria-label)$/.test(
              v.name.getText(sf),
            ) &&
            v.initializer &&
            ts.isStringLiteral(v.initializer)
          )
            visible.push(v.initializer.text);
          ts.forEachChild(v, visit);
        }
        visit(n);
        expect(visible).toEqual([]);
        expect(n.getText(sf)).not.toMatch(
          /font-(?:black|extrabold)|locale === ["']ar["']/,
        );
      }
    const css = read("src/features/admin/admin-home.module.css"),
      g = read("src/app/globals.css");
    for (const [, v] of css.matchAll(/var\((--[a-z-]+)\)/g))
      expect(g).toContain(v + ":");
    for (const [, w] of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(w);
    expect(css).not.toMatch(/animation:|@keyframes|box-shadow:(?!\s*none)/);
  });
});
