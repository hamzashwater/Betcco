import ts from "typescript";
// Independent pre-edit executable comparison; no presentation projection.
export function platformRatingContracts(source: string) {
  const file = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const compact = (n: ts.Node) => n.getText(file).replace(/\s+/g, " ");
  const owner = file.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) &&
      n.name?.text === "PlatformRatingModeration",
  )!;
  const props: string[] = [],
    averages: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|maxLength|type|value|key)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    if (ts.isVariableDeclaration(n) && n.name.getText(file) === "average")
      averages.push(compact(n));
    if (
      ts.isCallExpression(n) &&
      ["formatLocalizedNumber", "formatLocalizedDateTime"].includes(
        n.expression.getText(file),
      )
    )
      averages.push(compact(n));
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    setup: owner
      .body!.statements.filter(ts.isVariableStatement)
      .filter(
        (n) =>
          n.declarationList.declarations[0].name.getText(file) !== "pending",
      )
      .map(compact),
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    props,
    averages,
  };
}
