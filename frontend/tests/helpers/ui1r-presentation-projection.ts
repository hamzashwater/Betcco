import ts from "typescript";

const supportPath = "src/features/support/support-center.tsx";
const coursesPath = "src/app/[locale]/courses/page.tsx";
const parse = (source: string) =>
  ts.createSourceFile(
    "ui1r.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
const printer = ts.createPrinter({ removeComments: true });
function syntax(node: ts.Node) {
  return printer
    .printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    .replace(/\s+/g, " ")
    .trim();
}
function fragment(source: string, jsx: boolean) {
  const file = parse(jsx ? `const specimen = (${source});` : source);
  if (!jsx) return syntax(file.statements[0]);
  const statement = file.statements[0] as ts.VariableStatement;
  const expression = statement.declarationList.declarations[0]
    .initializer as ts.ParenthesizedExpression;
  return syntax(expression.expression);
}

// Exact reviewed syntax only. Do not erase arbitrary classes, functions or
// string literals. Historical T7 fixtures and catalogue hashes stay immutable.
const supportEdits = [
  {
    jsx: false,
    before: "",
    after: `function statusClassName(status: string) {
      switch (status) {
        case "Open":
        case "InProgress":
          return "bg-info-surface text-info";
        case "WaitingForStudent":
          return "bg-warning-surface text-warning";
        case "Resolved":
          return "bg-success-surface text-success";
        default:
          return "bg-surface-muted text-text-secondary";
      }
    }`,
  },
  {
    jsx: true,
    before: `<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted">
      {statusLabel(item.status, locale, supportCopy)}
    </span>`,
    after: `<span className={\`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold \${statusClassName(item.status)}\`}>
      {statusLabel(item.status, locale, supportCopy)}
    </span>`,
  },
];
const coursesEdits = [
  {
    jsx: true,
    before:
      '<div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,10,25,.92),rgba(5,10,25,.36))]" />',
    after:
      '<div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,10,25,.92),rgba(5,10,25,.72))]" />',
  },
  {
    jsx: true,
    before: `<p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
      {copy("betccoCatalog")}
    </p>`,
    after: `<p className="text-xs font-black uppercase tracking-[0.18em] text-action-primary-text">
      {copy("betccoCatalog")}
    </p>`,
  },
  {
    jsx: true,
    before: `<h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
      {copy("discoverCourses")}
    </h1>`,
    after: `<h1 className="mt-3 text-4xl font-black tracking-tight text-action-primary-text sm:text-5xl">
      {copy("discoverCourses")}
    </h1>`,
  },
  {
    jsx: true,
    before: `<p className="mt-3 max-w-2xl leading-7 text-muted">
      {copy("searchPublishedCoursesAndSelectTheTrack")}
    </p>`,
    after: `<p className="mt-3 max-w-2xl leading-7 text-action-primary-text">
      {copy("searchPublishedCoursesAndSelectTheTrack")}
    </p>`,
  },
];
const editsByPath: [string, typeof supportEdits][] = [
  [supportPath, supportEdits],
  [coursesPath, coursesEdits],
];
const reviewed = new Map(
  editsByPath.map(([path, edits]) => [
    path,
    edits.map((edit) => ({
      ...edit,
      expected: fragment(edit.after, edit.jsx),
    })),
  ]),
);

export function projectUi1rPresentation(source: string, path: string) {
  const edits = reviewed.get(path);
  if (!edits) return source;
  const matches = edits.map(() => [] as { start: number; end: number }[]);
  function walk(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node)
    ) {
      const actual = syntax(node);
      edits!.forEach((edit, index) => {
        if (actual === edit.expected)
          matches[index].push({ start: node.getStart(), end: node.getEnd() });
      });
    }
    ts.forEachChild(node, walk);
  }
  walk(parse(source));
  // Partial, changed or duplicated seams are not approved. Return them intact
  // so the existing residual and complete-contract guards still reject drift.
  if (matches.some((items) => items.length !== 1)) return source;
  const replacements = edits.map((edit, index) => ({
    ...matches[index][0],
    text: edit.before,
  }));
  for (const edit of replacements.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
