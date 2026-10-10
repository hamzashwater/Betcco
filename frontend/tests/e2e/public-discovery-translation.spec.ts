import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  course,
  detail,
  preview,
  taxonomy,
} from "../helpers/public-discovery-fixtures";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`public discovery/catalogue ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }, testInfo) => {
    const messages = scenario.locale === "ar" ? ar : en,
      m = messages.publicDiscovery;
    const errors: string[] = [],
      requests: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/**", (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      requests.push(`${req.method()} ${path}${url.search}`);
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "RAW Student", roles: ["Student"] },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/settings/public")) return route.fulfill({ json: {} });
      if (path.endsWith("/platform/summary"))
        return route.fulfill({
          json: {
            publishedCourses: 4,
            publishedLessons: 12,
            activeTeachers: 2,
            enrolledStudents: 7,
          },
        });
      if (path.endsWith("/taxonomy")) return route.fulfill({ json: taxonomy });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/cart") || path.includes("/cart/courses/"))
        return route.fulfill({ json: { items: [] } });
      if (path.endsWith("/preview/lesson-1"))
        return route.fulfill({ json: preview });
      if (path.endsWith("/catalog/courses/raw-course"))
        return route.fulfill({ json: detail });
      if (path.endsWith("/catalog/courses"))
        return route.fulfill({
          json: { items: [course], page: 1, pageSize: 12, totalCount: 1 },
        });
      return route.fulfill({ json: { items: [] } });
    });
    async function evidence(name: string) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      const buffer = await page.screenshot({ fullPage: true });
      await testInfo.attach(name, { body: buffer, contentType: "image/png" });
      if (process.env.BETCCO_EVIDENCE_DIR) {
        mkdirSync(process.env.BETCCO_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({
          path: `${process.env.BETCCO_EVIDENCE_DIR}/${scenario.locale}-${name}.png`,
          fullPage: true,
        });
      }
    }
    await page.goto(`/${scenario.locale}`);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    await expect(
      page.getByText(m.home.publishedCourses, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: m.home.latestPublishedCourses }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: m.images.clearDigitalSpecializations }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: messages.navigation.allTracks,
        exact: true,
      }),
    ).toHaveAttribute("href", `/${scenario.locale}/tracks`);
    await evidence("home");
    await page
      .locator("main")
      .getByRole("link", { name: messages.browseCourses, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/${scenario.locale}/courses$`));
    await expect(
      page.getByRole("heading", { name: m.catalog.discoverCourses }),
    ).toBeVisible();
    const search = page.getByPlaceholder(m.catalog.searchCourses);
    await search.fill("query");
    await page
      .getByRole("combobox", { name: m.catalog.track, exact: true })
      .selectOption("raw-track");
    await page
      .getByRole("combobox", { name: m.catalog.specialization, exact: true })
      .selectOption("raw-specialization");
    await page
      .getByRole("combobox", { name: m.catalog.subject, exact: true })
      .selectOption("raw-subject");
    await page
      .getByRole("combobox", { name: m.catalog.sort, exact: true })
      .selectOption("price-desc");
    await expect
      .poll(() =>
        requests.some((r) =>
          r.includes(
            `/catalog/courses?locale=${scenario.locale}&pageSize=12&search=query&track=raw-track&specialization=raw-specialization&subject=raw-subject&sort=price-desc`,
          ),
        ),
      )
      .toBe(true);
    const clear = page.getByRole("button", {
      name: m.catalog.clearFilters,
      exact: true,
    });
    await clear.focus();
    await expect(clear).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(search).toHaveValue("query");
    await expect(
      page.getByRole("combobox", { name: m.catalog.track, exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("combobox", { name: m.catalog.sort, exact: true }),
    ).toHaveValue("price-desc");
    await evidence("catalogue");
    await page.getByRole("link", { name: course.title, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${scenario.locale}/courses/raw-course$`),
    );
    await expect(
      page.getByRole("heading", { name: course.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: m.detail.breadcrumb }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: m.detail.courseSections }),
    ).toBeVisible();
    await expect(
      page.getByText(
        scenario.locale === "ar"
          ? detail.outcomes[0].arabic
          : detail.outcomes[0].english,
        { exact: true },
      ),
    ).toBeVisible();
    const open = page.getByRole("button", { name: m.detail.open, exact: true });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(preview.body, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: preview.resources[0].displayName }),
    ).toHaveAttribute("href", preview.resources[0].externalUrl);
    await evidence("detail-preview");
    await page
      .getByRole("button", { name: m.detail.close, exact: true })
      .click();
    await expect(page.getByText(preview.body, { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: m.detail.addToCart, exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: m.detail.courseAddedToCart }),
    ).toBeVisible();
    expect(requests).toContain(
      `POST /api/v1/cart/courses/${course.id}?locale=${scenario.locale}`,
    );
    await expect(
      page.getByRole("link", { name: m.detail.viewCart, exact: true }),
    ).toHaveAttribute("href", `/${scenario.locale}/cart`);
    expect(errors).toEqual([]);
  });
}
