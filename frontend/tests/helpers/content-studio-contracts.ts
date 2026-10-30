import ts from "typescript";

// Independent extraction: compare the unprojected live owner with the pinned
// original. No behavior is inferred from a source-projection approval hash.
export function studioContracts(source: string) {
  const file = ts.createSourceFile(
    "studio.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const printer = ts.createPrinter({ removeComments: true });
  const print = (node: ts.Node) =>
    printer
      .printNode(ts.EmitHint.Unspecified, node, file)
      .replace(/\s+/g, " ")
      .trim()
      .replace(/,\s*([}\]])/g, "$1");
  const queries: Record<string, string> = {},
    mutations: Record<string, unknown> = {},
    initial: Record<string, string> = {},
    functions: Record<string, string[]> = {},
    types: Record<string, string> = {},
    calls: string[] = [];
  const originals = [
    "TeacherOption",
    "CourseOption",
    "BlogItem",
    "PackageItem",
    "SessionItem",
    "LiveSessionProviderItem",
    "StudentOption",
    "AttendanceItem",
  ];
  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && originals.includes(node.name.text))
      types[node.name.text] = print(node);
    if (ts.isCallExpression(node) && node.expression.getText(file) === "api")
      calls.push(print(node));
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = node.name.getText(file),
        value = node.initializer;
      if (name.startsWith("initial")) initial[name] = print(value);
      if (
        ts.isCallExpression(value) &&
        value.arguments[0] &&
        ts.isObjectLiteralExpression(value.arguments[0])
      ) {
        const hook = value.expression.getText(file),
          obj = value.arguments[0];
        if (hook === "useQuery") queries[name] = print(obj);
        if (hook === "useMutation") {
          const fn = obj.properties.find(
            (p) => p.name?.getText(file) === "mutationFn",
          );
          const success = obj.properties.find(
            (p) => p.name?.getText(file) === "onSuccess",
          );
          const statements =
            success &&
            ts.isPropertyAssignment(success) &&
            ts.isArrowFunction(success.initializer) &&
            ts.isBlock(success.initializer.body)
              ? success.initializer.body.statements
                  .filter((s) => !s.getText(file).startsWith("setNotice("))
                  .map(print)
              : [];
          mutations[name] = {
            transport: fn ? print(fn) : null,
            success: statements,
          };
        }
      }
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.body &&
      [
        "selectTeacher",
        "selectPackage",
        "toggleCourse",
        "toLocalDateTime",
      ].includes(node.name.text)
    )
      functions[node.name.text] = node.body.statements
        .filter((s) => !/^\w+\.reset\(\);$/.test(s.getText(file)))
        .map(print);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { queries, mutations, initial, functions, types, calls };
}
