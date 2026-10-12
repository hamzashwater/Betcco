import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/public-trust-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import {
  assertTrustScope,
  auditTrust,
  trustContract,
  trustFiles,
} from "./helpers/public-trust-i18n-audit";
import { withoutPublicTrustAdditions } from "./helpers/public-trust-catalogue-projection";
import { withoutPublicDiscoveryAdditions } from "./helpers/public-discovery-catalogue-projection";
const read = (p: string) => readFileSync(p, "utf8");
const catalogues = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};
// Catalogue snapshots are immutable; flatten each once for all reference checks.
const catalogueLeaves = {
  ar: leaves(catalogues.ar.value),
  en: leaves(catalogues.en.value),
};

describe("T7-A6.3 public documents, identity and trust", () => {
  it("pins the exact four original sources and 153/4/2 inventory before wiring", () => {
    expect(Object.keys(baseline.sources)).toEqual(trustFiles);
    expect(trustFiles.map((p) => digest(baseline.sources[p]))).toEqual([
      "9ae622a41ae4b67b1b0700284df81f8e29a4bcd8b520512f56ee841b3fb3c22e",
      "0f24f2aa82651227fee10b106cf6d2ce9ca47f5bc111878206a5bd43ebea6209",
      "9200525f896e55b3c987f355a2af6cc6f6f431198844d9b3ef368724f38ee2b4",
      "7c5ef215e1ea8306ebed08d0a3c16ed87df2ed6c54e41d87d6484de3f4c5a482",
    ]);
    const records = Object.values(baseline.records).flat();
    expect(records.filter((r) => r.category === "STATIC_UI")).toHaveLength(153);
    expect(
      records.filter((r) => r.category === "ACCESSIBILITY_STATIC_UI"),
    ).toHaveLength(4);
    expect(baseline.unknown).toHaveLength(2);
    expect(baseline.additionalFindings).toEqual([
      {
        file: trustFiles[0],
        line: 808,
        expression: 'track.isBtecFocused ? "BTEC-first" : "Academic"',
        classification: "STATIC_UI",
        reason:
          "Additional client-owned display pair, absent from original counted findings; original source hash and 153/4/2 records remain unchanged.",
      },
    ]);
    for (const finding of baseline.additionalFindings)
      expect(
        baseline.sources[finding.file as (typeof trustFiles)[0]].split("\n")[
          finding.line - 1
        ],
      ).toContain(finding.expression);
    expect(
      baseline.unknown.map((f) => [
        f.line,
        f.classification,
        f.finalClassification,
        f.dataOrigin,
        f.userVisible,
      ]),
    ).toEqual([
      [
        46,
        "UNCLASSIFIED_PUBLICATION_CONFIGURATION",
        "STATIC_UI",
        "client static",
        true,
      ],
      [
        47,
        "UNCLASSIFIED_PUBLICATION_CONFIGURATION",
        "STATIC_UI",
        "client static",
        true,
      ],
    ]);
    for (const path of trustFiles) {
      for (const edit of baseline.replacements[path])
        expect(baseline.sources[path].slice(edit.start, edit.end)).toBe(
          edit.original,
        );
      if (path !== trustFiles[1])
        expect(
          baseline.replacements[path]
            .map((e) => e.recordLine)
            .sort((a, b) => a - b),
        ).toEqual(
          baseline.records[path].map((r) => r.line).sort((a, b) => a - b),
        );
    }
  });
  it("independently freezes reviewed copy wiring rather than accepting regenerated technical allowlists", () => {
    expect(trustFiles.map((p) => digest(baseline.approvedSources[p]))).toEqual([
      "165cce5c0941a2189f2989134dbabae20b0ff9ae9e89f5897184789140e5bf18",
      "661a44bc7864b9477be2c6b27a1b23d635284ca3229156c261e527c3851b6861",
      "22766d4e5c1cf67a65b80df928a111b5a44947a9d44fea2ace806f98cb6ebfe6",
      "544a6a6094d26f8e5a571dd2e3f3fd356b81c3f3a2754d829a4bca0f0462e2ff",
    ]);
  });
  it.each(trustFiles)(
    "zero residuals, bounded references and complete syntax contract: %s",
    (path) => {
      const source = read(path),
        audit = auditTrust(source, path);
      expect(audit.findings).toEqual([]);
      expect(audit.counts).toEqual({
        STATIC_UI: 0,
        ACCESSIBILITY_STATIC_UI: 0,
        UNCLASSIFIED: 0,
      });
      expect(trustContract(source)).toBe(
        trustContract(baseline.approvedSources[path]),
      );
      for (const reference of audit.references)
        for (const locale of ["ar", "en"] as const)
          expect(typeof catalogueLeaves[locale][reference]).toBe("string");
    },
  );
  it("limits production and supporting paths to the authorized wave", () => {
    const paths = trustFiles.map((p) => `frontend/${p}`);
    expect(() => assertTrustScope(paths)).not.toThrow();
    expect(() =>
      assertTrustScope([...paths, "frontend/src/components/site-footer.tsx"]),
    ).toThrow();
    expect(() =>
      assertTrustScope([...paths, "backend/Betcco.Api/Program.cs"]),
    ).toThrow();
    expect(() =>
      assertTrustScope([...paths, "frontend/pnpm-lock.yaml"]),
    ).toThrow();
  });
  it("exact catalogue shape parity and no duplicate keys", () => {
    expect(Object.keys(catalogueLeaves.ar).sort()).toEqual(
      Object.keys(catalogueLeaves.en).sort(),
    );
    expect(catalogues.ar.duplicates).toEqual([]);
    expect(catalogues.en.duplicates).toEqual([]);
    expect(catalogue('{"a":"one","a":"two"}').duplicates).not.toEqual([]);
  });
  it.each(["ar", "en"] as const)(
    "160 exact %s additions, zero existing changes/removals",
    (locale) => {
      const value = catalogues[locale].value as Record<string, unknown>;
      expect(leaves(value.publicTrust)).toEqual(
        leaves(baseline.catalogues[locale].additions),
      );
      expect(Object.keys(leaves(value.publicTrust))).toHaveLength(160);
      expect(
        digest(
          JSON.stringify(withoutPublicTrustAdditions(structuredClone(value))),
        ),
      ).toBe(baseline.catalogues[locale].baseHash);
    },
  );
  it("retains raw/server/legal/user fields and formatter/identifier contexts under the complete contract", () => {
    const retained = trustFiles.flatMap(
      (path) => auditTrust(read(path), path).retained,
    );
    for (const category of [
      "RAW_SERVER_CONTENT",
      "RAW_SERVER_ERROR",
      "RAW_USER_CONTENT",
      "SERVER_LOCALIZED_DATA",
      "LOCALE_FORMATTER",
    ])
      expect(retained.some((item) => item.category === category)).toBe(true);
    expect(retained).toContainEqual({
      category: "RAW_SERVER_CONTENT",
      text: "certificate.data.verificationCode",
    });
    expect(retained).toContainEqual({
      category: "RAW_SERVER_CONTENT",
      text: "value.title",
    });
    const sources = trustFiles.map(read).join("\n");
    for (const text of [
      "{value.title}",
      "value.content",
      "value.version",
      "effectiveAtUtc",
      "{item.resolutionSummary}",
      "{review.authorLabel}",
      "{review.comment}",
      "certificate.data.studentName",
      "certificate.data.courseTitle",
      "certificate.data.verificationCode",
      "encodeURIComponent(verificationCode)",
      "encodeURIComponent(slug)",
      "send.error.message",
      "save.error.message",
      "requests.error.message",
      "{item.name}",
      "{track.data.name}",
      "track.data.description",
      "...validSettings",
      "settings[key] || `{{${key}}}`",
    ])
      expect(sources).toContain(text);
  });
  it("resolves every added static key and preserves every original bilingual pair verbatim", () => {
    const references = new Set(
      trustFiles.flatMap((path) => auditTrust(read(path), path).references),
    );
    expect([...references].sort()).toEqual(
      Object.keys(catalogueLeaves.en)
        .filter((key) => key.startsWith("publicTrust."))
        .sort(),
    );
    const additions = {
      ar: Object.values(leaves(baseline.catalogues.ar.additions)),
      en: Object.values(leaves(baseline.catalogues.en.additions)),
    };
    for (const records of Object.values(baseline.records))
      for (const record of records) {
        if (
          "ar" in record &&
          "en" in record &&
          !record.context.includes("ratingsCount")
        ) {
          expect(additions.ar).toContain(record.ar);
          expect(additions.en).toContain(record.en);
        }
      }
  });
  it.each([
    "<p>Injected English UI</p>",
    "<p>نص عربي محقون</p>",
    '<button aria-label="Injected accessible name" />',
    '<input placeholder="Injected placeholder" />',
    '<img alt="Meaningful injected alt" />',
    '<button title="Injected tooltip" />',
    'const x = locale === "ar" ? "ثابت" : "Static UI";',
    'function localCopy() { return "Helper copy"; }',
    'const map = { ar: "نص ثابت", en: "Static presentation" };',
    "const templated = `Hello ${name}`;",
    'const fallback = error instanceof Error ? error.message : "Local failure";',
    'const copy = useTranslations("publicTrust.content"); const key = location.hash; copy(key);',
    'const copy = useTranslations(location.hash); copy("routeAbout");',
  ])("detects injected residual: %s", (injected) => {
    const path = trustFiles[0];
    expect(
      auditTrust(read(path) + "\n" + injected, path).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    [0, "/${locale}/guide", "/${locale}/changed"],
    [0, "/privacy/requests", "/privacy/changed"],
    [0, 'method: "POST"', 'method: "PUT"'],
    [0, '["privacy-requests"]', '["privacy-changed"]'],
    [0, "!user.data", "user.data"],
    [
      0,
      "document.isError || !document.data",
      "document.isError && !document.data",
    ],
    [0, '"Completed", "Rejected", "Cancelled"', '"Rejected", "Cancelled"'],
    [0, "description.trim() || null", "description || null"],
    [0, "disabled={cancelRequest.isPending}", "disabled={false}"],
    [0, "{value.title}", "{value.slug}"],
    [0, "settings[key] || `{{${key}}}`", 'settings[key] ?? ""'],
    [1, 'typeof entry[1] === "string"', 'typeof entry[1] !== "string"'],
    [
      1,
      "...getDefaultBrand(locale), ...validSettings",
      "...validSettings, ...getDefaultBrand(locale)",
    ],
    [2, "mine.data.isPublished", "mine.data.allowPublicDisplay"],
    [2, 'roles.includes("Student")', 'roles.includes("Teacher")'],
    [2, 'method: "PUT"', 'method: "POST"'],
    [2, "save.isPending || mine.isPending", "save.isPending && mine.isPending"],
    [3, "certificate.isPending", "certificate.isError"],
    [3, "certificate.data ? (", "!certificate.data ? ("],
    [3, "encodeURIComponent(verificationCode)", "verificationCode"],
    [3, "{certificate.data.verificationCode}", "{verificationCode}"],
    [3, 'dateStyle: "long"', 'dateStyle: "short"'],
  ] as const)("detects contract mutation %s: %s", (index, before, after) => {
    const source = read(trustFiles[index]);
    expect(source).toContain(before);
    expect(trustContract(source.replace(before, after))).not.toBe(
      trustContract(baseline.approvedSources[trustFiles[index]]),
    );
  });
  it("historical additions remain sensitive through the new projection", () => {
    const value = catalogues.en.value as Record<string, unknown>;
    const trust = structuredClone(value);
    (
      trust.publicTrust as { brand: { publicationRequired: string } }
    ).brand.publicationRequired = "Altered";
    expect(() => withoutPublicTrustAdditions(trust)).toThrow(
      "Unverified public trust additions",
    );
    const discovery = structuredClone(value);
    (
      discovery.publicDiscovery as { home: { latestPublishedCourses: string } }
    ).home.latestPublishedCourses = "Altered";
    expect(() => withoutPublicDiscoveryAdditions(discovery)).toThrow(
      "Unverified public discovery additions",
    );
    const extra = structuredClone(value);
    (extra.publicTrust as Record<string, unknown>).extra = "Unrelated";
    expect(() => withoutPublicTrustAdditions(extra)).toThrow();
  });
});
