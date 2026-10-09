import ts from "typescript";
import { createHash } from "node:crypto";

export const sections = {
  "internal-verification-plan-management": "internalVerificationPlans",
  "evaluation-appeal-management": "evaluationAppeals",
  "qualification-registry-management": "qualificationRegistry",
  gradebook: "gradebook",
} as const;
export type File = keyof typeof sections;
export const files = Object.keys(sections) as File[];
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function parse(source: string) {
  return ts.createSourceFile(
    "surface.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
export function staticBranch(n: ts.Node): boolean {
  return (
    ts.isConditionalExpression(n) &&
    ["ar", 'locale === "ar"'].includes(n.condition.getText()) &&
    ts.isStringLiteral(n.whenTrue) &&
    ts.isStringLiteral(n.whenFalse)
  );
}
function outcome(n: ts.Node) {
  if (
    ts.isElementAccessExpression(n) &&
    n.expression.getText() === "labels.outcomeLabels"
  )
    return n.argumentExpression;
  if (
    ts.isCallExpression(n) &&
    n.expression.getText() === "t" &&
    ts.isTemplateExpression(n.arguments[0]) &&
    n.arguments[0].head.text === "internalVerificationPlans.outcomeLabels."
  )
    return n.arguments[0].templateSpans[0].expression;
}
function copy(n: ts.Node) {
  return (
    staticBranch(n) ||
    (ts.isPropertyAccessExpression(n) && n.expression.getText() === "labels") ||
    (ts.isCallExpression(n) && n.expression.getText() === "t")
  );
}
// A per-file whole-AST freeze erases ONLY static copy and its hook. It retains
// computed outcome selectors, raw data, API/state/guards, DOM and CSS.
export function contractTree(source: string, name: File) {
  function tree(n: ts.Node): unknown {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isStringLiteral(n.expression) &&
      !n.expression.text.trim()
    )
      return null;
    if (ts.isParenthesizedExpression(n)) return tree(n.expression);
    if (ts.isImportSpecifier(n) && n.name.text === "useTranslations")
      return null;
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1
    ) {
      const d = n.declarationList.declarations[0];
      if (
        d.name.getText() === "t" ||
        d.name.getText() === "labels" ||
        (d.name.getText() === "ar" &&
          name !== "qualification-registry-management")
      )
        return null;
    }
    const selector = outcome(n);
    if (selector) return ["OUTCOME_COPY", tree(selector)];
    if (copy(n)) return ["COPY"];
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
  return tree(parse(source));
}
export const contractHash = (source: string, name: File) =>
  hash(contractTree(source, name));
export function literalSignature(n: ts.Node) {
  return `${n.kind}:${n.parent.kind}:${(n as ts.StringLiteral).text}`;
}
export function technicalLiterals(source: string) {
  const result: string[] = [];
  function visit(n: ts.Node) {
    if (staticBranch(n)) return;
    if (ts.isVariableDeclaration(n) && n.name.getText() === "labels") return;
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n))
      result.push(literalSignature(n));
    ts.forEachChild(n, visit);
  }
  visit(parse(source));
  return [...new Set(result)].sort();
}
export function audit(source: string, name: File, allowed: string[]) {
  const findings: string[] = [],
    keys: string[] = [],
    localeUses: { kind: string; text: string }[] = [];
  let staticBilingual = 0,
    staticArabic = 0,
    staticEnglish = 0,
    inlineBilingual = 0,
    dataBranches = 0;
  const sf = parse(source);
  const text = (n: ts.Node) => n.getText(sf).replace(/\s+/g, " ");
  function visit(n: ts.Node) {
    if (staticBranch(n)) {
      staticBilingual++;
      findings.push("STATIC_UI branch");
    }
    if (ts.isVariableDeclaration(n) && n.name.getText() === "labels") {
      inlineBilingual++;
      findings.push("STATIC_UI labels object");
    }
    if (
      ts.isConditionalExpression(n) &&
      ["ar", 'locale === "ar"'].includes(n.condition.getText())
    ) {
      if (
        name === "qualification-registry-management" &&
        ((n.whenTrue.getText() === "qualification.arabicName" &&
          n.whenFalse.getText() === "qualification.englishName") ||
          (n.whenTrue.getText() === "rubric.arabicTitle" &&
            n.whenFalse.getText() === "rubric.englishTitle"))
      ) {
        dataBranches++;
        localeUses.push({ kind: "SERVER_BILINGUAL_DATA", text: text(n) });
      } else if (!staticBranch(n) && !ts.isObjectLiteralExpression(n.whenTrue))
        findings.push("unclassified locale branch");
    }
    if (ts.isIdentifier(n) && n.text === "locale") {
      const p = n.parent;
      if (
        ts.isVariableDeclaration(p) ||
        (ts.isBinaryExpression(p) && p.getText() === 'locale === "ar"')
      ) {
        /* binding/selector */
      } else if (
        ts.isCallExpression(p) &&
        ["formatLocalizedDateTime", "formatLocalizedDate"].includes(
          p.expression.getText(),
        )
      )
        localeUses.push({ kind: "FORMATTER", text: text(p) });
      else if (
        ts.isTemplateSpan(p) ||
        ts.isShorthandPropertyAssignment(p) ||
        ts.isArrayLiteralExpression(p)
      )
        localeUses.push({ kind: "LOCALE_API_PARAMETER", text: text(p) });
      else findings.push(`unclassified locale: ${text(p)}`);
    }
    if (
      ts.isJsxText(n) &&
      n.text.trim() &&
      !/^(BETCCO\s*·|[·—…:\s]+)$/.test(n.text.trim())
    )
      findings.push(`STATIC_UI: ${n.text.trim()}`);
    if (ts.isCallExpression(n) && n.expression.getText() === "t") {
      if (ts.isStringLiteral(n.arguments[0])) keys.push(n.arguments[0].text);
      else if (outcome(n))
        keys.push(
          ...["Pass", "Merit", "Distinction"].map(
            (v) => `internalVerificationPlans.outcomeLabels.${v}`,
          ),
        );
      else findings.push("unclassified translation selector");
    }
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
      const p = n.parent;
      const translated =
        ts.isCallExpression(p) &&
        ["t", "useTranslations"].includes(p.expression.getText());
      const templateCopy =
        ts.isTemplateLiteralToken(n) &&
        (ts.isTemplateExpression(p) || ts.isTemplateSpan(p)) &&
        (ts.isTemplateExpression(p) ? p : p.parent).parent
          .getText()
          .startsWith("t(");
      if (
        !translated &&
        !templateCopy &&
        !allowed.includes(literalSignature(n))
      ) {
        if (/[\u0600-\u06ff]/.test(n.text)) staticArabic++;
        else if (/[a-zA-Z]/.test(n.text)) staticEnglish++;
        findings.push(`unclassified literal: ${n.text}`);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return {
    findings,
    keys,
    localeUses,
    staticBilingual,
    staticArabic,
    staticEnglish,
    inlineBilingual,
    dataBranches,
  };
}
