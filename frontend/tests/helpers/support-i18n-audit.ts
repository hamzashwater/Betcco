import ts from "typescript";
import baseline from "../fixtures/support-i18n-baseline.json";
import { ancestors, compact } from "./admin-final-i18n-audit";
import { practiceContract } from "./learning-practice-i18n-audit";

export const supportFiles = [
  "src/features/support/support-account-area.tsx",
  "src/features/support/support-center.tsx",
] as const;
export type SupportFile = (typeof supportFiles)[number];
const parse = (source: string) =>
  ts.createSourceFile(
    "support.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
// Reuse the established complete syntax proof, with no additional erasure rules.
export const supportContract = practiceContract;
export function assertSupportScope(paths: string[]) {
  const sources = paths
    .filter((path) => path.startsWith("frontend/src/"))
    .sort();
  if (
    JSON.stringify(sources) !==
    JSON.stringify(supportFiles.map((path) => `frontend/${path}`).sort())
  )
    throw new Error("Unexpected T7-A6.6 production scope");
  if (
    paths.some(
      (path) =>
        !sources.includes(path) &&
        !path.startsWith("frontend/tests/") &&
        !["frontend/messages/ar.json", "frontend/messages/en.json"].includes(
          path,
        ),
    )
  )
    throw new Error("Unexpected T7-A6.6 supporting scope");
}
export function replaySupportMigration(path: SupportFile) {
  let source: string = baseline.sources[path];
  for (const edit of [...baseline.replacements[path]].sort(
    (a, b) => b.start - a.start,
  )) {
    if (source.slice(edit.start, edit.end) !== edit.original)
      throw new Error("Changed reviewed support copy slot");
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  for (const wire of baseline.wiring[path]) {
    if (!source.includes(wire.before))
      throw new Error("Changed support translation seam");
    source = source.replace(wire.before, wire.after);
  }
  return source;
}
function identity(node: ts.Node) {
  const owners = ancestors(node);
  return `${owners.find(ts.isFunctionDeclaration)?.name?.getText() ?? "module"}:${owners.find(ts.isVariableDeclaration)?.name.getText() ?? "module"}:${compact(node.parent)}:${node.getText()}`;
}
// Cache only reviewed immutable literals. Live source and every mutation are
// independently reparsed; a new context cannot inherit a technical exception.
const reviewed = new Map<SupportFile, ReadonlySet<string>>(
  supportFiles.map((path) => {
    const literals = new Set<string>();
    walk(parse(baseline.approvedSources[path]), (node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
        literals.add(identity(node));
    });
    return [path, literals] as const;
  }),
);

export function auditSupport(source: string, path: SupportFile) {
  const file = parse(source),
    retainedLiterals = reviewed.get(path);
  if (!retainedLiterals) throw new Error("Missing reviewed Support baseline");
  const keys = new Set<ts.Node>(),
    references: string[] = [];
  const translators: { name: string; namespace: string; scope: ts.Node }[] = [];
  const retained: { category: string; text: string }[] = [];
  const findings: {
    category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
    text: string;
  }[] = [];
  walk(file, (node) => {
    if (ts.isParameter(node) && node.type?.getText() === "SupportTranslations")
      translators.push({
        name: node.name.getText(),
        namespace: "supportWorkspace",
        scope: node.parent,
      });
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "formatLocalizedDateTime"
    )
      retained.push({ category: "LOCALE_FORMATTER", text: compact(node) });
    if (ts.isPropertyAccessExpression(node)) {
      if (
        [
          "subject",
          "category",
          "status",
          "body",
          "displayName",
          "email",
          "id",
          "createdAtUtc",
          "updatedAtUtc",
          "isFrozen",
        ].includes(node.name.text)
      )
        retained.push({
          category: "RAW_USER_SERVER_CONTENT",
          text: compact(node),
        });
      if (node.name.text === "message")
        retained.push({ category: "RAW_SERVER_ERROR", text: compact(node) });
      if (compact(node) === "event.target.value")
        retained.push({ category: "RAW_USER_INPUT", text: compact(node) });
    }
    if (
      !ts.isVariableDeclaration(node) ||
      !node.initializer ||
      !ts.isCallExpression(node.initializer) ||
      node.initializer.expression.getText() !== "useTranslations"
    )
      return;
    const namespace = node.initializer.arguments[0];
    if (!namespace || !ts.isStringLiteral(namespace))
      findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    else {
      translators.push({
        name: node.name.getText(),
        namespace: namespace.text,
        scope: ancestors(node).find(ts.isFunctionDeclaration) ?? file,
      });
      keys.add(namespace);
    }
  });
  walk(file, (node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name =
        ts.isPropertyAccessExpression(expression) &&
        ["rich", "markup", "raw", "has"].includes(expression.name.text)
          ? expression.expression.getText()
          : expression.getText();
      const owners = [node, ...ancestors(node)],
        translator = translators.find(
          (item) => item.name === name && owners.includes(item.scope),
        );
      if (translator) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key)) {
          keys.add(key);
          references.push(`${translator.namespace}.${key.text}`);
        } else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
      }
    }
    if (ts.isJsxText(node) && /[a-zA-Z\u0600-\u06ff]/u.test(node.text))
      findings.push({ category: "STATIC_UI", text: compact(node) });
    if (
      !(ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) ||
      keys.has(node) ||
      !/[a-zA-Z\u0600-\u06ff]/u.test(node.text)
    )
      return;
    if (
      ancestors(node).some(ts.isImportDeclaration) ||
      retainedLiterals.has(identity(node))
    )
      return;
    const attribute = ancestors(node).find(ts.isJsxAttribute);
    findings.push({
      category:
        attribute &&
        [
          "aria-label",
          "aria-description",
          "title",
          "alt",
          "placeholder",
        ].includes(attribute.name.getText())
          ? "ACCESSIBILITY_STATIC_UI"
          : "STATIC_UI",
      text: compact(node),
    });
  });
  return {
    findings,
    references,
    retained,
    counts: {
      STATIC_UI: findings.filter((item) => item.category === "STATIC_UI")
        .length,
      ACCESSIBILITY_STATIC_UI: findings.filter(
        (item) => item.category === "ACCESSIBILITY_STATIC_UI",
      ).length,
      UNCLASSIFIED: findings.filter((item) => item.category === "UNCLASSIFIED")
        .length,
    },
  };
}
