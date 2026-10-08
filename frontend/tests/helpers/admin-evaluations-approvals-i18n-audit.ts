import ts from "typescript";
import { createHash } from "node:crypto";

export const owners = [
  "AdminEvaluations",
  "CourseApprovals",
  "CourseApprovalPreview",
] as const;
export function functionsIn(source: string) {
  const file = ts.createSourceFile(
    "admin.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = file.statements.filter(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) &&
      owners.includes(n.name?.text as (typeof owners)[number]),
  );
  return { file, functions };
}
export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function outsideScopeHash(source: string) {
  const { file, functions } = functionsIn(source);
  for (const fn of functions.slice().reverse())
    source = source.slice(0, fn.getStart(file)) + source.slice(fn.end);
  return hash(source.replace(/\r\n/g, "\n"));
}
function localeBranch(n: ts.Node): n is ts.ConditionalExpression {
  return (
    ts.isConditionalExpression(n) &&
    /^locale === ["']ar["']$/.test(n.condition.getText())
  );
}
function dataBranch(n: ts.ConditionalExpression) {
  return (
    ts.isPropertyAccessExpression(n.whenTrue) &&
    ts.isPropertyAccessExpression(n.whenFalse) &&
    (/^\w+\.arabic\w+$/.test(n.whenTrue.getText()) ||
      n.whenTrue.getText() === "course.subjectArabicName") &&
    (/^\w+\.english\w+$/.test(n.whenFalse.getText()) ||
      n.whenFalse.getText() === "course.subjectEnglishName") &&
    n.whenTrue.expression.getText() === n.whenFalse.expression.getText()
  );
}
function copy(n: ts.Node): boolean {
  return (
    (localeBranch(n) && !dataBranch(n)) ||
    (ts.isCallExpression(n) && n.expression.getText() === "t") ||
    (ts.isStringLiteral(n) &&
      ["—", "Unable to verify this result.", "Request failed."].includes(
        n.text,
      ))
  );
}
// Freeze the complete technical AST after erasing only owned copy/hooks.
// The section and cover interpolation data paths are checked independently.
export function contractHashes(source: string) {
  const { functions } = functionsIn(
    source.replace("}MB ·", '}{t("courseApprovalPreview.megabytes")} ·'),
  );
  function tree(n: ts.Node): unknown {
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      ["locale", "t"].includes(
        n.declarationList.declarations[0].name.getText(),
      ) &&
      /use(Translations|Locale)\(/.test(n.getText())
    )
      return null;
    if (ts.isJsxAttribute(n) && n.name.getText() === "eyebrow")
      return [n.kind, "eyebrow", "COPY_ATTRIBUTE"];
    if (ts.isJsxExpression(n) && n.expression && copy(n.expression))
      return ["COPY_JSX"];
    if (ts.isJsxText(n))
      return ["…", "Access denied."].includes(n.text.trim())
        ? ["COPY_JSX"]
        : n.text.trim()
          ? [n.kind, n.text.trim()]
          : null;
    if (copy(n)) return ["COPY_EXPR"];
    if (
      ts.isIdentifier(n) ||
      ts.isStringLiteralLike(n) ||
      ts.isTemplateLiteralToken(n) ||
      ts.isNumericLiteral(n)
    )
      return [n.kind, n.text];
    const children: unknown[] = [];
    ts.forEachChild(n, (c) => {
      const v = tree(c);
      if (v !== null) children.push(v);
    });
    return [n.kind, children];
  }
  return functions.map((fn) => hash(tree(fn)));
}
const technicalStrings = new Set([
  "",
  " ",
  "current-user",
  "/auth/me",
  "Admin",
  "InternalVerifier",
  "LeadInternalVerifier",
  "pending-evaluations",
  "/evaluations/pending-assignment",
  "under-review-evaluations",
  "/evaluations/under-review",
  "POST",
  "admin-dashboard",
  "assessment-coordination",
  "alert",
  "status",
  "datetime-local",
  "button",
  "approvals",
  "/admin/courses/approvals",
  "Needs revision",
  "Approved",
  "SubmittedForReview",
  "approval-course",
  "JOD",
  ", ",
]);
const technicalFragments = new Set([
  "/evaluations/",
  "/internal-verification",
  "/admin/courses/",
  "/review",
  "/publish",
  "",
  " · ",
  "/api/v1/admin/courses/",
  "/cover",
  "-",
  "/api/v1/admin/courses/resources/",
]);
technicalStrings.add("ar");
function css(n: ts.Node) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText() === "className";
    if (ts.isStatement(p)) break;
  }
  return false;
}
export function audit(source: string) {
  const { file, functions } = functionsIn(source);
  const findings: string[] = [],
    keys: string[] = [],
    branches: {
      owner: string;
      kind: "SERVER_BILINGUAL_DATA" | "STATIC_UI";
      text: string;
    }[] = [],
    formatters: string[] = [],
    technical: string[] = [];
  for (const fn of functions) {
    function visit(n: ts.Node) {
      if (localeBranch(n))
        branches.push({
          owner: fn.name!.text,
          kind: dataBranch(n) ? "SERVER_BILINGUAL_DATA" : "STATIC_UI",
          text: n.getText(file),
        });
      if (ts.isJsxText(n) && n.text.trim() && !/^[:·—\s]+$/.test(n.text))
        findings.push(n.text.trim());
      if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
        const p = n.parent,
          translated =
            ts.isCallExpression(p) &&
            ["t", "useTranslations"].includes(p.expression.getText(file));
        const internal = ts.isTemplateLiteralToken(n)
          ? technicalFragments.has(n.text)
          : technicalStrings.has(n.text);
        if (!translated && !css(n) && !internal) findings.push(n.text);
        if (translated && p.expression.getText(file) === "t") keys.push(n.text);
        if (internal && !css(n)) technical.push(n.text);
      }
      if (ts.isIdentifier(n) && n.text === "locale") {
        const p = n.parent;
        if (
          ts.isCallExpression(p) &&
          p.expression.getText(file) === "formatLocalizedCurrency"
        )
          formatters.push(p.getText(file));
        else if (
          !ts.isVariableDeclaration(p) &&
          !(ts.isBinaryExpression(p) && localeBranch(p.parent))
        )
          findings.push(`unclassified locale: ${p.getText(file)}`);
      }
      ts.forEachChild(n, visit);
    }
    visit(fn);
  }
  return { findings, keys, branches, formatters, technical };
}
