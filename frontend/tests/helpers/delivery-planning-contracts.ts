import ts from "typescript";
// Independent AST snapshot of actual transport, selection, filters and guards.
// View-only error ownership is extracted separately, not silently omitted.
export function deliveryPlanningContracts(source: string) {
  const file = ts.createSourceFile(
      "owner.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    printer = ts.createPrinter({ removeComments: true });
  const canonicalObjectSyntax: ts.TransformerFactory<ts.Node> =
    (context) => (root) => {
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
  const compact = (node: ts.Node) => {
    const result = ts.transform(node, [canonicalObjectSyntax]);
    try {
      return printer
        .printNode(ts.EmitHint.Unspecified, result.transformed[0], file)
        .replace(/\s+/g, " ");
    } finally {
      result.dispose();
    }
  };
  const owner = file.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === "DeliveryPlanning",
  )!;
  const declarations = owner
    .body!.statements.filter(ts.isVariableStatement)
    .flatMap((n) => [...n.declarationList.declarations]);
  const find = (name: string) =>
    declarations.find((n) => n.name.getText(file) === name)!;
  const presentation = new Set([
    "hasError",
    "hasSuccess",
    "failedError",
    "errorCode",
    "errorMessage",
    "operationError",
    "retryAction",
  ]);
  let code = find("errorCode")?.initializer,
    message = find("errorMessage")?.initializer;
  const formatter = find("operationError")?.initializer;
  if (
    formatter &&
    ts.isArrowFunction(formatter) &&
    ts.isBlock(formatter.body)
  ) {
    code = formatter.body.statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => [...s.declarationList.declarations])
      .find((d) => d.name.getText(file) === "errorCode")?.initializer;
    message = formatter.body.statements.find(ts.isReturnStatement)?.expression;
  }
  const props: string[] = [],
    apis: string[] = [],
    filters: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|type|value|checked|maxLength|minLength|min|max|key|editing|saving|cancel)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    if (ts.isCallExpression(n) && n.expression.getText(file) === "api")
      apis.push(compact(n));
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "filter" &&
      n.arguments[0]
    )
      filters.push(compact(n.arguments[0]));
    ts.forEachChild(n, visit);
  };
  visit(file);
  return {
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    constants: file.statements.filter(ts.isVariableStatement).map(compact),
    core: declarations
      .filter((d) => !presentation.has(d.name.getText(file)))
      .map(compact),
    errorCode: code ? compact(code) : null,
    errorMessage: message ? compact(message) : null,
    apis: apis.sort(),
    filters: filters.sort(),
    props: props.sort(),
  };
}
