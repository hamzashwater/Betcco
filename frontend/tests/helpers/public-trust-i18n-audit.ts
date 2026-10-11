import ts from "typescript";
import baseline from "../fixtures/public-trust-i18n-baseline.json";
import { ancestors, compact } from "./admin-final-i18n-audit";

export const trustFiles = [
  "src/features/public/content-route.tsx",
  "src/lib/brand.ts",
  "src/features/public/platform-rating.tsx",
  "src/features/public/certificate-verification.tsx",
] as const;
export type TrustFile = (typeof trustFiles)[number];
const parse = (source: string) =>
  ts.createSourceFile(
    "scope.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
function walk(node: ts.Node, fn: (node: ts.Node) => void) {
  fn(node);
  ts.forEachChild(node, (child) => walk(child, fn));
}
export function assertTrustScope(paths: string[]) {
  const production = paths.filter((p) => p.startsWith("frontend/src/")).sort();
  if (
    JSON.stringify(production) !==
    JSON.stringify(trustFiles.map((p) => `frontend/${p}`).sort())
  )
    throw new Error("Unexpected T7-A6.3 production scope");
  if (
    paths.some(
      (p) =>
        !p.startsWith("frontend/tests/") &&
        !production.includes(p) &&
        !["frontend/messages/ar.json", "frontend/messages/en.json"].includes(p),
    )
  )
    throw new Error("Unexpected T7-A6.3 non-source scope");
}

// Full approved syntax, including translation wiring, is frozen. Only pure
// formatting/comments are erased: guards, raw fields, API calls, attributes,
// dates, interpolation, markup and every other expression stay in the proof.
export function trustContract(source: string) {
  const transformed = ts.transform(parse(source), [
    (context) => {
      const visit: ts.Visitor = (node) =>
        ts.isJsxText(node) && !node.text.trim()
          ? undefined
          : ts.visitEachChild(node, visit, context);
      return (node) => ts.visitNode(node, visit) as ts.SourceFile;
    },
  ]);
  const result = ts
    .createPrinter({ removeComments: true })
    .printFile(transformed.transformed[0] as ts.SourceFile);
  transformed.dispose();
  return result;
}
function identity(node: ts.Node) {
  return `${ancestors(node).find(ts.isVariableDeclaration)?.name.getText() ?? "module"}:${compact(node.parent)}:${node.getText()}`;
}

// Pin each retained literal to its exact reviewed AST context. No language-wide
// allowlist: additions in helpers, maps, JSX, templates or fallbacks are findings.
export function auditTrust(source: string, path: TrustFile) {
  const file = parse(source),
    approved = parse(baseline.approvedSources[path]);
  const retainedLiterals = new Set<string>();
  walk(approved, (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
      retainedLiterals.add(identity(node));
  });
  const keys = new Set<ts.Node>(),
    references: string[] = [];
  const retained: { category: string; text: string }[] = [];
  const dataClassifications: Record<string, string> = {
    "value.title": "RAW_SERVER_CONTENT",
    "value.content": "RAW_SERVER_CONTENT",
    "value.version": "RAW_SERVER_CONTENT",
    "value.effectiveAtUtc": "RAW_SERVER_CONTENT",
    "item.resolutionSummary": "RAW_SERVER_CONTENT",
    "review.authorLabel": "RAW_SERVER_CONTENT",
    "review.comment": "RAW_SERVER_CONTENT",
    "certificate.data.studentName": "RAW_SERVER_CONTENT",
    "certificate.data.courseTitle": "SERVER_LOCALIZED_DATA",
    "certificate.data.verificationCode": "RAW_SERVER_CONTENT",
    "track.name": "SERVER_LOCALIZED_DATA",
    "track.data.name": "SERVER_LOCALIZED_DATA",
    "track.data.description": "SERVER_LOCALIZED_DATA",
    "item.name": "SERVER_LOCALIZED_DATA",
    "send.error.message": "RAW_SERVER_ERROR",
    "save.error.message": "RAW_SERVER_ERROR",
    "requests.error.message": "RAW_SERVER_ERROR",
    "createRequest.error.message": "RAW_SERVER_ERROR",
    "form.comment": "RAW_USER_CONTENT",
    validSettings: "RAW_SERVER_CONTENT",
  };
  const findings: {
    category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
    text: string;
  }[] = [];
  const translators = new Map<string, string>();
  walk(file, (node) => {
    const text = compact(node),
      category = dataClassifications[text];
    if (category) retained.push({ category, text });
    if (
      ts.isCallExpression(node) &&
      [
        "formatLocalizedDate",
        "formatLocalizedDateTime",
        "formatLocalizedNumber",
      ].includes(node.expression.getText())
    )
      retained.push({ category: "LOCALE_FORMATTER", text });
    if (
      !ts.isVariableDeclaration(node) ||
      !node.initializer ||
      !ts.isCallExpression(node.initializer)
    )
      return;
    const call = node.initializer;
    if (call.expression.getText() === "useTranslations") {
      const ns = call.arguments[0];
      if (!ns || !ts.isStringLiteral(ns))
        findings.push({ category: "UNCLASSIFIED", text: compact(node) });
      else {
        translators.set(node.name.getText(), ns.text);
        keys.add(ns);
      }
    }
    if (call.expression.getText() === "createTranslator") {
      // This scope supports exactly the two frozen brand catalogue projections.
      const config = call.arguments[0];
      if (
        path === trustFiles[1] &&
        config &&
        compact(config) ===
          ' { locale, messages: locale === "ar" ? ar.publicTrust.brand : en.publicTrust.brand, }'.trim()
      )
        translators.set(node.name.getText(), "publicTrust.brand");
      else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    }
  });
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      translators.has(node.expression.getText())
    ) {
      const key = node.arguments[0];
      if (key && ts.isStringLiteral(key)) {
        keys.add(key);
        references.push(
          `${translators.get(node.expression.getText())}.${key.text}`,
        );
      } else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    }
    if (
      ts.isJsxText(node) &&
      /[a-zA-Z\u0600-\u06ff]/u.test(node.text) &&
      node.text.trim() !== "BETCCO"
    )
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
      STATIC_UI: findings.filter((f) => f.category === "STATIC_UI").length,
      ACCESSIBILITY_STATIC_UI: findings.filter(
        (f) => f.category === "ACCESSIBILITY_STATIC_UI",
      ).length,
      UNCLASSIFIED: findings.filter((f) => f.category === "UNCLASSIFIED")
        .length,
    },
  };
}
