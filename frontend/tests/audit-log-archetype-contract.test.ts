import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-audit-log-baseline.json";
import { auditLogContracts } from "./helpers/audit-log-contracts";
import { projectAuditLogSource } from "./helpers/audit-log-projection";
import { projectQualificationRegistryCopy } from "./helpers/qualification-registry-projection";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const path = "src/features/admin/audit-log.tsx";
const source = read(path);
describe("UI-D01-15 / Slice 1 independent Audit Log presentation boundary", () => {
  it("pins the independent main snapshot and exact fixture", () => {
    expect(baseline.base).toBe("f361f5c79c41f547d690cad08815d26e7562c0a4");
    expect(hash(JSON.stringify(baseline))).toBe(
      "11ac1da664ee005eef53f47f740660f87ace7171afd37cc4892b9e6f95378554",
    );
  });
  it("preserves all query/export/setup, types, state and interaction contracts without projecting executable behavior", () => {
    expect(auditLogContracts(source)).toEqual(baseline.invariants);
    expect(source).toContain("values.items.map((item) => (");
    expect(source).not.toMatch(
      /values\.items\.(filter|sort|toSorted|slice)|localStorage|sessionStorage|useEffect|useMutation/,
    );
  });
  it("limits the historical DOM/i18n projection to exact unique reviewed seams, and fails closed on changes", () => {
    expect(hash(projectAuditLogSource(source, path))).toBe(
      baseline.originalHash,
    );
    expect(projectAuditLogSource(source, "src/features/admin/other.tsx")).toBe(
      source,
    );
    for (const seam of baseline.seams) {
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ]) {
        expect(
          hash(
            projectAuditLogSource(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
      }
    }
    for (const [from, to] of [
      ["/admin/audit-logs?", "/other?"],
      ['pageSize: "25"', 'pageSize: "50"'],
      ['cache: "no-store"', 'cache: "default"'],
      ['credentials: "include"', 'credentials: "omit"'],
      ["T23:59:59.999Z", "T00:00:00Z"],
      ["draftFilters.search.trim()", "draftFilters.search"],
      ["result.isFetching", "false"],
    ]) {
      const changed = source.replace(from, to);
      expect(changed).not.toBe(source);
      expect(hash(projectAuditLogSource(changed, path))).not.toBe(
        baseline.originalHash,
      );
    }
  });
  it.each(Object.entries(baseline.protected))(
    "preserves frozen producer/shared/catalogue/dependency owner %s",
    (file, expected) => {
      expect(
        hash(projectQualificationRegistryCopy(read(file), file)),
        file,
      ).toBe(expected);
    },
  );
  it("keeps DC03 weights and known semantic roles local, with neutral raw fallback", () => {
    const css = read("src/features/admin/audit-log.module.css");
    expect(source + css).not.toMatch(
      /font-(black|extrabold)|font-weight:\s*[89]00|backdrop-filter|radial-gradient/,
    );
    expect(
      [...css.matchAll(/font-weight:\s*(\d+)/g)].every((m) =>
        ["400", "500", "600", "700"].includes(m[1]),
      ),
    ).toBe(true);
    for (const [outcome, role] of [
      ["Success", "success"],
      ["Failure", "danger"],
      ["RiskObserved", "warning"],
    ]) {
      expect(css).toContain(`.outcome[data-outcome="${outcome}"]`);
      expect(css).toContain(`var(--ui-state-${role}-foreground)`);
    }
    expect(css).toContain("var(--ui-state-neutral-foreground)");
    expect(source).toContain("data-outcome={item.outcome}");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("var(--ui-action-disabled-text)");
    expect(css).not.toContain("opacity:");
    for (const role of ["body", "label", "data", "meta"]) {
      expect(css).toContain(`var(--ui-type-${role}-size)`);
      expect(css).toContain(`var(--ui-type-${role}-line)`);
    }
    expect(source).not.toContain("size={17}");
    expect(source).toContain("aria-busy={isExporting}");
  });
});
