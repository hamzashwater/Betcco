import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Theme = "light" | "dark";
export const globalsPath = resolve("src/app/globals.css");
export const globals = readFileSync(globalsPath, "utf8");
export const brandTokens = readFileSync("src/app/brand-tokens.css", "utf8");

export function tokenBlocks(theme: Theme) {
  const blocks = [
    brandTokens.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "",
    globals.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "",
  ];
  if (theme === "light")
    blocks.push(
      globals.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] ?? "",
    );
  return blocks;
}

export function tokensFor(theme: Theme) {
  const values = new Map<string, string>();
  for (const block of tokenBlocks(theme))
    for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      values.set(match[1], match[2].trim());
  function token(key: string, seen = new Set<string>()): string {
    if (seen.has(key)) throw new Error(`Circular token: ${key}`);
    const value = values.get(key);
    if (!value) throw new Error(`Missing token: ${key}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_match, variable: string) =>
      token(variable, new Set([...seen, key])),
    );
  }
  return { values, token };
}

export function contrast(a: string, b: string) {
  function luminance(hex: string) {
    if (!/^#[a-f\d]{6}$/i.test(hex))
      throw new Error(`Not an opaque color: ${hex}`);
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((part) => {
        const value = parseInt(part, 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

export function coreContrastPairs(theme: Theme) {
  const { token } = tokensFor(theme);
  const pairs: {
    role: string;
    foreground: string;
    background: string;
    minimum: number;
    ratio: number;
  }[] = [];
  function add(
    role: string,
    foreground: string,
    background: string,
    minimum = 4.5,
  ) {
    const fg = token(`--ui-${foreground}`),
      bg = token(`--ui-${background}`);
    pairs.push({
      role,
      foreground: fg,
      background: bg,
      minimum,
      ratio: contrast(fg, bg),
    });
  }
  for (const surface of [
    "canvas",
    "panel",
    "inset",
    "raised",
    "overlay",
    "row-hover",
    "row-pressed",
    "interactive",
  ])
    for (const text of ["primary", "secondary", "muted", "link"])
      add(
        `text.${text} / surface.${surface}`,
        `text-${text}`,
        `surface-${surface}`,
      );
  for (const surface of [
    "canvas",
    "panel",
    "inset",
    "raised",
    "overlay",
    "row-hover",
    "row-pressed",
    "interactive",
  ]) {
    add(`focus / ${surface}`, "focus-ring", `surface-${surface}`, 3);
    add(
      `control boundary / ${surface}`,
      "border-control",
      `surface-${surface}`,
      3,
    );
  }
  for (const state of ["success", "warning", "danger", "info", "neutral"])
    add(
      `state.${state}`,
      `state-${state}-foreground`,
      `state-${state}-surface`,
    );
  for (const action of ["primary", "secondary", "danger"])
    for (const suffix of ["", "-hover", "-pressed"])
      add(
        `action.${action}${suffix} (compatibility)`,
        `action-${action}-text`,
        `action-${action}${suffix}`,
      );
  for (const suffix of ["", "-hover", "-pressed"])
    add(
      `action.primary${suffix} (approved opt-in)`,
      "action-primary-foreground",
      `action-primary-surface${suffix}`,
    );
  for (const action of ["disabled", "pending"])
    add(`action.${action}`, `action-${action}-text`, `action-${action}`);
  for (const suffix of ["-hover", "-pressed"])
    add(`action.quiet${suffix}`, "action-quiet-text", `action-quiet${suffix}`);
  add("selection", "selection-text", "selection-surface");
  return pairs;
}
