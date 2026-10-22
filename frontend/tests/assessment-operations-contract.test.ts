import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-14-assessment-operations-baseline.json";
import { projectAssessmentOperationsSource } from "./helpers/assessment-operations-projection";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function contracts(source: string) {
  const sf = ts.createSourceFile(
      "owner.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    calls: string[] = [],
    props: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isCallExpression(n) &&
      (/^(api|useQuery|useMutation|useState|useMemo|useEffect|useRef|useQueryClient)$/.test(
        n.expression.getText(sf),
      ) ||
        /\.invalidateQueries$/.test(n.expression.getText(sf)))
    )
      calls.push(n.getText(sf).replace(/\s+/g, " "));
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|multiple|accept|type|name|value|checked|min|max|minLength|maxLength|key|hidden)$/.test(
        n.name.getText(sf),
      )
    )
      props.push(n.getText(sf).replace(/\s+/g, " "));
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return { calls, props };
}
describe("UI-D01-14 exact presentation boundary", () => {
  it("pins the independent live-main fixture", () => {
    expect(baseline.base).toBe("dd4ecf756716270b65312968d44e21fc2974010f");
    expect(hash(JSON.stringify(baseline))).toBe(
      "d72b166ac7874eb7aca6912900f6e7093f39aaa3c535c484a03e72429fac6393",
    );
  });
  it.each(Object.entries(baseline.files))(
    "retains all transport, query options, state, mutation ordering and action contracts in %s",
    (p, entry) => {
      const source = read(p);
      expect(contracts(source)).toEqual(entry.invariants);
      expect(hash(projectAssessmentOperationsSource(source, p))).toBe(
        entry.hash,
      );
      for (const seam of entry.seams) {
        for (const changed of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "#"),
        ])
          expect(
            hash(
              projectAssessmentOperationsSource(
                source.replace(seam.approved, changed),
                p,
              ),
            ),
          ).not.toBe(entry.hash);
      }
      const scoped = p.endsWith("/admin-area.tsx")
        ? source.slice(
            source.indexOf("function AdminEvaluations()"),
            source.indexOf("function TeacherInvites()"),
          )
        : source;
      expect(scoped).not.toMatch(/font-(black|extrabold)|fontWeight:\s*[89]00/);
    },
  );
  it.each(Object.entries(baseline.protected))(
    "preserves %s including home, roles, formative and legacy routes, backend producers, dependencies and all catalogue values",
    (p, expected) => {
      expect(hash(read(p))).toBe(expected);
    },
  );
  it("uses defined semantic tokens and local CSS classes with DC03 weights", () => {
    const css = read("src/features/admin/assessment-operations.module.css"),
      globals = read("src/app/globals.css");
    for (const token of css.matchAll(/var\((--[\w-]+)\)/g))
      expect(globals).toContain(token[1] + ":");
    for (const weight of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(weight[1]);
    for (const p of Object.keys(baseline.files))
      for (const ref of read(p)
        .replace(/import[^;]+;/g, "")
        .matchAll(/operations\.(\w+)/g))
        expect(css).toContain("." + ref[1]);
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain(":focus-visible");
  });
});
