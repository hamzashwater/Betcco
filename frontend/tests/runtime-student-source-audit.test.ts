import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/runtime-student-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import { withoutRuntimeStudentAdditions } from "./helpers/runtime-student-catalogue-projection";
import {
  errorOccurrences,
  functionSource,
  reconcileRuntimeStudent,
  runtimeStudentFiles,
  type RuntimeSources,
} from "./helpers/runtime-student-i18n-audit";

const read = (path: string) => readFileSync(path, "utf8");
const sources = Object.fromEntries(
  runtimeStudentFiles.map((path) => [path, read(path)]),
) as RuntimeSources;
const catalogues = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};

describe("T7-A6.7 six-occurrence reconciliation", () => {
  it("pins the independent approved inventory, source snapshots and classifications", () => {
    expect(baseline.base).toBe("43eeb52845296e2ab73814d7b490d0dc5b8d9df3");
    expect(digest(JSON.stringify(baseline))).toBe(
      "3e3f292f646448a6f9a68f2d8cefbea33cfa783700c5103b152a758b5f6acca3",
    );
    expect(
      baseline.selectedReports.flatMap((report) => report.findings),
    ).toHaveLength(3);
    expect(
      baseline.selectedReports.flatMap((report) => report.guards),
    ).toHaveLength(3);
    expect(baseline.records.map((record) => record.baselineCategory)).toEqual([
      "STATIC_UI",
      "STATIC_UI",
      "STATIC_UI",
      "UNCLASSIFIED",
      "UNCLASSIFIED",
      "UNCLASSIFIED",
    ]);
    expect(baseline.records.map((record) => record.finalCategory)).toEqual([
      "TECHNICAL_RUNTIME_ERROR_FALLBACK",
      "TECHNICAL_RUNTIME_ERROR_FALLBACK",
      "TECHNICAL_RUNTIME_ERROR_FALLBACK",
      "STATIC_UI_LOCALIZED",
      "STATIC_UI_LOCALIZED",
      "TECHNICAL_CLIENT_GUARD_NON_PRESENTATION",
    ]);
  });

  it("independently rediscovers all six executable error expressions in original scopes", () => {
    const discovered = [
      ...errorOccurrences(baseline.sources.api),
      ...errorOccurrences(baseline.sources.coursework),
      ...errorOccurrences(baseline.sources.resit),
    ];
    expect(discovered).toEqual(
      baseline.records.map(({ owner, text, parent }) => ({
        owner,
        text,
        parent,
      })),
    );
    expect(
      baseline.selectedReports
        .flatMap((report) => report.findings)
        .filter((record) => record.category === "ACCESSIBILITY_STATIC_UI"),
    ).toEqual([]);
  });

  it("accepts only two static guard expressions and reconciles presentation residuals to 0/0/0", () => {
    expect(reconcileRuntimeStudent(sources)).toMatchObject({
      violations: [],
      presentationResiduals: {
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      },
    });
    const original = baseline.sources.coursework;
    const approved = baseline.replacements
      .reduce(
        (text, replacement) => text.replace(replacement.from, replacement.to),
        original,
      )
      .replace(
        'if (!active)\n        throw new Error(t("coursework.errors.startBeforeUpload"));',
        'if (!active) throw new Error(t("coursework.errors.startBeforeUpload"));',
      );
    expect(
      functionSource(
        sources["src/features/student/student-area.tsx"],
        "CourseAssignmentPanel",
      ),
    ).toBe(approved);
  });

  it.each(["ar", "en"] as const)(
    "adds only the two paired %s keys without changing/removing existing values",
    (locale) => {
      const value = catalogues[locale].value as Record<string, unknown>;
      const flat = leaves(value);
      const additions = baseline.catalogues[locale].additions;
      expect(Object.keys(additions)).toEqual([
        "startBeforeUpload",
        "startBeforeSubmit",
      ]);
      for (const [key, text] of Object.entries(additions))
        expect(flat[`studentWorkspace.coursework.errors.${key}`]).toBe(text);
      const restored = withoutRuntimeStudentAdditions(structuredClone(value));
      expect(digest(JSON.stringify(restored, null, 2) + "\n")).toBe(
        baseline.catalogues[locale].originalHash,
      );
      expect(catalogues[locale].duplicates).toEqual([]);
    },
  );

  it("has full parity and detects changed additions or unrelated old values", () => {
    expect(Object.keys(leaves(catalogues.ar.value)).sort()).toEqual(
      Object.keys(leaves(catalogues.en.value)).sort(),
    );
    expect(catalogue('{"a":1,"a":2}').duplicates).toEqual(["a"]);
    const value = JSON.parse(JSON.stringify(catalogues.en.value));
    value.studentWorkspace.coursework.errors.startBeforeUpload =
      "Changed guard";
    expect(() => withoutRuntimeStudentAdditions(value)).toThrow(
      "Unverified Student guard additions",
    );
    const old = JSON.parse(JSON.stringify(catalogues.en.value));
    old.studentWorkspace.coursework.errors.action = "Changed old copy";
    expect(
      digest(
        JSON.stringify(withoutRuntimeStudentAdditions(old), null, 2) + "\n",
      ),
    ).not.toBe(baseline.catalogues.en.originalHash);
  });
});

const apiPath = "src/lib/api.ts";
const studentPath = "src/features/student/student-area.tsx";
const resitPath = "src/features/student/student-resit-workflow.tsx";
const mutations: [string, keyof RuntimeSources, string, string][] = [
  [
    "upload copy reintroduced",
    studentPath,
    't("coursework.errors.startBeforeUpload")',
    '"Start the submission before uploading files."',
  ],
  [
    "submit copy reintroduced",
    studentPath,
    't("coursework.errors.startBeforeSubmit")',
    '"Start the submission before submitting."',
  ],
  [
    "dynamic translation key",
    studentPath,
    't("coursework.errors.startBeforeUpload")',
    't("coursework.errors." + "startBeforeUpload")',
  ],
  [
    "upload guard weakened",
    studentPath,
    'if (!active) throw new Error(t("coursework.errors.startBeforeUpload"))',
    'if (false) throw new Error(t("coursework.errors.startBeforeUpload"))',
  ],
  [
    "submit guard weakened",
    studentPath,
    'if (!active) throw new Error(t("coursework.errors.startBeforeSubmit"))',
    'if (false) throw new Error(t("coursework.errors.startBeforeSubmit"))',
  ],
  [
    "raw error sink changed",
    studentPath,
    "(upload.error ?? submit.error)?.message",
    't("coursework.errors.action")',
  ],
  [
    "same technical text injected into UI",
    studentPath,
    '{t("coursework.title")}',
    '{"Request failed."}',
  ],
  [
    "same technical text injected as a new error",
    studentPath,
    "const refresh = () => {",
    'const refresh = () => { throw new Error("Request failed.");',
  ],
  [
    "upload sequential loop",
    studentPath,
    "for (const file of files)",
    "for (const file of files.reverse())",
  ],
  [
    "FormData key",
    studentPath,
    'body.set("file", file)',
    'body.set("upload", file)',
  ],
  [
    "submission key",
    studentPath,
    '["student-course-assignment-submissions"]',
    '["changed-submissions"]',
  ],
  [
    "start payload",
    studentPath,
    "JSON.stringify({ comment })",
    "JSON.stringify({ comment, extra: true })",
  ],
  ["active reset", studentPath, "setActive(undefined)", "setActive(active)"],
  [
    "resit guard removed",
    resitPath,
    'if (!paymentSession?.provider.startsWith("Fake"))',
    "if (false)",
  ],
  [
    "resit provider broadened",
    resitPath,
    'provider.startsWith("Fake")',
    'provider.startsWith("PayTabs")',
  ],
  [
    "resit technical message",
    resitPath,
    '"No development test payment is available."',
    '"Changed technical message."',
  ],
  [
    "resit raw error presentation",
    resitPath,
    't("payment.confirmTestError")',
    "confirmDevelopmentPayment.error?.message",
  ],
  [
    "resit fake endpoint",
    resitPath,
    '"/payments/fake/confirm"',
    '"/payments/confirm"',
  ],
  ["resit idempotency", resitPath, '"Idempotency-Key"', '"Changed-Key"'],
  [
    "resit included-credit invariant",
    resitPath,
    "expectIncludedCredit: false",
    "expectIncludedCredit: true",
  ],
  ["resit event prefix", resitPath, "resit_test_", "other_test_"],
  ["resit payment method", resitPath, 'value="EWallet"', 'value="Other"'],
  [
    "API security fallback",
    apiPath,
    '"Unable to initialize request security."',
    '"Security failed."',
  ],
  [
    "API parse fallback",
    apiPath,
    'message: "Request failed."',
    'message: "Parse failed."',
  ],
  [
    "API final fallback",
    apiPath,
    'body.title ?? "Request failed."',
    'body.title ?? "Final failed."',
  ],
  [
    "API server precedence",
    apiPath,
    "body.message ?? body.detail ?? body.title",
    "body.title ?? body.detail ?? body.message",
  ],
  [
    "API antiforgery path",
    apiPath,
    '"/api/v1/security/antiforgery"',
    '"/api/v1/security/token"',
  ],
  ["API CSRF header", apiPath, '"X-CSRF-TOKEN"', '"X-OTHER-TOKEN"'],
  [
    "API safe methods",
    apiPath,
    '["GET", "HEAD", "OPTIONS"]',
    '["GET", "HEAD", "OPTIONS", "POST"]',
  ],
  [
    "API FormData exemption",
    apiPath,
    "!(options.body instanceof FormData)",
    "true",
  ],
  ["API JSON header", apiPath, '"application/json"', '"text/plain"'],
  ["API credentials", apiPath, 'credentials: "include"', 'credentials: "omit"'],
  ["API cache", apiPath, 'cache: "no-store"', 'cache: "default"'],
  ["API URL prefix", apiPath, "`/api/v1${path}`", "`/api/v2${path}`"],
  [
    "API exact stale status",
    apiPath,
    "response.status !== 400",
    "response.status !== 403",
  ],
  [
    "API exact stale title",
    apiPath,
    'body?.title === "Bad Request"',
    'body?.title === "bad request"',
  ],
  ["API stale message exclusion", apiPath, "&& !body.message", ""],
  ["API stale detail exclusion", apiPath, "&& !body.detail", ""],
  [
    "API token invalidation",
    apiPath,
    "invalidateCsrfToken();",
    "/* omitted */",
  ],
  [
    "API retry bound",
    apiPath,
    "if (requiresCsrf && (await isStaleCsrfResponse(response)))",
    "while (requiresCsrf && (await isStaleCsrfResponse(response)))",
  ],
  ["API 204", apiPath, "response.status === 204", "response.status === 200"],
  ["API code", apiPath, "body.code,", "undefined,"],
  ["API status", apiPath, "response.status,", "500,"],
];

describe("exact file/expression exclusions reject mutations and injection", () => {
  it.each(mutations)("detects %s", (_name, path, from, to) => {
    expect(sources[path]).toContain(from);
    const result = reconcileRuntimeStudent({
      ...sources,
      [path]: sources[path].replace(from, to),
    });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.presentationResiduals).toBeUndefined();
  });
});
