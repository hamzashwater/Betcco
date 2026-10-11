import ts from "typescript";
import baseline from "../fixtures/public-purchase-i18n-baseline.json";
import { ancestors, compact } from "./admin-final-i18n-audit";

export const purchaseFiles = [
  "src/features/cart/cart-view.tsx",
  "src/features/cart/checkout.tsx",
  "src/app/[locale]/checkout/paytabs-result/page.tsx",
  "src/features/public/public-content.tsx",
] as const;
export type PurchaseFile = (typeof purchaseFiles)[number];
const parse = (source: string) =>
  ts.createSourceFile(
    "scope.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
export function assertPurchaseScope(paths: string[]) {
  const production = paths.filter((p) => p.startsWith("frontend/src/")).sort();
  if (
    JSON.stringify(production) !==
    JSON.stringify(purchaseFiles.map((p) => `frontend/${p}`).sort())
  )
    throw new Error("Unexpected T7-A6.4 production scope");
  if (
    paths.some(
      (p) =>
        !p.startsWith("frontend/tests/") &&
        !production.includes(p) &&
        !["frontend/messages/ar.json", "frontend/messages/en.json"].includes(p),
    )
  )
    throw new Error("Unexpected T7-A6.4 supporting scope");
}

// Preserve every non-copy AST node. Erase only whitespace JSX and comments.
export function purchaseContract(source: string) {
  const file = parse(source);
  function syntax(node: ts.Node): unknown {
    if (ts.isJsxText(node) && !node.text.trim()) return undefined;
    const children = node.getChildren(file);
    return children.length
      ? [node.kind, children.map(syntax).filter((child) => child !== undefined)]
      : [node.kind, node.getText(file)];
  }
  return JSON.stringify(syntax(file));
}
export function replayPurchaseMigration(path: PurchaseFile) {
  let source: string = baseline.sources[path];
  for (const edit of [...baseline.replacements[path]].sort(
    (a, b) => b.start - a.start,
  )) {
    if (source.slice(edit.start, edit.end) !== edit.original)
      throw new Error("Changed original copy slot");
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  for (const wire of baseline.wiring[path]) {
    if (!source.includes(wire.before))
      throw new Error("Missing original translation seam");
    source = source.replace(wire.before, wire.after);
  }
  return source;
}
function identity(node: ts.Node) {
  return `${ancestors(node).find(ts.isFunctionDeclaration)?.name?.getText() ?? "module"}:${ancestors(node).find(ts.isVariableDeclaration)?.name.getText() ?? "module"}:${compact(node.parent)}:${node.getText()}`;
}

// Retained literals are exact, independently frozen AST occurrences. No broad
// English/Arabic allowlist; new helper/map/template/attribute copy is reported.
export function auditPurchase(source: string, path: PurchaseFile) {
  const file = parse(source),
    approved = parse(baseline.approvedSources[path]);
  const retainedLiterals = new Set<string>();
  walk(approved, (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
      retainedLiterals.add(identity(node));
  });
  const keys = new Set<ts.Node>(),
    references: string[] = [];
  const translators: { name: string; namespace: string; scope: ts.Node }[] = [];
  const findings: {
    category: "STATIC_UI" | "ACCESSIBILITY_STATIC_UI" | "UNCLASSIFIED";
    text: string;
  }[] = [];
  const retained: { category: string; text: string }[] = [];
  walk(file, (node) => {
    const text = compact(node);
    if (
      ts.isCallExpression(node) &&
      /^formatLocalized/.test(node.expression.getText())
    )
      retained.push({ category: "LOCALE_FORMATTER", text });
    if (ts.isPropertyAccessExpression(node)) {
      if (
        [
          "price",
          "subtotal",
          "discount",
          "tax",
          "total",
          "currency",
          "originalPrice",
          "discountAmount",
        ].includes(node.name.text)
      )
        retained.push({ category: "RAW_SERVER_FINANCIAL_DATA", text });
      if (
        [
          "title",
          "description",
          "features",
          "courseTitle",
          "displayName",
          "bio",
          "specializations",
        ].includes(node.name.text)
      )
        retained.push({ category: "SERVER_LOCALIZED_DATA", text });
      if (
        [
          "paymentId",
          "provider",
          "redirectUrl",
          "id",
          "slug",
          "interval",
          "itemType",
        ].includes(node.name.text)
      )
        retained.push({ category: "RAW_SERVER_CONTENT", text });
      if (node.name.text === "message")
        retained.push({ category: "RAW_SERVER_ERROR", text });
    }
    if (
      !ts.isVariableDeclaration(node) ||
      !node.initializer ||
      !ts.isCallExpression(node.initializer)
    )
      return;
    const call = node.initializer;
    if (call.expression.getText() !== "useTranslations") return;
    const ns = call.arguments[0];
    if (!ns || !ts.isStringLiteral(ns))
      findings.push({ category: "UNCLASSIFIED", text: compact(node) });
    else {
      translators.push({
        name: node.name.getText(),
        namespace: ns.text,
        scope: ancestors(node).find(ts.isFunctionDeclaration) ?? file,
      });
      keys.add(ns);
    }
  });
  walk(file, (node) => {
    if (ts.isCallExpression(node)) {
      const owners = [node, ...ancestors(node)];
      const translator = translators.find(
        (t) => t.name === node.expression.getText() && owners.includes(t.scope),
      );
      if (translator) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key)) {
          keys.add(key);
          references.push(`${translator.namespace}.${key.text}`);
        } else findings.push({ category: "UNCLASSIFIED", text: compact(node) });
      }
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
    if (ancestors(node).some(ts.isImportDeclaration)) return;
    if (retainedLiterals.has(identity(node))) {
      if (
        [
          "Card",
          "BankTransfer",
          "EWallet",
          "Student",
          "Fake",
          "membership",
          "subscription",
        ].includes(node.text)
      )
        retained.push({
          category: "TECHNICAL_INTERNAL_VALUE",
          text: node.text,
        });
      if (
        node.text.startsWith("/") ||
        ancestors(node).some(
          (parent) =>
            ts.isPropertyAssignment(parent) &&
            ["queryKey", "method"].includes(parent.name.getText()),
        )
      )
        retained.push({ category: "API_CONTRACT", text: compact(node) });
      return;
    }
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
