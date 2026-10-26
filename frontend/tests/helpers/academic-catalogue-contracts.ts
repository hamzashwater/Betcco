import ts from "typescript";

export function catalogueContracts(source: string) {
  const sf = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const normalize: ts.TransformerFactory<ts.Node> = (context) => (root) => {
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
    const result = ts.transform(n, [normalize]);
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
  const owner = sf.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === "AcademicCatalogue",
  )!;
  const types = sf.statements.filter(ts.isTypeAliasDeclaration).map(print);
  const issueKeys = sf.statements
    .filter(ts.isVariableStatement)
    .find((n) =>
      n.declarationList.declarations.some(
        (d) => d.name.getText(sf) === "issueKeys",
      ),
    )!;
  const setup = owner
    .body!.statements.filter(ts.isVariableStatement)
    .map(print);
  const handlers: string[] = [],
    eligibility: string[] = [],
    resolution: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      ["onChange", "disabled"].includes(n.name.getText(sf))
    )
      handlers.push(print(n));
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "mutate"
    )
      handlers.push(print(n));
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      /^(definition|scope)\.validation\.length === 0$/.test(
        n.left.getText(sf).replace(/\s+/g, " "),
      ) &&
      ts.isPrefixUnaryExpression(n.right)
    )
      eligibility.push(print(n));
    if (
      ts.isVariableDeclaration(n) &&
      ["aims", "criteria"].includes(n.name.getText(sf))
    )
      resolution.push(print(n));
    if (
      ts.isCallExpression(n) &&
      /^(definition\.(aimIds|criterionIds))/.test(n.getText(sf)) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "join"
    )
      resolution.push(print(n));
    ts.forEachChild(n, visit);
  }
  visit(owner);
  return {
    types,
    issueKeys: print(issueKeys),
    setup,
    handlers: handlers.sort(),
    eligibility: eligibility.sort(),
    resolution: resolution.sort(),
  };
}
