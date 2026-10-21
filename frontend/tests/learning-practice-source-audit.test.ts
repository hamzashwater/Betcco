import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/learning-practice-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import {
  assertPracticeScope,
  auditPractice,
  practiceContract,
  practiceFiles,
  replayPracticeMigration,
} from "./helpers/learning-practice-i18n-audit";
import { withoutLearningPracticeAdditions } from "./helpers/learning-practice-catalogue-projection";
import { withoutPublicPurchaseAdditions } from "./helpers/public-purchase-catalogue-projection";
import { withoutPublicTrustAdditions } from "./helpers/public-trust-catalogue-projection";
import { withoutPublicDiscoveryAdditions } from "./helpers/public-discovery-catalogue-projection";
import { projectTeacherAuthoringSource } from "./helpers/teacher-authoring-projection";

const read = (path: string) => readFileSync(path, "utf8");
const catalogues = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};
const catalogueLeaves = {
  ar: leaves(catalogues.ar.value),
  en: leaves(catalogues.en.value),
};
const approvedContracts = Object.fromEntries(
  practiceFiles.map((path) => [
    path,
    practiceContract(baseline.approvedSources[path]),
  ]),
);

describe("T7-A6.5 Learning Practice", () => {
  it("pins both approved original sources and the unchanged 105/0/4 inventory", () => {
    expect(Object.keys(baseline.sources)).toEqual(practiceFiles);
    expect(practiceFiles.map((path) => digest(baseline.sources[path]))).toEqual(
      [
        "155aa660f07dbf111b1b3bc34bf07c8bd1c9b76d5345b43dd3f3192bef7f688c",
        "b4d88b652d2fb719d19b621f6a0bc383f42edd26b8d639406f7e1b6e139c3b7d",
      ],
    );
    expect(digest(JSON.stringify(baseline.records))).toBe(
      "00040f1c30f4f400f416cc04fb7dd265aa44bd14b37101be31189c58752df368",
    );
    expect(
      practiceFiles.map(
        (path) =>
          baseline.records[path].filter(
            (record) => record.category === "STATIC_UI",
          ).length,
      ),
    ).toEqual([44, 61]);
    expect(
      Object.values(baseline.records)
        .flat()
        .filter((record) => record.category === "ACCESSIBILITY_STATIC_UI"),
    ).toEqual([]);
    expect(
      Object.values(baseline.guards)
        .flat()
        .map((guard) => [
          guard.line,
          guard.text,
          guard.classification,
          guard.finalClassification,
          guard.userVisible,
        ]),
    ).toEqual([
      [
        124,
        "No active submission",
        "UNCLASSIFIED_CLIENT_GUARD_ERROR",
        "STATIC_UI",
        true,
      ],
      [
        141,
        "No active submission",
        "UNCLASSIFIED_CLIENT_GUARD_ERROR",
        "STATIC_UI",
        true,
      ],
      [
        173,
        "No active practice submission",
        "UNCLASSIFIED_CLIENT_GUARD_ERROR",
        "STATIC_UI",
        true,
      ],
      [
        190,
        "No active practice submission",
        "UNCLASSIFIED_CLIENT_GUARD_ERROR",
        "STATIC_UI",
        true,
      ],
    ]);
  });
  it.each(practiceFiles)(
    "independently reproduces original copy occurrences and guards: %s",
    (path) => {
      const source = baseline.sources[path];
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const counted: number[] = [],
        guards: number[] = [];
      function walk(node: ts.Node) {
        const line =
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "tr" &&
          node.arguments.length === 3 &&
          ts.isStringLiteral(node.arguments[1]) &&
          ts.isStringLiteral(node.arguments[2])
        )
          counted.push(line);
        if (ts.isStringLiteral(node)) {
          if (
            ts.isBinaryExpression(node.parent) &&
            node.parent.operatorToken.kind ===
              ts.SyntaxKind.QuestionQuestionToken &&
            node.parent.right === node &&
            /(?:arabic|english|Arabic|English)Title/.test(
              node.parent.left.getText(file),
            )
          )
            counted.push(line);
          if (ts.isPropertyAssignment(node.parent)) {
            let parent: ts.Node | undefined = node.parent;
            while (parent && !ts.isFunctionDeclaration(parent))
              parent = parent.parent;
            if (
              parent &&
              ts.isFunctionDeclaration(parent) &&
              ["practiceStatus", "trainingOutcomeLabel"].includes(
                parent.name?.text ?? "",
              )
            )
              counted.push(line);
          }
          if (
            ts.isNewExpression(node.parent) &&
            node.parent.expression.getText(file) === "Error" &&
            node.text.startsWith("No active")
          )
            guards.push(line);
        }
        ts.forEachChild(node, walk);
      }
      walk(file);
      expect(counted.sort((a, b) => a - b)).toEqual(
        baseline.records[path]
          .map((record) => record.line)
          .sort((a, b) => a - b),
      );
      expect(guards).toEqual(baseline.guards[path].map((guard) => guard.line));
    },
  );
  it("freezes exact copy slots/wiring independently from the final syntax proof", () => {
    expect(
      practiceFiles.map((path) => digest(baseline.approvedSources[path])),
    ).toEqual([
      "c19bc4b16612c4b8bda275a63d2a0ae751d0b3813477249f35de6e4531c63331",
      "3ba2209b2dca7634cd801118e01d4db228690ccfcd6acd0f4c2f2a1bf5886955",
    ]);
    expect(
      digest(
        JSON.stringify({
          replacements: baseline.replacements,
          wiring: baseline.wiring,
        }),
      ),
    ).toBe("219a095f31a165eba6384b1077dadbac621421ffa58babca93e0d43599e74439");
    for (const path of practiceFiles) {
      expect(
        baseline.replacements[path]
          .map((edit) => edit.recordLine)
          .sort((a, b) => a - b),
      ).toEqual(
        [...baseline.records[path], ...baseline.guards[path]]
          .map((item) => item.line)
          .sort((a, b) => a - b),
      );
      for (const edit of baseline.replacements[path])
        expect(baseline.sources[path].slice(edit.start, edit.end)).toBe(
          edit.original,
        );
      expect(practiceContract(replayPracticeMigration(path))).toBe(
        approvedContracts[path],
      );
    }
  });
  it.each(practiceFiles)(
    "zero residuals, bounded references and unchanged complete contract: %s",
    (path) => {
      const source = read(path),
        audit = auditPractice(source, path);
      expect(audit.findings).toEqual([]);
      expect(audit.counts).toEqual({
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      });
      expect(practiceContract(source)).toBe(approvedContracts[path]);
      expect(
        practiceContract(
          projectTeacherAuthoringSource(source, path).replace(
            '"use client";',
            '"use client";\n// harmless formatting',
          ),
        ),
      ).toBe(approvedContracts[path]);
      for (const reference of audit.references)
        for (const locale of ["ar", "en"] as const)
          expect(typeof catalogueLeaves[locale][reference]).toBe("string");
      const categories = new Set(audit.retained.map((item) => item.category));
      for (const category of [
        "SERVER_BILINGUAL_DATA",
        "RAW_USER_CONTENT",
        "RAW_SERVER_CONTENT",
        "RAW_SERVER_ERROR",
        "RAW_STAFF_FEEDBACK",
        "LOCALE_FORMATTER",
      ])
        expect(categories.has(category)).toBe(true);
    },
  );
  it("exact authorized scope excludes AI/RAG, backend, CI and dependencies", () => {
    const paths = practiceFiles.map((path) => `frontend/${path}`);
    expect(() =>
      assertPracticeScope([
        ...paths,
        "frontend/messages/ar.json",
        "frontend/messages/en.json",
        "frontend/tests/learning-practice-source-audit.test.ts",
      ]),
    ).not.toThrow();
    for (const extra of [
      "frontend/src/features/student/ai-practice-shell.tsx",
      "frontend/src/features/student/student-area.tsx",
      "backend/Betcco.Api/Program.cs",
      ".github/workflows/quality.yml",
      "frontend/pnpm-lock.yaml",
    ])
      expect(() => assertPracticeScope([...paths, extra])).toThrow();
  });
  it("exact shape parity, zero duplicate keys, complete static references and original pairs", () => {
    expect(Object.keys(catalogueLeaves.ar).sort()).toEqual(
      Object.keys(catalogueLeaves.en).sort(),
    );
    expect(catalogues.ar.duplicates).toEqual([]);
    expect(catalogues.en.duplicates).toEqual([]);
    expect(catalogue('{"a":"one","a":"two"}').duplicates).not.toEqual([]);
    const references = practiceFiles.flatMap(
      (path) => auditPractice(read(path), path).references,
    );
    expect(
      [
        ...new Set(
          references.filter((key) => key.startsWith("learningPractice.")),
        ),
      ].sort(),
    ).toEqual(
      Object.keys(catalogueLeaves.en)
        .filter((key) => key.startsWith("learningPractice."))
        .sort(),
    );
    const additions = {
      ar: Object.values(leaves(baseline.catalogues.ar.additions)),
      en: Object.values(leaves(baseline.catalogues.en.additions)),
    };
    for (const record of Object.values(baseline.records).flat())
      if ("ar" in record && "en" in record) {
        expect(additions.ar).toContain(record.ar);
        expect(additions.en).toContain(record.en);
      }
  });
  it.each(["ar", "en"] as const)(
    "exact %s additions, zero existing-value changes/removals",
    (locale) => {
      const value = catalogues[locale].value as Record<string, unknown>;
      expect(leaves(value.learningPractice)).toEqual(
        leaves(baseline.catalogues[locale].additions),
      );
      expect(
        digest(
          JSON.stringify(
            withoutLearningPracticeAdditions(structuredClone(value)),
          ),
        ),
      ).toBe(baseline.catalogues[locale].baseHash);
    },
  );
  it.each([
    "<p>Injected English UI</p>",
    "<p>نص عربي محقون</p>",
    "<label>Injected label</label>",
    '<input placeholder="Injected placeholder" />',
    '<button title="Injected tooltip" />',
    '<button aria-label="Injected accessible name" />',
    '<img alt="Injected alt" />',
    'function localCopy() { return "Helper copy"; }',
    'const map = { ar: "نص ثابت", en: "Static UI" };',
    "const copy = `Hello ${name}`;",
    'const fallback = error?.message ?? "Local failure";',
    'const copy = useTranslations("learningPractice"); copy(location.hash);',
    'const copy = useTranslations(location.hash); copy("aim.title");',
    "function label(t: PracticeTranslations, key: string) { return t(key); }",
  ])("detects injected presentation/unbounded copy: %s", (injected) => {
    for (const path of practiceFiles)
      expect(
        auditPractice(read(path) + "\n" + injected, path).findings.length,
      ).toBeGreaterThan(0);
  });
  it.each([
    ["/student/assignments/mine", "/student/assignments/changed"],
    [
      "/student/courses/${courseId}/learning-aim-practice",
      "/student/courses/${courseId}/changed",
    ],
    ['method: "POST"', 'method: "PUT"'],
    ['["learning-aim-practice", courseId]', '["changed-practice", courseId]'],
    ['["student-course-assignment-submissions"]', '["changed-submissions"]'],
    ["JSON.stringify({ comment })", "JSON.stringify({ note: comment })"],
    ["submissionId: result.submissionId", "submissionId: result.assignmentId"],
    ["if (!active)", "if (active)"],
    ["for (const file of files)", "for (const file of files.toReversed())"],
    ['body.set("file", file)', 'body.set("evidence", file)'],
    ["active.submissionId", "active.assignmentId"],
    ["units.isPending && !units.data", "units.isPending || !units.data"],
    ["units.isError && !units.data", "units.isError || !units.data"],
    ["!files.length ||", "files.length ||"],
    ["!uploaded.length ||", "uploaded.length ||"],
    ["setActive(undefined)", "setActive(active)"],
    ["unit.arabicTitle", "unit.id"],
    ["file.originalFileName", "file.displayName"],
    [
      "start.error ?? upload.error ?? submit.error",
      "upload.error ?? start.error ?? submit.error",
    ],
    [
      'accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.txt"',
      'accept=".pdf"',
    ],
    ["100 * 1024 * 1024", "10 * 1024 * 1024"],
    ["/api/v1/assignments/submissions/", "/api/v1/changed/submissions/"],
  ])("both complete contracts detect mutation %s", (before, after) => {
    for (const path of practiceFiles) {
      const source = read(path);
      expect(source).toContain(before);
      expect(practiceContract(source.replace(before, after))).not.toBe(
        approvedContracts[path],
      );
    }
  });
  it.each([
    [0, 'practice.status !== "Submitted"', 'practice.status === "Submitted"'],
    [0, "practice.isAvailable", "!practice.isAvailable"],
    [0, "practice.isTrainingComplete", "practice.trainingOutcome"],
    [0, "practice.strengths", "practice.assignmentId"],
    [0, "criterion.code", "criterion.id"],
    [
      1,
      "versionNumber: result.versionNumber",
      "versionNumber: result.submissionId",
    ],
    [
      1,
      "version.versionNumber === activeVersion",
      "version.versionNumber !== activeVersion",
    ],
    [1, "aim.canStartNewAttempt", "aim.isComplete"],
    [
      1,
      'aim.practiceStatus !== "Submitted"',
      'aim.practiceStatus === "Submitted"',
    ],
    [
      1,
      'locale === "ar" ? (arabic[status] ?? status) : status',
      'locale === "ar" ? arabic[status] : status',
    ],
    [1, "aim.strengths", "aim.assignmentId"],
    [1, "attempt.attemptNumber", "attempt.versionNumber"],
  ] as const)(
    "preserves file-specific workflow/raw/status contract %s: %s",
    (index, before, after) => {
      const path = practiceFiles[index],
        source = read(path);
      expect(source).toContain(before);
      expect(practiceContract(source.replace(before, after))).not.toBe(
        approvedContracts[path],
      );
    },
  );
  it("new and historical projections remain sensitive to changed, removed and extra copy", () => {
    const value = catalogues.en.value as Record<string, unknown>;
    for (const mutate of [
      (copy: typeof catalogues.en.value) => {
        (
          copy as { learningPractice: { aim: { title: string } } }
        ).learningPractice.aim.title = "Changed";
      },
      (copy: typeof catalogues.en.value) => {
        delete (copy as { learningPractice: Record<string, unknown> })
          .learningPractice.aim;
      },
      (copy: typeof catalogues.en.value) => {
        (
          copy as { learningPractice: Record<string, unknown> }
        ).learningPractice.extra = "Unrelated";
      },
    ]) {
      const changed = structuredClone(value);
      mutate(changed);
      expect(() => withoutPublicPurchaseAdditions(changed)).toThrow(
        "Unverified learning practice additions",
      );
    }
    for (const [namespace, project] of [
      ["publicPurchase", withoutPublicPurchaseAdditions],
      ["publicTrust", withoutPublicTrustAdditions],
      ["publicDiscovery", withoutPublicDiscoveryAdditions],
    ] as const) {
      const changed = structuredClone(value);
      (changed[namespace] as Record<string, unknown>).extra = "Unrelated";
      expect(() => project(changed)).toThrow();
    }
  });
});
