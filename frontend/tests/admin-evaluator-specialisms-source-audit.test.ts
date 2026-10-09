import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import baseline from "./fixtures/admin-evaluator-specialisms-copy-baseline.json";
import {
  audit,
  contractHash,
  hash,
} from "./helpers/admin-evaluator-specialisms-i18n-audit";
const source = readFileSync(
  "src/features/admin/evaluator-specialism-management.tsx",
  "utf8",
);
describe("Evaluator specialism static copy and frozen base-main contracts", () => {
  it("has zero static bilingual, Arabic, English, inline bilingual or unclassified UI", () => {
    expect(audit(source)).toMatchObject({
      findings: [],
      staticBilingual: 0,
      staticArabic: 0,
      staticEnglish: 0,
      inlineBilingual: 0,
      dataBranches: 1,
    });
  });
  it("matches the entire technical AST including imports, data/state, layout and all guards", () => {
    expect(contractHash(source)).toBe(baseline.contractHash);
  });
  it("classifies every remaining locale use without changing either title-selection path", () => {
    expect(audit(source).localeUses).toEqual(baseline.before.localeUses);
    expect(source).toContain('const ar = locale === "ar"');
    expect(source).toContain("const locale = useLocale()");
  });
  it("uses exactly the 19 new keys and existing shared Previous/Next", () => {
    expect(audit(source).keys.sort()).toEqual(
      baseline.cases.map((c) => c.key).sort(),
    );
    expect(Object.keys(en.adminWorkspace.evaluatorSpecialisms)).toHaveLength(
      19,
    );
    expect(Object.keys(ar.adminWorkspace.evaluatorSpecialisms)).toHaveLength(
      19,
    );
  });
  it.each(["ar", "en"] as const)(
    "preserves all 21 historical wording cases in %s",
    (locale) => {
      const t = createTranslator({
        locale,
        messages: locale === "ar" ? ar : en,
        namespace: "adminWorkspace",
      });
      for (const c of baseline.cases)
        expect(t(c.key as Parameters<typeof t>[0]), c.key).toBe(c[locale]);
    },
  );
  it.each(["ar", "en"] as const)(
    "freezes the entire existing catalogue in %s",
    (locale) => {
      const catalogue: Record<string, unknown> = JSON.parse(
        JSON.stringify(locale === "ar" ? ar : en),
      );
      delete (catalogue.adminWorkspace as Record<string, unknown>)
        .evaluatorSpecialisms;
      expect(hash(catalogue)).toBe(baseline.catalogueHashes[locale]);
    },
  );
  it.each([
    ['t("evaluatorSpecialisms.title")', '"Raw UI title"'],
    ['t("evaluatorSpecialisms.loading")', '"جارٍ التحميل"'],
    ['t("evaluatorSpecialisms.grant")', 'ar ? "منح" : "Grant"'],
    [
      "ar ? item.arabicTitle : item.englishTitle",
      'ar ? item.arabicTitle : "Fallback Unit"',
    ],
    ['t("evaluatorSpecialisms.history")', '({ en: "History", ar: "سجل" }).en'],
  ])(
    "detects static or unclassified presentation reintroduced at %s",
    (before, after) => {
      expect(source).toContain(before);
      expect(
        audit(source.replace(before, after)).findings.length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([
    ['"evaluator-specialism-staff"', '"other-staff"'],
    ['"evaluator-specialism-units"', '"other-units"'],
    [
      '"evaluator-specialism-history", page',
      '"evaluator-specialism-history", 1',
    ],
    [
      "/admin/evaluator-specialisms/staff",
      "/admin/evaluator-specialisms/all-staff",
    ],
    [
      "/admin/evaluator-specialisms/units",
      "/admin/evaluator-specialisms/all-units",
    ],
    ["&pageSize=25", "&pageSize=10"],
    ['queryKey: ["eligible-evaluators"]', 'queryKey: ["evaluators"]'],
    ['queryKey: ["evaluator-specialism-history"]', 'queryKey: ["history"]'],
    ['method: "POST"', 'method: "PUT"'],
    [
      "JSON.stringify({ evaluatorUserId, unitDefinitionId })",
      "JSON.stringify({ teacherUserId: evaluatorUserId, unitDefinitionId })",
    ],
    ["JSON.stringify({ reason: null })", 'JSON.stringify({ reason: "" })'],
    ["/${id}/revoke", "/${id}/activate"],
    ['setSuccess("grant")', 'setSuccess("revoke")'],
    ['setSuccess("revoke")', 'setSuccess("grant")'],
    ["onError: () => setSuccess(null)", 'onError: () => setSuccess("grant")'],
    ["staff.isPending || staff.isError", "staff.isPending || units.isError"],
    ["units.isPending || units.isError", "units.isPending || staff.isError"],
    [
      "!evaluatorUserId || !unitDefinitionId || grant.isPending",
      "!evaluatorUserId || grant.isPending",
    ],
    [
      "staff.isPending || units.isPending || history.isPending",
      "staff.isPending || units.isPending || grant.isPending",
    ],
    ["grant.isError ||", "grant.isPending ||"],
    [
      "!history.isPending && history.data?.items.length === 0",
      "history.data?.items.length === 0",
    ],
    [
      "ar ? item.arabicTitle : item.englishTitle",
      "academicText(locale, item.arabicTitle, item.englishTitle)",
    ],
    ["item.unitArabicTitle,", "item.unitEnglishTitle,"],
    [
      "formatLocalizedDateTime(item.grantedAtUtc, locale)",
      'formatLocalizedDateTime(item.grantedAtUtc, "en")',
    ],
    [
      "formatLocalizedDateTime(item.revokedAtUtc, locale)",
      "new Date(item.revokedAtUtc).toLocaleString()",
    ],
    [
      "disabled={revoke.isPending}",
      "disabled={revoke.isPending && revoke.variables === item.id}",
    ],
    ["revoke.isPending && revoke.variables === item.id", "revoke.isPending"],
    [
      "(history.data?.totalCount ?? 0) > 25",
      "(history.data?.totalCount ?? 0) > 10",
    ],
    ["disabled={page <= 1}", "disabled={page < 1}"],
    [
      "page * 25 >= (history.data?.totalCount ?? 0)",
      "page * 10 >= (history.data?.totalCount ?? 0)",
    ],
    ["setPage(page - 1)", "setPage(page - 2)"],
    ["setPage(page + 1)", "setPage(page + 2)"],
    ["item.evaluatorName", "item.evaluatorUserId"],
    ['className="shell py-10"', 'className="shell py-5"'],
    ["const locale = useLocale()", 'const locale = "en"'],
  ])("detects technical contract drift at %s", (before, after) => {
    expect(source).toContain(before);
    expect(contractHash(source.replace(before, after))).not.toBe(
      baseline.contractHash,
    );
  });
});
