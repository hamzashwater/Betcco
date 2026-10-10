import { describe, expect, it } from "vitest";
import ts from "typescript";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import baseline from "./fixtures/admin-final-i18n-baseline.json";
import { withoutFinalAdminAdditions } from "./helpers/admin-final-catalogue-projection";
import {
  auditFile,
  catalogue,
  contentContract,
  digest,
  inventory,
  leaves,
  read,
  wholeAudit,
  type Exception,
} from "./helpers/admin-final-i18n-audit";

const exceptions = baseline.exceptions as Record<string, Exception[]>;
const reports = wholeAudit(exceptions);
const debt = (findings: (typeof reports)[number]["findings"]) =>
  findings.filter((f) =>
    ["STATIC_UI", "ACCESSIBILITY_STATIC_UI", "UNCLASSIFIED"].includes(
      f.category,
    ),
  );
const messages = Object.fromEntries(
  ["ar", "en"].map((locale) => [
    locale,
    catalogue(read(`messages/${locale}.json`)),
  ]),
);
const flattened = {
  ar: leaves(messages.ar.value),
  en: leaves(messages.en.value),
};

describe("final whole-Admin i18n gate", () => {
  it("recursively audits the exact live inventory and rejects an unreviewed new file", () => {
    expect(reports.map((r) => r.file)).toEqual(
      Object.keys(baseline.hashes).sort(),
    );
    expect(reports.map((r) => r.file)).toEqual(
      inventory()
        .map((path) => basename(path))
        .sort(),
    );
    const directory = mkdtempSync(join(tmpdir(), "betcco-admin-audit-"));
    try {
      mkdirSync(join(directory, "nested"));
      writeFileSync(join(directory, "root.tsx"), "export {};");
      writeFileSync(join(directory, "nested", "new.tsx"), "export {};");
      writeFileSync(join(directory, "ignore.ts"), "export {};");
      expect(
        inventory(directory)
          .map((path) => basename(path))
          .sort(),
      ).toEqual(["new.tsx", "root.tsx"]);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
  it.each(reports)(
    "classifies every literal and locale consumer in $file",
    (report) => {
      expect(debt(report.findings)).toEqual([]);
      expect(report.references.length).toBeGreaterThan(0);
      expect(report.findings.every((f) => f.reason.length > 0)).toBe(true);
      expect(
        report.branches.every((f) =>
          ["SERVER_BILINGUAL_DATA", "LOCALE_DIRECTION"].includes(f.category),
        ),
      ).toBe(true);
    },
  );
  it.each(reports)(
    "freezes all non-copy contracts in $file against live base",
    (report) => {
      const source = read(`src/features/admin/${report.file}`);
      if (report.file === "content-studio.tsx")
        expect(contentContract(source)).toEqual(baseline.contentContract);
      else
        expect(digest(source)).toBe(
          baseline.hashes[report.file as keyof typeof baseline.hashes],
        );
    },
  );
  it("validates full JSON shape, duplicates, every static and finite dynamic reference in both languages", () => {
    expect(messages.ar.duplicates).toEqual([]);
    expect(messages.en.duplicates).toEqual([]);
    expect(Object.keys(flattened.ar).sort()).toEqual(
      Object.keys(flattened.en).sort(),
    );
    for (const report of reports) {
      for (const namespace of report.namespaces)
        expect(
          Object.keys(flattened.ar).some((key) =>
            key.startsWith(namespace + "."),
          ),
        ).toBe(true);
      for (const reference of report.references)
        for (const key of reference.keys)
          for (const locale of ["ar", "en"] as const)
            expect(
              flattened[locale][`${reference.namespace}.${key}`],
              `${report.file}:${reference.line} ${reference.namespace}.${key} ${locale}`,
            ).toBeTypeOf("string");
    }
    const dynamic = reports.flatMap((r) =>
      r.references.filter((ref) => ref.dynamic),
    );
    expect(dynamic).toHaveLength(7);
    expect(
      dynamic.find((r) => r.expression.includes("issueKeys"))?.keys.sort(),
    ).toEqual(
      [
        "draft",
        "missingSource",
        "missingAims",
        "missingCriteria",
        "inactiveVersion",
        "invalidMapping",
        "duplicateCriterion",
        "rubricMismatch",
        "rubricCriteriaMismatch",
      ].sort(),
    );
    expect(
      dynamic
        .filter((r) => r.expression.includes("outcomeLabels"))
        .every((r) => r.keys.length === 3),
    ).toBe(true);
  });
  it.each(["ar", "en"] as const)(
    "freezes every pre-existing %s message value; permits exactly one new fallback key",
    (locale) => {
      const projected = JSON.parse(JSON.stringify(messages[locale].value)) as {
        adminContent: Record<string, string>;
      };
      expect(projected.adminContent.requestFailed).toBe(
        locale === "ar" ? "تعذر إتمام الطلب." : "Request failed.",
      );
      delete projected.adminContent.requestFailed;
      expect(digest(JSON.stringify(projected))).toBe(
        baseline.messages[locale].canonicalHash,
      );
    },
  );
  it("detects duplicated escaped keys and permits the same name in separate objects", () => {
    expect(
      catalogue('{"a":{"key":1,"k\\u0065y":2},"b":{"key":3}}').duplicates,
    ).toEqual(["key"]);
  });
  it("keeps historical freezes sensitive to old-value drift and unrelated additions", () => {
    const original = JSON.parse(JSON.stringify(messages.en.value)) as Record<
      string,
      unknown
    >;
    const projected = digest(
      JSON.stringify(withoutFinalAdminAdditions(structuredClone(original))),
    );
    const changed = structuredClone(original);
    (changed.adminContent as Record<string, unknown>).saved =
      "Changed old wording";
    expect(
      digest(JSON.stringify(withoutFinalAdminAdditions(changed))),
    ).not.toBe(projected);
    const unrelated = structuredClone(original);
    (unrelated.adminContent as Record<string, unknown>).unreviewed =
      "New unrelated key";
    expect(
      digest(JSON.stringify(withoutFinalAdminAdditions(unrelated))),
    ).not.toBe(projected);
    const invalid = structuredClone(original);
    (invalid.adminContent as Record<string, unknown>).requestFailed =
      "Wrong new wording";
    expect(() => withoutFinalAdminAdditions(invalid)).toThrow(
      "Unverified final Admin fallback value",
    );
  });
});

function synthetic(source: string) {
  const name = "mutation.tsx";
  const options: ts.CompilerOptions = {
    noLib: true,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (fileName) =>
    fileName === name
      ? ts.createSourceFile(
          name,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
      : undefined;
  const program = ts.createProgram([name], options, host);
  return auditFile(program.getSourceFile(name)!, program.getTypeChecker());
}
describe("audit mutation resistance", () => {
  it.each([
    "<button>Untranslated English</button>",
    "<p>نص غير مترجم</p>",
    '<span className="sr-only">Hidden English</span>',
    '<p>{"String child"}</p>',
    '<input placeholder="Search students" />',
    '<img alt="Teacher portrait" />',
    '<p title="Tooltip copy" />',
    '<button aria-label="Close modal" />',
    '<p aria-description="Long description" />',
    '<p>{ar ? "نص" : "English"}</p>',
    "<p>{ar ? `Hello ${name}` : `مرحبا ${name}`}</p>",
    'const labels = { ar: "نص", en: "Label" };',
    'const labels = ["Loading", "Empty"];',
    'function helper() { return "Helper copy"; }',
    "const message = `Welcome ${name}`;",
    'const options = [{ value: "TechnicalId", label: "Display label" }];',
    '<button onClick={() => setNotice("Unexpected English")}>—</button>',
    'function helper() { return ar ? { label: "Arabic" } : { label: "English" }; }',
    'const t = useTranslations("adminWorkspace"); t(unboundedKey);',
  ])("rejects new static/unclassified presentation: %s", (source) => {
    expect(debt(synthetic(source).findings).length).toBeGreaterThan(0);
  });
  it.each(reports.map((r) => r.file))(
    "cannot hide future English/Arabic/accessibility copy in existing %s",
    (file) => {
      const injected =
        read(`src/features/admin/${file}`) +
        '\nfunction Regression() { return <><p>Future English</p><p>نص جديد</p><img alt="Future alt" /></>; }';
      const result = synthetic(injected);
      expect(
        result.findings
          .filter((f) =>
            ["Future English", "نص جديد", "Future alt"].includes(f.text),
          )
          .map((f) => f.category),
      ).toEqual(["STATIC_UI", "STATIC_UI", "ACCESSIBILITY_STATIC_UI"]);
    },
  );
  it("classifies paired server fields and direction without allowing unrelated locale copy", () => {
    const result = synthetic(
      '<><p>{locale === "ar" ? item.arabicTitle : item.englishTitle}</p><p dir={locale === "ar" ? "rtl" : "ltr"} /><p>{locale === "ar" ? "New Arabic" : "New English"}</p></>',
    );
    expect(result.branches.map((b) => b.category)).toEqual([
      "SERVER_BILINGUAL_DATA",
      "LOCALE_DIRECTION",
      "STATIC_UI",
    ]);
  });
  it("derives finite maps/templates from source rather than catalogue-prefix guesses", () => {
    const result = synthetic(
      'const map = { A: "known", B: "missing" }; const t = useTranslations("adminWorkspace"); t(map[id] ?? "fallback"); const outcome: "Pass" | "Merit" = "Pass" as "Pass" | "Merit"; t(`outcome.${outcome}`);',
    );
    expect(result.references.map((r) => r.keys)).toEqual([
      ["known", "missing", "fallback"],
      ["outcome.Pass", "outcome.Merit"],
    ]);
    expect(
      result.references[0].keys.some(
        (key) => flattened.en[`adminWorkspace.${key}`] === undefined,
      ),
    ).toBe(true);
  });
  it("does not exempt a technical identifier moved into human-facing JSX", () => {
    expect(
      debt(synthetic("<button>Submitted</button>").findings)[0].category,
    ).toBe("STATIC_UI");
  });
  it("cannot erase endpoint, payload, guard, status, invalidation or raw-error drift", () => {
    const source = read("src/features/admin/content-studio.tsx");
    for (const [from, to] of [
      ['"/admin/content/blog"', '"/admin/content/other"'],
      ['method: "POST"', 'method: "DELETE"'],
      ["JSON.stringify(article)", "JSON.stringify({})"],
      ["Boolean(attendanceSessionId)", "true"],
      ['"admin-content-blog"', '"changed-key"'],
      ["error.message", '"Masked error"'],
      ['"Present"', '"Absent"'],
    ])
      expect(contentContract(source.replace(from, to)).hash).not.toBe(
        baseline.contentContract.hash,
      );
    expect(contentContract(source).slots).toBe(5);
  });
});
