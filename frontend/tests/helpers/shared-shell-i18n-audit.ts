import ts from "typescript";
import { createAudit, compact, ancestors } from "./admin-final-i18n-audit";

export const scopedFiles = [
  "src/app/[locale]/error.tsx",
  "src/app/[locale]/layout.tsx",
  "src/app/[locale]/loading.tsx",
  "src/components/forms/file-picker.tsx",
  "src/components/navigation/command-palette.tsx",
  "src/components/navigation/notification-center.tsx",
  "src/components/theme-toggle.tsx",
] as const;

type Category = "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
const accessibility = new Set([
  "aria-label",
  "aria-description",
  "title",
  "alt",
  "placeholder",
]);
const display = new Set([
  ...accessibility,
  "label",
  "description",
  "pendingLabel",
  "heading",
]);
const human = (text: string) => /[a-zA-Z\u0600-\u06ff]/u.test(text);

// Walk rendered sinks back through local variables and helper returns. Technical
// literals in routes, options, comparisons and DOM mechanics are not UI sinks.
export function auditShell(source: string, name = "fixture.tsx") {
  const file = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, ts.Expression>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  const translators = new Map<string, string>();
  const references: { namespace: string; key: string }[] = [];
  const findings: { category: Category; text: string }[] = [];
  const recorded = new Set<ts.Node>();
  function visit(n: ts.Node, callback: (n: ts.Node) => void) {
    callback(n);
    ts.forEachChild(n, (child) => visit(child, callback));
  }
  visit(file, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n);
    if (
      !ts.isVariableDeclaration(n) ||
      !ts.isIdentifier(n.name) ||
      !n.initializer
    )
      return;
    declarations.set(n.name.text, n.initializer);
    const call = ts.isAwaitExpression(n.initializer)
      ? n.initializer.expression
      : n.initializer;
    if (
      ts.isCallExpression(call) &&
      /^(useTranslations|getTranslations)$/.test(call.expression.getText())
    ) {
      if (!call.arguments.length) translators.set(n.name.text, "");
      else if (ts.isStringLiteral(call.arguments[0]))
        translators.set(n.name.text, call.arguments[0].text);
      else findings.push({ category: "UNCLASSIFIED", text: compact(call) });
    }
  });
  visit(file, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isIdentifier(n.expression) ||
      !translators.has(n.expression.text)
    )
      return;
    const key = n.arguments[0];
    if (!key || !ts.isStringLiteralLike(key)) {
      findings.push({ category: "UNCLASSIFIED", text: compact(n) });
      return;
    }
    references.push({
      namespace: translators.get(n.expression.text)!,
      key: key.text,
    });
  });
  function isCopy(n: ts.Node, seen = new Set<ts.Node>()): boolean {
    if (seen.has(n)) return false;
    seen.add(n);
    if (ts.isStringLiteralLike(n)) return human(n.text);
    if (ts.isTemplateExpression(n))
      return human(
        n.head.text + n.templateSpans.map((s) => s.literal.text).join(""),
      );
    if (ts.isConditionalExpression(n))
      return (
        isCopy(n.whenTrue, new Set(seen)) || isCopy(n.whenFalse, new Set(seen))
      );
    if (ts.isIdentifier(n)) {
      const value = declarations.get(n.text);
      return !!value && isCopy(value, seen);
    }
    return false;
  }
  function render(n: ts.Node, category: Category, seen = new Set<ts.Node>()) {
    if (seen.has(n)) return;
    seen.add(n);
    if (
      ts.isStringLiteralLike(n) ||
      ts.isTemplateExpression(n) ||
      ts.isJsxText(n)
    ) {
      const text = ts.isTemplateExpression(n) ? compact(n) : n.text.trim();
      if (human(text) && text !== "BETCCO" && !recorded.has(n)) {
        recorded.add(n);
        findings.push({ category, text });
      }
      return;
    }
    if (ts.isIdentifier(n)) {
      const value = declarations.get(n.text);
      if (value) render(value, category, seen);
      return;
    }
    if (ts.isConditionalExpression(n)) {
      // One finding per bilingual presentation slot, including nested count
      // branches, as in the supplied 23/9 semantic baseline.
      if (
        /^(isArabic|locale === ["']ar["'])$/.test(compact(n.condition)) &&
        isCopy(n)
      ) {
        if (!recorded.has(n)) {
          recorded.add(n);
          findings.push({ category, text: compact(n) });
        }
      } else {
        render(n.whenTrue, category, new Set(seen));
        render(n.whenFalse, category, new Set(seen));
      }
      return;
    }
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression) && translators.has(n.expression.text))
        return;
      const fn = functions.get(n.expression.getText());
      // These helpers return raw file metadata/units, explicitly preserved by
      // this task. Their bodies are frozen separately against base source.
      if (
        fn &&
        !["fileType", "fileKey", "formatBytes"].includes(fn.name!.text)
      ) {
        visit(fn, (child) => {
          if (ts.isReturnStatement(child) && child.expression)
            render(child.expression, category, seen);
        });
      }
      return;
    }
    if (ts.isBinaryExpression(n)) {
      if (n.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
        render(n.left, category, new Set(seen));
      render(n.right, category, new Set(seen));
    } else if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n))
      render(n.expression, category, seen);
  }
  visit(file, (n) => {
    if (ts.isJsxText(n)) render(n, "STATIC_UI");
    if (
      ts.isJsxAttribute(n) &&
      display.has(n.name.getText()) &&
      n.initializer
    ) {
      const tooltip =
        n.name.getText() !== "title" ||
        ((ts.isJsxOpeningElement(n.parent.parent) ||
          ts.isJsxSelfClosingElement(n.parent.parent)) &&
          /^[a-z]/.test(n.parent.parent.tagName.getText()));
      render(
        ts.isJsxExpression(n.initializer)
          ? n.initializer.expression!
          : n.initializer,
        accessibility.has(n.name.getText()) && tooltip
          ? "ACCESSIBILITY_STATIC_UI"
          : "STATIC_UI",
      );
    }
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    )
      render(n.expression, "STATIC_UI");
    if (
      ts.isPropertyAssignment(n) &&
      ["label", "hint"].includes(n.name.getText())
    )
      render(n.initializer, "STATIC_UI");
    if (
      ts.isCallExpression(n) &&
      n.expression.getText() === "setError" &&
      n.arguments[0]
    )
      render(n.arguments[0], "STATIC_UI");
  });
  return {
    findings,
    references,
    counts: Object.fromEntries(
      (["STATIC_UI", "ACCESSIBILITY_STATIC_UI", "UNCLASSIFIED"] as const).map(
        (c) => [c, findings.filter((f) => f.category === c).length],
      ),
    ),
  };
}

export function shellContracts(source: string) {
  const file = ts.createSourceFile(
    "contract.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const contracts: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      contracts.push(`element:${n.tagName.getText()}`);
      for (const attribute of n.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) {
          contracts.push(compact(attribute));
          continue;
        }
        const name = attribute.name.getText();
        const nestedJsx =
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression &&
          (ts.isJsxElement(attribute.initializer.expression) ||
            ts.isJsxFragment(attribute.initializer.expression));
        // Nested element props are walked below, including each handler and
        // mechanical attribute; do not hash their presentation text twice.
        contracts.push(
          display.has(name)
            ? `copy-attribute:${name}`
            : nestedJsx
              ? `element-prop:${name}`
              : compact(attribute),
        );
      }
    }
    if (
      ts.isFunctionDeclaration(n) &&
      [
        "generateMetadata",
        "removeFile",
        "fileKey",
        "formatBytes",
        "fileType",
        "toggle",
      ].includes(n.name?.text ?? "")
    )
      contracts.push(compact(n));
    if (ts.isVariableDeclaration(n) && n.name.getText() === "structuredData")
      contracts.push(compact(n));
    if (
      ts.isPropertyAssignment(n) &&
      [
        "queryKey",
        "queryFn",
        "mutationFn",
        "onSuccess",
        "enabled",
        "retry",
        "staleTime",
      ].includes(n.name.getText())
    )
      contracts.push(compact(n));
    if (ts.isCallExpression(n) && n.expression.getText() === "useDialogFocus")
      contracts.push(compact(n));
    if (ts.isVariableDeclaration(n) && n.name.getText() === "chooseFiles") {
      const text = compact(n).replace(
        /setError\([\s\S]*?\);/,
        "setError(COPY);",
      );
      contracts.push(text);
    }
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      [
        "notification.title",
        "notification.body",
        "file.name",
        "item.label",
        "item.hint",
      ].includes(compact(n.expression))
    )
      contracts.push(compact(n));
    if (
      ts.isPropertyAssignment(n) &&
      ["id", "href"].includes(n.name.getText()) &&
      !ancestors(n).some(ts.isTypeNode)
    )
      contracts.push(compact(n));
    ts.forEachChild(n, visit);
  }
  visit(file);
  return contracts;
}

export function liveShellAudit() {
  const { program } = createAudit([...scopedFiles]);
  return scopedFiles.map((path) => ({
    path,
    ...auditShell(program.getSourceFile(path)!.text, path),
  }));
}
