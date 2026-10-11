import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/public-purchase-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import {
  assertPurchaseScope,
  auditPurchase,
  purchaseContract,
  purchaseFiles,
  replayPurchaseMigration,
} from "./helpers/public-purchase-i18n-audit";
import { withoutPublicPurchaseAdditions } from "./helpers/public-purchase-catalogue-projection";
import { withoutPublicTrustAdditions } from "./helpers/public-trust-catalogue-projection";
import { withoutPublicDiscoveryAdditions } from "./helpers/public-discovery-catalogue-projection";
import { withoutSharedShellAdditions } from "./helpers/shared-shell-catalogue-projection";
const read = (p: string) => readFileSync(p, "utf8");
const catalogues = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};

describe("T7-A6.4 purchase, memberships and payment state", () => {
  it("pins exactly four reviewed sources and all original 44/1/0 records", () => {
    expect(Object.keys(baseline.sources)).toEqual(purchaseFiles);
    expect(purchaseFiles.map((p) => digest(baseline.sources[p]))).toEqual([
      "bf3fd9214ac1563055a8ec5b2426f653d257447a8daa20fb6de73061b4454f57",
      "2cb8c4ca5d736c2d8a026d79e96fc9b836c76511790b6352b41cc3918c91b4ba",
      "5779d6c22b630a8f40896436677e5b35ffec6e1e770ee88d0f9c0d125789ae57",
      "a4a4674b4a093820af9806ec4c8fe6b9394a5bd383d29457fb388aaccdb30a87",
    ]);
    expect(digest(JSON.stringify(baseline.records))).toBe(
      "4dfe57b001a74b98626823dcfc8d2cc50a696c79420072d8b270c0f9af16caf2",
    );
    expect([
      baseline.catalogues.ar.baseHash,
      baseline.catalogues.en.baseHash,
    ]).toEqual([
      "fc6951c960499e3151e948bab55e89291fb528cce706bfd51958dc41d7b497f5",
      "a672c143ef8e6c69782b8e6e1e2cb29f1468c1a49e840916f0c5b9bcef8bbb25",
    ]);
    const records = Object.values(baseline.records).flat();
    expect(records.filter((r) => r.category === "STATIC_UI")).toHaveLength(44);
    expect(
      records.filter((r) => r.category === "ACCESSIBILITY_STATIC_UI"),
    ).toHaveLength(1);
    expect(records.filter((r) => r.category === "UNCLASSIFIED")).toHaveLength(
      0,
    );
    expect(
      records
        .filter((r) => r.category === "ACCESSIBILITY_STATIC_UI")
        .map((r) => [r.line, r.context]),
    ).toEqual([[133, 'locale === "ar" ? "حذف العنصر" : "Remove item"']]);
    for (const path of purchaseFiles) {
      expect(
        [...new Set(baseline.replacements[path].map((e) => e.recordLine))].sort(
          (a, b) => a - b,
        ),
      ).toEqual(
        baseline.records[path].map((r) => r.line).sort((a, b) => a - b),
      );
      for (const edit of baseline.replacements[path])
        expect(baseline.sources[path].slice(edit.start, edit.end)).toBe(
          edit.original,
        );
    }
  });
  it("independently freezes translation seams and permits only the reviewed copy slots", () => {
    expect(
      purchaseFiles.map((p) => digest(baseline.approvedSources[p])),
    ).toEqual([
      "b2722803759c288d5e123480076e284327dfa9d99b89ce97e26e1e5949688c76",
      "8a974161d59d9efd699e2dcd3be6a1bcc5a53df2b69dc9131231b30a665c3413",
      "e324b6f03770cdd30dc974e2a74cf4b3c55948f002a8de9de817e628ebddc536",
      "869ef8b0948d8b06e4d3f6c322f636415032dd805be1c529c4ab8e4f92fb45fb",
    ]);
    expect(
      digest(
        JSON.stringify({
          replacements: baseline.replacements,
          wiring: baseline.wiring,
        }),
      ),
    ).toBe("5bef4bb1eec49f39ea07746c0adcb15e9ae732ee2c48bf7c09fe570968e79063");
    for (const path of purchaseFiles)
      expect(purchaseContract(replayPurchaseMigration(path))).toBe(
        purchaseContract(baseline.approvedSources[path]),
      );
  });
  it.each(purchaseFiles)(
    "zero residuals, all references resolve and complete contract: %s",
    (path) => {
      const source = read(path),
        audit = auditPurchase(source, path);
      expect(audit.findings).toEqual([]);
      expect(audit.counts).toEqual({
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      });
      expect(purchaseContract(source)).toBe(
        purchaseContract(baseline.approvedSources[path]),
      );
      for (const reference of audit.references)
        for (const locale of ["ar", "en"] as const)
          expect(typeof leaves(catalogues[locale].value)[reference]).toBe(
            "string",
          );
    },
  );
  it("all added keys are statically referenced and bilingual values remain verbatim", () => {
    const references = new Set(
      purchaseFiles.flatMap(
        (path) => auditPurchase(read(path), path).references,
      ),
    );
    expect(
      [...references].filter((k) => k.startsWith("publicPurchase.")).sort(),
    ).toEqual(
      Object.keys(leaves(catalogues.en.value))
        .filter((k) => k.startsWith("publicPurchase."))
        .sort(),
    );
    for (const records of Object.values(baseline.records))
      for (const record of records) {
        if ("ar" in record && "en" in record) {
          expect(
            Object.values(leaves(baseline.catalogues.ar.additions)),
          ).toContain(record.ar);
          expect(
            Object.values(leaves(baseline.catalogues.en.additions)),
          ).toContain(record.en);
        }
      }
  });
  it.each(["ar", "en"] as const)(
    "45 exact %s additions, zero existing changes or removals",
    (locale) => {
      const value = catalogues[locale].value as Record<string, unknown>;
      expect(leaves(value.publicPurchase)).toEqual(
        leaves(baseline.catalogues[locale].additions),
      );
      expect(Object.keys(leaves(value.publicPurchase))).toHaveLength(45);
      expect(
        digest(
          JSON.stringify(
            withoutPublicPurchaseAdditions(structuredClone(value)),
          ),
        ),
      ).toBe(baseline.catalogues[locale].baseHash);
    },
  );
  it("complete AR/EN shape parity, no duplicate JSON keys", () => {
    expect(Object.keys(leaves(catalogues.ar.value)).sort()).toEqual(
      Object.keys(leaves(catalogues.en.value)).sort(),
    );
    expect(catalogues.ar.duplicates).toEqual([]);
    expect(catalogues.en.duplicates).toEqual([]);
    expect(catalogue('{"a":"one","a":"two"}').duplicates).not.toEqual([]);
  });
  it("exact production scope plus catalogues and focused tests only", () => {
    const paths = purchaseFiles.map((p) => `frontend/${p}`);
    expect(() => assertPurchaseScope(paths)).not.toThrow();
    for (const extra of [
      "frontend/src/features/student/student-area.tsx",
      "backend/Betcco.Api/Program.cs",
      "frontend/pnpm-lock.yaml",
      ".github/workflows/ci.yml",
    ])
      expect(() => assertPurchaseScope([...paths, extra])).toThrow();
  });
  it("raw server, provider, financial values and formatters remain classified", () => {
    const retained = purchaseFiles.flatMap(
      (p) => auditPurchase(read(p), p).retained,
    );
    for (const category of [
      "RAW_SERVER_FINANCIAL_DATA",
      "SERVER_LOCALIZED_DATA",
      "RAW_SERVER_CONTENT",
      "RAW_SERVER_ERROR",
      "LOCALE_FORMATTER",
      "TECHNICAL_INTERNAL_VALUE",
      "API_CONTRACT",
    ])
      expect(retained.some((r) => r.category === category)).toBe(true);
    for (const [category, text] of [
      ["RAW_SERVER_CONTENT", "checkout.data?.provider"],
      ["RAW_SERVER_CONTENT", "payment.redirectUrl"],
      ["RAW_SERVER_CONTENT", "payment.paymentId"],
      ["RAW_SERVER_FINANCIAL_DATA", "checkout.data.currency"],
      ["SERVER_LOCALIZED_DATA", "plan.title"],
      ["RAW_SERVER_ERROR", "activeError.message"],
    ])
      expect(retained).toContainEqual({ category, text });
  });
  it.each([
    "<p>Injected English UI</p>",
    "<p>نص عربي محقون</p>",
    '<button aria-label="Injected name" />',
    '<input placeholder="Injected placeholder" />',
    '<img alt="Injected alt" />',
    '<button title="Injected tooltip" />',
    'const label = locale === "ar" ? "الدفع" : "Payment label";',
    'function membershipLabel() { return "Membership label"; }',
    'const map = { ar: "اشتراك", en: "Subscription" };',
    'const failure = error instanceof Error ? error.message : "Local failure";',
    "const template = `Payment ${id}`;",
    'const copy = useTranslations("publicPurchase.checkout"); copy(location.hash);',
    'const copy = useTranslations(location.hash); copy("title");',
  ])("detects injected copy or unbounded reference: %s", (injected) => {
    const path = purchaseFiles[1];
    expect(
      auditPurchase(read(path) + "\n" + injected, path).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    [0, "/${locale}/checkout", "/${locale}/changed"],
    [0, "/cart/items/${id}", "/cart/changed/${id}"],
    [0, 'method: "DELETE"', 'method: "POST"'],
    [0, '["cart", locale]', '["changed-cart", locale]'],
    [0, "enabled: isStudent", "enabled: true"],
    [0, 'roles.includes("Student")', 'roles.includes("Teacher")'],
    [0, "remove.mutate(item.id)", "remove.mutate(item.referenceId)"],
    [0, "cart.data.total", "cart.data.subtotal"],
    [0, "{item.title}", "{item.referenceId}"],
    [0, "if (cart.isError)", "if (cart.isPending)"],
    [0, 'cart.data.items.length ? ""', 'true ? ""'],
    [1, '"/cart/checkout"', '"/cart/changed"'],
    [1, 'method: "POST"', 'method: "GET"'],
    [1, "couponCode: coupon || null", "couponCode: coupon"],
    [
      1,
      '"Idempotency-Key": crypto.randomUUID()',
      '"Idempotency-Key": "constant"',
    ],
    [1, 'value: "BankTransfer"', 'value: "bankTransfer"'],
    [
      1,
      "window.location.assign(payment.redirectUrl)",
      'window.location.assign("/changed")',
    ],
    [1, "checkout.error ?? confirm.error", "confirm.error ?? checkout.error"],
    [1, "activeError instanceof Error", "false"],
    [1, 'provider.startsWith("Fake")', 'provider.startsWith("PayTabs")'],
    [1, "disabled={checkout.isPending}", "disabled={false}"],
    [1, "disabled={confirm.isPending}", "disabled={false}"],
    [1, "paymentId: payment.paymentId", "paymentId: payment.checkoutReference"],
    [1, "-checkout.data.discount", "checkout.data.discount"],
    [3, 'kind === "membership"', 'kind === "subscription"'],
    [3, 'paymentMethod: "Card"', 'paymentMethod: "card"'],
    [3, 'start("membership", plan.id)', 'start("membership", plan.title)'],
    [3, "checkout.error ?? confirm.error", "confirm.error ?? checkout.error"],
    [3, 'provider.startsWith("Fake")', 'provider.startsWith("PayTabs")'],
    [
      3,
      'client.invalidateQueries({ queryKey: ["cart"] })',
      'client.invalidateQueries({ queryKey: ["different"] })',
    ],
    [3, "add.mutate(packageItem.id)", "add.mutate(packageItem.slug)"],
    [3, "add.isPending || user.isPending", "add.isPending && user.isPending"],
    [3, "packageItem.discountAmount > 0", "packageItem.discountAmount >= 0"],
    [3, "if (!isStudent)", "if (isStudent)"],
  ] as const)(
    "detects financial/behavior mutation %s: %s",
    (index, before, after) => {
      const path = purchaseFiles[index],
        source = read(path);
      expect(source).toContain(before);
      expect(purchaseContract(source.replace(before, after))).not.toBe(
        purchaseContract(baseline.approvedSources[path]),
      );
    },
  );
  it("current and historical catalogue additions remain mutation-sensitive", () => {
    const value = catalogues.en.value as Record<string, unknown>;
    for (const mutation of ["change", "extra", "remove"]) {
      const altered = structuredClone(value);
      const cart = (altered.publicPurchase as { cart: Record<string, string> })
        .cart;
      if (mutation === "change") cart.title = "Changed";
      if (mutation === "extra") cart.unrelated = "Extra";
      if (mutation === "remove") delete cart.title;
      expect(() => withoutPublicPurchaseAdditions(altered)).toThrow();
    }
    const trust = structuredClone(value);
    (
      trust.publicTrust as { brand: { publicationRequired: string } }
    ).brand.publicationRequired = "Changed";
    expect(() => withoutPublicTrustAdditions(trust)).toThrow();
    const discovery = structuredClone(value);
    (
      discovery.publicDiscovery as { home: { latestPublishedCourses: string } }
    ).home.latestPublishedCourses = "Changed";
    expect(() => withoutPublicDiscoveryAdditions(discovery)).toThrow();
    const shell = structuredClone(value);
    (
      shell.navigation as { accessibility: { skipToMainContent: string } }
    ).accessibility.skipToMainContent = "Changed";
    expect(() => withoutSharedShellAdditions(shell)).toThrow();
  });
});
