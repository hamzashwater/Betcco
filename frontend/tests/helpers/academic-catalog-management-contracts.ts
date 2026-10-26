import ts from "typescript";

// Detect call syntax, not substrings in refetch/prefetch, comments or strings.
// Include native global/member and computed-string fetch calls so replacing the
// old substring check cannot introduce a window/globalThis bypass.
export function directFetchCalls(source: string): string[] {
  const sf = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const calls: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      let callee: ts.Expression = node.expression;
      while (
        ts.isParenthesizedExpression(callee) ||
        ts.isNonNullExpression(callee)
      )
        callee = callee.expression;
      if (
        (ts.isIdentifier(callee) && callee.text === "fetch") ||
        (ts.isPropertyAccessExpression(callee) &&
          callee.name.text === "fetch") ||
        (ts.isElementAccessExpression(callee) &&
          callee.argumentExpression &&
          ts.isStringLiteralLike(callee.argumentExpression) &&
          callee.argumentExpression.text === "fetch")
      )
        calls.push(node.getText(sf));
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

// Wire/identity/validation evidence is collected independently of the exact
// presentation seam. No API or handler is omitted by the historical projection.
export function academicCatalogContracts(source: string) {
  const sf = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const canonical: ts.TransformerFactory<ts.Node> = (context) => (root) => {
    const visit: ts.Visitor = (node) => {
      const next = ts.visitEachChild(node, visit, context);
      return ts.isObjectLiteralExpression(next)
        ? ts.factory.updateObjectLiteralExpression(
            next,
            ts.factory.createNodeArray(next.properties, false),
          )
        : next;
    };
    return ts.visitNode(root, visit) as ts.Node;
  };
  const print = (n: ts.Node) => {
    const result = ts.transform(n, [canonical]);
    try {
      return ts
        .createPrinter({ removeComments: true })
        .printNode(ts.EmitHint.Unspecified, result.transformed[0], sf)
        .replace(/\s+/g, " ")
        .trim();
    } finally {
      result.dispose();
    }
  };
  const result: Record<string, string[]> = {
    types: [],
    queries: [],
    state: [],
    core: [],
    writes: [],
    changes: [],
    validation: [],
    filters: [],
  };
  function visit(n: ts.Node) {
    if (ts.isTypeAliasDeclaration(n)) result.types.push(print(n));
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer,
        name = n.name.getText(sf);
      if (
        ts.isCallExpression(init) &&
        init.expression.getText(sf) === "useQuery"
      )
        result.queries.push(print(n));
      if (
        ts.isCallExpression(init) &&
        init.expression.getText(sf) === "useState" &&
        name !== "[operation, setOperation]"
      )
        result.state.push(print(n));
      if (["trackId", "versionChoices", "refresh", "write"].includes(name))
        result.core.push(print(n));
    }
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "save")
      result.writes.push(print(n));
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === "onChange")
      result.changes.push(print(n));
    if (
      ts.isJsxAttribute(n) &&
      ["required", "minLength", "type", "value"].includes(n.name.getText(sf))
    )
      result.validation.push(print(n));
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "filter"
    )
      result.filters.push(print(n.arguments[0]));
    ts.forEachChild(n, visit);
  }
  visit(sf);
  // Reordering sections may reorder operations. The ordered qualification map
  // remains tested separately; no production sorting is authorized.
  return Object.fromEntries(
    Object.entries(result).map(([key, values]) => [
      key,
      [...new Set(values)].sort(),
    ]),
  );
}
