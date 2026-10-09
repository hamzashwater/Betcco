import ts from "typescript";
import { createHash } from "node:crypto";

export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function parse(source: string) {
  return ts.createSourceFile(
    "specialisms.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function staticBranch(n: ts.Node): n is ts.ConditionalExpression {
  return (
    ts.isConditionalExpression(n) &&
    n.condition.getText() === "ar" &&
    ts.isStringLiteral(n.whenTrue) &&
    ts.isStringLiteral(n.whenFalse)
  );
}
function dataBranch(n: ts.Node): n is ts.ConditionalExpression {
  return (
    ts.isConditionalExpression(n) &&
    n.condition.getText() === "ar" &&
    n.whenTrue.getText() === "item.arabicTitle" &&
    n.whenFalse.getText() === "item.englishTitle"
  );
}
function copy(n: ts.Node) {
  return (
    staticBranch(n) ||
    (ts.isCallExpression(n) && n.expression.getText() === "t")
  );
}
// Freeze the entire technical AST, including data selectors, hooks, CSS and
// state. Erase only static presentation and the added translation hook/import.
export function contractTree(source: string) {
  function tree(n: ts.Node): unknown {
    if (ts.isParenthesizedExpression(n)) return tree(n.expression);
    if (ts.isImportSpecifier(n) && n.name.text === "useTranslations")
      return null;
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      n.declarationList.declarations[0].name.getText() === "t"
    )
      return null;
    if (ts.isJsxExpression(n) && n.expression) {
      if (ts.isStringLiteral(n.expression) && !n.expression.text.trim())
        return null;
      if (copy(n.expression)) return ["COPY_JSX"];
    }
    if (copy(n)) return ["COPY_EXPR"];
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
    ts.forEachChild(n, (child) => {
      const v = tree(child);
      if (v !== null) children.push(v);
    });
    return [n.kind, children];
  }
  return tree(parse(source));
}
export function contractHash(source: string) {
  return hash(contractTree(source));
}

const technical = new Set([
  "use client",
  "@/i18n/date-time",
  "@/lib/api",
  "@/lib/academic-localization",
  "@tanstack/react-query",
  "next-intl",
  "react",
  "ar",
  "",
  " ",
  "grant",
  "revoke",
  "evaluator-specialism-staff",
  "evaluator-specialism-units",
  "evaluator-specialism-history",
  "eligible-evaluators",
  "/admin/evaluator-specialisms/staff",
  "/admin/evaluator-specialisms/units",
  "/admin/evaluator-specialisms",
  "POST",
  "button",
  "alert",
  "status",
]);
const fragments = new Set([
  "/admin/evaluator-specialisms?page=",
  "&pageSize=25",
  "/admin/evaluator-specialisms/",
  "/revoke",
]);
export function audit(source: string) {
  const file = parse(source),
    findings: string[] = [],
    keys: string[] = [];
  const localeUses: { kind: string; text: string }[] = [];
  let staticBilingual = 0,
    staticArabic = 0,
    staticEnglish = 0,
    inlineBilingual = 0,
    dataBranches = 0;
  function visit(n: ts.Node) {
    if (staticBranch(n)) {
      staticBilingual++;
      findings.push("static bilingual presentation");
    }
    if (dataBranch(n)) {
      dataBranches++;
      localeUses.push({
        kind: "SERVER_BILINGUAL_DATA",
        text: n.getText(file).replace(/\s+/g, " "),
      });
    }
    if (
      ts.isConditionalExpression(n) &&
      n.condition.getText() === "ar" &&
      !staticBranch(n) &&
      !dataBranch(n)
    )
      findings.push("unclassified locale branch");
    if (
      ts.isObjectLiteralExpression(n) &&
      n.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) && ["ar", "en"].includes(p.name.getText()),
      )
    ) {
      inlineBilingual++;
      findings.push("inline bilingual presentation mapping");
    }
    if (ts.isJsxText(n) && n.text.trim() && !/^[·—:\s]+$/.test(n.text))
      findings.push(n.text.trim());
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
      const p = n.parent;
      const translated =
        ts.isCallExpression(p) &&
        ["t", "useTranslations"].includes(p.expression.getText());
      const style = ts.isJsxAttribute(p) && p.name.getText() === "className";
      const internal = ts.isTemplateLiteralToken(n)
        ? fragments.has(n.text)
        : technical.has(n.text);
      if (
        translated &&
        ts.isCallExpression(p) &&
        p.expression.getText() === "t"
      )
        keys.push(n.text);
      if (!translated && !style && !internal) {
        if (/[\u0600-\u06ff]/.test(n.text)) staticArabic++;
        else if (/[a-zA-Z]/.test(n.text)) staticEnglish++;
        findings.push(n.text);
      }
    }
    if (ts.isIdentifier(n) && n.text === "locale") {
      const p = n.parent;
      if (
        ts.isCallExpression(p) &&
        ["academicText", "formatLocalizedDateTime"].includes(
          p.expression.getText(),
        )
      )
        localeUses.push({
          kind:
            p.expression.getText() === "academicText"
              ? "ACADEMIC_LOCALIZATION"
              : "FORMATTER",
          text: p.getText(file).replace(/\s+/g, " "),
        });
      else if (
        !ts.isVariableDeclaration(p) &&
        !(ts.isBinaryExpression(p) && p.getText() === 'locale === "ar"')
      )
        findings.push(`unclassified locale: ${p.getText()}`);
    }
    if (ts.isIdentifier(n) && n.text === "ar") {
      const p = n.parent;
      if (
        !ts.isVariableDeclaration(p) &&
        !(
          ts.isConditionalExpression(p) &&
          p.condition === n &&
          (dataBranch(p) || staticBranch(p))
        )
      )
        findings.push("unclassified ar use");
    }
    ts.forEachChild(n, visit);
  }
  visit(file);
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
