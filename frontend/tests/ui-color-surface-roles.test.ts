import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import { describe, expect, test } from "vitest";
import {
  brandTokens,
  coreContrastPairs,
  globals,
  globalsPath,
  tokenBlocks,
  tokensFor,
} from "./helpers/ui-color-roles";

describe("UI-D01-02 approved color and surface foundation", () => {
  test.each(["light", "dark"] as const)(
    "resolves paired roles and every custom-property reference without cycles (%s)",
    (theme) => {
      const { token, values } = tokensFor(theme);
      for (const family of [
        "surface-canvas",
        "surface-section",
        "surface-panel",
        "surface-inset",
        "surface-overlay",
        "surface-muted",
        "surface-interactive",
        "surface-row",
        "surface-row-hover",
        "surface-row-pressed",
        "text-primary",
        "text-secondary",
        "text-muted",
        "text-link",
        "text-on-image",
        "border-default",
        "border-strong",
        "border-interactive",
        "focus-ring",
        "selection-marker",
        "action-primary",
        "action-primary-hover",
        "action-primary-pressed",
        "action-primary-text",
        "action-primary-surface",
        "action-primary-foreground",
        "action-secondary",
        "action-disabled",
      ])
        expect(token(`--ui-${family}`), family).not.toContain("var(");
      for (const key of values.keys())
        expect(() => token(key), key).not.toThrow();
      const declarations = new Set(
        [...`${brandTokens}\n${globals}`.matchAll(/(--[\w-]+):/g)].map(
          (match) => match[1],
        ),
      );
      for (const ref of `${brandTokens}\n${globals}`.matchAll(
        /var\((--[\w-]+)([,)]?)/g,
      ))
        if (ref[2] !== ",") expect(declarations.has(ref[1]), ref[1]).toBe(true);
      for (const block of tokenBlocks(theme)) {
        const names = [...block.matchAll(/(--[\w-]+):/g)].map(
          (match) => match[1],
        );
        expect(new Set(names).size).toBe(names.length);
      }
    },
  );

  test("preserves six identity anchors and the exact approved small ramps", () => {
    const { token } = tokensFor("dark");
    for (const [name, value] of Object.entries({
      navy: "#0d1b2a",
      blue: "#1b4f72",
      teal: "#21c1a6",
      "teal-strong": "#087d6f",
      mint: "#e6f7f5",
      white: "#f5f6f8",
    }))
      expect(token(`--betcco-${name}`)).toBe(value);
    for (const step of [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900])
      expect(token(`--betcco-neutral-${step}`)).toMatch(/^#[a-f\d]{6}$/);
    for (const family of ["blue", "teal"])
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900])
        expect(token(`--betcco-${family}-${step}`)).toMatch(/^#[a-f\d]{6}$/);
  });

  test.each(["light", "dark"] as const)(
    "meets core text, state, interaction, control and focus contrast (%s)",
    (theme) => {
      for (const pair of coreContrastPairs(theme))
        expect(
          pair.ratio,
          `${theme}: ${pair.role} ${pair.foreground}/${pair.background}`,
        ).toBeGreaterThanOrEqual(pair.minimum);
      const { token } = tokensFor(theme);
      for (const state of ["success", "warning", "danger", "info"]) {
        expect(
          tokensFor(theme).values.get(`--ui-state-${state}`),
        ).not.toContain("betcco-");
        for (const suffix of ["foreground", "surface", "border"]) {
          const name = `--ui-state-${state}-${suffix}`;
          expect(token(name)).toMatch(/^#[a-f\d]{6}$/);
          expect(token(name)).not.toBe(token("--betcco-teal"));
          expect(token(name)).not.toBe(token("--betcco-blue"));
          expect(tokensFor(theme).values.get(name)).not.toContain("betcco-");
        }
      }
    },
  );

  test("separates invariant image text from both current and final primary-action pairs", () => {
    for (const theme of ["light", "dark"] as const) {
      const { token, values } = tokensFor(theme);
      expect(token("--ui-text-on-image")).toBe("#f5f6f8");
      expect(values.get("--ui-text-on-image")).not.toContain("action");
      // Existing Actions and gradient consumers are deliberately not migrated.
      expect(token("--ui-action-primary")).toBe("#1b4f72");
      expect(token("--ui-action-primary-text")).toBe("#f5f6f8");
    }
    expect(tokensFor("dark").token("--ui-action-primary-surface")).toBe(
      "#86bad6",
    );
    expect(tokensFor("dark").token("--ui-action-primary-foreground")).toBe(
      "#0d1b2a",
    );
    const catalogue = readFileSync("src/app/[locale]/courses/page.tsx", "utf8");
    expect(catalogue.match(/text-text-on-image/g)).toHaveLength(3);
    expect(catalogue).not.toContain("text-action-primary-text");
    expect(catalogue).toContain("rgba(5,10,25,.72)");
  });

  test("preserves legacy surfaces while providing transparent grouping and opaque working panels", () => {
    for (const theme of ["light", "dark"] as const) {
      const { token } = tokensFor(theme);
      expect(token("--ui-surface-section")).toBe("transparent");
      expect(token("--ui-surface-row")).toBe("transparent");
      for (const role of ["panel", "overlay", "inset"])
        expect(token(`--ui-surface-${role}`)).toMatch(/^#[a-f\d]{6}$/);
    }
    expect(tokensFor("light").token("--ui-surface-panel")).toBe("#ffffff");
    expect(tokensFor("light").token("--surface")).toBe("#f5f6f8");
    expect(tokensFor("dark").token("--surface-solid")).toBe("#173a52");
    expect(globals).toContain("backdrop-filter: blur(14px)");
  });

  test("compiles the new utilities through the production Tailwind pipeline", async () => {
    const require = createRequire(resolve("package.json"));
    const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
      "postcss",
    ) as (plugins: unknown[]) => {
      process: (
        css: string,
        options: { from: string },
      ) => Promise<{ css: string }>;
    };
    const utilities = [
      "bg-surface-canvas",
      "bg-surface-section",
      "bg-surface-panel",
      "bg-surface-row",
      "bg-surface-row-hover",
      "bg-surface-row-pressed",
      "bg-selection-surface",
      "text-selection-text",
      "text-text-on-image",
      "border-border-interactive",
      "text-icon-action",
      "bg-action-primary-surface",
      "bg-action-primary-surface-hover",
      "bg-action-primary-surface-pressed",
      "text-action-primary-foreground",
      "outline-focus-ring",
      "bg-success-surface",
      "text-state-success-foreground",
    ];
    const result = await postcss([tailwind()]).process(
      `${globals}\n@source inline("${utilities.join(" ")}");`,
      { from: globalsPath },
    );
    for (const utility of utilities)
      expect(result.css).toContain(`.${utility} {`);
  }, 30_000);
});
