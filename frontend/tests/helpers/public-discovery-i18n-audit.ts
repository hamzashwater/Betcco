import ts from "typescript";
import baseline from "../fixtures/public-discovery-i18n-baseline.json";
import { ancestors, compact } from "./admin-final-i18n-audit";

export const scopedFiles = [
  "src/app/[locale]/page.tsx",
  "src/components/home-image-sections.tsx",
  "src/app/[locale]/courses/page.tsx",
  "src/features/courses/catalog-grid.tsx",
  "src/features/courses/course-card.tsx",
  "src/features/courses/course-detail.tsx",
  "src/features/courses/track-cards.tsx",
] as const;
export type ScopedFile = (typeof scopedFiles)[number];
export function assertDiscoveryProductionScope(paths: string[]) {
  const actual = paths
    .filter((path) => path.startsWith("frontend/src/"))
    .sort();
  const expected = scopedFiles.map((path) => `frontend/${path}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Unexpected T7-A6.2 production scope");
}
const human = (value: string) => /[a-zA-Z\u0600-\u06ff]/u.test(value);
const accessibility = new Set([
  "aria-label",
  "aria-description",
  "alt",
  "title",
]);
const parse = (source: string) =>
  ts.createSourceFile(
    "scope.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
function walk(node: ts.Node, fn: (node: ts.Node) => void) {
  fn(node);
  ts.forEachChild(node, (child) => walk(child, fn));
}
function identity(node: ts.Node) {
  const owner = ancestors(node).find(ts.isVariableDeclaration);
  return `${owner?.name.getText() ?? "module"}:${compact(node.parent)}:${node.getText()}`;
}
function translated(source: string, path: ScopedFile) {
  for (const edit of [...baseline.replacements[path]].sort(
    (a, b) => b.start - a.start,
  ))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

// Every non-copy literal is pinned to its exact base context. An added literal,
// even in a helper/map/error fallback, must be classified instead of escaping
// through a broad technical-string allowlist.
export function auditDiscovery(source: string, path: ScopedFile) {
  const file = parse(source),
    approved = parse(translated(baseline.sources[path], path));
  const technical = new Set<string>();
  walk(approved, (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
      technical.add(identity(node));
  });
  const translators = new Map<string, string>();
  const references: { namespace: string; key: string }[] = [];
  const findings: {
    category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
    text: string;
  }[] = [];
  const retained: { category: "SERVER_BILINGUAL_DATA"; text: string }[] = [];
  const keys = new Set<ts.Node>();
  walk(file, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText() === "useTranslations"
    ) {
      const argument = node.initializer.arguments[0];
      if (!argument || ts.isStringLiteral(argument)) {
        translators.set(node.name.getText(), argument?.text ?? "");
        if (argument) keys.add(argument);
      } else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    }
  });
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      translators.has(node.expression.getText())
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        keys.add(argument);
        references.push({
          namespace: translators.get(node.expression.getText())!,
          key: argument.text,
        });
      } else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    }
    if (
      ts.isConditionalExpression(node) &&
      compact(node.condition) === 'locale === "ar"' &&
      ts.isPropertyAccessExpression(node.whenTrue) &&
      ts.isPropertyAccessExpression(node.whenFalse)
    ) {
      if (
        node.whenTrue.expression.getText() ===
          node.whenFalse.expression.getText() &&
        node.whenTrue.name.text === "arabic" &&
        node.whenFalse.name.text === "english"
      )
        retained.push({
          category: "SERVER_BILINGUAL_DATA",
          text: compact(node),
        });
      else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    }
    if (
      ts.isJsxText(node) &&
      human(node.text.trim()) &&
      node.text.trim() !== "BETCCO"
    )
      findings.push({ category: "STATIC_UI", text: node.text.trim() });
    if (
      !(ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) ||
      keys.has(node) ||
      !human(node.text)
    )
      return;
    if (ancestors(node).some(ts.isImportDeclaration)) return;
    if (technical.has(identity(node))) return;
    const chain = ancestors(node),
      attribute = chain.find(ts.isJsxAttribute);
    const isDisplay =
      chain.some(ts.isJsxExpression) ||
      chain.some(ts.isConditionalExpression) ||
      chain.some(
        (n) =>
          ts.isCallExpression(n) &&
          /^(setNotice|setError|Error)$/.test(n.expression.getText()),
      );
    findings.push({
      category:
        attribute && accessibility.has(attribute.name.getText())
          ? "ACCESSIBILITY_STATIC_UI"
          : isDisplay
            ? "STATIC_UI"
            : "UNCLASSIFIED",
      text: compact(node),
    });
  });
  return {
    findings,
    references,
    retained,
    counts: {
      STATIC_UI: findings.filter((f) => f.category === "STATIC_UI").length,
      ACCESSIBILITY_STATIC_UI: findings.filter(
        (f) => f.category === "ACCESSIBILITY_STATIC_UI",
      ).length,
      UNCLASSIFIED: findings.filter((f) => f.category === "UNCLASSIFIED")
        .length,
    },
  };
}

// Compare the complete syntax after erasing only approved copy and the minimum
// hook/static-map wiring. Routes, callbacks, gates, payloads, state precedence,
// styles, DOM mechanics, raw server content and formatting remain in the proof.
export function discoveryContract(
  source: string,
  path: ScopedFile,
  isBase = false,
) {
  if (isBase) source = translated(source, path);
  const arrays: ts.Node[] = [];
  const result = ts.transform(parse(source), [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === "t" &&
          node.arguments[0]?.getText() === '"navigation.allTracks"'
        )
          return ts.factory.createIdentifier("COPY");
        if (
          ts.isParenthesizedExpression(node) &&
          ts.isCallExpression(node.expression) &&
          node.expression.expression.getText() === "copy"
        )
          return ts.factory.createIdentifier("COPY");
        if (
          ts.isImportSpecifier(node) &&
          node.name.text === "useTranslations" &&
          path !== scopedFiles[0]
        )
          return undefined;
        if (
          ts.isTypeAliasDeclaration(node) &&
          node.name.text === "LocalizedText"
        )
          return undefined;
        if (
          ts.isTypeReferenceNode(node) &&
          node.typeName.getText() === "LocalizedText"
        )
          return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
        if (ts.isVariableStatement(node)) {
          const name = node.declarationList.declarations[0]?.name.getText();
          if (
            ["copy", "navigation", "rootCopy", "isArabic", "text"].includes(
              name,
            )
          )
            return undefined;
          if (["platformVisuals", "roleVisuals"].includes(name)) {
            arrays.push(ts.visitEachChild(node, visit, context));
            return undefined;
          }
        }
        if (
          ts.isCallExpression(node) &&
          ["copy", "navigation", "rootCopy"].includes(node.expression.getText())
        )
          return ts.factory.createIdentifier("COPY");
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === "text" &&
          node.arguments.length === 1
        )
          return node.arguments[0];
        if (
          ts.isJsxExpression(node) &&
          node.expression &&
          ts.isStringLiteral(node.expression) &&
          !node.expression.text.trim()
        )
          return undefined;
        if (ts.isJsxText(node))
          return ts.factory.createJsxText(node.text.trim());
        return ts.visitEachChild(node, visit, context);
      };
      return (file) => ts.visitNode(file, visit) as ts.SourceFile;
    },
  ]);
  const printer = ts.createPrinter({ removeComments: true });
  const file = result.transformed[0];
  const contract = [
    printer.printFile(file),
    ...arrays.map((n) => printer.printNode(ts.EmitHint.Unspecified, n, file)),
  ]
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  result.dispose();
  return contract;
}
