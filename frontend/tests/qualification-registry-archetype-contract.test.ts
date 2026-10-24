import { projectPlatformRatingBoundary } from "./helpers/platform-rating-projection";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-qualification-registry-baseline.json";
import { qualificationRegistryContracts } from "./helpers/qualification-registry-contracts";
import {
  projectQualificationRegistrySource,
  projectQualificationRegistryCopy,
  projectQualificationRegistryGuard,
  withoutQualificationRegistryAdditions,
} from "./helpers/qualification-registry-projection";
const path = baseline.path,
  read = (p: string) =>
    projectPlatformRatingBoundary(
      readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
      p,
    ),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  source = read(path);
describe("Slice 3 Qualification Registry independent presentation boundary", () => {
  it("pins the pre-edit latest-main fixture independently", () => {
    expect(baseline.base).toBe("e94a2b216c18f293869573768dcdf83fda42dd67");
    expect(baseline.originalHash).toBe(
      "80b3ad41dd106f8ad139e8d528a2cdc678de1f8aef096cfa42514accf1e29366",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "8221f46e4f6357b40e39fc10eff8eeb925ae39de8c13130b6f43eeac8ce160bf",
    );
  });
  it("directly freezes setup, separate queries, retry, raw types, mutations, UTC, reset/invalidation, eligibility, handlers and identities", () => {
    expect(qualificationRegistryContracts(source)).toEqual(baseline.invariants);
    expect(source).not.toMatch(
      /\.(sort|toSorted|filter|reverse)\(|localStorage|sessionStorage|useEffect|placeholderData/,
    );
    expect(source).not.toMatch(/qualification\.isActive|version\.isActive/);
  });
  it("accepts only unique exact owner seams, fails closed and preserves the historical source", () => {
    expect(hash(projectQualificationRegistrySource(source, path))).toBe(
      baseline.originalHash,
    );
    expect(
      projectQualificationRegistrySource(
        source,
        "src/features/other/qualification-registry-management.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(
          hash(
            projectQualificationRegistrySource(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each([
    ['queryKey: ["qualification-registry"]', 'queryKey: ["changed"]'],
    ["retry: false", "retry: true"],
    ['"/qualification-registry/rubrics"', '"/rubrics"'],
    ['method: "POST"', 'method: "PUT"'],
    ["JSON.stringify(qualificationForm)", "JSON.stringify({})"],
    [
      "qualificationId: versionForm.qualificationId",
      'qualificationId: "fabricated"',
    ],
    ["T00:00:00.000Z", "T00:00:00"],
    [": null,", ': "",'],
    [
      "qualificationForm.code.trim().length >= 2",
      "qualificationForm.code.trim().length >= 1",
    ],
    [
      "versionForm.sourceReference.trim().length >= 10",
      "versionForm.sourceReference.trim().length >= 9",
    ],
    ["setRubricVersions({})", 'setRubricVersions({ invented: "id" })'],
    ["selected === rubric.qualificationVersionId", "false"],
    [
      "qualificationCode: qualification.code",
      "qualificationCode: qualification.id",
    ],
    ["rubricVersions[rubric.rubricTemplateId]", 'rubricVersions["other"]'],
    ["rubric.qualificationCode &&", "rubric.qualificationVersionId &&"],
    ["ar ? rubric.arabicTitle : rubric.englishTitle", "rubric.englishTitle"],
  ])("rejects executable/academic drift: %s", (from, to) => {
    const changed = source.replace(from, to);
    expect(changed).not.toBe(source);
    expect(qualificationRegistryContracts(changed)).not.toEqual(
      baseline.invariants,
    );
    expect(hash(projectQualificationRegistrySource(changed, path))).not.toBe(
      baseline.originalHash,
    );
  });
  it.each(Object.entries(baseline.protected))(
    "keeps frozen completed UI, backend and dependencies: %s",
    (p, expected) => {
      expect(hash(projectQualificationRegistryGuard(read(p), p)), p).toBe(
        expected,
      );
    },
  );
  it.each(["en", "ar"] as const)(
    "permits only five exact factual %s query-state copy additions and keeps every old value",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw);
      expect(hash(projectQualificationRegistryCopy(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(
        hash(
          JSON.stringify(
            withoutQualificationRegistryAdditions(structuredClone(m)),
            null,
            2,
          ) + "\n",
        ),
      ).toBe(baseline.messageHashes[locale]);
      for (const key of Object.keys(baseline.additions[locale])) {
        const changed = structuredClone(m);
        changed.adminWorkspace.qualificationRegistry[key] = "Changed";
        expect(() => withoutQualificationRegistryAdditions(changed)).toThrow();
        expect(
          hash(
            projectQualificationRegistryCopy(
              JSON.stringify(changed, null, 2) + "\n",
              p,
            ),
          ),
        ).not.toBe(baseline.messageHashes[locale]);
      }
      const unrelated = structuredClone(m);
      unrelated.adminWorkspace.qualificationRegistry.extra = "Unreviewed";
      expect(
        hash(
          JSON.stringify(
            withoutQualificationRegistryAdditions(unrelated),
            null,
            2,
          ) + "\n",
        ),
      ).not.toBe(baseline.messageHashes[locale]);
    },
  );
  it("keeps the historical guard alignment exact and fail closed", () => {
    for (const [p, seams] of Object.entries(baseline.guardSeams))
      for (const seam of seams) {
        const raw = read(p);
        expect(projectQualificationRegistryGuard(raw, p)).not.toBe(raw);
        for (const replacement of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "#"),
        ])
          expect(
            projectQualificationRegistryGuard(
              raw.replace(seam.approved, replacement),
              p,
            ),
          ).toBe(raw.replace(seam.approved, replacement));
      }
  });
  it("keeps DC03, semantic roles, local CSS, opaque panels, wrap and 44px/focus contracts", () => {
    const css = read(
        "src/features/admin/qualification-registry-management.module.css",
      ),
      globals = read("src/app/globals.css");
    expect(source + css).not.toMatch(
      /font-(black|extrabold)|font-weight:\s*[89]00|backdrop-filter|gradient|box-shadow|opacity:/,
    );
    expect(
      [...css.matchAll(/font-weight:\s*(\d+)/g)].every((m) =>
        ["400", "500", "600", "700"].includes(m[1]),
      ),
    ).toBe(true);
    for (const token of css.matchAll(/var\((--[\w-]+)\)/g))
      expect(globals, token[1]).toContain(token[1] + ":");
    for (const role of ["page", "section", "item", "body", "label", "data"])
      expect(css).toContain(`var(--ui-type-${role}-size)`);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(source).not.toContain("key={qualificationForm");
    const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      copy: string[] = [];
    function visit(n: ts.Node) {
      if (
        ts.isJsxText(n) &&
        /[a-zA-Z\u0600-\u06ff]/.test(n.text) &&
        !n.text.includes("BETCCO")
      )
        copy.push(n.text);
      ts.forEachChild(n, visit);
    }
    visit(file);
    expect(copy).toEqual([]);
  });
});
