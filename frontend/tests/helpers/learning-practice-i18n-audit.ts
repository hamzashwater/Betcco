import ts from "typescript";
import baseline from "../fixtures/learning-practice-i18n-baseline.json";
import { ancestors, compact } from "./admin-final-i18n-audit";
import { projectPlayerWorkspaceSource } from "./player-workspace-projection";

export const practiceFiles = [
  "src/features/learning/comprehensive-practice.tsx",
  "src/features/learning/learning-aim-practice.tsx",
] as const;
export type PracticeFile = (typeof practiceFiles)[number];
const parse = (source: string) =>
  ts.createSourceFile(
    "practice.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function assertPracticeScope(paths: string[]) {
  const sources = paths
    .filter((path) => path.startsWith("frontend/src/"))
    .sort();
  if (
    JSON.stringify(sources) !==
    JSON.stringify(practiceFiles.map((path) => `frontend/${path}`).sort())
  )
    throw new Error("Unexpected T7-A6.5 production scope");
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
    throw new Error("Unexpected T7-A6.5 supporting scope");
}

// Every syntax token remains in the proof; only comments/whitespace trivia vanish.
export function practiceContract(source: string) {
  if (source.includes("id={`player-practice-aim-"))
    source = projectPlayerWorkspaceSource(
      source,
      "src/features/learning/learning-aim-practice.tsx",
    );
  if (source.includes("id={`player-practice-unit-"))
    source = projectPlayerWorkspaceSource(
      source,
      "src/features/learning/comprehensive-practice.tsx",
    );
  const file = parse(source);
  function jsxChildren(children: ts.NodeArray<ts.JsxChild>) {
    const result: unknown[] = [];
    let text = "";
    const flush = () => {
      if (text) result.push(["jsxText", text]);
      text = "";
    };
    for (const child of children) {
      if (ts.isJsxText(child)) {
        // Match JSX's line-whitespace rules. Prettier may express a trailing
        // space as either text or {" "}; preserve the same rendered text.
        const lines = child.text.replaceAll("\t", " ").split(/\r\n|\n|\r/u);
        text += lines
          .map((line, index) => {
            if (index !== 0) line = line.trimStart();
            if (index !== lines.length - 1) line = line.trimEnd();
            return line;
          })
          .filter(Boolean)
          .join(" ");
      } else if (
        ts.isJsxExpression(child) &&
        child.expression &&
        ts.isStringLiteral(child.expression)
      )
        text += child.expression.text;
      else {
        flush();
        result.push(syntax(child));
      }
    }
    flush();
    return result;
  }
  function syntax(node: ts.Node): unknown {
    if (ts.isJsxText(node) && !node.text.trim()) return undefined;
    if (ts.isJsxElement(node))
      return [
        node.kind,
        syntax(node.openingElement),
        jsxChildren(node.children),
        syntax(node.closingElement),
      ];
    if (ts.isJsxFragment(node)) return [node.kind, jsxChildren(node.children)];
    if (
      ts.isParenthesizedExpression(node) &&
      (ts.isJsxElement(node.expression) ||
        ts.isJsxSelfClosingElement(node.expression) ||
        ts.isJsxFragment(node.expression))
    )
      return syntax(node.expression);
    // List separators/trailing commas are formatting. Comma operators and
    // omitted array elements remain represented by their surrounding AST.
    const children = node
      .getChildren(file)
      .filter(
        (child) =>
          !(
            node.kind === ts.SyntaxKind.SyntaxList &&
            child.kind === ts.SyntaxKind.CommaToken
          ),
      );
    return children.length
      ? [node.kind, children.map(syntax).filter((child) => child !== undefined)]
      : [node.kind, node.getText(file)];
  }
  return JSON.stringify(syntax(file));
}

export function replayPracticeMigration(path: PracticeFile) {
  let source: string = baseline.sources[path];
  for (const edit of [...baseline.replacements[path]].sort(
    (a, b) => b.start - a.start,
  )) {
    if (source.slice(edit.start, edit.end) !== edit.original)
      throw new Error("Changed reviewed practice copy slot");
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  for (const wire of baseline.wiring[path]) {
    if (!source.includes(wire.before))
      throw new Error("Changed practice translation seam");
    source = source.replace(wire.before, wire.after);
  }
  return source;
}

function identity(node: ts.Node) {
  const owners = ancestors(node);
  return `${owners.find(ts.isFunctionDeclaration)?.name?.getText() ?? "module"}:${owners.find(ts.isVariableDeclaration)?.name.getText() ?? "module"}:${compact(node.parent)}:${node.getText()}`;
}

// Immutable reviewed baseline work is performed once. Live and mutant sources
// are always parsed and walked afresh; retained literals stay context-specific.
const approvedLiterals = new Map<PracticeFile, ReadonlySet<string>>(
  practiceFiles.map((path) => {
    const literals = new Set<string>();
    walk(parse(baseline.approvedSources[path]), (node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
        literals.add(identity(node));
    });
    return [path, literals] as const;
  }),
);

export function auditPractice(source: string, path: PracticeFile) {
  source = projectPlayerWorkspaceSource(source, path);
  const file = parse(source);
  const retainedLiterals = approvedLiterals.get(path);
  if (!retainedLiterals) throw new Error("Missing reviewed practice baseline");
  const keys = new Set<ts.Node>();
  const references: string[] = [];
  const translators: { name: string; namespace: string; scope: ts.Node }[] = [];
  const retained: { category: string; text: string }[] = [];
  const findings: {
    category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
    text: string;
  }[] = [];
  walk(file, (node) => {
    if (ts.isParameter(node) && node.type?.getText() === "PracticeTranslations")
      translators.push({
        name: node.name.getText(),
        namespace: "learningPractice",
        scope: node.parent,
      });
    if (
      ts.isCallExpression(node) &&
      /^formatLocalized/.test(node.expression.getText())
    )
      retained.push({ category: "LOCALE_FORMATTER", text: compact(node) });
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text,
        text = compact(node);
      if (name === "message")
        retained.push({ category: "RAW_SERVER_ERROR", text });
      if (/^(arabic|english|assignmentArabic|assignmentEnglish)/.test(name))
        retained.push({ category: "SERVER_BILINGUAL_DATA", text });
      if (/^(training)?(strengths|gaps|improvementGuidance)$/i.test(name))
        retained.push({ category: "RAW_STAFF_FEEDBACK", text });
      if (
        [
          "originalFileName",
          "displayName",
          "code",
          "status",
          "practiceStatus",
          "id",
          "assignmentId",
          "submissionId",
          "attemptNumber",
          "versionNumber",
        ].includes(name)
      )
        retained.push({ category: "RAW_SERVER_CONTENT", text });
      if (compact(node) === "event.target.value")
        retained.push({ category: "RAW_USER_CONTENT", text });
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
      const owners = [node, ...ancestors(node)];
      const translator = translators.find(
        (item) =>
          item.name === node.expression.getText() &&
          owners.includes(item.scope),
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
