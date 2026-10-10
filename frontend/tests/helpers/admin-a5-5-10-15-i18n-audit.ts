import ts from "typescript";
import { createHash } from "node:crypto";

export const scopes = {
  academicCatalogManagement: ["academic-catalog-management", "adminWorkspace"],
  academicCatalogue: ["academic-catalogue", "academicCatalogue"],
  privacyRequests: ["privacy-request-management", "adminWorkspace"],
  securityIncidents: ["security-incident-management", "adminWorkspace"],
  platformRatingModeration: ["platform-rating-moderation", "adminWorkspace"],
  wallet: ["admin-area", "adminWorkspace", "AdminWallet"],
  schoolIntegrations: ["admin-area", "adminWorkspace", "SchoolIntegrations"],
  legacyRetakes: ["retake-management", "adminWorkspace"],
  deliveryPlanning: ["delivery-planning", "deliveryPlanning"],
} as const;
export type Scope = keyof typeof scopes;
export type CopyCase = { key: string; ar: string; en: string };
export const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function parse(source: string) {
  return ts.createSourceFile(
    "surface.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
export function root(source: string, scope: Scope): ts.Node {
  const sf = parse(source),
    spec = scopes[scope];
  if (spec.length < 3) return sf;
  return sf.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === spec[2],
  )!;
}
export function staticBranch(n: ts.Node): boolean {
  return (
    ts.isConditionalExpression(n) &&
    ["ar", 'locale === "ar"'].includes(n.condition.getText()) &&
    ((ts.isStringLiteralLike(n.whenTrue) &&
      ts.isStringLiteralLike(n.whenFalse) &&
      !["rtl", "en"].includes(n.whenTrue.text)) ||
      (ts.isTemplateExpression(n.whenTrue) &&
        ts.isTemplateExpression(n.whenFalse)))
  );
}
export function uiLiteral(n: ts.Node): boolean {
  if (ts.isJsxText(n))
    return (
      /[a-zA-Z\u0600-\u06ff]/.test(n.text) &&
      !["/", "/ 5", "·", "BETCCO REVIEW", "BETCCO ·"].includes(n.text.trim())
    );
  return (
    ts.isStringLiteral(n) &&
    ts.isJsxAttribute(n.parent) &&
    ["aria-label", "placeholder", "eyebrow"].includes(
      n.parent.name.getText(),
    ) &&
    !["slug", "BETCCO REVIEW"].includes(n.text)
  );
}
function translation(n: ts.Node, cases: CopyCase[]) {
  return (
    ts.isCallExpression(n) &&
    n.expression.getText() === "t" &&
    ts.isStringLiteral(n.arguments[0]) &&
    cases.some((c) => c.key === (n.arguments[0] as ts.StringLiteral).text)
  );
}
// Normalize only the inventoried copy. All other AST nodes, including existing
// translation calls, API/state/guards, academic data and DOM, remain frozen.
export function contractTree(
  source: string,
  scope: Scope,
  cases: CopyCase[],
): unknown {
  function tree(n: ts.Node): unknown {
    if (ts.isParenthesizedExpression(n)) return tree(n.expression);
    if (ts.isImportSpecifier(n) && n.name.text === "useTranslations")
      return null;
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      ["t", "ar", "locale"].includes(
        n.declarationList.declarations[0].name.getText(),
      )
    )
      return null;
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isStringLiteral(n.expression) &&
      !n.expression.text.trim()
    )
      return null;
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      (translation(n.expression, cases) || staticBranch(n.expression))
    )
      return tree(n.expression);
    if (staticBranch(n)) {
      const b = n as ts.ConditionalExpression;
      if (ts.isTemplateExpression(b.whenTrue))
        return [
          "COPY",
          b.whenTrue.templateSpans.map((s) => interpolation(s.expression)),
        ];
      return ["COPY"];
    }
    if (translation(n, cases)) {
      const call = n as ts.CallExpression;
      if (call.arguments[1] && ts.isObjectLiteralExpression(call.arguments[1]))
        return [
          "COPY",
          call.arguments[1].properties.map((p) =>
            interpolation((p as ts.PropertyAssignment).initializer),
          ),
        ];
      return ["COPY"];
    }
    if (uiLiteral(n)) return ["COPY"];
    if (ts.isJsxText(n))
      return n.text.trim()
        ? [n.kind, n.text.replace(/\s+/g, " ").trim()]
        : null;
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
  function interpolation(n: ts.Node): unknown {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      (ts.isStringLiteral(n.right) || translation(n.right, cases))
    )
      return [n.kind, tree(n.left), n.operatorToken.kind, "COPY_FALLBACK"];
    return tree(n);
  }
  return tree(root(source, scope));
}
export const contractHash = (source: string, scope: Scope, cases: CopyCase[]) =>
  hash(contractTree(source, scope, cases));
export function outsideAdminArea(source: string) {
  const sf = parse(source);
  const edits = sf.statements
    .filter(ts.isFunctionDeclaration)
    .filter((n) =>
      ["AdminWallet", "SchoolIntegrations"].includes(n.name?.text ?? ""),
    );
  for (const n of edits.reverse())
    source =
      source.slice(0, n.body!.getStart(sf)) + "{}" + source.slice(n.body!.end);
  return hash(
    parse(source).statements.map((n) => n.getText().replace(/\s+/g, " ")),
  );
}
export function audit(source: string, scope: Scope, cases: CopyCase[]) {
  const findings: string[] = [],
    keys: string[] = [],
    localeUses: string[] = [],
    classifications: { text: string; kind: string }[] = [];
  let staticBilingual = 0,
    staticArabic = 0,
    staticEnglish = 0,
    dataBranches = 0;
  function visit(n: ts.Node) {
    if (staticBranch(n)) {
      staticBilingual++;
      findings.push(n.getText());
      return;
    }
    if (uiLiteral(n)) {
      const text = (n as ts.StringLiteral).text.trim();
      if (/[\u0600-\u06ff]/.test(text)) staticArabic++;
      else staticEnglish++;
      findings.push(text);
      return;
    }
    if (translation(n, cases)) {
      keys.push(
        ((n as ts.CallExpression).arguments[0] as ts.StringLiteral).text,
      );
      classifications.push({ text: n.getText(), kind: "STATIC_UI" });
      return;
    }
    if (
      ts.isConditionalExpression(n) &&
      ["ar", 'locale === "ar"'].includes(n.condition.getText())
    ) {
      dataBranches++;
      classifications.push({
        text: n.getText(),
        kind: ts.isStringLiteral(n.whenTrue)
          ? "LOCALE_DIRECTION"
          : "SERVER_BILINGUAL_DATA",
      });
    }
    if (
      ts.isIdentifier(n) &&
      ["locale", "ar"].includes(n.text) &&
      !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
    )
      localeUses.push(n.parent.getText().replace(/\s+/g, " "));
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n))
      classifications.push({
        text: n.text,
        kind: n.text.startsWith("/")
          ? "API_CONTRACT"
          : "TECHNICAL_INTERNAL_VALUE",
      });
    if (
      ts.isCallExpression(n) &&
      /^(academicText|academicUnitLabel|formatLocalized)/.test(
        n.expression.getText(),
      )
    )
      classifications.push({
        text: n.getText(),
        kind: n.expression.getText().startsWith("academic")
          ? "ACADEMIC_LOCALIZATION"
          : "LOCALE_FORMATTER",
      });
    if (
      ts.isPropertyAccessExpression(n) &&
      /message|description|comment|Summary|title|Name|source|status|severity/.test(
        n.name.text,
      )
    )
      classifications.push({
        text: n.getText(),
        kind: /message/.test(n.name.text)
          ? "RAW_SERVER_ERROR"
          : /description|comment|Summary/.test(n.name.text)
            ? "RAW_USER_CONTENT"
            : /source/.test(n.name.text)
              ? "TECHNICAL_SOURCE_VALUE"
              : /status|severity/.test(n.name.text)
                ? "TECHNICAL_STATUS_VALUE"
                : "RAW_SERVER_CONTENT",
      });
    ts.forEachChild(n, visit);
  }
  visit(root(source, scope));
  return {
    findings,
    keys,
    localeUses,
    classifications,
    staticBilingual,
    staticArabic,
    staticEnglish,
    dataBranches,
    unclassified: findings.length,
  };
}
