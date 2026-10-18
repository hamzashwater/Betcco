import ts from "typescript";

const seams = {
  "action.tsx": [
    [
      "px-4 py-2 ui-type-label whitespace-normal",
      "px-4 py-2 text-sm font-bold leading-6 whitespace-normal",
    ],
  ],
  "query-state.tsx": [
    [
      'className="ui-type-label break-words"',
      'className="break-words text-sm font-bold leading-6"',
    ],
    [
      'className="ui-type-body mt-1 text-text-secondary"',
      'className="mt-1 text-sm leading-6 text-text-secondary"',
    ],
    [
      "ui-type-label flex items-start gap-2",
      "flex items-start gap-2 text-sm font-semibold leading-6",
    ],
  ],
} as const;

export function typographyContract(source: string, file: keyof typeof seams) {
  for (const [approved, previous] of seams[file]) {
    // Missing/duplicated/changed seams stay intact so the full source proof fails.
    if (source.split(approved).length !== 2) return syntax(source);
    source = source.replace(approved, previous);
  }
  return syntax(source);
}

export function syntax(source: string) {
  return ts
    .createPrinter({ removeComments: true })
    .printFile(
      ts.createSourceFile(
        "typography.tsx",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
    )
    .replace(/\s+/g, " ")
    .trim();
}
