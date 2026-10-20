import { expect, test, type Page } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleNavigationFixtures } from "../fixtures/role-navigation";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE: actual Next shell, routing and native links.
// Synthetic GET responses do not establish backend authorization or workflows.
async function prepare(page: Page, locale: string, roles: string[]) {
  await page.addInitScript(
    (theme) => {
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
    },
    locale === "ar" ? "dark" : "light",
  );
  const requests: string[] = [],
    writes: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    requests.push(request.url());
    if (request.method() !== "GET") writes.push(request.method() + " " + path);
    await route.fulfill(roleShellRuntimeResponse(path, locale, roles));
  });
  return { requests, writes };
}

for (const locale of ["en", "ar"] as const) {
  const m = locale === "ar" ? ar : en;
  for (const fixture of roleNavigationFixtures) {
    test(`${locale}: actual mobile ${fixture.name} preserves exact eligible routes and drawer focus`, async ({
      page,
    }, info) => {
      const { writes } = await prepare(page, locale, fixture.roles);
      await page.setViewportSize({ width: 390, height: 844 });
      // Keep healthy representative content separate from nested-shell checks below.
      const path =
        fixture.section === "student"
          ? "student/courses"
          : fixture.section === "admin"
            ? fixture.roles.includes("CourseReviewer") ||
              fixture.roles.includes("LeadInternalVerifier")
              ? "admin/evaluations"
              : "admin"
            : fixture.section === "support"
              ? "support/accounts"
              : fixture.path;
      await page.goto(`/${locale}/${path}`);
      const opener = page
        .getByRole("button", { name: m.navigation.accessibility.openMenu })
        .last();
      await expect(opener).toBeVisible();
      if (fixture.section === "student") {
        const dock = page.locator("nav.fixed");
        await expect(dock.locator("a")).toHaveCount(4);
        expect(
          await dock
            .locator("a")
            .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
        ).toEqual([
          `/${locale}/student`,
          `/${locale}/student/courses`,
          `/${locale}/student/evaluations`,
          `/${locale}/student/planner`,
        ]);
      }
      await opener.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const root = `/${locale}${fixture.section ? "/" + fixture.section : ""}`;
      expect(
        await dialog
          .locator("nav a")
          .evaluateAll((links) =>
            links.map((a) => a.getAttribute("href")).sort(),
          ),
      ).toEqual(
        fixture.destinations
          .map((part) => root + (part ? "/" + part : ""))
          .sort(),
      );
      const close = dialog.getByRole("button", {
        name: m.navigation.accessibility.closeMenu,
      });
      await expect(close).toBeFocused();
      expect(
        await page
          .locator("#main-content")
          .evaluate((main) => !!main.closest("[inert]")),
      ).toBe(true);
      await page.keyboard.press("Shift+Tab");
      expect(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.screenshot({ path: info.outputPath("mobile-drawer.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(
        await page
          .locator("#main-content")
          .evaluate((main) => !!main.closest("[inert]")),
      ).toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(writes).toEqual([]);
    });
  }

  for (const role of ["Teacher", "Admin"] as const) {
    test(`${locale}: actual ${role} desktop gutter, hide/reopen, footer and tablet drawer`, async ({
      page,
    }, info) => {
      const section = role.toLowerCase();
      await prepare(page, locale, [role]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/${locale}/${section}`);
      const sidebar = page.locator("#staff-workspace-navigation");
      await expect(sidebar).toBeVisible();
      const aside = (await sidebar.boundingBox())!,
        main = (await page.locator("#main-content").boundingBox())!;
      expect(aside.width).toBe(role === "Teacher" ? 240 : 256);
      expect(
        locale === "ar"
          ? main.x + main.width <= aside.x
          : main.x >= aside.x + aside.width,
      ).toBe(true);
      const footer = (await page.locator("footer").boundingBox())!;
      expect(
        locale === "ar"
          ? footer.x + footer.width <= aside.x
          : footer.x >= aside.x + aside.width,
      ).toBe(true);
      await sidebar
        .getByRole("button", { name: m.navigation.roleShell.hideNavigation })
        .click();
      const reopen = page.getByRole("button", {
        name: m.navigation.roleShell.showNavigation,
      });
      await expect(reopen).toBeFocused();
      await expect(sidebar).toBeHidden();
      const expanded = (await page.locator("#main-content").boundingBox())!;
      expect(expanded.width).toBeGreaterThan(main.width);
      await reopen.click();
      await expect(
        sidebar.getByRole("button", {
          name: m.navigation.roleShell.hideNavigation,
        }),
      ).toBeFocused();
      await page.screenshot({ path: info.outputPath("desktop-focus.png") });
      await page.setViewportSize({ width: 834, height: 1112 });
      await expect(sidebar).toBeHidden();
      expect((await page.locator("#main-content").boundingBox())!.width).toBe(
        834,
      );
      await page
        .getByRole("button", { name: m.navigation.accessibility.openMenu })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: info.outputPath("tablet-drawer.png") });
    });
  }

  test(`${locale}: actual local palette uses existing eligible destinations and native routing`, async ({
    page,
  }, info) => {
    const { requests, writes } = await prepare(page, locale, ["Teacher"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/teacher`);
    await expect(page.locator("#staff-workspace-navigation")).toBeVisible();
    const before = requests.filter((url) =>
      url.includes("/catalog/courses"),
    ).length;
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", {
      name: m.navigation.commandPalette.label,
    });
    await expect(palette).toBeVisible();
    await expect(
      palette.getByRole("button", {
        name: m.teacherStudentFollowUp.navigation,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      requests.filter((url) => url.includes("/catalog/courses")),
    ).toHaveLength(before);
    await page.screenshot({ path: info.outputPath("palette.png") });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/students$`));
    await expect(palette).toHaveCount(0);
    expect(
      requests.filter((url) => url.includes("/catalog/courses")),
    ).toHaveLength(before);
    expect(writes).toEqual([]);
  });

  test(`${locale}: real course context stays separate and locale preserves query/hash`, async ({
    page,
  }, info) => {
    await prepare(page, locale, ["Teacher"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    const query = "?query=grade%2F11%20science";
    await page.goto(
      `/${locale}/teacher/courses/course-raw${query}#assignments`,
    );
    const local = page.getByRole("navigation", {
      name: m.teacherCourseWorkspace.navigation.label,
      exact: true,
    });
    await expect(local).toBeVisible();
    expect(
      await local
        .locator("a")
        .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
    ).toEqual(
      [
        "details",
        "access",
        "announcements",
        "curriculum",
        "assignments",
        "review",
      ].map((part) => "#" + part),
    );
    await expect(local.locator('a[href="#assignments"]')).toHaveAttribute(
      "aria-current",
      "location",
    );
    await expect(
      page.locator(
        `#staff-workspace-navigation a[href="/${locale}/teacher/courses"]`,
      ),
    ).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: info.outputPath("course-context.png") });
    await page
      .getByRole("link", { name: m.navigation.accessibility.switchLanguage })
      .click();
    const alternate = locale === "ar" ? "en" : "ar";
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${alternate}/teacher/courses/course-raw` &&
        url.search === query &&
        url.hash === "#assignments",
    );
  });

  test(`${locale}: real nested Student route keeps the Courses dock current`, async ({
    page,
  }, info) => {
    await prepare(page, locale, ["Student"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/student/learn/course-raw/lesson-raw`);
    await expect(
      page.locator(`nav.fixed a[href="/${locale}/student/courses"]`),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/student/learn/course-raw/lesson-raw$`),
    );
    await page.screenshot({ path: info.outputPath("student-nested.png") });
  });
}
