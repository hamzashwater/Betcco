import ts from "typescript";
import baseline from "../fixtures/runtime-student-i18n-baseline.json";
import { ancestors, compact, digest } from "./admin-final-i18n-audit";

export const runtimeStudentFiles = Object.keys(
  baseline.sourceHashes,
) as (keyof typeof baseline.sourceHashes)[];
export type RuntimeSources = Record<
  (typeof runtimeStudentFiles)[number],
  string
>;

export function functionSource(source: string, name: string) {
  const file = ts.createSourceFile(
    "scope.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const node = file.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (!node) throw new Error(`Missing reviewed function: ${name}`);
  return node.getText(file);
}

// Discover error prose in these reviewed executable scopes, not a string allowlist.
export function errorOccurrences(source: string) {
  const file = ts.createSourceFile(
    "scope.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const result: { owner: string; text: string; parent: string }[] = [];
  function walk(node: ts.Node) {
    if (
      ts.isStringLiteral(node) &&
      /\s/.test(node.text) &&
      (ancestors(node).some(
        (parent) =>
          ts.isNewExpression(parent) &&
          ["Error", "ApiError"].includes(parent.expression.getText(file)),
      ) ||
        (ts.isPropertyAssignment(node.parent) &&
          node.parent.name.getText(file) === "message"))
    ) {
      const owner = ancestors(node).find(ts.isFunctionDeclaration);
      result.push({
        owner: owner?.name?.text ?? "module",
        text: node.text,
        parent: compact(node.parent),
      });
    }
    ts.forEachChild(node, walk);
  }
  walk(file);
  return result;
}

// A technical exclusion is valid only at its exact file + owner + expression,
// with the entire original transport/payment source unchanged. Student changes
// must invert to the independent original hash after exactly two replacements.
export function reconcileRuntimeStudent(sources: RuntimeSources) {
  const violations: string[] = [];
  for (const path of runtimeStudentFiles) {
    let source = sources[path].replace(/\r\n/g, "\n");
    if (path.endsWith("/student-area.tsx")) {
      for (const replacement of baseline.replacements) {
        if (source.split(replacement.to).length !== 2)
          violations.push(`${path}: missing, duplicate or unbounded guard key`);
        source = source.replace(replacement.to, replacement.from);
      }
      // Prettier joins this one now-shorter guard after replacing its argument.
      source = source.replace(
        'if (!active) throw new Error("Start the submission before uploading files.");',
        'if (!active)\n        throw new Error("Start the submission before uploading files.");',
      );
    }
    if (digest(source) !== baseline.sourceHashes[path])
      violations.push(`${path}: source or contract drift`);
    const scope = path.endsWith("/student-area.tsx")
      ? functionSource(source, "CourseAssignmentPanel")
      : path.endsWith("/student-resit-workflow.tsx")
        ? functionSource(source, "StudentResitDetail")
        : source;
    const actual = errorOccurrences(scope);
    const expected = baseline.records
      .filter((record) => record.file === path)
      .map(({ owner, text, parent }) => ({ owner, text, parent }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      violations.push(`${path}: unreviewed error occurrence or expression`);
  }
  return {
    violations,
    presentationResiduals: violations.length
      ? undefined
      : { STATIC_UI: 0, ACCESSIBILITY_STATIC_UI: 0, UNCLASSIFIED: 0 },
    classifications: baseline.records,
  };
}
