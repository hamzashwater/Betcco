import ts from "typescript";
// Independently captured from live main before implementation. This does not
// project presentation: it directly compares all executable setup (including
// query/export), record types and every interaction/value/disabled contract.
export function auditLogContracts(source: string) {
  const sf = ts.createSourceFile(
    "audit-log.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const compact = (node: ts.Node) => node.getText(sf).replace(/\s+/g, " ");
  const owner = sf.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "AuditLogViewer",
  )!;
  const props: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      /^(on[A-Z].*|disabled|type|value|key)$/.test(node.name.getText(sf))
    )
      props.push(compact(node));
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return {
    setup: owner
      .body!.statements.filter((node) => !ts.isReturnStatement(node))
      .map(compact),
    types: sf.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    props,
  };
}
