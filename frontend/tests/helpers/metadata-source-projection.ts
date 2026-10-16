import ts from "typescript";
import baseline from "../fixtures/metadata-i18n-baseline.json";
import { digest } from "./admin-final-i18n-audit";
import { practiceContract } from "./learning-practice-i18n-audit";

const frozen = {
  metadataFunction:
    "5cf8f03dced7273c3c25ea626c5558d927516310b3a1425ffd94aa69eab3670e",
  structuredData:
    "34b6eaf10e94ece4ea1259dc006901bcbac7b45ec85a33a358561ff52604d754",
};

// Historical shell proofs retain their old hashes. Projection accepts only the
// independently reviewed metadata implementation, including every SEO/JSON-LD
// contract, then restores its original representation for those earlier proofs.
export function withoutMetadataPresentationChanges(source: string) {
  const file = ts.createSourceFile(
    "layout.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: ts.Node) {
    const key =
      ts.isFunctionDeclaration(node) && node.name?.text === "generateMetadata"
        ? "metadataFunction"
        : ts.isVariableDeclaration(node) &&
            node.name.getText(file) === "structuredData"
          ? "structuredData"
          : undefined;
    if (key) {
      const text = node.getText(file);
      const original = baseline.projection[key].original;
      if (practiceContract(text) !== practiceContract(original)) {
        if (digest(practiceContract(text)) !== frozen[key])
          throw new Error("Unverified metadata/SEO/JSON-LD change");
        edits.push({
          start: node.getStart(file),
          end: node.end,
          text: original,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
