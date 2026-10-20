// Run from frontend: node tests/helpers/progress-specimen-browser.mjs OUTPUT_DIR
// Isolated browser evidence only. No Next route or production consumer is added.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const out = path.resolve(process.argv[2] ?? "test-results/ui-d01-06");
const site = path.join(out, "site");
await fs.mkdir(path.join(out, "screenshots"), { recursive: true });
await fs.mkdir(site, { recursive: true });
const { chromium, expect } = require("@playwright/test");
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const viteRequire = createRequire(
  createRequire(require.resolve("vitest/package.json")).resolve(
    "vite/package.json",
  ),
);
const { build } = await import(pathToFileURL(viteRequire.resolve("vite")).href);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react")).href
);
const entry = path.join(site, "entry.tsx");
await fs.writeFile(
  entry,
  `import React from 'react';import{createRoot}from'react-dom/client';import{ProgressSpecimen}from${JSON.stringify(path.join(root, "specimens/ui-d01-06.tsx"))};const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<ProgressSpecimen locale={p.get('locale')} scenario={p.get('scenario')}/>);`,
);
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
  },
  resolve: {
    alias: { "@": path.join(root, "src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: site,
    emptyOutDir: false,
    lib: {
      entry,
      name: "ProgressEvidence",
      formats: ["iife"],
      fileName: () => "specimen.js",
      cssFileName: "specimen",
    },
  },
});
const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
  "postcss",
);
const css = (
  await fs.readFile(path.join(root, "src/app/globals.css"), "utf8")
).replace(
  '@import "./brand-tokens.css";',
  await fs.readFile(path.join(root, "src/app/brand-tokens.css"), "utf8"),
);
await fs.writeFile(
  path.join(site, "actual.css"),
  (
    await postcss([require("@tailwindcss/postcss")()]).process(css, {
      from: path.join(root, "src/app/globals.css"),
    })
  ).css,
);
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/fonts/")) {
    const font = path.resolve(root, "public", "." + url.pathname);
    if (!font.startsWith(path.resolve(root, "public/fonts") + path.sep)) {
      response.writeHead(404);
      return response.end();
    }
    try {
      response.writeHead(200, { "Content-Type": "font/woff2" });
      return response.end(await fs.readFile(font));
    } catch {
      response.writeHead(404);
      return response.end();
    }
  }
  if (["/actual.css", "/specimen.css", "/specimen.js"].includes(url.pathname)) {
    response.writeHead(200, {
      "Content-Type": url.pathname.endsWith(".js")
        ? "application/javascript"
        : "text/css",
    });
    return response.end(
      await fs.readFile(path.join(site, path.basename(url.pathname))),
    );
  }
  const locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
  const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  response.end(
    `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI-D01-06 MOCKED UI-CONTRACT EVIDENCE</title><link rel="stylesheet" href="/actual.css"><link rel="stylesheet" href="/specimen.css"></head><body class="bg-surface-canvas"><div id="root"></div><script src="/specimen.js"></script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const records = [],
  failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const matrix = [];
for (const locale of ["en", "ar"])
  for (const theme of ["light", "dark"])
    for (const width of [1440, 834, 390])
      matrix.push({ locale, theme, width, scenario: "in-progress" });
for (const scenario of [
  "available",
  "locked",
  "waiting-review",
  "aim-waiting-review",
  "complete",
  "missing-configuration",
  "expired",
  "restricted",
  "revision",
  "resit",
  "historical-retake",
  "zero",
  "partial-data",
  "pending",
  "cold-error",
  "empty",
  "cached-error",
  "disabled",
])
  for (const locale of ["en", "ar"])
    matrix.push({
      locale,
      theme: locale === "ar" ? "dark" : "light",
      width: locale === "ar" ? 390 : 1440,
      scenario,
    });
for (const locale of ["en", "ar"])
  for (const theme of ["light", "dark"])
    matrix.push({
      locale,
      theme,
      width: 390,
      scenario: "complete",
      reduced: true,
    });
for (const locale of ["en", "ar"])
  matrix.push({
    locale,
    theme: "light",
    width: 720,
    scenario: "in-progress",
    reflow: true,
  });
function contrast(a, b) {
  const luminance = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
try {
  for (const item of matrix.filter(
    (item) =>
      (!process.argv[3] || item.scenario === process.argv[3]) &&
      (process.argv[4] !== "models" ||
        (item.scenario === "in-progress" &&
          ((item.locale === "en" &&
            item.theme === "light" &&
            item.width === 1440) ||
            (item.locale === "ar" &&
              item.theme === "dark" &&
              item.width === 390)))),
  )) {
    const name = `${item.locale}-${item.theme}-${item.width}-${item.scenario}${item.reduced ? "-reduced" : ""}${item.reflow ? "-equivalent-200-reflow" : ""}`;
    const context = await browser.newContext({
      viewport: {
        width: item.width,
        height:
          item.width === 1440
            ? 900
            : item.width === 834
              ? 1112
              : item.reflow
                ? 450
                : 844,
      },
      deviceScaleFactor: item.reflow ? 2 : 1,
      reducedMotion: item.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage(),
      errors = [],
      api = [],
      writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/api/")) api.push(request.url());
      if (request.method() !== "GET") writes.push(request.method());
    });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/?${new URLSearchParams(item)}`,
    );
    try {
      await expect(page.locator("main")).toBeVisible();
    } catch (error) {
      await fs.writeFile(
        path.join(out, "browser-render-failure.json"),
        JSON.stringify(
          { name, errors, body: await page.locator("body").innerText() },
          null,
          2,
        ),
      );
      throw error;
    }
    await page.evaluate(() => document.fonts.ready);
    const dataVisible = !["pending", "cold-error", "empty"].includes(
      item.scenario,
    );
    await expect(page.locator("[data-progress-model]")).toHaveCount(
      dataVisible ? 6 : 0,
    );
    if (!dataVisible) await expect(page.locator("main a")).toHaveCount(0);
    const metrics = await page.evaluate(() => {
      const background = (element) => {
        for (let e = element; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c !== "transparent" && c !== "rgba(0, 0, 0, 0)") return c;
        }
        return "rgb(255,255,255)";
      };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        direction: getComputedStyle(document.querySelector("main")).direction,
        states: [...document.querySelectorAll("[data-source-state]")].map(
          (e) => ({
            value: e.dataset.sourceState,
            text: e.textContent,
            foreground: getComputedStyle(e).color,
            background: background(e),
          }),
        ),
        controls: [
          ...document.querySelectorAll("select,summary,main a,button"),
        ].map((e) => ({
          tag: e.tagName,
          disabled: e.disabled === true,
          height: e.getBoundingClientRect().height,
          width: e.getBoundingClientRect().width,
          transition: getComputedStyle(e).transitionDuration,
        })),
        railBorder: document.querySelector("[data-progress-model=course] li")
          ? {
              left: getComputedStyle(
                document.querySelector("[data-progress-model=course] li"),
              ).borderLeftWidth,
              right: getComputedStyle(
                document.querySelector("[data-progress-model=course] li"),
              ).borderRightWidth,
            }
          : null,
      };
    });
    check(!metrics.overflow, name + " overflow");
    check(
      metrics.direction === (item.locale === "ar" ? "rtl" : "ltr"),
      name + " direction",
    );
    check(
      !errors.length && !api.length && !writes.length,
      name + " errors/API/writes",
    );
    for (const state of metrics.states) {
      state.contrast = contrast(state.foreground, state.background);
      check(
        state.contrast >= 4.5,
        name + " contrast " + state.value + " " + state.contrast,
      );
    }
    for (const control of metrics.controls) {
      check(
        control.height >= 43.5 && control.width >= 43.5,
        name + " target " + control.tag,
      );
      if (item.reduced)
        check(
          control.transition.split(",").every((t) => parseFloat(t) <= 0.001),
          name + " reduced motion",
        );
    }
    if (metrics.railBorder)
      check(
        metrics.railBorder[item.locale === "ar" ? "right" : "left"] === "2px",
        name + " logical rail",
      );
    if (item.scenario === "in-progress" && !item.reflow) {
      await page.keyboard.press("Tab");
      await expect(page.locator("select")).toBeFocused();
      const selector = page.locator("select");
      metrics.focus = await selector.evaluate((e) => ({
        visible: e.matches(":focus-visible"),
        width: getComputedStyle(e).outlineWidth,
      }));
      check(
        metrics.focus.visible && metrics.focus.width === "3px",
        name + " keyboard focus",
      );
      const first = page.locator("details").first(),
        old = await first.getAttribute("open");
      await first.locator("summary").focus();
      await page.keyboard.press("Enter");
      check(
        (await first.getAttribute("open")) !== old,
        name + " native keyboard disclosure",
      );
      await page.keyboard.press("Enter");
      await selector.selectOption("1");
      await expect(
        page.locator('[data-progress-model="dashboard"] h3'),
      ).toContainText(item.locale === "ar" ? "الأعمال" : "Business");
      await selector.selectOption("0");
      await selector.focus();
    }
    const screenshot = `screenshots/${name}.png`;
    await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
    if (
      item.scenario === "in-progress" &&
      ((item.locale === "en" &&
        item.theme === "light" &&
        item.width === 1440) ||
        (item.locale === "ar" && item.theme === "dark" && item.width === 390))
    )
      for (const model of [
        "course",
        "aim",
        "task",
        "evaluation",
        "dashboard",
        "milestone",
      ]) {
        // Keep glyph ink and focus outlines outside the CSS box in detail crops.
        const box = await page
          .locator(`[data-progress-model="${model}"]`)
          .boundingBox();
        const raw = await page.screenshot({ fullPage: true });
        const dimensions = await sharp(raw).metadata();
        const left = Math.max(0, Math.floor(box.x) - 12);
        const top = Math.max(0, Math.floor(box.y) - 12);
        await sharp(raw)
          .extract({
            left,
            top,
            width: Math.min(dimensions.width - left, Math.ceil(box.width) + 24),
            height: Math.min(
              dimensions.height - top,
              Math.ceil(box.height) + 24,
            ),
          })
          .toFile(
            path.join(
              out,
              `screenshots/${item.locale}-${item.width}-model-${model}.png`,
            ),
          );
      }
    records.push({
      ...item,
      name,
      screenshot,
      ...metrics,
      errors,
      api,
      writes,
    });
    console.log(name + " recorded");
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const sourceHashes = {};
for (const file of [
  "progress-contracts.ts",
  "progress-patterns.tsx",
  "progress-patterns.module.css",
  "progress-fixtures.ts",
  "progress-copy.en.json",
  "progress-copy.ar.json",
  "ui-d01-06.tsx",
])
  sourceHashes[`specimens/${file}`] = createHash("sha256")
    .update(await fs.readFile(path.join(root, "specimens", file)))
    .digest("hex");
await fs.writeFile(
  path.join(out, "browser-evidence.json"),
  JSON.stringify(
    {
      base: "40c1457988fc439b175f3a9cd08f4dc9ead1ec6a",
      status: failures.length ? "FAILED" : "PASSED",
      label: "MOCKED UI-CONTRACT EVIDENCE",
      limits:
        "Isolated actual specimen components and production CSS/fonts; synthetic source-shaped snapshots; no production routes or live backend workflows. Equivalent viewport/DPR reflow is not native zoom. No whole-site WCAG claim.",
      sourceHashes,
      records,
      failures,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ records: records.length, failures }));
if (failures.length) process.exitCode = 1;
