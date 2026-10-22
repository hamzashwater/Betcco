import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-09-practice-baseline.json";
import {
  projectPracticeClaritySource,
  withoutPracticeClarityAdditions,
} from "./helpers/practice-clarity-projection";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { projectTeacherAuthoringSource } from "./helpers/teacher-authoring-projection";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
describe("UI-D01-09 exact presentation scope", () => {
  it("pins the independent main baseline and exact reviewed seams", () => {
    expect(baseline.referenceMain).toBe(
      "4e49df5c52a749055508964917759c95bd18abac",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "c20a76b0c70d2a8b0b3539d27d85de8b75d1cc32fdb0f9757012a44b03564bfc",
    );
  });
  it.each(Object.entries(baseline.files))(
    "retains every unrelated byte from main: %s",
    (path, file) => {
      const source = readFileSync(path, "utf8");
      expect(hash(projectPracticeClaritySource(source, path))).toBe(file.hash);
      const practiceSource = projectTeacherAuthoringSource(source, path);
      for (const seam of file.seams)
        for (const replacement of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "!"),
        ])
          expect(
            hash(
              projectPracticeClaritySource(
                practiceSource.replace(seam.approved, replacement),
                path,
              ),
            ),
          ).not.toBe(file.hash);
      if (!path.endsWith(".tsx")) return;
      const sf = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const transport: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          [
            "api",
            "useQuery",
            "useMutation",
            "client.invalidateQueries",
          ].includes(node.expression.getText(sf))
        )
          transport.push(node.getText(sf).replace(/\s+/g, " "));
        ts.forEachChild(node, visit);
      };
      visit(sf);
      expect(transport).toEqual(file.transport);
      const student = source.split("export function Teacher")[0];
      expect(student).not.toMatch(/font-(?:black|extrabold)/);
    },
  );
  it("uses only locked DC03 numeric weights and adds no motion", () => {
    const css = readFileSync(
      "src/features/learning/student-practice-presentation.module.css",
      "utf8",
    );
    for (const [, weight] of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(weight);
    expect(css).not.toMatch(/animation|transition|@keyframes/);
  });
  it.each([en, ar])(
    "accepts only exact paired new copy; old catalogue proofs stay active",
    (copy) => {
      expect(Object.keys(copy.studentPracticeWorkspace).sort()).toEqual(
        Object.keys(en.studentPracticeWorkspace).sort(),
      );
      const original = structuredClone(copy);
      expect(withoutPracticeClarityAdditions(original)).not.toHaveProperty(
        "studentPracticeWorkspace",
      );
      for (const mutant of [
        { ...copy.studentPracticeWorkspace, stages: "Changed" },
        { ...copy.studentPracticeWorkspace, extra: "Unexpected" },
      ])
        expect(() =>
          withoutPracticeClarityAdditions({
            ...copy,
            studentPracticeWorkspace: mutant,
          }),
        ).toThrow();
    },
  );
});
