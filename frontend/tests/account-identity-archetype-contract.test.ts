import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-account-identity-baseline.json";
import { accountIdentityContracts } from "./helpers/account-identity-contracts";
import { projectAccountIdentitySource } from "./helpers/account-identity-projection";

const path = "src/features/admin/account-identity-management.tsx";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const source = read(path);
describe("Account Identity independently frozen presentation boundary", () => {
  it("pins the pre-edit live-main baseline", () => {
    expect(baseline.base).toBe("27e0a502fb3efe810f76ee2c7f6d7797f04f0a0c");
    expect(hash(JSON.stringify(baseline))).toBe(
      "d5d69973dbb06a07aba07336ef65372f630cc552743d8a490aff0d1a8a25c8f6",
    );
  });
  it("directly freezes setup, all five mutations, query/options, types, handlers, native validations and eligibility", () => {
    expect(accountIdentityContracts(source)).toEqual(baseline.invariants);
    expect(source).toContain("users.data.items.map((user) => (");
    expect(source).not.toMatch(
      /users\.data\.items\.(filter|sort|toSorted|slice)|localStorage|sessionStorage|placeholderData|useEffect/,
    );
    expect(source.match(/window\.confirm\(/g)).toHaveLength(2);
  });
  it("reverses only exact reviewed seams and rejects missing/duplicated/changed presentation", () => {
    expect(hash(projectAccountIdentitySource(source, path))).toBe(
      baseline.originalHash,
    );
    expect(
      projectAccountIdentitySource(
        source,
        "src/features/other/account-identity-management.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ]) {
        expect(
          hash(
            projectAccountIdentitySource(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
      }
  });
  it.each([
    ['["managed-identities", role, page]', '["managed-identities", role]'],
    [
      "new URLSearchParams({ role, page: String(page) })",
      'new URLSearchParams({ role, page: "1" })',
    ],
    ["/admin/users/support-admins/invite", "/admin/users/invite"],
    [
      "JSON.stringify({ displayName, email })",
      "JSON.stringify({ displayName, email, role })",
    ],
    ["newEmail: newEmails[id]", "newEmail: email"],
    ["/resend-activation", "/activate"],
    ["/revoke-authority", "/freeze"],
    ["JSON.stringify({ frozen })", "JSON.stringify({ frozen: true })"],
    ["user.mustChangePassword || !user.emailConfirmed", "false"],
    ["window.confirm(", "Boolean("],
    [
      "page * 25 >= users.data.totalCount",
      "page * 50 >= users.data.totalCount",
    ],
    ["minLength={2}", "minLength={1}"],
    ['setNewEmails((value) => ({ ...value, [id]: "" }))', "setNewEmails({})"],
  ])("rejects transport/interaction drift: %s", (before, after) => {
    const changed = source.replace(before, after);
    expect(changed).not.toBe(source);
    expect(accountIdentityContracts(changed)).not.toEqual(baseline.invariants);
    expect(hash(projectAccountIdentitySource(changed, path))).not.toBe(
      baseline.originalHash,
    );
  });
  it.each(Object.entries(baseline.protected))(
    "preserves frozen owner %s",
    (p, expected) => {
      expect(hash(read(p)), p).toBe(expected);
    },
  );
  it("keeps native mounted disclosure, live copy and DC03/roles local", () => {
    const original = projectAccountIdentitySource(source, path);
    const keys = (s: string) =>
      [
        ...new Set(
          [...s.matchAll(/t\("(accountIdentities\.[^"]+)"/g)].map((m) => m[1]),
        ),
      ].sort();
    expect(keys(source)).toEqual(keys(original));
    const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      hardcoded: string[] = [];
    function visit(n: ts.Node) {
      if (ts.isJsxText(n) && /[a-zA-Z\u0600-\u06ff]/.test(n.text))
        hardcoded.push(n.text);
      ts.forEachChild(n, visit);
    }
    visit(file);
    expect(hardcoded).toEqual([]);
    expect(source).toContain("<details className={styles.emailDetail}>");
    expect(source).not.toContain("key={role}");
    const css = read(
      "src/features/admin/account-identity-management.module.css",
    );
    expect(source + css).not.toMatch(
      /font-(black|extrabold)|font-weight:\s*[89]00|backdrop-filter|gradient|box-shadow/,
    );
    expect(
      [...css.matchAll(/font-weight:\s*(\d+)/g)].every((m) =>
        ["400", "500", "600", "700"].includes(m[1]),
      ),
    ).toBe(true);
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("min-height: 44px");
    expect(css).not.toContain("opacity:");
    for (const role of ["success", "warning", "info", "danger"])
      expect(css).toContain(`var(--ui-state-${role}-foreground)`);
  });
});
