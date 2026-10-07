import ts from "typescript";
import { createHash } from "node:crypto";

export const scopedNames = [
  "AdminDashboard",
  "AdminAnalyticsTrend",
  "AdminLink",
] as const;
export function scopedFunctions(source: string) {
  const file = ts.createSourceFile(
    "admin-area.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return {
    file,
    functions: file.statements.filter(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) &&
        scopedNames.some((name) => name === node.name?.text),
    ),
  };
}
function copyExpression(node: ts.Node) {
  return (
    (ts.isConditionalExpression(node) &&
      ts.isStringLiteral(node.whenTrue) &&
      ts.isStringLiteral(node.whenFalse) &&
      node.condition.getText().match(/^locale === ["']ar["']$/)) ||
    (ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "t")
  );
}
// Remove only migrated copy and its hook. Freeze the remaining AST, including
// query timing, state initialization, routes, fields, formatters and layout.
export function contractHash(fn: ts.FunctionDeclaration): string {
  function tree(node: ts.Node): unknown {
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.length === 1 &&
      node.declarationList.declarations[0].name.getText() === "t" &&
      node.getText().includes('useTranslations("adminWorkspace")')
    )
      return null;
    if (ts.isJsxAttribute(node) && node.name.getText() === "eyebrow")
      return [node.kind, "eyebrow", "COPY"];
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      copyExpression(node.expression)
    )
      return ["COPY_JSX"];
    if (ts.isJsxText(node))
      return node.text.trim() === "…"
        ? ["COPY_JSX"]
        : node.text.trim()
          ? [node.kind, node.text.trim()]
          : null;
    if (copyExpression(node)) return ["COPY_EXPR"];
    if (
      ts.isIdentifier(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isTemplateLiteralToken(node) ||
      ts.isNumericLiteral(node)
    )
      return [node.kind, node.text];
    const children: unknown[] = [];
    ts.forEachChild(node, (child) => {
      const result = tree(child);
      if (result !== null) children.push(result);
    });
    return [node.kind, children];
  }
  return createHash("sha256")
    .update(JSON.stringify(tree(fn)))
    .digest("hex");
}

const technicalStrings = new Set([
  "30d",
  "custom",
  "admin-dashboard",
  "today",
  "7d",
  "3m",
  "year",
  "all",
  "button",
  "date",
  "alert",
  "secondary",
  "accent",
  "warm",
  "JOD",
  "students",
  "teachers",
  "account-identities",
  "course-approvals",
  "evaluations",
  "internal-verification",
  "evaluation-appeals",
  "qualification-registry",
  "academic-catalogue",
  "delivery-planning",
  "gradebook",
  "ratings",
  "wallet",
  "content",
  "commerce",
  "audit-logs",
  "privacy",
  "integrations",
  "trend",
  "revenue",
  "paidOrders",
  "lessonActivity",
  "short",
  "numeric",
  "true",
]);
const technicalTemplateFragments = new Set([
  "/admin/dashboard?period=custom&fromUtc=",
  "",
  "T00:00:00.000Z",
  "&toUtc=",
  "T23:59:59.999Z",
  "/admin/dashboard?period=",
  "focus-ring rounded-lg border px-3 py-2 text-xs font-bold ",
  ": ",
  " block w-full rounded-t-sm opacity-85 transition-opacity group-hover:opacity-100",
  "%",
  "/",
  "/admin/",
]);
export function staticCopyFindings(source: string) {
  const { file, functions } = scopedFunctions(source);
  const findings: string[] = [];
  for (const fn of functions) {
    function visit(node: ts.Node) {
      if (
        ts.isTemplateLiteralToken(node) &&
        !technicalTemplateFragments.has(node.text)
      )
        findings.push(node.text);
      if (
        ts.isConditionalExpression(node) &&
        /locale\s*===\s*["']ar["']/.test(node.condition.getText(file))
      )
        findings.push("locale-branch");
      if (ts.isJsxText(node) && node.text.trim())
        findings.push(node.text.trim());
      if (ts.isStringLiteralLike(node)) {
        const parent = node.parent;
        const translated =
          ts.isCallExpression(parent) &&
          ["t", "academicT", "deliveryT", "useTranslations"].includes(
            parent.expression.getText(file),
          );
        const css =
          (ts.isJsxAttribute(parent) &&
            parent.name.getText(file) === "className") ||
          node.text.startsWith("bg-") ||
          node.text.startsWith("border-");
        const templateTechnical =
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node);
        if (
          /[\u0600-\u06ff]/u.test(node.text) ||
          (!translated &&
            !css &&
            !templateTechnical &&
            !technicalStrings.has(node.text))
        )
          findings.push(node.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(fn);
  }
  return findings;
}
