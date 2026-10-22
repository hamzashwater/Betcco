import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import dashboard from "../fixtures/admin-dashboard.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import { roleNavigationFixtures } from "../fixtures/role-navigation";
// MOCKED UI-CONTRACT EVIDENCE: real production rendering, intercepted synthetic API.
test.afterEach(async ({}, info) => {
  const p = info.outputPath("scenario.json");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        title: info.title,
        status: info.status,
        expectedStatus: info.expectedStatus,
      },
      null,
      2,
    ),
  );
});
async function prepare(
  page: Page,
  locale: "en" | "ar",
  theme = "light",
  initial = "data",
  roles = ["Admin"],
) {
  const state = { mode: initial },
    reads: string[] = [],
    writes: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((theme) => {
    localStorage.setItem("betcco-theme", theme);
    localStorage.setItem(
      "betcco-cookie-consent",
      JSON.stringify({
        necessary: true,
        preferences: false,
        analytics: false,
        marketing: false,
        savedAt: new Date().toISOString(),
      }),
    );
  }, theme);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace(/^\/api\/v1/, "");
    if (req.method() !== "GET") {
      writes.push(req.method() + " " + p);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (p === "/admin/dashboard") {
      reads.push(p + url.search);
      if (state.mode === "pending") return new Promise(() => {});
      if (["error", "401", "403"].includes(state.mode))
        return route.fulfill({
          status: state.mode === "error" ? 503 : Number(state.mode),
          json: { message: "Synthetic query failure" },
        });
      const value = {
        ...dashboard,
        period: url.searchParams.get("period") || "30d",
        trend: state.mode === "zero" ? [] : dashboard.trend,
      };
      if (state.mode === "zero")
        for (const key of Object.keys(value) as (keyof typeof value)[])
          if (typeof value[key] === "number")
            Object.assign(value, { [key]: 0 });
      return route.fulfill({ json: value });
    }
    return route.fulfill(roleShellRuntimeResponse(p, locale, roles));
  });
  await page.goto(`/${locale}/admin/dashboard`);
  const copy = locale === "ar" ? ar : en,
    toggle = page.getByRole("button", { name: copy.navigation.theme.toggle });
  await expect(toggle).toBeVisible();
  if (!(await page.locator("html").getAttribute("data-theme")))
    await toggle.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    locale === "ar" ? "rtl" : "ltr",
  );
  return { state, reads, writes, errors, copy };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function ready(page: Page, locale: "en" | "ar") {
  await expect(
    page.getByRole("region", {
      name: (locale === "ar" ? ar : en).adminHomePresentation.operations,
    }),
  ).toBeVisible();
}
for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      test(`${locale} ${theme} ${viewport.width}: Admin populated operational home`, async ({
        page,
      }, info) => {
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme);
        await ready(page, locale);
        const p = c.copy.adminHomePresentation;
        const ops = page.getByRole("region", { name: p.operations }),
          links = ops.getByRole("link");
        expect(
          await links.evaluateAll((a) => a.map((e) => e.getAttribute("href"))),
        ).toEqual(
          ["course-approvals", "evaluations", "evaluations", "gradebook"].map(
            (h) => `/${locale}/admin/${h}`,
          ),
        );
        for (const [i, value] of [3, 4, 5, 9].entries())
          await expect(
            links.nth(i).getByText(String(value), { exact: true }),
          ).toBeVisible();
        const context = page.getByRole("region", { name: p.currentContext }),
          period = page.getByRole("region", { name: p.periodActivity });
        expect(
          await ops.evaluate((a) =>
            a.nextElementSibling?.getAttribute("aria-label"),
          ),
        ).toBe(p.currentContext);
        expect(
          await context.evaluate((a) =>
            a.nextElementSibling?.getAttribute("aria-label"),
          ),
        ).toBe(p.periodActivity);
        await page.screenshot({ path: info.outputPath("operations.png") });
        for (const [name, item] of [
          ["context", context],
          ["period", period],
          [
            "destinations",
            page.getByRole("navigation", { name: p.destinations }),
          ],
        ] as const) {
          await item.scrollIntoViewIfNeeded();
          await noOverflow(page);
          await page.screenshot({ path: info.outputPath(name + ".png") });
        }
        const root = page.locator("section.shell").filter({
          has: page.getByRole("heading", {
            name: c.copy.adminWorkspace.dashboard.title,
            exact: true,
          }),
        });
        await expect(root.locator("a")).toHaveCount(20);
        await expect(
          root.locator(`a[href="/${locale}/admin/retakes"]`),
        ).toContainText(p.legacyRetakes);
        await expect(
          root.locator(`a[href="/${locale}/admin/gradebook"]`),
        ).toContainText(c.copy.adminWorkspace.navigation.gradebook.title);
        expect(
          await root
            .locator("h1,h2,h3,p,button")
            .evaluateAll((a) =>
              a.every((e) => Number(getComputedStyle(e).fontWeight) <= 700),
            ),
        ).toBe(true);
        expect(c.reads).toEqual(["/admin/dashboard?period=30d"]);
        expect(c.writes).toEqual([]);
        expect(c.errors).toEqual([]);
      });
  for (const mode of ["zero", "pending", "error", "401", "403"])
    test(`${locale}: ${mode} query state`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const c = await prepare(page, locale, "dark", mode),
        t = c.copy.adminWorkspace;
      if (mode === "zero") {
        await ready(page, locale);
        const ops = page.getByRole("region", {
          name: c.copy.adminHomePresentation.operations,
        });
        for (const l of await ops.getByRole("link").all())
          await expect(l.getByText("0", { exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath("zero-operations.png") });
        await page
          .getByText(t.analytics.empty, { exact: true })
          .scrollIntoViewIfNeeded();
      } else if (mode === "pending")
        await expect(
          page.getByText(t.shared.loadingIndicator, { exact: true }),
        ).toBeVisible();
      else {
        await expect(
          page.getByText(
            mode === "401"
              ? t.dashboard.signIn
              : mode === "403"
                ? t.courseApprovals.accessDenied
                : t.dashboard.requestError,
            { exact: true },
          ),
        ).toBeVisible({ timeout: 15000 });
        await expect(
          page.getByRole("region", {
            name: c.copy.adminHomePresentation.operations,
          }),
        ).toHaveCount(0);
      }
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath("state.png") });
      expect(c.writes).toEqual([]);
      expect(c.errors).toEqual([]);
    });
  for (const theme of ["light", "dark"])
    test(`${locale} ${theme}: every period and editable invalid custom range`, async ({
      page,
    }, info) => {
      await page.clock.install({ time: new Date("2026-10-22T09:00:00Z") });
      await page.setViewportSize({ width: 834, height: 1112 });
      const c = await prepare(page, locale, theme);
      await ready(page, locale);
      const t = c.copy.adminWorkspace;
      for (const [value, label] of [
        ["today", t.dashboard.periods.today],
        ["7d", t.dashboard.periods.sevenDays],
        ["30d", t.dashboard.periods.thirtyDays],
        ["3m", t.dashboard.periods.threeMonths],
        ["year", t.dashboard.periods.year],
        ["all", t.dashboard.periods.all],
        ["custom", t.dashboard.periods.custom],
      ]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect
          .poll(() => c.reads.some((p) => p.includes(`period=${value}`)))
          .toBe(true);
        await expect(
          page.getByRole("button", { name: label, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await page
          .getByRole("region", {
            name: c.copy.adminHomePresentation.periodActivity,
          })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(value + ".png") });
      }
      await expect(
        page.getByLabel(t.dashboard.from, { exact: true }),
      ).toHaveValue("2026-09-22");
      await expect(
        page.getByLabel(t.dashboard.to, { exact: true }),
      ).toHaveValue("2026-10-22");
      expect(c.reads).toContain(
        "/admin/dashboard?period=custom&fromUtc=2026-09-22T00%3A00%3A00.000Z&toUtc=2026-10-22T23%3A59%3A59.999Z",
      );
      const before = c.reads.length;
      await page
        .getByLabel(t.dashboard.from, { exact: true })
        .fill("2026-10-23");
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(
        t.dashboard.invalidRange,
      );
      expect(c.reads).toHaveLength(before);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath("invalid-custom.png") });
      await page
        .getByLabel(t.dashboard.from, { exact: true })
        .fill("2026-10-20");
      await expect
        .poll(() => c.reads)
        .toContain(
          "/admin/dashboard?period=custom&fromUtc=2026-10-20T00%3A00%3A00.000Z&toUtc=2026-10-22T23%3A59%3A59.999Z",
        );
      await ready(page, locale);
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      expect(c.writes).toEqual([]);
      expect(c.errors).toEqual([]);
    });
  test(`${locale}: cache refresh error preserves operation counts and every destination`, async ({
    page,
  }, info) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    const c = await prepare(page, locale, "dark");
    await ready(page, locale);
    const root = page.locator("main"),
      before = await root
        .locator("a")
        .evaluateAll((a) => a.map((e) => e.getAttribute("href")));
    c.state.mode = "error";
    await page.clock.fastForward(31000);
    await page.evaluate(() => {
      dispatchEvent(new Event("offline"));
      dispatchEvent(new Event("online"));
    });
    await expect(
      page.getByText(c.copy.adminWorkspace.dashboard.requestError, {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await root
        .locator("a")
        .evaluateAll((a) => a.map((e) => e.getAttribute("href"))),
    ).toEqual(before);
    const links = page
      .getByRole("region", { name: c.copy.adminHomePresentation.operations })
      .getByRole("link");
    for (const [i, v] of [3, 4, 5, 9].entries())
      await expect(
        links.nth(i).getByText(String(v), { exact: true }),
      ).toBeVisible();
    await page.screenshot({ path: info.outputPath("cached-error.png") });
    expect(c.writes).toEqual([]);
    expect(c.errors).toEqual([]);
  });
  for (const name of ["LeadIV", "coordinator-only"])
    for (const width of [1440, 390])
      test(`${locale} ${width}: ${name} restricted home retains exact eligible shell`, async ({
        page,
      }, info) => {
        const fixture = roleNavigationFixtures.find((f) =>
          name === "LeadIV" ? f.name === "LeadIV" : f.name === "coordinator",
        )!;
        await page.setViewportSize({ width, height: 900 });
        const c = await prepare(
          page,
          locale,
          width === 390 ? "light" : "dark",
          "403",
          fixture.roles,
        );
        await expect(
          page.getByText(c.copy.adminWorkspace.courseApprovals.accessDenied, {
            exact: true,
          }),
        ).toBeVisible({ timeout: 15000 });
        await expect(
          page.getByRole("region", {
            name: c.copy.adminHomePresentation.operations,
          }),
        ).toHaveCount(0);
        if (width === 390)
          await page
            .getByRole("button", {
              name: c.copy.navigation.accessibility.openMenu,
              exact: true,
            })
            .click();
        const nav =
          width === 390
            ? page.getByRole("dialog").locator("nav")
            : page.locator("#staff-workspace-navigation");
        expect(
          await nav
            .locator("a")
            .evaluateAll((a) => a.map((e) => e.getAttribute("href")).sort()),
        ).toEqual(
          fixture.destinations
            .map((h) => `/${locale}/admin${h ? "/" + h : ""}`)
            .sort(),
        );
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath("restricted-shell.png"),
        });
        expect(c.writes).toEqual([]);
        expect(c.errors).toEqual([]);
      });
  test(`${locale}: keyboard focus, reduced motion and 200 percent reflow proxy`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 720, height: 450 });
    const c = await prepare(page, locale);
    await ready(page, locale);
    const first = page
      .getByRole("region", { name: c.copy.adminHomePresentation.operations })
      .getByRole("link")
      .first();
    await first.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    expect(await first.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe(
      "solid",
    );
    expect(
      Number.parseFloat(
        await first.evaluate((e) => getComputedStyle(e).transitionDuration),
      ),
    ).toBeLessThanOrEqual(0.001);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("keyboard-reflow.png") });
    expect(c.writes).toEqual([]);
    expect(c.errors).toEqual([]);
  });
}
