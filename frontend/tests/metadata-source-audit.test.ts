import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/metadata-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import { practiceContract } from "./helpers/learning-practice-i18n-audit";
import { auditMetadata } from "./helpers/metadata-i18n-audit";
import { withoutMetadataAdditions } from "./helpers/metadata-catalogue-projection";
import { withoutMetadataPresentationChanges } from "./helpers/metadata-source-projection";

const read = (path: string) => readFileSync(path, "utf8");
const paths = Object.keys(
  baseline.approvedSources,
) as (keyof typeof baseline.approvedSources)[];
const sources = Object.fromEntries(
  paths.map((path) => [path, read(path)]),
) as Record<(typeof paths)[number], string>;
const messages = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};
const flat = { ar: leaves(messages.ar.value), en: leaves(messages.en.value) };
const approved = {
  "src/app/[locale]/layout.tsx":
    "5bba5c0f8aadf142142aeae1faf2ccd0400d540d8c4c60a3050412125f84ebce",
  "src/app/opengraph-image/route.tsx":
    "db856a091288c6fc36f339beda73faa7a4198e56dcd385c1fa7ea7548974263b",
  "src/app/[locale]/opengraph-image/route.tsx":
    "edc5614507f20d3a2cbf44f02d5c47d7e3d80a2f376b5fba71db46b52bb523c6",
};

describe("T7-A6.8 independently frozen metadata residuals", () => {
  it("pins original current-main sources, all five original slots and exact approved wiring", () => {
    expect(baseline.base).toBe("3b1b22a36c5af718d9505caf93967254f53dfe8c");
    expect(digest(JSON.stringify(baseline))).toBe(
      "00597d59e9a66f47e1ddb5ee9274a69e8e89163bea4dda4d66a16570cd5d0f99",
    );
    expect(Object.values(baseline.sources).map(digest)).toEqual(
      Object.values(baseline.sourceHashes),
    );
    expect(baseline.records.map((r) => [r.line, r.category])).toEqual([
      [33, "STATIC_UI"],
      [37, "STATIC_UI"],
      [81, "STATIC_UI"],
      [41, "STATIC_UI"],
      [51, "STATIC_UI"],
    ]);
    const before = Object.values(baseline.sources).flatMap(
      (source) => auditMetadata(source).findings,
    );
    expect(before.filter((r) => r.category === "STATIC_UI")).toHaveLength(5);
    expect(before.filter((r) => r.category !== "STATIC_UI")).toEqual([]);
  });

  it.each(paths)(
    "has zero residuals and freezes every non-copy contract in %s",
    (path) => {
      expect(auditMetadata(sources[path]).findings).toEqual([]);
      expect(digest(practiceContract(sources[path]))).toBe(approved[path]);
      expect(digest(practiceContract(baseline.approvedSources[path]))).toBe(
        approved[path],
      );
    },
  );

  it("resolves all five semantic additions and the unchanged accessibility key in both locales", () => {
    const references = paths.flatMap(
      (path) => auditMetadata(sources[path]).references,
    );
    for (const reference of references)
      for (const locale of ["ar", "en"] as const)
        expect(
          flat[locale][reference.namespace + "." + reference.key],
        ).toBeTypeOf("string");
    expect(
      references
        .filter((r) => r.namespace.startsWith("siteMetadata"))
        .map((r) => r.namespace + "." + r.key)
        .sort(),
    ).toEqual([
      "siteMetadata.description",
      "siteMetadata.organizationDescription",
      "siteMetadata.socialImage.description",
      "siteMetadata.socialImage.headline",
      "siteMetadata.title",
    ]);
  });

  it.each(["ar", "en"] as const)(
    "adds precisely five %s leaves and preserves all existing values/removals",
    (locale) => {
      expect(messages[locale].duplicates).toEqual([]);
      expect(
        Object.keys(leaves(baseline.catalogues[locale].additions)),
      ).toHaveLength(5);
      expect(
        digest(
          JSON.stringify(
            withoutMetadataAdditions(
              structuredClone(
                messages[locale].value as Record<string, unknown>,
              ),
            ),
          ),
        ),
      ).toBe(baseline.catalogues[locale].originalCanonicalHash);
    },
  );
  it("has full shape parity and detects duplicates and altered additions", () => {
    expect(Object.keys(flat.ar).sort()).toEqual(Object.keys(flat.en).sort());
    expect(catalogue('{"a":1,"a":2}').duplicates).toEqual(["a"]);
    const value = structuredClone(messages.en.value) as {
      siteMetadata: { socialImage: Record<string, string> };
    };
    value.siteMetadata.socialImage.headline = "Changed";
    expect(() => withoutMetadataAdditions(value)).toThrow(
      "Unverified metadata additions",
    );
  });
  it.each(["ar", "en"] as const)(
    "rejects a missing %s social image key",
    (locale) => {
      const value = structuredClone(messages[locale].value) as {
        siteMetadata: { socialImage: Record<string, string> };
      };
      delete value.siteMetadata.socialImage.description;
      expect(() => withoutMetadataAdditions(value)).toThrow(
        "Unverified metadata additions",
      );
    },
  );
  it("projects only the reviewed metadata function and JSON-LD change for historical shell proofs", () => {
    const projected = withoutMetadataPresentationChanges(
      sources["src/app/[locale]/layout.tsx"],
    );
    expect(projected).toContain(baseline.projection.metadataFunction.original);
    expect(projected).toContain(baseline.projection.structuredData.original);
    expect(() =>
      withoutMetadataPresentationChanges(
        sources["src/app/[locale]/layout.tsx"].replace(
          'type: "website"',
          'type: "article"',
        ),
      ),
    ).toThrow("Unverified metadata/SEO/JSON-LD change");
    expect(() =>
      withoutMetadataPresentationChanges(
        sources["src/app/[locale]/layout.tsx"].replace(
          '"EducationalOrganization"',
          '"Other"',
        ),
      ),
    ).toThrow("Unverified metadata/SEO/JSON-LD change");
  });
});

const layout = "src/app/[locale]/layout.tsx";
const image = "src/app/[locale]/opengraph-image/route.tsx";
const copyMutants: [string, typeof layout | typeof image, string, string][] = [
  [
    "English title",
    layout,
    'metadata("title", { brand: defaultBrand.BrandName })',
    '"Hardcoded English title"',
  ],
  [
    "Arabic title",
    layout,
    'metadata("title", { brand: defaultBrand.BrandName })',
    '"عنوان عربي ثابت"',
  ],
  [
    "English description",
    layout,
    'metadata("description", {\n    brand: defaultBrand.BrandName,\n  })',
    '"Hardcoded English description"',
  ],
  [
    "Arabic description",
    layout,
    'metadata("description", {\n    brand: defaultBrand.BrandName,\n  })',
    '"وصف عربي ثابت"',
  ],
  [
    "JSON-LD description",
    layout,
    'metadata("organizationDescription")',
    '"Hardcoded organization description"',
  ],
  [
    "English image headline",
    image,
    '{text(copy("headline"))}',
    "Hardcoded image headline",
  ],
  [
    "English image description",
    image,
    '{text(copy("description"))}',
    "Hardcoded image description",
  ],
  ["Arabic image copy", image, '{text(copy("headline"))}', "نص الصورة الثابت"],
  [
    "unbounded namespace",
    image,
    'namespace: "siteMetadata.socialImage"',
    "namespace: location.hash",
  ],
  [
    "unbounded locale",
    image,
    "locale,\n    namespace:",
    "locale: location.hash,\n    namespace:",
  ],
  ["unbounded key", image, 'copy("headline")', "copy(location.hash)"],
];
describe("metadata and ImageResponse scanner mutation resistance", () => {
  it.each(copyMutants)("detects %s", (_name, path, from, to) => {
    expect(sources[path]).toContain(from);
    expect(
      auditMetadata(sources[path].replace(from, to)).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    [layout, "width: 1200", "width: 1000"],
    [layout, "height: 630", "height: 600"],
    [layout, '"summary_large_image"', '"summary"'],
    [layout, "index: true", "index: false"],
    [layout, "follow: true", "follow: false"],
    [layout, '"en_US"', '"en_GB"'],
    [layout, 'publicBase.replace(/\\/$/, "")', "publicBase"],
    [layout, '.replace(/</g, "\\\\u003c")', ""],
    [layout, "canonical: `/${locale}`", 'canonical: "/"'],
    [layout, "brand: defaultBrand.BrandName", 'brand: "BETCCO"'],
    [
      image,
      "export const dynamicParams = false",
      "export const dynamicParams = true",
    ],
    [image, "routing.locales.map", '["ar"].map'],
    [image, "if (!hasLocale(routing.locales, locale)) notFound();", ""],
    [image, '"row-reverse"', '"row"'],
    [image, "padding: 76", "padding: 20"],
    [image, "height: 630", "height: 600"],
  ] as const)("detects contract mutation in %s: %s", (path, from, to) => {
    expect(sources[path]).toContain(from);
    expect(digest(practiceContract(sources[path].replace(from, to)))).not.toBe(
      approved[path],
    );
  });
});
