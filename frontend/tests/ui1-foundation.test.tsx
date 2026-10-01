import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import { BrandLogo } from "@/components/brand-logo";
import { resolveBrandIdentity } from "@/lib/brand";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  Ui1FoundationSpecimen,
  ui1ReplacementSettings,
} from "../specimens/ui1-foundation";

afterEach(cleanup);

describe("replaceable brand presentation", () => {
  test("preserves the default variants and locale-aware settings contract", () => {
    const identity = resolveBrandIdentity("ar");
    expect(identity.name).toBe("BETCCO");
    expect(identity.assets.wordmark).toEqual({
      src: "/brand/BETCCO-logo-horizontal.svg",
      width: 1600,
      height: 500,
    });
    expect(identity.assets.mark.src).toBe("/brand/BETCCO-icon.svg");
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "BETCCO" })).toHaveAttribute(
      "width",
      "1600",
    );
  });

  test("supports long names, distinct mark/favicons and intrinsic ratios", () => {
    const identity = resolveBrandIdentity("en", ui1ReplacementSettings);
    expect(identity.shortName).toBe(ui1ReplacementSettings.BrandName);
    expect(identity.assets.favicon.src).toBe("/brand/BETCCO-icon.svg");
    render(<BrandLogo identity={identity} />);
    const image = screen.getByRole("img", { name: identity.name });
    expect(image).toHaveAttribute("width", "480");
    expect(image).toHaveAttribute("height", "80");
    cleanup();
    render(
      <BrandLogo identity={identity} variant="icon" maxBlockSize="4rem" />,
    );
    const mark = screen.getByRole("img", { name: identity.name });
    expect(mark).toHaveAttribute("width", "80");
    expect(mark).toHaveAttribute("height", "160");
    expect(mark.style.maxBlockSize).toBe("4rem");
  });

  test("retains explicit source/alt overrides and a decorative empty alt", () => {
    render(
      <BrandLogo
        src={ui1ReplacementSettings.Logo}
        alt=""
        dimensions={{ width: 480, height: 80 }}
      />,
    );
    const image = screen.getByAltText("");
    expect(image).toHaveAttribute("src", ui1ReplacementSettings.Logo);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("uses a name fallback for an explicitly absent asset", () => {
    const identity = resolveBrandIdentity("en", { BrandName: "A", Logo: "" });
    render(<BrandLogo identity={identity} />);
    expect(screen.getByRole("img", { name: "A" })).toHaveTextContent("A");
    cleanup();
    render(<BrandLogo identity={identity} alt="" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toHaveAttribute("aria-hidden", "true");
  });

  test.each([
    { LogoWidth: "480" },
    { LogoWidth: "-1", LogoHeight: "80" },
    { LogoWidth: "0", LogoHeight: "80" },
    { LogoWidth: "480.5", LogoHeight: "80" },
    { LogoWidth: "Infinity", LogoHeight: "80" },
  ])(
    "keeps a valid fallback ratio for invalid or incomplete dimensions %j",
    (settings) => {
      expect(
        resolveBrandIdentity("en", settings).assets.wordmark,
      ).toMatchObject({ width: 1600, height: 500 });
    },
  );

  test.each(["ar", "en"] as const)(
    "renders the %s specimen with named actions and non-color state meaning",
    (locale) => {
      render(<Ui1FoundationSpecimen locale={locale} />);
      expect(screen.getByRole("main")).toHaveAttribute("lang", locale);
      expect(screen.getByRole("main")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      const actions = screen.getAllByRole("button");
      expect(actions).toHaveLength(5);
      expect(actions[0]).toHaveAccessibleName();
      expect(actions[3]).toBeDisabled();
      expect(actions[4]).toBeDisabled();
      expect(actions[4]).toHaveAttribute("aria-busy", "true");
      for (const state of ["success", "warning", "danger", "info"]) {
        const label = document.querySelector(`.text-${state}`);
        expect(label?.textContent?.trim().length).toBeGreaterThan(5);
      }
    },
  );
});

const globalsPath = resolve("src/app/globals.css");
const globals = readFileSync(globalsPath, "utf8");
const brandTokens = readFileSync(resolve("src/app/brand-tokens.css"), "utf8");

function tokensFor(theme: "light" | "dark") {
  const values = new Map<string, string>();
  const blocks = [
    brandTokens.match(/:root\s*\{([^}]+)\}/)?.[1],
    globals.match(/:root\s*\{([^}]+)\}/)?.[1],
  ];
  if (theme === "light")
    blocks.push(
      globals.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1],
    );
  for (const block of blocks) {
    for (const match of (block ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g))
      values.set(match[1], match[2].trim());
  }
  function resolve(key: string): string {
    const value = values.get(key);
    if (!value) throw new Error(`Missing token: ${key}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_match, variable: string) =>
      resolve(variable),
    );
  }
  return resolve;
}

function luminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("semantic foundation", () => {
  test.each(["light", "dark"] as const)(
    "supports readable action/state pairs and focus on %s surfaces",
    (theme) => {
      const token = tokensFor(theme);
      for (const action of [
        "primary",
        "secondary",
        "danger",
        "disabled",
        "pending",
      ]) {
        expect(
          contrast(
            token(`--ui-action-${action}-text`),
            token(`--ui-action-${action}`),
          ),
          action,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const state of ["success", "warning", "danger", "info"]) {
        expect(
          contrast(
            token(`--ui-state-${state}`),
            token(`--ui-state-${state}-surface`),
          ),
          state,
        ).toBeGreaterThanOrEqual(4.5);
        expect(token(`--ui-state-${state}`)).toMatch(/^#[a-f0-9]{6}$/);
      }
      for (const surface of [
        "page",
        "content",
        "raised",
        "overlay",
        "muted",
        "interactive",
      ]) {
        expect(
          contrast(token("--ui-focus"), token(`--ui-surface-${surface}`)),
          surface,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(
            token("--ui-text-primary"),
            token(`--ui-surface-${surface}`),
          ),
          surface,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test("preserves legacy surface values in both themes", () => {
    expect(tokensFor("dark")("--surface-solid")).toBe("#173a52");
    expect(tokensFor("light")("--surface-solid")).toBe("#ffffff");
    expect(tokensFor("dark")("--background")).toBe("#0d1b2a");
    expect(tokensFor("light")("--background")).toBe("#f5f6f8");
  });

  test("compiles previously missing and new semantic utility families using the existing Tailwind pipeline", async () => {
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
      "bg-page",
      "bg-surface-solid",
      "bg-secondary",
      "text-warm",
      "border-border",
      "text-danger",
      "bg-surface-overlay",
      "text-text-link",
      "border-border-focus",
      "bg-action-primary",
      "text-action-primary-text",
      "bg-warning-surface",
      "rounded-control",
      "shadow-overlay",
    ];
    const result = await postcss([tailwind()]).process(
      `${globals}\n@source inline("${utilities.join(" ")}");`,
      {
        from: globalsPath,
      },
    );
    for (const utility of utilities)
      expect(result.css).toContain(`.${utility} {`);
  }, 30_000);
});
