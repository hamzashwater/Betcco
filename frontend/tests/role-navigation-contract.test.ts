import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-05-role-shell-baseline.json";
import { projectStudentContinuitySource } from "./helpers/student-continuity-projection";
import {
  projectRoleShellSource,
  withoutRoleShellAdditions,
} from "./helpers/role-shell-projection";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const read = (file: string) => readFileSync(file, "utf8");
function nodes(source: string, select: (node: ts.Node) => boolean) {
  const sf = ts.createSourceFile(
      "shell.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    result: string[] = [];
  const visit = (node: ts.Node) => {
    if (select(node)) result.push(node.getText(sf).replace(/\s+/g, " "));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result;
}
describe("role-shell presentation retains the merged route/data/auth contracts", () => {
  it("starts from the independently verified main including merged UI-D01-05G", () => {
    expect(baseline.base).toBe("2c71926cd6908a7e103e8da66709f3a40f0665a2");
  });
  it.each(Object.entries(baseline.files))(
    "projects only exact reviewed %s source hunks",
    (file, expected) => {
      const source = read(file);
      expect(hash(projectRoleShellSource(source, file))).toBe(expected.hash);
      const seam = expected.seams[0].approved;
      for (const replacement of ["", seam + seam, seam.replace(/\S/, "!")])
        expect(
          hash(projectRoleShellSource(source.replace(seam, replacement), file)),
        ).not.toBe(expected.hash);
    },
  );
  it.each(Object.keys(baseline.files))(
    "retains every existing query/mutation/API/router call in %s",
    (file) => {
      const source = read(file),
        previous = projectRoleShellSource(source, file);
      const selected = (node: ts.Node) =>
        ts.isCallExpression(node) &&
        [
          "useQuery",
          "useMutation",
          "api",
          "router.push",
          "router.replace",
          "router.refresh",
          "queryClient.clear",
          "invalidateCsrfToken",
        ].includes(node.expression.getText());
      expect(nodes(source, selected)).toEqual(nodes(previous, selected));
    },
  );
  it("retains the exact eligible registries, role predicates, section boundaries, destinations and active-route rules", () => {
    const file = "src/components/site-navigation.tsx",
      source = read(file),
      previous = projectRoleShellSource(source, file);
    const names = new Set([
      "workspace",
      "isWorkspace",
      "isAccountArea",
      "isLeadVerifier",
      "canManageEvaluatorSpecialisms",
      "isCourseReviewer",
      "isCoordinatorOnly",
      "dashboardRole",
      "visibleAccountRole",
      "accountDestination",
      "brandDestination",
      "accountLabel",
      "publicNavLinks",
      "workspaceNavLinks",
      "navLinks",
      "active",
      "studentShell",
      "studentLinks",
      "shellLinks",
      "shellActive",
    ]);
    const selected = (node: ts.Node) =>
      (ts.isVariableDeclaration(node) && names.has(node.name.getText())) ||
      (ts.isFunctionDeclaration(node) &&
        node.name?.text === "isTeacherWorkspacePath");
    expect(nodes(source, selected)).toEqual(nodes(previous, selected));
  });
  it("keeps routes, MFA, dashboards, editor data/logic, API, AI, shared primitives, fonts, tokens and dependencies byte-identical", () => {
    for (const [file, expected] of Object.entries(baseline.protectedFiles))
      expect(hash(projectStudentContinuitySource(read(file), file)), file).toBe(
        expected,
      );
  });
  it.each(["en", "ar"] as const)(
    "adds only the exact paired %s role-shell copy and retains every old value",
    (locale) => {
      const value = JSON.parse(read(`messages/${locale}.json`));
      expect(value.navigation.roleShell).toEqual(baseline.additions[locale]);
      expect(
        hash(JSON.stringify(withoutRoleShellAdditions(structuredClone(value)))),
      ).toBe(baseline.catalogueHashes[locale]);
      const mutated = structuredClone(value);
      mutated.navigation.roleShell.work += " changed";
      expect(() => withoutRoleShellAdditions(mutated)).toThrow(
        "Unverified role shell copy additions",
      );
    },
  );
});
