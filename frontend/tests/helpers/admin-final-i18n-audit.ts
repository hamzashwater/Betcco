import ts from "typescript";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";

export const categories = [
  "STATIC_UI",
  "ACCESSIBILITY_STATIC_UI",
  "SERVER_BILINGUAL_DATA",
  "SERVER_LOCALIZED_DATA",
  "ACADEMIC_LOCALIZATION",
  "TECHNICAL_INTERNAL_VALUE",
  "TECHNICAL_STATUS_VALUE",
  "TECHNICAL_SOURCE_VALUE",
  "LOCALE_API_PARAMETER",
  "LOCALE_FORMATTER",
  "LOCALE_DIRECTION",
  "RAW_USER_CONTENT",
  "RAW_STAFF_CONTENT",
  "RAW_SERVER_CONTENT",
  "RAW_SERVER_ERROR",
  "NEUTRAL_BRAND_TEXT",
  "NEUTRAL_SYMBOL",
  "API_CONTRACT",
  "UNCLASSIFIED",
] as const;
export type Category = (typeof categories)[number];
export type Finding = {
  line: number;
  text: string;
  category: Category;
  reason: string;
};
export type Exception = {
  context: string;
  text: string;
  category: Category;
  reason: string;
};
export const digest = (source: string) =>
  createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
export function inventory(directory = "src/features/admin"): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? inventory(path)
        : entry.name.endsWith(".tsx")
          ? [path]
          : [];
    })
    .sort();
}
export const compact = (node: ts.Node) => node.getText().replace(/\s+/g, " ");
export function ancestors(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  for (let parent = node.parent; parent; parent = parent.parent)
    result.push(parent);
  return result;
}
// The nearest executable/attribute boundary pins an exception to its actual use.
// A same-valued literal at another location is never grandfathered in.
export function context(node: ts.Node) {
  const chain = ancestors(node);
  const owner = chain.find(
    (p) => ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p),
  );
  const scope =
    owner &&
    (ts.isFunctionDeclaration(owner)
      ? owner.name?.text
      : (owner as ts.VariableDeclaration).name.getText());
  return `${scope ?? "module"}:${chain
    .slice(0, 4)
    .map((p) => ts.SyntaxKind[p.kind])
    .join("/")}:${compact(node.parent)}`;
}
export function catalogue(source: string) {
  const file = ts.parseJsonText("messages.json", source);
  const duplicates: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set<string>();
      for (const property of node.properties) {
        const name =
          property.name &&
          (ts.isStringLiteral(property.name)
            ? property.name.text
            : property.name.getText());
        if (name && names.has(name)) duplicates.push(name);
        if (name) names.add(name);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const value: unknown = JSON.parse(source);
  return { value, duplicates };
}
export function leaves(value: unknown, prefix = ""): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key)),
      ),
    );
  return { [prefix]: value };
}
function literalType(type: ts.Type): string[] | undefined {
  if (type.isStringLiteral()) return [type.value];
  if (type.isUnion()) {
    const parts = type.types
      .filter(
        (part) => !(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
      )
      .map(literalType);
    if (parts.every((part) => part !== undefined)) return parts.flat();
  }
}
export function createAudit(files = inventory()) {
  const root = resolve(".");
  const config = ts.readConfigFile(resolve("tsconfig.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root,
  ).options;
  const program = ts.createProgram(files, options);
  return { program, checker: program.getTypeChecker() };
}
export function auditFile(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  exceptions: Exception[] = [],
) {
  const findings: Finding[] = [],
    branches: Finding[] = [],
    localeUses: Finding[] = [];
  const references: {
    namespace: string;
    keys: string[];
    line: number;
    expression: string;
    dynamic: boolean;
  }[] = [];
  const namespaces = new Set<string>();
  const translators = new Map<ts.Symbol, string>();
  const keyNodes = new Set<ts.Node>();
  let useLocale = 0;
  const line = (n: ts.Node) =>
    file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;
  const add = (
    n: ts.Node,
    category: Category,
    reason: string,
    text = compact(n),
  ): Finding => {
    const finding = { line: line(n), text, category, reason };
    findings.push(finding);
    return finding;
  };
  function visitAll(n: ts.Node, action: (n: ts.Node) => void) {
    action(n);
    ts.forEachChild(n, (c) => {
      visitAll(c, action);
    });
  }
  visitAll(file, (n) => {
    if (ts.isCallExpression(n) && n.expression.getText() === "useLocale")
      useLocale++;
    if (
      ts.isCallExpression(n) &&
      n.expression.getText() === "useTranslations"
    ) {
      if (!ts.isStringLiteral(n.arguments[0])) {
        add(n, "UNCLASSIFIED", "Non-static translation namespace");
        return;
      }
      namespaces.add(n.arguments[0].text);
      keyNodes.add(n.arguments[0]);
      if (ts.isVariableDeclaration(n.parent)) {
        const symbol = checker.getSymbolAtLocation(n.parent.name);
        if (symbol) translators.set(symbol, n.arguments[0].text);
      }
    }
  });
  function finite(
    n: ts.Expression,
    seen = new Set<ts.Node>(),
  ): string[] | undefined {
    if (seen.has(n)) return;
    seen.add(n);
    if (ts.isStringLiteralLike(n)) {
      keyNodes.add(n);
      return [n.text];
    }
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n))
      return finite(n.expression, seen);
    if (ts.isTemplateExpression(n)) {
      keyNodes.add(n.head);
      let values = [n.head.text];
      for (const span of n.templateSpans) {
        const choices = finite(span.expression, seen);
        if (!choices) return;
        keyNodes.add(span.literal);
        values = values.flatMap((prefix) =>
          choices.map((choice) => prefix + choice + span.literal.text),
        );
      }
      return values;
    }
    if (
      ts.isBinaryExpression(n) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        n.operatorToken.kind,
      )
    ) {
      const left = finite(n.left, new Set(seen)),
        right = finite(n.right, new Set(seen));
      return left && right ? [...left, ...right] : undefined;
    }
    if (ts.isConditionalExpression(n)) {
      const yes = finite(n.whenTrue, new Set(seen)),
        no = finite(n.whenFalse, new Set(seen));
      return yes && no ? [...yes, ...no] : undefined;
    }
    if (ts.isElementAccessExpression(n)) {
      const symbol = checker.getSymbolAtLocation(n.expression);
      const declaration = symbol?.valueDeclaration;
      if (
        declaration &&
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        const values = declaration.initializer.properties.map((property) =>
          ts.isPropertyAssignment(property)
            ? finite(property.initializer, new Set(seen))
            : undefined,
        );
        return values.every((v) => v !== undefined) ? values.flat() : undefined;
      }
    }
    return literalType(checker.getTypeAtLocation(n));
  }
  visitAll(file, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    const symbol = checker.getSymbolAtLocation(n.expression);
    let namespace = symbol && translators.get(symbol);
    // Local helper parameters receive the sole translator from this file.
    // Ambiguous/multi-namespace parameters fail rather than guessing.
    if (
      !namespace &&
      n.expression.text === "t" &&
      symbol?.declarations?.some((d) =>
        [d, ...ancestors(d)].some(
          (p) =>
            ts.isParameter(p) &&
            /ReturnType<typeof useTranslations>/.test(p.getText()),
        ),
      ) &&
      namespaces.size === 1
    )
      namespace = [...namespaces][0];
    if (!namespace) return;
    const keys = n.arguments[0] && finite(n.arguments[0]);
    if (!keys?.length) {
      add(n, "UNCLASSIFIED", "Translation key has no proven finite domain");
      return;
    }
    references.push({
      namespace,
      keys: [...new Set(keys)],
      line: line(n),
      expression: compact(n),
      dynamic: !ts.isStringLiteralLike(n.arguments[0]),
    });
  });
  const humanAttributes = new Set([
    "aria-label",
    "aria-description",
    "alt",
    "title",
    "placeholder",
    "label",
    "description",
    "eyebrow",
    "busyLabel",
    "emptyLabel",
    "errorLabel",
    "heading",
  ]);
  const neutral = (value: string) => !/[a-zA-Z\u0600-\u06ff]/u.test(value);
  visitAll(file, (n) => {
    if (
      ts.isConditionalExpression(n) &&
      /^(ar|locale === ["']ar["'])$/.test(compact(n.condition))
    ) {
      let category: Category = "UNCLASSIFIED";
      if (
        ts.isPropertyAccessExpression(n.whenTrue) &&
        ts.isPropertyAccessExpression(n.whenFalse) &&
        n.whenTrue.expression.getText() === n.whenFalse.expression.getText()
      ) {
        const left = n.whenTrue.name.text.replace(/arabic|english/gi, ""),
          right = n.whenFalse.name.text.replace(/arabic|english/gi, "");
        if (
          left === right &&
          /arabic|english/i.test(n.whenTrue.name.text) &&
          /arabic|english/i.test(n.whenFalse.name.text)
        )
          category = "SERVER_BILINGUAL_DATA";
      }
      const attribute = ancestors(n).find(ts.isJsxAttribute);
      if (
        ts.isStringLiteral(n.whenTrue) &&
        ts.isStringLiteral(n.whenFalse) &&
        attribute
      ) {
        if (
          attribute.name.getText() === "dir" &&
          n.whenTrue.text === "rtl" &&
          n.whenFalse.text === "ltr"
        )
          category = "LOCALE_DIRECTION";
        if (
          attribute.name.getText() === "lang" &&
          n.whenTrue.text === "en" &&
          n.whenFalse.text === "ar"
        )
          category = "SERVER_BILINGUAL_DATA";
      }
      if (
        category === "UNCLASSIFIED" &&
        (ts.isStringLiteralLike(n.whenTrue) ||
          ts.isTemplateExpression(n.whenTrue) ||
          ts.isObjectLiteralExpression(n.whenTrue))
      )
        category = "STATIC_UI";
      branches.push(
        add(
          n,
          category,
          category === "SERVER_BILINGUAL_DATA"
            ? "Paired server fields or inverse secondary language"
            : category === "LOCALE_DIRECTION"
              ? "RTL/LTR DOM direction"
              : "Unlocalized or unclassified locale branch",
        ),
      );
    }
    if (
      ts.isIdentifier(n) &&
      n.text === "locale" &&
      !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
    ) {
      const parents = ancestors(n),
        parent = n.parent;
      const call = parents.find(ts.isCallExpression);
      let category: Category = "UNCLASSIFIED";
      if (
        ts.isBinaryExpression(parent) &&
        /locale === ["']ar["']/.test(compact(parent))
      )
        category = "TECHNICAL_INTERNAL_VALUE";
      else if (
        call &&
        /^(academicText|academicUnitLabel)$/.test(call.expression.getText())
      )
        category = "ACADEMIC_LOCALIZATION";
      else if (call && /^formatLocalized/.test(call.expression.getText()))
        category = "LOCALE_FORMATTER";
      else if (
        parents.some(ts.isTypeNode) ||
        ts.isBindingElement(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isJsxAttribute(parent)
      )
        category = "TECHNICAL_INTERNAL_VALUE";
      else if (
        ts.isJsxExpression(parent) &&
        ts.isJsxAttribute(parent.parent) &&
        parent.parent.name.getText() === "locale"
      )
        category = "LOCALE_FORMATTER";
      else if (
        ts.isTemplateSpan(parent) ||
        ts.isArrayLiteralExpression(parent) ||
        ts.isShorthandPropertyAssignment(parent) ||
        ts.isPropertyAssignment(parent)
      )
        category = "LOCALE_API_PARAMETER";
      localeUses.push(
        add(
          parent,
          category,
          "Locale consumer retained and classified structurally",
        ),
      );
    }
    if (
      ts.isCallExpression(n) &&
      /^(academicText|academicUnitLabel|formatLocalized)/.test(
        n.expression.getText(),
      )
    )
      add(
        n,
        n.expression.getText().startsWith("academic")
          ? "ACADEMIC_LOCALIZATION"
          : "LOCALE_FORMATTER",
        "Existing academic fallback / locale formatter",
      );
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isPropertyAccessExpression(n.expression) &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    ) {
      const value = compact(n.expression),
        name = n.expression.name.text;
      add(
        n.expression,
        /message$/.test(name) && /error/i.test(value)
          ? "RAW_SERVER_ERROR"
          : /status|severity|outcome/i.test(name)
            ? "TECHNICAL_STATUS_VALUE"
            : /source/i.test(name)
              ? "TECHNICAL_SOURCE_VALUE"
              : /comment/i.test(name)
                ? "RAW_USER_CONTENT"
                : /reason|rationale|summary|note|resolution/i.test(name)
                  ? "RAW_STAFF_CONTENT"
                  : "RAW_SERVER_CONTENT",
        "Raw API/user/staff field; no static copy migration",
      );
    }
    if (
      !ts.isStringLiteralLike(n) &&
      !ts.isTemplateLiteralToken(n) &&
      !ts.isJsxText(n)
    )
      return;
    if (keyNodes.has(n)) return;
    const value = n.text.trim(),
      parents = ancestors(n),
      parent = n.parent;
    if (!value || neutral(value)) {
      if (value)
        add(
          n,
          "NEUTRAL_SYMBOL",
          "Language-neutral punctuation or numeric format",
          value,
        );
      return;
    }
    const exception = exceptions.find(
      (e) => e.text === value && e.context === context(n),
    );
    if (exception) {
      add(n, exception.category, exception.reason, value);
      return;
    }
    const attribute = parents.find(ts.isJsxAttribute);
    if (
      ts.isPropertyAssignment(parent) &&
      parent.name.getText() === "label" &&
      references.some((r) => r.keys.includes(value))
    ) {
      add(
        n,
        "TECHNICAL_INTERNAL_VALUE",
        "Finite dynamic translation-map key validated in both catalogues",
        value,
      );
      return;
    }
    if (
      ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.operatorToken.kind)
    ) {
      add(
        n,
        /source/i.test(parent.left.getText())
          ? "TECHNICAL_SOURCE_VALUE"
          : /status|severity|outcome/i.test(parent.left.getText())
            ? "TECHNICAL_STATUS_VALUE"
            : "TECHNICAL_INTERNAL_VALUE",
        "Comparison operand; not a display label",
        value,
      );
      return;
    }
    if (
      ts.isJsxText(n) ||
      (attribute && humanAttributes.has(attribute.name.getText()))
    ) {
      add(
        n,
        attribute && /^(aria-|alt$|title$)/.test(attribute.name.getText())
          ? "ACCESSIBILITY_STATIC_UI"
          : "STATIC_UI",
        "Hardcoded human-facing text",
        value,
      );
      return;
    }
    if (
      attribute &&
      ([
        "className",
        "key",
        "id",
        "type",
        "value",
        "name",
        "role",
        "mode",
        "href",
        "target",
        "rel",
        "accept",
        "autoComplete",
        "inputMode",
        "pattern",
        "tone",
        "color",
        "data-testid",
        "htmlFor",
        "lang",
        "dir",
      ].includes(attribute.name.getText()) ||
        attribute.name.getText().startsWith("aria-"))
    ) {
      add(
        n,
        "TECHNICAL_INTERNAL_VALUE",
        `DOM/component contract attribute ${attribute.name.getText()}`,
        value,
      );
      return;
    }
    if (
      parents.some((p) => ts.isImportDeclaration(p) || ts.isTypeNode(p)) ||
      (ts.isExpressionStatement(parent) && value === "use client")
    ) {
      add(n, "TECHNICAL_INTERNAL_VALUE", "Import/type/client directive", value);
      return;
    }
    const contract = parents.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ["queryKey", "method", "credentials", "cache"].includes(
          p.name.getText(),
        ),
    );
    if (contract || /^[/&?]|^T\d{2}:/.test(value)) {
      add(
        n,
        "API_CONTRACT",
        "Route/query/HTTP/cache or ISO timestamp fragment",
        value,
      );
      return;
    }
    if (
      ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.operatorToken.kind)
    ) {
      add(
        n,
        /source/i.test(parent.left.getText())
          ? "TECHNICAL_SOURCE_VALUE"
          : /status|severity|outcome/i.test(parent.left.getText())
            ? "TECHNICAL_STATUS_VALUE"
            : "TECHNICAL_INTERNAL_VALUE",
        "Comparison operand; not a display label",
        value,
      );
      return;
    }
    if (
      ts.isPropertyAssignment(parent) &&
      ["dateStyle", "timeStyle", "timeZone", "month", "day"].includes(
        parent.name.getText(),
      )
    ) {
      add(n, "LOCALE_FORMATTER", "Intl formatter option", value);
      return;
    }
    // No generic English allowlist: helper returns, arrays, maps, notices and
    // templates must resolve to translation keys or have a reviewed exact use.
    add(
      n,
      /\s/.test(value) ? "STATIC_UI" : "UNCLASSIFIED",
      "Unreviewed literal outside a proven technical context",
      value,
    );
  });
  return {
    file: relative(resolve("src/features/admin"), file.fileName).replaceAll(
      "\\",
      "/",
    ),
    useLocale,
    namespaces: [...namespaces].sort(),
    references,
    branches,
    localeUses,
    findings,
  };
}
export function wholeAudit(exceptions: Record<string, Exception[]>) {
  const files = inventory(),
    { program, checker } = createAudit(files);
  return files.map((path) =>
    auditFile(
      program.getSourceFile(path)!,
      checker,
      exceptions[
        relative(resolve("src/features/admin"), path).replaceAll("\\", "/")
      ],
    ),
  );
}
// Erase exactly the five authorized fallback leaves. Retain every other node,
// including error.message, mutation guards, payloads, queries and DOM structure.
export function contentContract(source: string) {
  const sf = ts.createSourceFile(
    "content.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const slots: ts.Node[] = [];
  function walk(n: ts.Node) {
    if (
      ts.isConditionalExpression(n) &&
      compact(n.condition) === "error instanceof Error" &&
      compact(n.whenTrue) === "error.message" &&
      ((ts.isStringLiteral(n.whenFalse) &&
        n.whenFalse.text === "Request failed.") ||
        (ts.isCallExpression(n.whenFalse) &&
          compact(n.whenFalse) === 't("requestFailed")'))
    )
      slots.push(n.whenFalse);
    ts.forEachChild(n, walk);
  }
  walk(sf);
  for (const slot of slots.reverse())
    source =
      source.slice(0, slot.getStart(sf)) +
      "__AUTHORIZED_FALLBACK__" +
      source.slice(slot.end);
  return { slots: slots.length, hash: digest(source) };
}
export const read = (path: string) => readFileSync(path, "utf8");
