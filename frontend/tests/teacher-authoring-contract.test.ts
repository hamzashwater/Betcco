import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-12-authoring-baseline.json";
import {
  projectTeacherAuthoringSource,
  withoutTeacherAuthoringAdditions,
} from "./helpers/teacher-authoring-projection";
import { auditTeacherSource } from "./helpers/teacher-i18n-audit";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
describe("UI-D01-12 exact mutable authoring boundary", () => {
  it("pins independently captured main and exact reviewed seams", () => {
    expect(baseline.base).toBe("4a24e9ad6fbea30b182cc02a6dbde8e41ee6a614");
    expect(hash(JSON.stringify(baseline))).toBe(
      "c6e3b02154d71eaa41eca47a8bb761dc98d31071521b83822aff33f868a12e40",
    );
  });
  it.each(Object.entries(baseline.files))(
    "protects full source, state/effects/transport, mechanical props and all non-Teacher statements: %s",
    (path, file) => {
      const source = read(path);
      expect(hash(projectTeacherAuthoringSource(source, path))).toBe(file.hash);
      for (const seam of file.seams)
        for (const v of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "!"),
        ])
          expect(
            hash(
              projectTeacherAuthoringSource(
                source.replace(seam.approved, v),
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
        transport: string[] = [],
        mechanics: string[] = [],
        frozen: Record<string, string> = {};
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
            "router.replace",
            "window.location.assign",
            "useState",
            "useRef",
            "useEffect",
          ].includes(n.expression.getText(sf))
        )
          transport.push(n.getText(sf).replace(/\s+/g, " "));
        if (
          ts.isJsxAttribute(n) &&
          /^(on[A-Z].*|disabled|required|multiple|accept|type|name|value|checked|min|max|minLength|maxLength|href|src|id|aria-.*|key)$/.test(
            n.name.getText(sf),
          )
        )
          mechanics.push(n.getText(sf).replace(/\s+/g, " "));
        ts.forEachChild(n, visit);
      };
      visit(sf);
      expect(transport).toEqual(file.transport);
      expect(mechanics).toEqual(file.mechanics);
      for (const n of sf.statements) {
        if (ts.isImportDeclaration(n)) continue;
        const named = n as ts.Node & { name?: ts.Node };
        const key =
          ts.SyntaxKind[n.kind] +
          ":" +
          (named.name?.getText(sf) || n.getText(sf).slice(0, 60));
        if (Object.hasOwn(file.frozen, key)) frozen[key] = hash(n.getText(sf));
      }
      expect(frozen).toEqual(file.frozen);
      const a = auditTeacherSource(path, source, false, false);
      expect(a.staticArabic).toBe(0);
      expect(a.staticEnglish).toBe(0);
      expect(a.staticLocaleBranches).toBe(0);
    },
  );
  it("keeps previous Teacher/Student/practice/nav/shared/dependency owners unchanged", () => {
    for (const [p, h] of Object.entries(baseline.protectedFiles))
      expect(hash(read(p)), p).toBe(h);
  });
  it.each(["en", "ar"] as const)(
    "adds only exact %s paired presentation copy",
    (locale) => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      expect(m.teacherAuthoringPresentation).toEqual(
        baseline.additions[locale],
      );
      expect(
        hash(
          JSON.stringify(withoutTeacherAuthoringAdditions(structuredClone(m))),
        ),
      ).toBe(baseline.catalogueHashes[locale]);
      m.teacherAuthoringPresentation.extra = "Unexpected";
      expect(() => withoutTeacherAuthoringAdditions(m)).toThrow();
    },
  );
  it("uses locked weights and defined semantic tokens; Student routines retain their original source", () => {
    const css = read("src/features/teacher/course-authoring.module.css"),
      g = read("src/app/globals.css");
    for (const [, w] of css.matchAll(/font-weight:\s*(\d+)/g))
      expect(["400", "500", "600", "700"]).toContain(w);
    for (const [, v] of css.matchAll(/var\((--[a-z-]+)\)/g))
      expect(g).toContain(v + ":");
    expect(css).not.toMatch(/animation:|@keyframes|box-shadow:/);
    for (const path of Object.keys(baseline.files)) {
      const source = read(path),
        sf = ts.createSourceFile(
          path,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      for (const n of sf.statements)
        if (
          ts.isFunctionDeclaration(n) &&
          ((path.includes("/learning/") &&
            n.name?.text.startsWith("Teacher")) ||
            (!path.includes("/learning/") &&
              n.getText(sf).includes("data-authoring-region")))
        )
          expect(n.getText(sf)).not.toMatch(/font-(?:black|extrabold)/);
    }
  });
});
