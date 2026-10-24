import ts from "typescript";
// Independent pre-edit executable comparison: no presentation projection.
export function privacyRequestContracts(source: string) {
  const file = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const printer = ts.createPrinter({ removeComments: true });
  const compact = (n: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, n, file).replace(/\s+/g, " ");
  const owner = file.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) &&
      n.name?.text === "PrivacyRequestManagement",
  )!;
  const props: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|type|value|checked|maxLength|key)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    setup: owner.body!.statements.filter(ts.isVariableStatement).map(compact),
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    constants: file.statements.filter(ts.isVariableStatement).map(compact),
    props,
  };
}
