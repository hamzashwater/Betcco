import ts from "typescript";

// Independent pre-edit comparison, without presentation projection.
export function qualificationRegistryContracts(source: string) {
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
      n.name?.text === "QualificationRegistryManagement",
  )!;
  const props: string[] = [],
    identities: string[] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|minLength|maxLength|type|value|key|pending)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    if (ts.isVariableDeclaration(n) && n.name.getText(file) === "selected")
      identities.push(compact(n));
    if (
      ts.isConditionalExpression(n) &&
      [
        "ar",
        "rubric.qualificationCode && rubric.qualificationVersionCode",
      ].includes(compact(n.condition))
    )
      identities.push(compact(n));
    if (
      ts.isCallExpression(n) &&
      [
        "qualifications.data?.map",
        "qualification.versions.map",
        "rubrics.data?.map",
        "versions.map",
      ].includes(n.expression.getText(file))
    )
      identities.push(
        compact(n.expression) +
          ":" +
          n.arguments[0].getText(file).split("=>")[0].trim(),
      );
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    setup: owner
      .body!.statements.filter((n) => !ts.isReturnStatement(n))
      .map(compact),
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    props,
    identities,
  };
}
