import ts from "typescript";
import { createHash } from "node:crypto";
export const files = [
  "assessment-coordination-queue",
  "eligible-evaluator-assignment",
  "resit-coordination-panel",
] as const;
export function parse(source: string) {
  return ts.createSourceFile(
    "coordination.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function copy(n: ts.Node): boolean {
  return (
    (ts.isConditionalExpression(n) && n.condition.getText() === "ar") ||
    (ts.isCallExpression(n) && n.expression.getText() === "t") ||
    (ts.isConditionalExpression(n) &&
      n.condition.getText() === "label" &&
      copy(n.whenTrue) &&
      n.whenFalse.getText() === "undefined")
  );
}
// Erase static presentation and its locale/translation hooks only. All other
// AST nodes remain frozen, including types, data paths, CSS, payloads and guards.
// Status-to-key mappings and dynamic interpolation paths are checked separately.
export function contractTree(source: string) {
  function tree(n: ts.Node): unknown {
    if (ts.isParenthesizedExpression(n)) return tree(n.expression);
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isStringLiteral(n.expression) &&
      !n.expression.text.trim()
    )
      return null;
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      n.moduleSpecifier.text === "next-intl"
    )
      return null;
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1
    ) {
      const d = n.declarationList.declarations[0];
      if (["ar", "locale", "t"].includes(d.name.getText())) return null;
      if (
        d.name.getText() === "statuses" &&
        d.initializer &&
        ts.isArrayLiteralExpression(d.initializer)
      )
        return [
          "STATUS_VALUES",
          d.initializer.elements.map((e) =>
            ts.isObjectLiteralExpression(e)
              ? e.properties
                  .filter(
                    (p) =>
                      ts.isPropertyAssignment(p) &&
                      p.name.getText() === "value",
                  )
                  .map((p) => p.getText())
              : [],
          ),
        ];
    }
    if (ts.isJsxExpression(n) && n.expression && copy(n.expression))
      return ["COPY_JSX"];
    if (copy(n)) return ["COPY_EXPR"];
    if (ts.isJsxText(n)) return n.text.trim() ? [n.kind, n.text.trim()] : null;
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
export function contractHash(source: string) {
  return hash(contractTree(source));
}
const technical = new Set([
  "use client",
  "next-intl",
  "react",
  "@/i18n/date-time",
  "@/lib/api",
  "@/lib/academic-localization",
  "@tanstack/react-query",
  "lucide-react",
  "",
  " ",
  "PendingAssignment",
  "Assigned",
  "UnderReview",
  "NeedsRevision",
  "AcademicMappingRequired",
  "NoEligibleEvaluator",
  "StateChanged",
  "NotSet",
  "OnTrack",
  "Overdue",
  "assessment-coordination",
  "PUT",
  "POST",
  "true",
  "status",
  "datetime-local",
  "button",
  "submit",
  "polite",
  "alert",
  "eligible-evaluators",
  "ACADEMIC_MAPPING_REQUIRED",
  "UNIT_SPECIALISM_REQUIRED",
  "EVALUATOR_NOT_ELIGIBLE",
  "ASSIGNMENT_CONFLICT",
  "resit-authorizations",
]);
const fragments = new Set([
  "/assessment-coordination/queue?page=",
  "&status=",
  "&expectedCompletionState=",
  "",
  "&pageSize=",
  "/assessment-coordination/",
  "/expected-completion",
  "/reasonable-adjustments/revision-deadline",
  "/reasonable-adjustments/revision-deadline/",
  "/revoke",
  " ",
  " · ",
  "/evaluations/",
  "/eligible-evaluators",
  "/assign",
  "/resits/authorizations?page=",
  "&pageSize=10",
]);
technical.add("expectedCompletionState");
fragments.add("assessmentCoordination.statuses.");
function style(n: ts.Node) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText() === "className";
    if (ts.isStatement(p)) break;
  }
  return false;
}
export function audit(source: string) {
  const file = parse(source),
    findings: string[] = [],
    keys: string[] = [],
    localeUses: {
      kind: "FORMATTER" | "ACADEMIC_LOCALIZATION";
      text: string;
    }[] = [],
    statusMappings: { value: string; key: string }[] = [],
    interpolations: string[] = [],
    technicalValues: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isConditionalExpression(n) && n.condition.getText(file) === "ar")
      findings.push("static bilingual presentation");
    if (
      ts.isObjectLiteralExpression(n) &&
      n.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ["ar", "en"].includes(p.name.getText(file)),
      )
    )
      findings.push("inline bilingual mapping");
    if (ts.isJsxText(n) && n.text.trim() && !/^[·:\s]+$/.test(n.text))
      findings.push(n.text.trim());
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
      const p = n.parent,
        translated =
          ts.isCallExpression(p) &&
          ["t", "useTranslations"].includes(p.expression.getText(file));
      const mapping =
        ts.isPropertyAssignment(p) &&
        p.name.getText(file) === "label" &&
        /^assessmentCoordination\.statuses\./.test(n.text);
      const internal = ts.isTemplateLiteralToken(n)
        ? fragments.has(n.text)
        : technical.has(n.text);
      if (!translated && !mapping && !style(n) && !internal)
        findings.push(n.text);
      if (translated && p.expression.getText(file) === "t") keys.push(n.text);
      if (mapping) keys.push(n.text);
      if (internal && !style(n)) technicalValues.push(n.text);
    }
    if (ts.isObjectLiteralExpression(n)) {
      const properties = new Map(
        n.properties
          .filter(ts.isPropertyAssignment)
          .map((p) => [p.name.getText(file), p.initializer]),
      );
      const value = properties.get("value"),
        label = properties.get("label");
      if (
        value &&
        label &&
        ts.isStringLiteral(value) &&
        ts.isStringLiteral(label)
      )
        statusMappings.push({ value: value.text, key: label.text });
    }
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(file) === "t" &&
      n.arguments.length > 1
    )
      interpolations.push(n.getText(file).replace(/\s+/g, " "));
    if (ts.isIdentifier(n) && n.text === "locale") {
      const p = n.parent;
      if (
        ts.isCallExpression(p) &&
        ["formatLocalizedDateTime", "academicText"].includes(
          p.expression.getText(file),
        )
      )
        localeUses.push({
          kind:
            p.expression.getText(file) === "academicText"
              ? "ACADEMIC_LOCALIZATION"
              : "FORMATTER",
          text: p.getText(file).replace(/\s+/g, " "),
        });
      else if (!ts.isVariableDeclaration(p))
        findings.push(`unclassified locale: ${p.getText(file)}`);
    }
    if (
      ts.isIdentifier(n) &&
      n.text === "ar" &&
      !ts.isPropertyAccessExpression(n.parent)
    )
      findings.push("unclassified ar selector");
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    findings,
    keys,
    statusMappings,
    localeUses,
    interpolations,
    technicalValues,
  };
}
