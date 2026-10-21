import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-10-evaluation-baseline.json";
import {
  projectEvaluationPresentationSource,
  withoutEvaluationPresentationAdditions,
} from "./helpers/evaluation-presentation-projection";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
describe("UI-D01-10 protected evaluation presentation seams", () => {
  it("pins independently captured main and the reviewed presentation seams", () => {
    expect(baseline.referenceMain).toBe(
      "fe84a0c6a580d9cdaa8c7a7a910964e6c2bf53a5",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "3efc716e7018baea04a166a123dec6ca82af4829b02047a659ad9b8e5ebb628a",
    );
    expect(
      hash(
        readFileSync(
          "src/features/student/student-evaluation-presentation.tsx",
          "utf8",
        ).replace(/\r\n/g, "\n"),
      ),
    ).toBe(baseline.presentationHash);
  });
  it.each(Object.entries(baseline.files))(
    "retains all unrelated source and original transport/navigation: %s",
    (path, file) => {
      const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      expect(hash(projectEvaluationPresentationSource(source, path))).toBe(
        file.hash,
      );
      for (const seam of file.seams)
        for (const replacement of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, (character) =>
            character === "!" ? "?" : "!",
          ),
        ])
          expect(
            hash(
              projectEvaluationPresentationSource(
                source.replace(seam.approved, replacement),
                path,
              ),
            ),
          ).not.toBe(file.hash);
      if (path.endsWith(".css")) return;
      const sf = ts.createSourceFile(
          path,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        ),
        transport: string[] = [];
      const visit = (n: ts.Node) => {
        if (
          ts.isCallExpression(n) &&
          [
            "api",
            "useQuery",
            "useInfiniteQuery",
            "useMutation",
            "client.invalidateQueries",
            "router.push",
            "window.location.assign",
          ].includes(n.expression.getText(sf))
        )
          transport.push(n.getText(sf).replace(/\s+/g, " "));
        ts.forEachChild(n, visit);
      };
      visit(sf);
      expect(transport).toEqual(file.transport);
    },
  );
  it("uses only locked CSS weights and no new routine font-black in migrated owners", () => {
    const css = readFileSync(
      "src/features/student/student-evaluation-wizard.module.css",
      "utf8",
    );
    for (const [, weight] of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(weight);
    for (const path of [
      "student-resit-workflow.tsx",
      "evaluation-appeals.tsx",
      "student-evaluation-presentation.tsx",
    ])
      expect(readFileSync("src/features/student/" + path, "utf8")).not.toMatch(
        /font-(?:black|extrabold)/,
      );
    const source = readFileSync(
        "src/features/student/student-area.tsx",
        "utf8",
      ),
      sf = ts.createSourceFile(
        "student.tsx",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
    for (const n of sf.statements)
      if (
        ts.isFunctionDeclaration(n) &&
        [
          "EvaluationWizard",
          "MyEvaluations",
          "EvaluationRevisionSubmission",
        ].includes(n.name?.text ?? "")
      )
        expect(n.getText(sf)).not.toMatch(/font-(?:black|extrabold)/);
  });
  it.each(["en", "ar"] as const)(
    "accepts only exact paired new copy",
    (locale) => {
      const copy = JSON.parse(
        readFileSync(`messages/${locale}.json`, "utf8"),
      ).studentEvaluationPresentation;
      expect(copy).toEqual(baseline.additions[locale]);
      expect(
        withoutEvaluationPresentationAdditions({
          studentEvaluationPresentation: copy,
        }),
      ).toEqual({});
      expect(() =>
        withoutEvaluationPresentationAdditions({
          studentEvaluationPresentation: { ...copy, extra: "Unexpected" },
        }),
      ).toThrow();
    },
  );
});
