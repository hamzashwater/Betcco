import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`shared shell and accessibility in ${scenario.locale} (mocked API)`, async ({
    page,
  }) => {
    const m = scenario.locale === "ar" ? ar : en;
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(scenario);
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      requests.push(`${request.method()} ${path}`);
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "RAW Teacher", roles: ["Teacher"] },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/taxonomy"))
        return route.fulfill({
          json: { tracks: [], grades: [], specializations: [] },
        });
      if (path.endsWith("/settings/public")) return route.fulfill({ json: {} });
      if (path.endsWith("/notifications"))
        return route.fulfill({
          json: [
            {
              id: "raw-id",
              title: "RAW title إشعار",
              body: "RAW body نص",
              deepLink: "/teacher/courses",
              createdAtUtc: "2026-10-10T00:00:00Z",
            },
          ],
        });
      if (path.endsWith("/notifications/read-all"))
        return route.fulfill({ json: {} });
      if (path.endsWith("/catalog/courses"))
        return route.fulfill({
          json: {
            items: [
              {
                id: "raw-course",
                title: "RAW Course دورة",
                track: "RAW track",
                slug: "raw-course",
              },
            ],
          },
        });
      if (path.endsWith("/cart")) return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto(`/${scenario.locale}`);
    await expect(
      page.getByRole("link", {
        name: m.navigation.accessibility.skipToMainContent,
      }),
    ).toHaveAttribute("href", "#main-content");
    await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      scenario.locale === "ar" ? "rtl" : "ltr",
    );
    await page.getByRole("button", { name: m.cookieConsent.reject }).click();
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: m.navigation.commandPalette.label }),
    ).toBeVisible();
    const input = page.getByRole("textbox", {
      name: m.navigation.accessibility.searchCourses,
    });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute(
      "placeholder",
      m.navigation.commandPalette.placeholder,
    );
    await expect(
      page.getByRole("button", {
        name: m.navigation.commandPalette.browseCourses,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(m.navigation.commandPalette.keyboardHelp),
    ).toBeVisible();
    await input.fill("ab");
    await expect(
      page.getByRole("button", { name: /RAW Course دورة.*RAW track/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: m.navigation.commandPalette.label }),
    ).toHaveCount(0);

    if (scenario.locale === "ar") {
      await page
        .getByRole("button", { name: m.navigation.accessibility.openMenu })
        .click();
    }
    const themeScope =
      scenario.locale === "ar"
        ? page.getByRole("dialog", {
            name: m.navigation.accessibility.navigationMenu,
          })
        : page;
    const theme = themeScope
      .getByRole("button", { name: m.navigation.theme.toggle })
      .filter({ visible: true })
      .first();
    const before = await page.locator("html").getAttribute("data-theme");
    await theme.click();
    const next = before === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", next);
    expect(
      await page.evaluate(() => localStorage.getItem("betcco-theme")),
    ).toBe(next);
    if (scenario.locale === "ar")
      await page
        .getByRole("button", { name: m.navigation.accessibility.closeMenu })
        .click();

    const notification = page.getByRole("button", {
      name: m.navigation.notifications.unreadLabel.replace("{count}", "1"),
    });
    await expect(notification).toBeVisible();
    await notification.click();
    const dialog = page.getByRole("dialog", {
      name: m.navigation.notifications.title,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("RAW body نص")).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /RAW title إشعار.*RAW body نص/ }),
    ).toHaveAttribute("href", `/${scenario.locale}/teacher/courses`);
    await dialog
      .getByRole("button", { name: m.navigation.notifications.readAll })
      .click();
    await expect
      .poll(() => requests.includes("POST /api/v1/notifications/read-all"))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
