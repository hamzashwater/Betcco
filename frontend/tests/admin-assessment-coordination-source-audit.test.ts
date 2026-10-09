import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import baseline from "./fixtures/admin-assessment-coordination-copy-baseline.json";
import {
  audit,
  contractHash,
  files,
  hash,
} from "./helpers/admin-assessment-coordination-i18n-audit";
const sources = Object.fromEntries(
  files.map((name) => [
    name,
    readFileSync(`src/features/admin/${name}.tsx`, "utf8"),
  ]),
);
describe("Admin assessment coordination static-copy and technical contract audit", () => {
  it.each(files)(
    "has zero static Arabic/English UI, bilingual selectors, inline status labels or unclassified uses in %s",
    (name) => {
      expect(audit(sources[name]).findings).toEqual([]);
    },
  );
  it.each(files)(
    "matches the complete base-main technical AST for %s",
    (name) => {
      expect(contractHash(sources[name])).toBe(baseline.contractHashes[name]);
    },
  );
  it.each(files)("classifies each legitimate locale use in %s", (name) => {
    expect(audit(sources[name]).localeUses).toEqual(
      baseline.before[name].localeUses,
    );
  });
  it("preserves the four internal status values and exact typed translation mapping", () => {
    expect(audit(sources[files[0]]).statusMappings).toEqual(
      ["PendingAssignment", "Assigned", "UnderReview", "NeedsRevision"].map(
        (value) => ({ value, key: `assessmentCoordination.statuses.${value}` }),
      ),
    );
    expect(sources[files[0]]).toContain("label ? t(label.label) : undefined");
    expect(sources[files[0]]).toContain("t(option.label)");
  });
  it("preserves both interpolation data arguments and raw ASCII numeric semantics", () => {
    expect(audit(sources[files[0]]).interpolations).toEqual([
      't("assessmentCoordination.evaluator", { name: item.evaluatorDisplayName, })',
      't("assessmentCoordination.pageSummary", { page: queue.data.page, count: queue.data.totalCount, })',
    ]);
  });
  it.each(["ar", "en"] as const)(
    "preserves all 83 unique historical wording cases in %s",
    (locale) => {
      const t = createTranslator({
        locale,
        messages: locale === "ar" ? ar : en,
        namespace: "adminWorkspace",
      });
      for (const c of baseline.cases)
        expect(
          t(
            c.key as Parameters<typeof t>[0],
            c.values as Record<string, string | number>,
          ),
          c.key,
        ).toBe(c[locale]);
    },
  );
  it.each(["ar", "en"] as const)(
    "preserves every existing catalogue value in %s",
    (locale) => {
      const catalogue: Record<string, unknown> = JSON.parse(
        JSON.stringify(locale === "ar" ? ar : en),
      );
      const workspace = catalogue.adminWorkspace as Record<string, unknown>;
      delete workspace.assessmentCoordination;
      delete workspace.evaluatorAssignment;
      delete workspace.resitCoordination;
      for (const key of ["previous", "next", "resit", "originalRequest"])
        delete (workspace.shared as Record<string, unknown>)[key];
      expect(hash(catalogue)).toBe(baseline.catalogueHashes[locale]);
    },
  );
  it("uses all new keys without dead keys or raw en/ar presentation mappings", () => {
    expect(
      [...new Set(files.flatMap((name) => audit(sources[name]).keys))].sort(),
    ).toEqual(baseline.cases.map((c) => c.key).sort());
    expect(baseline.cases).toHaveLength(83);
  });
  it("keeps Resit read-only and raw staff/student text paths in their original files", () => {
    const resit = sources[files[2]];
    expect(resit).not.toMatch(/useMutation|method:\s*["'](?:POST|PUT|DELETE)/);
    expect(resit).toContain("{item.reason}");
    expect(resit).toContain("{item.revocationReason}");
    expect(sources[files[1]]).toContain("{evaluation.status}");
  });
  it.each([
    ['t("assessmentCoordination.title")', '"Assessment coordination"'],
    ['t("evaluatorAssignment.assign")', '"إسناد"'],
    ['t("resitCoordination.title")', 'ar ? "متابعة" : "Resit history"'],
  ])("detects reintroduced copy %s", (before, after) => {
    const name = files.find((n) => sources[n].includes(before))!;
    expect(name).toBeDefined();
    expect(
      audit(sources[name].replace(before, after)).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ["const pageSize = 10", "const pageSize = 20"],
    ["refetchInterval: 60_000", "refetchInterval: 6000"],
    ["retry: false", "retry: true"],
    [
      'queryKey: ["assessment-coordination", status, expectedState, page]',
      'queryKey: ["assessment-coordination", status, page]',
    ],
    [
      "&expectedCompletionState=${expectedState}",
      "&expectedCompletionState=Overdue",
    ],
    ["setPage(1)", "setPage(2)"],
    ["reason: reason.trim()", "reason: reason"],
    ["reason.trim().length > 500", "reason.trim().length > 501"],
    ['method: "PUT"', 'method: "POST"'],
    [
      "expectedCompletionAtUtc: parsed.toISOString()",
      "expectedCompletionAtUtc: targetLocal",
    ],
    ["setSavedId(id)", "setSavedId(null)"],
    ['setAdjustedDueLocal("")', 'setAdjustedDueLocal("keep")'],
    [
      "reason: adjustmentReason.trim() || null",
      "reason: adjustmentReason.trim()",
    ],
    [
      "adjustmentReason.trim().length > 500",
      "adjustmentReason.trim().length > 501",
    ],
    ["item.effectiveRevisionDueAtUtc ??", "item.revisionDueAtUtc ??"],
    ["item.id.slice(0, 8)", "item.id.slice(0, 12)"],
    ['item.status === "PendingAssignment"', 'item.status === "Assigned"'],
    [
      "page * queue.data.pageSize >= queue.data.totalCount",
      "page * 20 >= queue.data.totalCount",
    ],
    ["item.unitArabicTitle", "item.unitEnglishTitle"],
    [
      "formatLocalizedDateTime(item.updatedAtUtc, locale)",
      "new Date(item.updatedAtUtc).toLocaleString()",
    ],
    ['"ACADEMIC_MAPPING_REQUIRED"', '"MAPPING_REQUIRED"'],
    ['"UNIT_SPECIALISM_REQUIRED"', '"UNIT_REQUIRED"'],
    ['"EVALUATOR_NOT_ELIGIBLE"', '"ELIGIBLE"'],
    ['"ASSIGNMENT_CONFLICT"', '"CONFLICT"'],
    ["teacherUserId: selected", 'teacherUserId: "other"'],
    ["onSuccess: onAssigned", "onSuccess: () => {}"],
    ["!selected || assign.isPending", "assign.isPending"],
    [
      'queryKey: ["eligible-evaluators", evaluation.id]',
      'queryKey: ["eligible-evaluators"]',
    ],
    ["&pageSize=10", "&pageSize=20"],
    ["item.revokedAtUtc\n            ?", "item.activatedAtUtc\n            ?"],
    [
      "originalEvaluationRequestId.slice(0, 8)",
      "originalEvaluationRequestId.slice(0, 9)",
    ],
    [
      "!authorizations.data?.hasNextPage || authorizations.isFetching",
      "!authorizations.data?.hasNextPage",
    ],
  ])("detects technical drift %s", (before, after) => {
    const name = files.find((n) => sources[n].includes(before))!;
    expect(name).toBeDefined();
    expect(contractHash(sources[name].replace(before, after))).not.toBe(
      baseline.contractHashes[name],
    );
  });
});
