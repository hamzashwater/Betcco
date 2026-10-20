import { expect, test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };

// MOCKED UI-CONTRACT EVIDENCE: real Next routing/navigation, synthetic API.
// This verifies client classification, not backend authorization policy.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/settings/public")) return route.fulfill({ json: {} });
    if (path.endsWith("/public/teachers")) return route.fulfill({ json: [] });
    if (path.endsWith("/taxonomy"))
      return route.fulfill({ json: { grades: [], specializations: [] } });
    return route.fulfill({
      status: 401,
      json: { message: "Synthetic unauthenticated response" },
    });
  });
});

for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  test(`guest /${locale}/teachers stays public and preserves query/hash when switching locale`, async ({
    page,
  }) => {
    const query = "?page=2&filter=grade%2F11%20science",
      hash = "#directory";
    await page.setViewportSize({ width: 1440, height: 900 });
    const auth = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/v1/auth/me",
    );
    await page.goto(`/${locale}/teachers${query}${hash}`);
    expect((await auth).status()).toBe(401);
    await expect(
      page.getByRole("link", { name: copy.login, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: copy.publicContent.teachers.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", {
        name: copy.navigation.accessibility.primary,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", {
        name: copy.navigation.accessibility.workspace,
      }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${locale}/teachers` &&
        url.search === query &&
        url.hash === hash,
    );
    await expect(page.locator("header a").first()).toHaveAttribute(
      "href",
      `/${locale}`,
    );
    await page
      .getByRole("link", { name: copy.navigation.accessibility.switchLanguage })
      .click();
    const alternate = locale === "ar" ? "en" : "ar";
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${alternate}/teachers` &&
        url.search === query &&
        url.hash === hash,
    );
    await expect(page.locator("html")).toHaveAttribute("lang", alternate);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      alternate === "ar" ? "rtl" : "ltr",
    );
  });

  for (const section of ["teacher", "teacher/courses"]) {
    test(`guest /${locale}/${section} retains the existing login redirect`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/${section}`);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/${locale}/login`,
      );
    });
  }
}
