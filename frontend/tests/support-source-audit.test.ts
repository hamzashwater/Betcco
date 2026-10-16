import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/support-i18n-baseline.json";
import {
  ancestors,
  catalogue,
  digest,
  leaves,
} from "./helpers/admin-final-i18n-audit";
import {
  assertSupportScope,
  auditSupport,
  replaySupportMigration,
  supportContract,
  supportFiles,
} from "./helpers/support-i18n-audit";
import { withoutSupportAdditions } from "./helpers/support-catalogue-projection";
import { withoutLearningPracticeAdditions } from "./helpers/learning-practice-catalogue-projection";
import { withoutPublicPurchaseAdditions } from "./helpers/public-purchase-catalogue-projection";
const read = (path: string) => readFileSync(path, "utf8");
const catalogues = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};
const catalogueLeaves = {
  ar: leaves(catalogues.ar.value),
  en: leaves(catalogues.en.value),
};
const approved = Object.fromEntries(
  supportFiles.map((path) => [
    path,
    supportContract(baseline.approvedSources[path]),
  ]),
);

describe("T7-A6.6 Support residual migration", () => {
  it("freezes exact original sources and the independent 60/1/0 inventory", () => {
    expect(Object.keys(baseline.sources)).toEqual(supportFiles);
    expect(supportFiles.map((path) => digest(baseline.sources[path]))).toEqual([
      "073221b206daa312edf801ed2e4daa7b61cbd3bfa46f86928c6707641e1ae736",
      "eece0a7d4fe0abea7ad75d56bf23337e6e6e8acc5d079f480431497839eb535c",
    ]);
    expect(digest(JSON.stringify(baseline.records))).toBe(
      "b7dda2cbba57e86985a386160e8719cc72a18aba1f96b5fbc60d067cff5cfe43",
    );
    expect(
      supportFiles.map(
        (path) =>
          baseline.records[path].filter(
            (record) => record.category === "STATIC_UI",
          ).length,
      ),
    ).toEqual([21, 39]);
    expect(
      Object.values(baseline.records)
        .flat()
        .filter((record) => record.category === "ACCESSIBILITY_STATIC_UI")
        .map((record) => [record.line, record.context]),
    ).toEqual([[352, 'locale === "ar" ? "إرسال الرد" : "Send reply"']]);
    expect(
      Object.values(baseline.records)
        .flat()
        .filter((record) => record.category === "UNCLASSIFIED"),
    ).toEqual([]);
    expect(baseline.classifications.accessibility.category).toBe(
      "ACCESSIBILITY_STATIC_UI",
    );
    expect(baseline.classifications.brand).toMatchObject({
      text: "BETCCO SUPPORT",
      category: "STATIC_UI",
      ar: "دعم BETCCO",
      en: "BETCCO SUPPORT",
    });
  });
  it.each(supportFiles)(
    "independently rediscovers all original presentation contexts: %s",
    (path) => {
      const file = ts.createSourceFile(
        path,
        baseline.sources[path],
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const actual: { line: number; category: string }[] = [];
      function walk(node: ts.Node) {
        const line =
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        if (
          ts.isConditionalExpression(node) &&
          node.condition.getText(file) === 'locale === "ar"' &&
          ts.isStringLiteral(node.whenTrue) &&
          ts.isStringLiteral(node.whenFalse)
        ) {
          const attribute = ancestors(node).find(ts.isJsxAttribute);
          actual.push({
            line,
            category:
              attribute?.name.getText() === "aria-label"
                ? "ACCESSIBILITY_STATIC_UI"
                : "STATIC_UI",
          });
        }
        if (
          ts.isArrayLiteralExpression(node) &&
          node.elements.length === 2 &&
          node.elements.every(ts.isStringLiteral) &&
          ts.isPropertyAssignment(node.parent) &&
          [
            "Open",
            "InProgress",
            "WaitingForStudent",
            "Resolved",
            "Closed",
          ].includes(node.parent.name.getText(file))
        )
          actual.push({ line, category: "STATIC_UI" });
        if (ts.isJsxText(node) && /[a-zA-Z\u0600-\u06ff]/u.test(node.text))
          actual.push({ line, category: "STATIC_UI" });
        ts.forEachChild(node, walk);
      }
      walk(file);
      expect(actual.sort((a, b) => a.line - b.line)).toEqual(
        baseline.records[path]
          .map((record) => ({ line: record.line, category: record.category }))
          .sort((a, b) => a.line - b.line),
      );
    },
  );
  it("independently pins copy replacements and translation-only wiring", () => {
    expect(
      supportFiles.map((path) => digest(baseline.approvedSources[path])),
    ).toEqual([
      "6a0fed57a4561be5da6ff3c787a92701e781d2784bbb8d1fb807df4bde7d2df3",
      "bba9a449412e80dc928383959a6411d57ee5a64e8c033aac1b0bcee66c038e61",
    ]);
    expect(
      digest(
        JSON.stringify({
          replacements: baseline.replacements,
          wiring: baseline.wiring,
        }),
      ),
    ).toBe("6f2d82d3ef1981c85dd8ad7e1f72e432057cfe10819eb0173d9e4e5648ee122f");
    for (const path of supportFiles) {
      expect(
        baseline.replacements[path]
          .map((edit) => edit.recordLine)
          .sort((a, b) => a - b),
      ).toEqual(
        baseline.records[path]
          .map((record) => record.line)
          .sort((a, b) => a - b),
      );
      for (const edit of baseline.replacements[path])
        expect(baseline.sources[path].slice(edit.start, edit.end)).toBe(
          edit.original,
        );
      expect(supportContract(replaySupportMigration(path))).toBe(
        approved[path],
      );
    }
  });
  it.each(supportFiles)(
    "zero residuals, bounded references and complete preserved contract: %s",
    (path) => {
      const source = read(path),
        audit = auditSupport(source, path);
      expect(audit.findings).toEqual([]);
      expect(audit.counts).toEqual({
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      });
      expect(supportContract(source)).toBe(approved[path]);
      expect(
        supportContract(
          source.replace('"use client";', '"use client";\n// formatting'),
        ),
      ).toBe(approved[path]);
      for (const reference of audit.references)
        for (const locale of ["ar", "en"] as const)
          expect(typeof catalogueLeaves[locale][reference]).toBe("string");
      expect(
        audit.retained.some(
          (item) => item.category === "RAW_USER_SERVER_CONTENT",
        ),
      ).toBe(true);
      expect(
        audit.retained.some((item) => item.category === "RAW_USER_INPUT"),
      ).toBe(true);
      if (path === supportFiles[1]) {
        expect(
          audit.retained.some((item) => item.category === "RAW_SERVER_ERROR"),
        ).toBe(true);
        expect(audit.retained).toContainEqual({
          category: "LOCALE_FORMATTER",
          text: "formatLocalizedDateTime(value, locale)",
        });
      }
    },
  );
  it("keeps exactly two production files and excludes auth, AI, backend, CI and dependencies", () => {
    const paths = supportFiles.map((path) => `frontend/${path}`);
    expect(() =>
      assertSupportScope([
        ...paths,
        "frontend/messages/ar.json",
        "frontend/messages/en.json",
        "frontend/tests/support-source-audit.test.ts",
      ]),
    ).not.toThrow();
    for (const extra of [
      "frontend/src/features/auth/account-profile.tsx",
      "frontend/src/features/auth/account-security.tsx",
      "frontend/src/features/student/ai-practice-shell.tsx",
      "backend/Betcco.Api/Program.cs",
      "frontend/pnpm-lock.yaml",
      ".github/workflows/quality.yml",
    ])
      expect(() => assertSupportScope([...paths, extra])).toThrow();
  });
  it("has complete catalogue parity, zero duplicate keys and only static semantic references", () => {
    expect(Object.keys(catalogueLeaves.ar).sort()).toEqual(
      Object.keys(catalogueLeaves.en).sort(),
    );
    expect(catalogues.ar.duplicates).toEqual([]);
    expect(catalogues.en.duplicates).toEqual([]);
    expect(catalogue('{"a":"one","a":"two"}').duplicates).not.toEqual([]);
    const references = supportFiles.flatMap(
      (path) => auditSupport(read(path), path).references,
    );
    expect([...new Set(references)].sort()).toEqual(
      Object.keys(catalogueLeaves.en)
        .filter((key) => key.startsWith("supportWorkspace."))
        .sort(),
    );
    expect(catalogueLeaves.ar.support).toBe("الدعم");
    expect(catalogueLeaves.en.support).toBe("Support");
    for (const record of Object.values(baseline.records).flat())
      if ("ar" in record && "en" in record) {
        expect(
          Object.values(leaves(baseline.catalogues.ar.additions)),
        ).toContain(record.ar);
        expect(
          Object.values(leaves(baseline.catalogues.en.additions)),
        ).toContain(record.en);
      }
  });
  it.each(["ar", "en"] as const)(
    "exact %s additions with no existing changes/removals",
    (locale) => {
      const value = catalogues[locale].value as Record<string, unknown>;
      expect(leaves(value.supportWorkspace)).toEqual(
        leaves(baseline.catalogues[locale].additions),
      );
      expect(Object.keys(leaves(value.supportWorkspace))).toHaveLength(61);
      expect(
        digest(JSON.stringify(withoutSupportAdditions(structuredClone(value)))),
      ).toBe(baseline.catalogues[locale].baseHash);
    },
  );
  it.each([
    "<p>Injected English UI</p>",
    "<p>نص عربي محقون</p>",
    "<label>Injected label</label>",
    '<span className="sr-only">Hidden UI name</span>',
    '<input placeholder="Injected placeholder" />',
    '<button aria-label="Injected accessible name" />',
    '<button title="Injected tooltip" />',
    'function label() { return "Helper copy"; }',
    'const statusMap = { Open: "New static status" };',
    'const options = { Technical: "Technical label" };',
    'const copy = { ar: "نص ثابت", en: "Static English" };',
    'const fallback = error instanceof Error ? error.message : "Local failure";',
    "const text = `Hello ${name}`;",
    'const copy = useTranslations("supportWorkspace"); copy(location.hash);',
    'const copy = useTranslations(location.hash); copy("account.title");',
    'const copy = useTranslations("supportWorkspace"); copy.rich(location.hash);',
    "function label(t: SupportTranslations, status: string) { return t(status); }",
  ])("detects injected presentation and unbounded copy: %s", (injected) => {
    for (const path of supportFiles)
      expect(
        auditSupport(read(path) + "\n" + injected, path).findings.length,
      ).toBeGreaterThan(0);
  });
  it.each([
    [0, '"/auth/me"', '"/auth/changed"'],
    [0, 'roles.includes("SupportAdmin")', 'roles.includes("Student")'],
    [0, 'roles.includes("Admin")', 'roles.includes("Teacher")'],
    [0, 'roles.includes("SystemAdmin")', 'roles.includes("FinanceAdmin")'],
    [0, '["current-user"]', '["changed-user"]'],
    [
      0,
      '["support-freeze-targets", role, term, page]',
      '["support-freeze-targets", role, search, page]',
    ],
    [0, "/admin/users/freeze-targets?", "/admin/users/changed?"],
    [0, "search: term", "search: term.trim()"],
    [0, "page: String(page)", "page: String(1)"],
    [0, "{ role, search: term", '{ role: "Admin", search: term'],
    [
      0,
      'enabled: Boolean(permitted) && current === "accounts"',
      'enabled: Boolean(permitted) || current === "accounts"',
    ],
    [0, "/admin/users/${id}/freeze", "/admin/users/${id}/delete"],
    [0, 'method: "POST"', 'method: "DELETE"'],
    [0, "JSON.stringify({ frozen })", "JSON.stringify({ frozen: !frozen })"],
    [
      0,
      'queryKey: ["support-freeze-targets"]',
      'queryKey: ["changed-targets"]',
    ],
    [0, "setPage(1)", "setPage(2)"],
    [0, "setTerm(search)", "setTerm(search.trim())"],
    [
      0,
      "page * 25 >= targets.data.totalCount",
      "page * 50 >= targets.data.totalCount",
    ],
    [0, "disabled={page === 1}", "disabled={false}"],
    [0, "disabled={freeze.isPending}", "disabled={false}"],
    [0, "window.confirm(", "Boolean("],
    [0, "target.id", "target.email"],
    [0, "target.displayName", "target.id"],
    [0, "target.email", "target.id"],
    [0, "frozen: !target.isFrozen", "frozen: target.isFrozen"],
    [0, 'dir="ltr"', 'dir="rtl"'],
    [0, "maxLength={100}", "maxLength={200}"],
    [0, '<AccountProfile role="support"', '<AccountProfile role="admin"'],
    [0, '<AccountSecurity role="support"', '<AccountSecurity role="admin"'],
    [1, 'mode === "admin"', 'mode === "student"'],
    [1, '["support-tickets", mode]', '["support-tickets"]'],
    [
      1,
      "/support/tickets?page=1&pageSize=50",
      "/support/tickets?page=1&pageSize=25",
    ],
    [
      1,
      "selectedId ?? tickets.data?.items[0]?.id ?? null",
      "tickets.data?.items[0]?.id ?? selectedId ?? null",
    ],
    [1, '["support-ticket", activeTicketId]', '["support-ticket", selectedId]'],
    [
      1,
      "/support/tickets/${activeTicketId}",
      "/support/changed/${activeTicketId}",
    ],
    [1, "enabled: Boolean(activeTicketId)", "enabled: true"],
    [
      1,
      'api<CreatedTicket>("/support/tickets"',
      'api<CreatedTicket>("/support/changed"',
    ],
    [1, 'method: "POST"', 'method: "PUT"'],
    [1, "subject: subject.trim()", "subject: subject"],
    [1, "message: openingMessage.trim()", "message: openingMessage"],
    [1, 'setCategory("General")', 'setCategory("Technical")'],
    [1, "setSelectedId(created.id)", "setSelectedId(null)"],
    [1, "/messages`", "/changed-messages`"],
    [1, "message: reply.trim()", "message: reply"],
    [1, 'setReply("")', "setReply(reply)"],
    [1, "/status`", "/changed-status`"],
    [1, "JSON.stringify({ status })", "JSON.stringify({ state: status })"],
    [1, 'changeStatus.mutate("InProgress")', 'changeStatus.mutate("Open")'],
    [1, 'changeStatus.mutate("Resolved")', 'changeStatus.mutate("Open")'],
    [1, 'changeStatus.mutate("Closed")', 'changeStatus.mutate("Open")'],
    [1, "if (activeTicketId)", "if (!activeTicketId)"],
    [1, 'ticket.data.status === "Closed"', 'ticket.data.status !== "Closed"'],
    [1, "!reply.trim() ||", "false ||"],
    [
      1,
      "create.isPending || !subject.trim() || !openingMessage.trim()",
      "create.isPending",
    ],
    [1, "disabled={changeStatus.isPending}", "disabled={false}"],
    [1, "maxLength={200}", "maxLength={400}"],
    [1, "maxLength={4000}", "maxLength={8000}"],
    [1, "create.error instanceof Error", "false"],
    [1, "sendReply.error instanceof Error", "false"],
    [1, "changeStatus.error instanceof Error", "false"],
    [1, "create.error.message", '"Local failure"'],
    [1, "item.subject", "item.id"],
    [1, "ticket.data.subject", "ticket.data.id"],
    [1, "ticket.data.category", "ticket.data.status"],
    [1, "message.body", "message.id"],
    [
      1,
      "formatLocalizedDateTime(value, locale)",
      "new Date(value).toLocaleString()",
    ],
    [1, "?? status", '?? "Unknown"'],
    [1, '<option value="Payment"', '<option value="Donation"'],
    [
      1,
      'aria-label={supportCopy("center.sendReply")}',
      'title={supportCopy("center.sendReply")}',
    ],
  ] as const)(
    "protects exact account/ticket contract %s: %s",
    (index, before, after) => {
      const path = supportFiles[index],
        source = read(path);
      expect(source).toContain(before);
      expect(supportContract(source.replace(before, after))).not.toBe(
        approved[path],
      );
    },
  );
  it("new and historical catalogue projections remain mutation-sensitive", () => {
    const original = catalogues.en.value as Record<string, unknown>;
    for (const mutate of [
      (value: typeof original) => {
        (
          value.supportWorkspace as { account: { title: string } }
        ).account.title = "Changed";
      },
      (value: typeof original) => {
        delete (value.supportWorkspace as Record<string, unknown>).center;
      },
      (value: typeof original) => {
        (value.supportWorkspace as Record<string, unknown>).extra = "Unrelated";
      },
    ]) {
      const value = structuredClone(original);
      mutate(value);
      expect(() => withoutLearningPracticeAdditions(value)).toThrow(
        "Unverified Support additions",
      );
    }
    const oldLabel = structuredClone(original);
    oldLabel.support = "Changed existing label";
    expect(digest(JSON.stringify(withoutSupportAdditions(oldLabel)))).not.toBe(
      baseline.catalogues.en.baseHash,
    );
    for (const [namespace, project] of [
      ["learningPractice", withoutLearningPracticeAdditions],
      ["publicPurchase", withoutPublicPurchaseAdditions],
    ] as const) {
      const value = structuredClone(original);
      (value[namespace] as Record<string, unknown>).extra = "Unrelated";
      expect(() => project(value)).toThrow();
    }
  });
});
