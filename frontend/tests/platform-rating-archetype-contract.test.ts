import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-platform-rating-baseline.json";
import { platformRatingContracts } from "./helpers/platform-rating-contracts";
import {
  projectPlatformRatingBoundary,
  withoutPlatformRatingAdditions,
} from "./helpers/platform-rating-projection";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  path = baseline.path,
  source = read(path);
describe("Slice 4 independent consent/transport/presentation boundary", () => {
  it("pins pre-edit live main and exact reviewed fixture", () => {
    expect(baseline.base).toBe("30322f0d73f6ad390025cb4b5e29447d336288dd");
    expect(baseline.originalHash).toBe(
      "3f9243790c04ee03ba309c6676b4404095b124b471eea5471e9e7c333d8557c1",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "1e29041d4a4b6d47614086cac8d96bf1f59b828ae36efa0b2606b0659ef1675a",
    );
  });
  it("directly freezes separate queries/options, mutation/payload/reason normalization/invalidation, all DTO fields, average arithmetic/formatting and action eligibility", () => {
    expect(platformRatingContracts(source)).toEqual(baseline.invariants);
    expect(source).not.toMatch(
      /\.filter\(|\.sort\(|\.toSorted\(|\.slice\(|localStorage|sessionStorage|useEffect|StudentUserId|studentUserId|studentName|email|window\.confirm|bulk|selectAll/,
    );
    expect(source).toContain("ratings.data?.map((rating) => {");
    expect(source).not.toContain("const pending =");
  });
  it("restores only exact unique owner seams and fails closed", () => {
    expect(
      hash(projectPlatformRatingBoundary(source, "C:/workspace/" + path)),
    ).toBe(baseline.originalHash);
    expect(hash(projectPlatformRatingBoundary(source, path))).toBe(
      baseline.originalHash,
    );
    expect(
      projectPlatformRatingBoundary(
        source,
        "src/features/other/platform-rating-moderation.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(
          hash(
            projectPlatformRatingBoundary(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each([
    ['["admin-platform-ratings"]', '["changed"]'],
    ['["admin-platform-ratings-summary"]', '["summary"]'],
    ['"/admin/platform-ratings"', '"/other"'],
    ['"/admin/platform-ratings/summary"', '"/summary"'],
    ['method: "POST"', 'method: "PUT"'],
    ["reasons[id]?.trim() || null", "reasons[id] || null"],
    ['["platform-ratings"]', '["other-public"]'],
    ["moderate.isPending || !rating.allowPublicDisplay", "moderate.isPending"],
    ["publish: false", "publish: true"],
    ["maxLength={500}", "maxLength={501}"],
    [
      'reasons[rating.id] ?? rating.moderationReason ?? ""',
      'rating.moderationReason ?? ""',
    ],
    ["rating.supportScore +", "rating.courseQualityScore +"],
    ["minimumFractionDigits: 1", "minimumFractionDigits: 0"],
    ["allowPublicDisplay: boolean", "allowPublicDisplay: string"],
  ])("rejects consent/transport/reason/score drift at %s", (from, to) => {
    const changed = source.replace(from, to);
    expect(changed).not.toBe(source);
    expect(platformRatingContracts(changed)).not.toEqual(baseline.invariants);
    expect(hash(projectPlatformRatingBoundary(changed, path))).not.toBe(
      baseline.originalHash,
    );
  });
  it.each(Object.entries(baseline.protected))(
    "keeps completed owners/dependencies/business producers frozen: %s",
    (p, expected) => {
      expect(hash(projectPlatformRatingBoundary(read(p), p)), p).toBe(expected);
    },
  );
  it.each(["en", "ar"] as const)(
    "permits only nine exact paired %s factual leaves and retains every old message",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw);
      expect(hash(projectPlatformRatingBoundary(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(
        hash(
          JSON.stringify(
            withoutPlatformRatingAdditions(structuredClone(m)),
            null,
            2,
          ) + "\n",
        ),
      ).toBe(baseline.messageHashes[locale]);
      for (const key of Object.keys(baseline.additions[locale])) {
        const changed = structuredClone(m);
        changed.adminWorkspace.platformRatingModeration[key] = "Changed";
        expect(() => withoutPlatformRatingAdditions(changed)).toThrow();
      }
      const unrelated = structuredClone(m);
      unrelated.adminWorkspace.platformRatingModeration.extra = "Unreviewed";
      expect(
        hash(
          JSON.stringify(withoutPlatformRatingAdditions(unrelated), null, 2) +
            "\n",
        ),
      ).not.toBe(baseline.messageHashes[locale]);
    },
  );
  it("keeps every historical test alignment exact, mutation sensitive and fail closed", () => {
    for (const [p, seams] of Object.entries(baseline.guardSeams)) {
      const raw = read(p),
        original = projectPlatformRatingBoundary(raw, p);
      expect(original).not.toBe(raw);
      for (const seam of seams)
        for (const replacement of [
          "",
          seam.approved + seam.approved,
          seam.approved.replace(/\S/, "#"),
        ])
          expect(
            projectPlatformRatingBoundary(
              raw.replace(seam.approved, replacement),
              p,
            ),
          ).toBe(raw.replace(seam.approved, replacement));
    }
  });
  it("uses local DC03/semantic opaque surfaces, factual status, wrap, 44px controls and focus without new motion", () => {
    const css = read(
        "src/features/admin/platform-rating-moderation.module.css",
      ),
      globals = read("src/app/globals.css");
    expect(source + css).not.toMatch(
      /font-(black|extrabold)|font-weight:\s*[89]00|backdrop-filter|gradient|box-shadow|opacity:|animation:|transition:/,
    );
    for (const token of css.matchAll(/var\((--[\w-]+)\)/g))
      expect(globals, token[1]).toContain(token[1] + ":");
    expect(
      [...css.matchAll(/font-weight:\s*(\d+)/g)].every((m) =>
        ["400", "500", "600", "700"].includes(m[1]),
      ),
    ).toBe(true);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(source).toContain("data-published={rating.isPublished}");
    expect(source).toContain("data-consent={rating.allowPublicDisplay}");
    for (const field of [
      "totalCount",
      "publishedCount",
      "awaitingModerationCount",
      "privateWithoutConsentCount",
      "averageScore",
    ])
      expect(source).toContain(`summary.data.${field}`);
  });
});
