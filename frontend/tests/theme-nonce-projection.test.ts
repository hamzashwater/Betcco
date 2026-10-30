import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectThemeNonceSource } from "./helpers/theme-nonce-projection";

const path = "src/app/[locale]/layout.tsx";
const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
describe("bounded nonce seam for historical complete layout proofs", () => {
  it("preserves the complete historical root contract outside reviewed restoration wiring", () => {
    const path = "src/app/(root)/layout.tsx";
    const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    const projected = projectThemeNonceSource(source, path);
    expect(projected).not.toBe(source);
    expect(projected).not.toContain("nonce={nonce}");
    expect(projected).not.toContain("ThemeRestoration");
    expect(projected).toContain(
      "export default function DefaultLocaleRootLayout",
    );
    const changed = source.replace('locale="ar"', 'locale="en"');
    expect(projectThemeNonceSource(changed, path)).toBe(changed);
    expect(
      projectThemeNonceSource(
        source.replace("export default async", "export default"),
        path,
      ),
    ).toContain("nonce={nonce}");
  });
  it("removes only the reviewed nonce authorization for earlier proofs", () => {
    const projected = projectThemeNonceSource(source, path);
    expect(projected).not.toBe(source);
    expect(projected).not.toContain('from "next/headers"');
    expect(projected).not.toContain("nonce={nonce}");
    expect(projected).toContain("localStorage.getItem('betcco-theme')");
    expect(projected).toContain('type="application/ld+json"');
  });
  it.each([
    ['"x-nonce"', '"another-header"'],
    ['(await headers()).get("x-nonce")', '"fixed-nonce"'],
    ["nonce={nonce}", "nonce={undefined}"],
    ["nonce={nonce}", ""],
    ["nonce={nonce}", "nonce={nonce} nonce={nonce}"],
    ['import { headers } from "next/headers";', ""],
    [
      "<ThemeRestoration locale={locale} />",
      '<ThemeRestoration locale="en" />',
    ],
  ])("keeps unreviewed nonce wiring visible: %s", (from, to) => {
    expect(source).toContain(from);
    const mutant = source.replace(from, to);
    expect(projectThemeNonceSource(mutant, path)).toBe(mutant);
  });
  it("does not project other owners and does not conceal unrelated changes", () => {
    expect(projectThemeNonceSource(source, "another-owner.tsx")).toBe(source);
    const changed = source.replace(
      'type="application/ld+json"',
      'type="other"',
    );
    expect(projectThemeNonceSource(changed, path)).toContain('type="other"');
  });
});
