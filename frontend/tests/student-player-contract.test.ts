import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import baseline from "./fixtures/ui-d01-08-player-baseline.json";
import logic from "./fixtures/ui-d01-08-player-logic.json";
import { projectPracticeClaritySource } from "./helpers/practice-clarity-projection";
import { projectEvaluationPresentationSource } from "./helpers/evaluation-presentation-projection";
import {
  projectPlayerWorkspaceSource,
  withoutPlayerWorkspaceAdditions,
} from "./helpers/player-workspace-projection";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function selected(source: string) {
  const sf = ts.createSourceFile(
    "source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const calls: string[] = [];
  let derive = "";
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      [
        "api",
        "useQuery",
        "useMutation",
        "client.invalidateQueries",
        "client.setQueriesData",
        "progress.mutate",
        "certificate.mutate",
      ].includes(n.expression.getText(sf))
    )
      calls.push(n.getText(sf).replace(/\s+/g, " "));
    if (ts.isFunctionDeclaration(n) && n.name?.text === "deriveNextAction")
      derive = n.getText(sf).replace(/\s+/g, " ");
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { calls, derive };
}
describe("UI-D01-08 bounded presentation and workflow proof", () => {
  it.each(Object.entries(baseline.files))(
    "retains all unrelated bytes through exact reviewed seams: %s",
    (path, file) => {
      const source = readFileSync(path, "utf8");
      expect(hash(projectPlayerWorkspaceSource(source, path))).toBe(file.hash);
      const playerSource = projectPracticeClaritySource(
        projectEvaluationPresentationSource(source, path),
        path,
      );
      for (const seam of file.seams)
        for (const value of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "!"),
        ])
          expect(
            hash(
              projectPlayerWorkspaceSource(
                playerSource.replace(seam.approved, value),
                path,
              ),
            ),
          ).not.toBe(file.hash);
    },
  );
  it.each([
    ["student", "src/features/student/student-area.tsx"],
    ["progress", "src/features/student/student-progress-intelligence.tsx"],
  ] as const)(
    "preserves every %s query/mutation and the complete existing next-action derivation",
    (key, path) => {
      expect(selected(readFileSync(path, "utf8"))).toEqual(logic[key]);
    },
  );
  it("uses only DC03 routine weights in player CSS and Journey presentation", () => {
    const css = readFileSync(
      "src/features/student/student-course-player.module.css",
      "utf8",
    );
    expect(
      [...css.matchAll(/font-weight:\s*(\d+)/g)]
        .map((m) => m[1])
        .every((w) => ["400", "500", "600", "700"].includes(w)),
    ).toBe(true);
    expect(
      readFileSync(
        "src/features/student/student-progress-intelligence.tsx",
        "utf8",
      ),
    ).not.toMatch(/font-black|font-extrabold/);
  });
  it.each(["en", "ar"] as const)(
    "keeps seven paired %s navigation leaves and rejects copy drift",
    (locale) => {
      const value = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      expect(value.studentPlayerWorkspace).toEqual(baseline.additions[locale]);
      expect(Object.keys(value.studentPlayerWorkspace)).toHaveLength(7);
      const changed = structuredClone(value);
      changed.studentPlayerWorkspace.practice += "!";
      expect(() => withoutPlayerWorkspaceAdditions(changed)).toThrow();
      expect(withoutPlayerWorkspaceAdditions(value)).not.toHaveProperty(
        "studentPlayerWorkspace",
      );
    },
  );
});
