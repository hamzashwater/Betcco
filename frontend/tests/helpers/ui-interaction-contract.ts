import seams from "../fixtures/ui-d01-04-presentation-seams.json";

// Only these exact, reviewed UI-D01-04 visual fragments may project back to
// merged UI-D01-03. A missing, duplicated or changed fragment stays unprojected.
export function interactionPresentation(
  source: string,
  file: keyof typeof seams,
) {
  const original = source;
  for (const { approved, previous, count } of seams[file]) {
    if (source.split(approved).length !== count + 1) return original;
    source = source.split(approved).join(previous);
  }
  return source;
}
