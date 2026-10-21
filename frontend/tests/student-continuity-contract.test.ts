import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-07-continuity-baseline.json";
import { projectStudentContinuitySource } from "./helpers/student-continuity-projection";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const path = "src/features/student/student-area.tsx";
const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const hub = readFileSync(
  "src/features/student/student-courses-learning-hub.tsx",
  "utf8",
).replace(/\r\n/g, "\n");
function calls(source: string) {
  const sf = ts.createSourceFile(
    "hub.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const result: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) && node.name?.text === "queryString") ||
      (ts.isCallExpression(node) &&
        ["api", "useQuery", "useMemo"].includes(node.expression.getText(sf)))
    )
      result.push(node.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result;
}
describe("UI-D01-07 retains source-owned workflow and frozen AI", () => {
  it("keeps the new continuation title at the locked DC03 weight 700", () => {
    const css = readFileSync(
      "src/features/student/student-learning-presentation.module.css",
      "utf8",
    );
    const titles = [...css.matchAll(/\.continuationTitle\s*\{([^}]+)\}/g)];
    expect(titles).toHaveLength(1);
    expect(titles[0][1].match(/font-weight:\s*(\d+)\s*;/)?.[1]).toBe("700");
  });
  it("reverses exactly the dashboard variant and optional lesson deep link to verified main", () => {
    expect(baseline.base).toBe("4534ec747067e49f90cb77580b13131fa4512469");
    expect(hash(projectStudentContinuitySource(source, path))).toBe(
      baseline.studentHash,
    );
  });
  it.each([
    ["              continuation", "              compact"],
    ["encodeURIComponent(assignment.lessonId)", "assignment.lessonId"],
    ["mine.data &&", "mine.isSuccess &&"],
    ['["student-learning-overview", locale]', '["changed", locale]'],
    ["<AiTutorPanel courseId={courseId} lessonId={lesson.id} />", "<div />"],
    ['if (current === "ai-practice") content = <AiPracticeShell />;', ""],
  ])(
    "rejects altered, missing or duplicated allowed seams and unrelated drift: %s",
    (from, to) => {
      expect(source).toContain(from);
      expect(
        hash(projectStudentContinuitySource(source.replace(from, to), path)),
      ).not.toBe(baseline.studentHash);
      expect(
        hash(
          projectStudentContinuitySource(
            source.replace(from, from + from),
            path,
          ),
        ),
      ).not.toBe(baseline.studentHash);
    },
  );
  it("keeps all hub API, query keys/options, filtering and server sorting calls byte-identical", () => {
    expect(calls(hub)).toEqual(baseline.hubCalls);
    expect(
      calls(
        hub.replace(
          'sort: options.sort ?? "Recent"',
          'sort: options.sort ?? "Title"',
        ),
      ),
    ).not.toEqual(baseline.hubCalls);
  });
  it("keeps the complete course AI integration byte-identical", () => {
    const start = hub.indexOf('      <article className="relative border-t');
    const ai = hub.slice(
      start,
      hub.indexOf("\n    </section>\n  );\n}", start),
    );
    expect(start).toBeGreaterThan(0);
    expect(hash(ai)).toBe(baseline.hubAiHash);
    expect(
      hash(ai.replace('ai("comingSoon")', 'ai("courseBanner.title")')),
    ).not.toBe(baseline.hubAiHash);
  });
});
