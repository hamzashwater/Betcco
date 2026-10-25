import ts from "typescript";
// Independent executable snapshot. Only explicit local presentation ownership
// aliases/feedback are normalized; transport and business expressions remain.
export function securityIncidentContracts(source: string) {
  const file = ts.createSourceFile(
      "owner.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    printer = ts.createPrinter({ removeComments: true });
  const compact = (n: ts.Node) =>
    printer
      .printNode(ts.EmitHint.Unspecified, n, file)
      .replace(/\s+/g, " ")
      .replace(/\bcreateDataImpact\b/g, "potentialDataImpact")
      .replace(/\bsetCreateDataImpact\b/g, "setPotentialDataImpact");
  const owner = file.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) &&
      n.name?.text === "SecurityIncidentManagement",
  )!;
  const declarations = owner
    .body!.statements.filter(ts.isVariableStatement)
    .map((n) => n.declarationList.declarations[0]);
  const find = (name: string) =>
    declarations.find((n) => n.name.getText(file) === name)!;
  const presentation = new Set([
    "[createDataImpact, setCreateDataImpact]",
    "[reviewNotice, setReviewNotice]",
    "[deadlineNotice, setDeadlineNotice]",
    "[selectedRefreshPending, setSelectedRefreshPending]",
    "[selectedRefreshError, setSelectedRefreshError]",
    "refreshSelectedIncident",
  ]);
  const feedback =
    /^(setReviewNotice|setDeadlineNotice|setSelectedRefreshPending|setSelectedRefreshError)\(/;
  const options = (name: string) =>
    (find(name).initializer as ts.CallExpression)
      .arguments[0] as ts.ObjectLiteralExpression;
  const option = (name: string, key: string) =>
    options(name).properties.find(
      (n): n is ts.PropertyAssignment =>
        ts.isPropertyAssignment(n) && n.name.getText(file) === key,
    )!.initializer;
  const success = (name: string) =>
    (
      (option(name, "onSuccess") as ts.ArrowFunction).body as ts.Block
    ).statements
      .filter((n) => !feedback.test(compact(n)))
      .map(compact);
  const selected = (find("selectIncident").initializer as ts.ArrowFunction)
    .body as ts.Block;
  const props: string[] = [],
    apis: string[] = [],
    reReadFlow: string[][] = [];
  function visit(n: ts.Node) {
    if (
      ts.isJsxAttribute(n) &&
      /^(on[A-Z].*|disabled|required|type|value|checked|maxLength|key)$/.test(
        n.name.getText(file),
      )
    ) {
      const attrs = n.parent;
      const retry = attrs.properties.some(
        (p) =>
          ts.isJsxAttribute(p) &&
          p.name.getText(file) === "onClick" &&
          p.initializer?.getText(file).includes("refreshSelectedIncident"),
      );
      if (!retry)
        props.push(
          compact(n).replace(
            "selectedRefreshPending || Boolean(selectedRefreshError) || ",
            "",
          ),
        );
    }
    if (ts.isCallExpression(n) && n.expression.getText(file) === "api")
      apis.push(compact(n));
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "then" &&
      ts.isCallExpression(n.expression.expression) &&
      n.expression.expression.expression.getText(file) === "api"
    ) {
      const callback = n.arguments[0];
      if (callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body))
        reReadFlow.push(
          callback.body.statements
            .filter((s) => !feedback.test(compact(s)))
            .map(compact),
        );
    }
    ts.forEachChild(n, visit);
  }
  visit(file);
  return {
    types: file.statements.filter(ts.isTypeAliasDeclaration).map(compact),
    constants: file.statements.filter(ts.isVariableStatement).map(compact),
    setup: declarations
      .filter(
        (n) =>
          !presentation.has(n.name.getText(file)) &&
          !["selectIncident", "create", "review", "recordDeadline"].includes(
            n.name.getText(file),
          ),
      )
      .map(compact),
    selection: selected.statements
      .filter((n) => !feedback.test(compact(n)))
      .map(compact),
    mutationFns: ["create", "review", "recordDeadline"].map((n) =>
      compact(option(n, "mutationFn")),
    ),
    successes: [success("create"), success("review")],
    apis: apis.sort(),
    reReadFlow,
    props: props.sort(),
  };
}
