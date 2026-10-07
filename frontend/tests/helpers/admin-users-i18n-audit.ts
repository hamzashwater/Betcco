import ts from "typescript";
import { createHash } from "node:crypto";
export const scopes = {
  "src/features/admin/admin-area.tsx": ["StudentManagement", "TeacherInvites"],
  "src/features/admin/account-identity-management.tsx": [
    "AccountIdentityManagement",
  ],
} as const;
export function functionsIn(source: string, names: readonly string[]) {
  const file = ts.createSourceFile(
    "admin-users.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return {
    file,
    functions: file.statements.filter(
      (n): n is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? ""),
    ),
  };
}
function isCopy(n: ts.Node): boolean {
  if (
    ts.isConditionalExpression(n) &&
    /^locale === ["']ar["']$/.test(n.condition.getText())
  )
    return true;
  if (ts.isCallExpression(n) && n.expression.getText() === "t") return true;
  if (
    ts.isStringLiteral(n) &&
    ["…", "—", "Request failed.", "Email"].includes(n.text)
  )
    return true;
  return (
    ts.isConditionalExpression(n) &&
    n.condition.getText() === 'pendingBulkAction === "delete"' &&
    isCopy(n.whenTrue) &&
    isCopy(n.whenFalse)
  );
}
// Erase presentation only. API/mutation/state/selection/role guards and all
// layout tokens remain in the frozen technical tree. Pure label adapters and
// interpolation wording are checked separately against base-main fixtures.
export function contractHash(fn: ts.FunctionDeclaration) {
  function tree(n: ts.Node): unknown {
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      ["t", "locale"].includes(
        n.declarationList.declarations[0].name.getText(),
      ) &&
      /use(Translations|Locale)\(/.test(n.getText())
    )
      return null;
    if (
      ts.isVariableDeclaration(n) &&
      ["bulkActionLabel", "invitationStatus"].includes(n.name.getText())
    )
      return [n.kind, n.name.getText(), "COPY_HELPER"];
    if (
      ts.isJsxAttribute(n) &&
      (n.name.getText() === "eyebrow" ||
        (n.initializer &&
          (isCopy(n.initializer) ||
            (ts.isJsxExpression(n.initializer) &&
              n.initializer.expression &&
              isCopy(n.initializer.expression)))))
    )
      return [n.kind, n.name.getText(), "COPY_ATTRIBUTE"];
    if (ts.isJsxExpression(n) && n.expression && isCopy(n.expression))
      return ["COPY_JSX"];
    if (ts.isJsxText(n))
      return n.text.trim() === "…"
        ? ["COPY_JSX"]
        : n.text.trim()
          ? [n.kind, n.text.trim()]
          : null;
    if (isCopy(n)) return ["COPY_EXPR"];
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
  return createHash("sha256")
    .update(JSON.stringify(tree(fn)))
    .digest("hex");
}
const technicalStrings = new Set([
  "",
  " ",
  "admin-students",
  "POST",
  "approve",
  "delete",
  "DELETE",
  "freeze",
  "admin-dashboard",
  "unfreeze",
  "true",
  "alert",
  "checkbox",
  "status",
  "button",
  "dialog",
  "submit",
  "admin-teachers",
  "/admin/users?role=Teacher&pageSize=100",
  "teacher-invitations",
  "/admin/users/teachers/invitations?pageSize=100",
  "teachers-for-evaluation",
  "/admin/users/teachers/invite",
  "email",
  "Teacher",
  "SupportAdmin",
  "managed-identities",
  "/admin/users/support-admins/invite",
  "ltr",
]);
const technicalFragments = new Set([
  "/admin/users?role=Student&pageSize=100&search=",
  "",
  "/admin/users/",
  "/reset-device",
  "/approve",
  "/freeze",
  " · ",
  "/admin/users/teachers/invitations/",
  "/revoke",
  "/admin/users?",
  "/email-change/request",
  "/admin/users/support-admins/",
  "/resend-activation",
  "/revoke-authority",
]);
function css(n: ts.Node) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText() === "className";
    if (ts.isStatement(p)) break;
  }
  return false;
}
export function audit(source: string, names: readonly string[]) {
  const { file, functions } = functionsIn(source, names);
  const findings: string[] = [];
  const localeUses: {
    owner: string;
    kind: "FORMATTER" | "OTHER";
    text: string;
  }[] = [];
  const keys: string[] = [];
  for (const fn of functions) {
    function visit(n: ts.Node) {
      if (
        (ts.isConditionalExpression(n) &&
          /locale\s*===\s*["']ar["']/.test(n.condition.getText(file))) ||
        (ts.isIfStatement(n) &&
          /locale\s*===\s*["']ar["']/.test(n.expression.getText(file)))
      )
        findings.push("locale-copy branch");
      if (ts.isJsxText(n) && n.text.trim() && n.text.trim() !== "·")
        findings.push(n.text.trim());
      if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
        const p = n.parent;
        const translated =
          ts.isCallExpression(p) &&
          ["t", "useTranslations"].includes(p.expression.getText(file));
        const technical = ts.isTemplateLiteralToken(n)
          ? technicalFragments.has(n.text)
          : technicalStrings.has(n.text);
        if (
          /[\u0600-\u06ff]/u.test(n.text) ||
          (!translated && !css(n) && !technical)
        )
          findings.push(n.text);
        if (translated && p.expression.getText(file) === "t") keys.push(n.text);
      }
      if (ts.isIdentifier(n) && n.text === "locale") {
        const p = n.parent;
        if (
          ts.isCallExpression(p) &&
          p.expression.getText(file) === "formatLocalizedDateTime"
        )
          localeUses.push({
            owner: fn.name!.text,
            kind: "FORMATTER",
            text: p.getText(file),
          });
        else if (ts.isVariableDeclaration(p))
          localeUses.push({
            owner: fn.name!.text,
            kind: "OTHER",
            text: "useLocale binding",
          });
        else findings.push(`unclassified locale: ${p.getText(file)}`);
      }
      ts.forEachChild(n, visit);
    }
    visit(fn);
  }
  return { findings, localeUses, keys };
}
