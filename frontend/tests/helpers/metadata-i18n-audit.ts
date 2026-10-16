import ts from "typescript";
import { ancestors, compact } from "./admin-final-i18n-audit";

type Finding = {
  line: number;
  category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
  text: string;
};
export function auditMetadata(source: string) {
  const file = ts.createSourceFile(
    "metadata.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: Finding[] = [];
  const references: { line: number; namespace: string; key: string }[] = [];
  const translators: { name: string; namespace: string; scope: ts.Node }[] = [];
  const recorded = new Set<ts.Node>();
  const human = (text: string) => /[a-zA-Z\u0600-\u06ff]/u.test(text);
  const line = (node: ts.Node) =>
    file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const scope = (node: ts.Node) =>
    ancestors(node).find(ts.isFunctionDeclaration) ?? file;
  const walk = (node: ts.Node, action: (node: ts.Node) => void) => {
    action(node);
    ts.forEachChild(node, (child) => walk(child, action));
  };
  const add = (node: ts.Node, category: Finding["category"]) => {
    if (recorded.has(node)) return;
    recorded.add(node);
    findings.push({ line: line(node), category, text: compact(node) });
  };
  walk(file, (node) => {
    if (
      !ts.isCallExpression(node) ||
      node.expression.getText(file) !== "getTranslations"
    )
      return;
    const options = node.arguments[0];
    const props =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties
        : [];
    const property = (name: string) => {
      const entry = props.find((p) => p.name?.getText(file) === name);
      return entry && ts.isPropertyAssignment(entry)
        ? entry.initializer
        : entry && ts.isShorthandPropertyAssignment(entry)
          ? entry.name
          : undefined;
    };
    const namespace = property("namespace"),
      locale = property("locale");
    // Existing accessibility lookup also occurs in this file.
    if (options && ts.isStringLiteral(options)) {
      if (ts.isVariableDeclaration(node.parent))
        translators.push({
          name: node.parent.name.getText(file),
          namespace: options.text,
          scope: scope(node),
        });
      else if (
        ts.isAwaitExpression(node.parent) &&
        ts.isVariableDeclaration(node.parent.parent)
      )
        translators.push({
          name: node.parent.parent.name.getText(file),
          namespace: options.text,
          scope: scope(node),
        });
      return;
    }
    let guarded = false;
    walk(scope(node), (candidate) => {
      if (
        ts.isIfStatement(candidate) &&
        candidate.end < node.getStart(file) &&
        compact(candidate.expression) ===
          "!hasLocale(routing.locales, locale)" &&
        compact(candidate.thenStatement) === "notFound();"
      )
        guarded = true;
    });
    if (
      !namespace ||
      !ts.isStringLiteral(namespace) ||
      !locale ||
      locale.getText(file) !== "locale" ||
      !guarded
    ) {
      add(node, "UNCLASSIFIED");
      return;
    }
    const declaration = ts.isAwaitExpression(node.parent)
      ? node.parent.parent
      : node.parent;
    if (!ts.isVariableDeclaration(declaration)) {
      add(node, "UNCLASSIFIED");
      return;
    }
    translators.push({
      name: declaration.name.getText(file),
      namespace: namespace.text,
      scope: scope(node),
    });
  });
  function translator(node: ts.CallExpression) {
    return translators.find(
      (entry) =>
        entry.name === node.expression.getText(file) &&
        (entry.scope === scope(node) || ancestors(node).includes(entry.scope)),
    );
  }
  walk(file, (node) => {
    if (!ts.isCallExpression(node)) return;
    const owner = translator(node);
    if (!owner) return;
    const key = node.arguments[0];
    if (!key || !ts.isStringLiteralLike(key)) add(node, "UNCLASSIFIED");
    else
      references.push({
        line: line(node),
        namespace: owner.namespace,
        key: key.text,
      });
  });
  function render(node: ts.Node, seen = new Set<ts.Node>()) {
    if (seen.has(node)) return;
    seen.add(node);
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
      if (human(node.text.trim())) add(node, "STATIC_UI");
    } else if (ts.isTemplateExpression(node)) {
      if (
        human(
          node.head.text +
            node.templateSpans.map((span) => span.literal.text).join(""),
        )
      )
        add(node, "STATIC_UI");
    } else if (ts.isConditionalExpression(node)) {
      const values = [node.whenTrue, node.whenFalse];
      if (
        values.every(
          (n) => ts.isStringLiteralLike(n) || ts.isTemplateExpression(n),
        ) &&
        values.some((n) => /[\u0600-\u06ff]/u.test(n.getText(file)))
      )
        add(node, "STATIC_UI");
      else for (const value of values) render(value, new Set(seen));
    } else if (ts.isIdentifier(node)) {
      walk(scope(node), (candidate) => {
        if (
          ts.isVariableDeclaration(candidate) &&
          candidate.name.getText(file) === node.text &&
          candidate.initializer
        )
          render(candidate.initializer, seen);
      });
    } else if (ts.isCallExpression(node)) {
      if (translator(node)) return;
      for (const arg of node.arguments) render(arg, new Set(seen));
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
      render(node.expression, seen);
  }
  walk(file, (node) => {
    if (ts.isJsxText(node)) render(node);
    if (
      ts.isVariableDeclaration(node) &&
      ["title", "description"].includes(node.name.getText(file)) &&
      node.initializer
    )
      render(node.initializer);
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    )
      render(node.expression);
    if (
      ts.isPropertyAssignment(node) &&
      ["title", "description"].includes(node.name.getText(file))
    )
      render(node.initializer);
    if (
      ts.isJsxAttribute(node) &&
      ["aria-label", "alt", "placeholder", "title"].includes(
        node.name.getText(file),
      ) &&
      node.initializer
    ) {
      const before = findings.length;
      render(
        ts.isJsxExpression(node.initializer)
          ? node.initializer.expression!
          : node.initializer,
      );
      for (const finding of findings.slice(before))
        finding.category = "ACCESSIBILITY_STATIC_UI";
    }
  });
  return { findings, references };
}
