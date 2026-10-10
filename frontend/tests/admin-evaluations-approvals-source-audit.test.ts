import {
  restorePrebatchAdminFunctions,
  withoutFinalAdminAdditions,
} from "./helpers/admin-final-catalogue-projection";
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import baseline from "./fixtures/admin-evaluations-approvals-copy-baseline.json";
import {
  audit,
  contractHashes,
  functionsIn,
  hash,
  outsideScopeHash,
  owners,
} from "./helpers/admin-evaluations-approvals-i18n-audit";
const source = readFileSync("src/features/admin/admin-area.tsx", "utf8");
const result = audit(source);
describe("Admin evaluation/approval static copy and frozen contracts", () => {
  it("owns exactly three functions and preserves every byte outside their boundaries", () => {
    expect(functionsIn(source).functions.map((fn) => fn.name!.text)).toEqual(
      owners,
    );
    // The final-batch audit separately freezes both newly authorized bodies and
    // their entire outside AST. Reconstruct their original bytes for this audit.
    expect(outsideScopeHash(restorePrebatchAdminFunctions(source))).toBe(
      baseline.outsideScopeHash,
    );
  });
  it("has zero Arabic/English static UI literals or unclassified locale uses", () => {
    expect(result.findings).toEqual([]);
    expect(result.branches.filter((b) => b.kind === "STATIC_UI")).toEqual([]);
  });
  it("classifies all ten server selectors and the sole JOD formatter", () => {
    expect(
      result.branches.map((b) => [
        b.owner,
        b.kind,
        b.text.replace(/\s+/g, " "),
      ]),
    ).toEqual([
      [
        "CourseApprovals",
        "SERVER_BILINGUAL_DATA",
        'locale === "ar" ? course.arabicTitle : course.englishTitle',
      ],
      [
        "CourseApprovals",
        "SERVER_BILINGUAL_DATA",
        'locale === "ar" ? course.subjectArabicName : course.subjectEnglishName',
      ],
      ...[
        "course.arabicTitle : course.englishTitle",
        "course.arabicDescription : course.englishDescription",
        "module.arabicTitle : module.englishTitle",
        "lesson.arabicTitle : lesson.englishTitle",
        "lesson.arabicBody : lesson.englishBody",
        "assignment.arabicTitle : assignment.englishTitle",
        "assignment.arabicInstructions : assignment.englishInstructions",
        "criterion.arabicDescription : criterion.englishDescription",
      ].map((pair) => [
        "CourseApprovalPreview",
        "SERVER_BILINGUAL_DATA",
        `locale === "ar" ? ${pair}`,
      ]),
    ]);
    expect(result.formatters).toEqual([
      'formatLocalizedCurrency(course.price, "JOD", locale)',
    ]);
    expect(result.technical).toContain("Needs revision");
  });
  it("freezes all API, query, payload, guard, state, data and layout contracts", () => {
    expect(contractHashes(source)).toEqual(baseline.contractHashes);
  });
  it("keeps section interpolation and the mixed cover alt data arguments exact", () => {
    expect(source).toMatch(
      /t\("evaluations.section",\s*\{\s*section: section.section,?\s*\}\)/,
    );
    expect(source).toMatch(
      /t\("courseApprovalPreview.coverAlt",\s*\{\s*title: locale === "ar" \? course.arabicTitle : course.englishTitle,?\s*\}\)/,
    );
  });
  it.each(["ar", "en"] as const)(
    "preserves historical wording and approved newly localized fallbacks in %s",
    (locale) => {
      const t = createTranslator({
        locale,
        messages: locale === "ar" ? ar : en,
        namespace: "adminWorkspace",
      });
      for (const entry of baseline.cases)
        expect(
          t(
            entry.key as Parameters<typeof t>[0],
            entry.values as Record<string, string | number>,
          ),
          entry.key,
        ).toBe(entry[locale]);
    },
  );
  it.each(["ar", "en"] as const)(
    "preserves every pre-existing catalogue value in %s",
    (locale) => {
      const catalogue: Record<string, unknown> = JSON.parse(
        JSON.stringify(locale === "ar" ? ar : en),
      );
      const workspace = catalogue.adminWorkspace as Record<string, unknown>;
      // Freeze the original pre-A5.5.3 partition as later slices extend it.
      const original = Object.fromEntries(
        Object.entries(workspace).filter(([key]) =>
          [
            "shared",
            "dashboard",
            "navigation",
            "analytics",
            "students",
            "teacherInvites",
            "accountIdentities",
          ].includes(key),
        ),
      );
      original.shared = Object.fromEntries(
        Object.entries(workspace.shared as Record<string, unknown>).filter(
          ([key]) => ["open", "loadingIndicator", "cancel"].includes(key),
        ),
      );
      catalogue.adminWorkspace = original;
      expect(hash(withoutFinalAdminAdditions(catalogue))).toBe(
        baseline.existingCatalogueHashes[locale],
      );
    },
  );
  it("uses every added key and shared loading indicator without dead keys", () => {
    expect([...new Set(result.keys)].sort()).toEqual(
      [
        ...new Set([
          ...baseline.cases.map((c) => c.key),
          "shared.loadingIndicator",
        ]),
      ].sort(),
    );
  });
  it.each([
    ['t("evaluations.title")', '"Assign evaluations"'],
    ['t("courseApprovals.publish")', '"نشر الدورة"'],
    ['t("courseApprovalPreview.free")', 'locale === "ar" ? "مجانية" : "Free"'],
    ['t("courseApprovalPreview.minutes")', '"min"'],
  ])("detects static copy reintroduction: %s", (before, after) => {
    expect(source).toContain(before);
    expect(
      audit(source.replace(before, after)).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ['"LeadInternalVerifier"', '"Teacher"'],
    ["refetchInterval: 10_000", "refetchInterval: 1000"],
    ["enabled: canVerify", "enabled: true"],
    ['"/evaluations/pending-assignment"', '"/evaluations/assigned"'],
    [
      "comment: verificationNotes[requestId] || null",
      "comment: verificationNotes[requestId]?.trim() || null",
    ],
    ["resubmissionDueAtUtc: approve", "resubmissionDueAtUtc: !approve"],
    ["maxLength={4000}", "maxLength={2000}"],
    [
      '!(verificationNotes[evaluation.id] ?? "").trim()',
      "!verificationNotes[evaluation.id]",
    ],
    ['"assessment-coordination"', '"assessment"'],
    [
      'reason: approved ? null : reasons[id] || "Needs revision"',
      'reason: reasons[id] || "Needs revision"',
    ],
    ['"Needs revision"', '"يحتاج تعديلاً"'],
    ["selectedCourseId !== course.id || review.isPending", "review.isPending"],
    ["setSelectedCourseId(undefined)", 'setSelectedCourseId("course-1")'],
    ["review.error ?? publish.error", "publish.error ?? review.error"],
    ['course.status === "SubmittedForReview"', 'course.status === "Approved"'],
    ["{outcome.englishText}", "{outcome.arabicText}"],
    [
      "Math.round(lesson.durationSeconds / 60)",
      "Math.floor(lesson.durationSeconds / 60)",
    ],
    [
      'assignment.allowedFileExtensions.join(", ").toUpperCase()',
      'assignment.allowedFileExtensions.join(", ")',
    ],
    ['"JOD", locale', '"USD", locale'],
    ["resources/${resource.id}", "resources/${course.id}"],
    ["verify.error.message", '"Hidden error"'],
    ["course.arabicDescription", "course.englishDescription"],
  ])("detects technical contract drift: %s", (before, after) => {
    expect(source).toContain(before);
    const { file, functions } = functionsIn(source);
    const owner = functions.find((fn) => fn.getText(file).includes(before))!;
    expect(owner).toBeDefined();
    const changed =
      source.slice(0, owner.getStart(file)) +
      owner.getText(file).replace(before, after) +
      source.slice(owner.end);
    expect(contractHashes(changed)).not.toEqual(baseline.contractHashes);
  });
});
