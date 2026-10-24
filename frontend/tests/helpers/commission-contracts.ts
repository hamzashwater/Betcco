import ts from "typescript";

// Compare live executable contracts to the pre-edit source independently of the
// historical presentation projection. Notice metadata is presentation-only.
export function commissionContracts(source: string) {
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
      ts.isFunctionDeclaration(n) && n.name?.text === "CommissionSettings",
  )!;
  const setup: string[] = [],
    mutations: unknown[] = [],
    props: string[] = [],
    preview: string[] = [];
  for (const statement of owner.body!.statements.filter(
    ts.isVariableStatement,
  )) {
    const declaration = statement.declarationList.declarations[0];
    if (declaration.name.getText(file) === "[noticeContext, setNoticeContext]")
      continue;
    const init = declaration.initializer;
    if (
      init &&
      ts.isCallExpression(init) &&
      init.expression.getText(file) === "useMutation"
    ) {
      const options = init.arguments[0] as ts.ObjectLiteralExpression;
      mutations.push(
        options.properties.map((p) => {
          if (!ts.isPropertyAssignment(p) || !ts.isArrowFunction(p.initializer))
            return compact(p);
          const name = p.name.getText(file),
            body = p.initializer.body;
          if (name === "onSuccess" && ts.isBlock(body))
            return [
              name,
              body.statements
                .filter((s) => !/^setNoticeContext\(/.test(compact(s)))
                .map(compact),
            ];
          if (name === "onError") {
            const expressions: string[] = [];
            function visit(n: ts.Node) {
              if (
                ts.isCallExpression(n) &&
                n.expression.getText(file) === "setNotice"
              )
                expressions.push(compact(n));
              ts.forEachChild(n, visit);
            }
            visit(body);
            return [name, expressions];
          }
          return compact(p);
        }),
      );
    } else setup.push(compact(statement));
  }
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|type|value|min|max|step|dir)$/.test(
        n.name.getText(file),
      )
    )
      props.push(compact(n));
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(file) === "formatLocalizedPercentage" &&
      n.arguments[0]?.getText(file) === "teacherShare"
    )
      preview.push(compact(n));
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    setup,
    mutations,
    props,
    preview,
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
  };
}
