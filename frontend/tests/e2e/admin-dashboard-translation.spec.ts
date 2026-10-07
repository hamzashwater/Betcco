import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import dashboard from "../fixtures/admin-dashboard.json" with { type: "json" };

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`Admin Dashboard ${scenario.locale} — mocked UI-contract evidence`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en;
    const copy = messages.adminWorkspace;
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "Mock Admin", roles: ["Admin"] },
        });
      if (url.pathname.endsWith("/admin/dashboard")) {
        requests.push(url.pathname + url.search);
        return route.fulfill({ json: dashboard });
      }
      if (url.pathname.endsWith("/notifications"))
        return route.fulfill({ json: [] });
      if (url.pathname.endsWith("/cart"))
        return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto(`/${scenario.locale}/admin/dashboard`);
    const heading = page.getByRole("heading", {
      name: copy.dashboard.title,
      exact: true,
    });
    await expect(heading).toBeVisible();
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    const area = page.locator("section.shell").filter({ has: heading });
    await expect(area.getByText(copy.dashboard.description)).toBeVisible();
    for (const label of Object.values(copy.dashboard.periods))
      await expect(
        area.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    await expect(
      area.getByText(copy.dashboard.metrics.activeStudents, { exact: true }),
    ).toBeVisible();
    await expect(area.getByText("92", { exact: true })).toBeVisible();
    await expect(
      area.getByRole("heading", { name: copy.analytics.title }),
    ).toBeVisible();
    await expect(
      area.getByRole("heading", { name: copy.analytics.paidOrders }),
    ).toBeVisible();
    await expect(area.locator("a")).toHaveCount(18);
    for (const href of [
      "students",
      "integrations",
      "academic-catalogue",
      "delivery-planning",
    ]) {
      const link = area.locator(`a[href="/${scenario.locale}/admin/${href}"]`);
      await expect(link).toBeVisible();
      await expect(
        link.getByText(copy.shared.open, { exact: true }),
      ).toBeVisible();
    }
    await expect(
      area.getByRole("heading", { name: copy.navigation.integrations.title }),
    ).toBeVisible();
    await expect(
      area.getByRole("heading", {
        name: messages.academicCatalogue.title,
        exact: true,
      }),
    ).toBeVisible();
    expect(requests).toContain("/api/v1/admin/dashboard?period=30d");
    await area
      .getByRole("button", { name: copy.dashboard.periods.sevenDays })
      .click();
    await expect(heading).toBeVisible();
    await expect
      .poll(() => requests)
      .toContain("/api/v1/admin/dashboard?period=7d");
    await area
      .getByRole("button", { name: copy.dashboard.periods.custom })
      .click();
    await expect(
      area.getByLabel(copy.dashboard.from, { exact: true }),
    ).toBeVisible();
    await expect(
      area.getByLabel(copy.dashboard.to, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await expect(page.locator("body")).not.toContainText("MISSING_MESSAGE");
    await page.screenshot({
      path: testInfo.outputPath(`admin-dashboard-${scenario.locale}.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `admin-dashboard-${scenario.locale}-viewport.png`,
      ),
    });
  });
}
