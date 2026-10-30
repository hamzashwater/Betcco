// Permit only the reviewed theme restoration additions in historical layout
// proofs. Missing, duplicate or modified wiring is left intact and fails those
// original complete-contract comparisons; all unrelated bytes remain visible.
export function projectThemeNonceSource(source: string, path: string) {
  const root = path === "src/app/(root)/layout.tsx";
  if (!root && path !== "src/app/[locale]/layout.tsx") return source;
  const additions = [
    [
      'import { ThemeRestoration } from "@/components/theme-restoration";\n',
      "",
    ],
    [
      root
        ? '        <ThemeRestoration locale="ar" />\n'
        : "        <ThemeRestoration locale={locale} />\n",
      "",
    ],
    ['import { headers } from "next/headers";\n', ""],
    ['  const nonce = (await headers()).get("x-nonce") ?? undefined;\n', ""],
    [
      "<script\n          nonce={nonce}\n          dangerouslySetInnerHTML",
      "<script\n          dangerouslySetInnerHTML",
    ],
  ] as const;
  if (
    source.split("nonce={nonce}").length !== 2 ||
    additions.some(([added]) => source.split(added).length !== 2)
  )
    return source;
  if (
    root &&
    source.split("export default async function DefaultLocaleRootLayout")
      .length !== 2
  )
    return source;
  const projected = additions.reduce(
    (value, [added, previous]) => value.replace(added, previous),
    source,
  );
  return root
    ? projected.replace(
        "export default async function DefaultLocaleRootLayout",
        "export default function DefaultLocaleRootLayout",
      )
    : projected;
}
