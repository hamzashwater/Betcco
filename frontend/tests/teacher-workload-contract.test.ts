import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-11-teacher-workload-baseline.json";
import {
  projectTeacherWorkloadSource,
  withoutTeacherWorkloadAdditions,
} from "./helpers/teacher-workload-projection";
import { auditTeacherSource } from "./helpers/teacher-i18n-audit";
import { projectTeacherAuthoringSource } from "./helpers/teacher-authoring-projection";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
describe("UI-D01-11 presentation-only boundary", () => {
  it("pins independently captured live main and exact reviewed presentation seams", () => {
    expect(baseline.base).toBe("f6ffbf533a4037b9a2625d6130e5cdfaea59e269");
    expect(hash(JSON.stringify(baseline))).toBe(
      "75b19c47657c7c518e3ad84bc7b0348ca200ddbd1bcdbae05d6a90199960965c",
    );
  });
  it.each(Object.entries(baseline.files))(
    "retains original complete source/transport and fails closed: %s",
    (path, file) => {
      const source = read(path);
      expect(hash(projectTeacherWorkloadSource(source, path))).toBe(file.hash);
      for (const seam of file.seams)
        for (const replacement of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "!"),
        ])
          expect(
            hash(
              projectTeacherWorkloadSource(
                source.replace(seam.approved, replacement),
                path,
              ),
            ),
          ).not.toBe(file.hash);
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
      const audit = auditTeacherSource(path, source, false, false);
      expect(audit.staticArabic).toBe(0);
      expect(audit.staticEnglish).toBe(0);
      expect(audit.staticLocaleBranches).toBe(0);
    },
  );
  it("retains frozen Teacher routing, wallet, review/assessment owners and all previous Student/practice/dependency files", () => {
    for (const [path, expected] of Object.entries(baseline.protectedFiles))
      expect(hash(projectTeacherAuthoringSource(read(path), path)), path).toBe(
        expected,
      );
    const sf = ts.createSourceFile(
      "teacher.tsx",
      read("src/features/teacher/teacher-area.tsx"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const [name, expected] of Object.entries(baseline.frozen)) {
      const n = sf.statements.find(
        (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
      );
      expect(n, name).toBeDefined();
      expect(hash(n!.getText(sf)), name).toBe(expected);
    }
  });
  it.each(["en", "ar"] as const)(
    "adds only exact paired %s copy and preserves every previous catalogue value",
    (locale) => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      expect(m.teacherWorkloadPresentation).toEqual(baseline.additions[locale]);
      expect(Object.keys(m.teacherWorkloadPresentation)).toEqual(
        Object.keys(baseline.additions.en),
      );
      expect(
        hash(
          JSON.stringify(withoutTeacherWorkloadAdditions(structuredClone(m))),
        ),
      ).toBe(baseline.catalogueHashes[locale]);
      m.teacherWorkloadPresentation.unapproved = "Unexpected";
      expect(() => withoutTeacherWorkloadAdditions(m)).toThrow();
    },
  );
  it("uses locked weights, defined semantic CSS roles and no new motion", () => {
    const css = read("src/features/teacher/teacher-workload.module.css"),
      globals = read("src/app/globals.css");
    for (const [, weight] of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(weight);
    for (const [, token] of css.matchAll(/var\((--[a-z-]+)\)/g))
      expect(globals).toContain(token + ":");
    expect(css).not.toMatch(/animation:|@keyframes/);
    for (const [, shadow] of css.matchAll(/box-shadow:([^;]+);/g))
      expect(shadow.trim()).toBe("none");
    for (const p of [
      "teacher-courses-management.tsx",
      "teacher-student-follow-up.tsx",
    ])
      expect(read("src/features/teacher/" + p)).not.toMatch(
        /font-(?:black|extrabold)/,
      );
    const sf = ts.createSourceFile(
      "teacher.tsx",
      read("src/features/teacher/teacher-area.tsx"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const n of sf.statements)
      if (
        ts.isFunctionDeclaration(n) &&
        ["TeacherDashboard", "TeacherEvaluations"].includes(n.name?.text ?? "")
      )
        expect(n.getText(sf)).not.toMatch(/font-(?:black|extrabold)/);
  });
  it("uses every new presentation leaf through catalogue calls", () => {
    const used = Object.keys(baseline.files).flatMap((path) =>
      [...read(path).matchAll(/\bp\("([^"]+)"/g)].map((match) => match[1]),
    );
    expect([...new Set(used)].sort()).toEqual(
      Object.keys(baseline.additions.en).sort(),
    );
  });
});
