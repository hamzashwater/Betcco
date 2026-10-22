import ts from "typescript";
// Direct comparison with pre-edit live main: no presentation projection.
export function accountIdentityContracts(source: string) {
  const file = ts.createSourceFile(
    "owner.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const compact = (node: ts.Node) => node.getText(file).replace(/\s+/g, " ");
  const owner = file.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) &&
      n.name?.text === "AccountIdentityManagement",
  )!;
  const props: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|minLength|maxLength|type|value|key|aria-pressed)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    setup: owner
      .body!.statements.filter((n) => !ts.isReturnStatement(n))
      .map(compact),
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    props,
  };
}
