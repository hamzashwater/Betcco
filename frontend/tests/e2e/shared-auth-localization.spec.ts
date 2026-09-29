import { expect, test } from "@playwright/test";

for (const locale of ["ar", "en"] as const) {
  test(`${locale} login and registration routes render localized copy`, async ({
    page,
  }) => {
    await page.route("**/api/v1/**", (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path.endsWith("/auth/me"))
        return route.fulfill({ status: 401, json: {} });
      if (path.endsWith("/settings/public")) return route.fulfill({ json: {} });
      if (path.endsWith("/legal/required"))
        return route.fulfill({
          json: [
            {
              slug: "terms",
              version: "1",
              title: "Terms",
              effectiveAtUtc: "2026-01-01T00:00:00Z",
            },
            {
              slug: "privacy",
              version: "1",
              title: "Privacy",
              effectiveAtUtc: "2026-01-01T00:00:00Z",
            },
          ],
        });
      return route.fulfill({ json: [] });
    });

    const loginResponse = await page.goto(`/${locale}/login`);
    expect(loginResponse?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", {
        name: locale === "ar" ? "تسجيل الدخول" : "Sign in",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: locale === "ar" ? "البريد الإلكتروني" : "Email",
      }),
    ).toBeVisible();

    const registerResponse = await page.goto(`/${locale}/register`);
    expect(registerResponse?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", {
        name: locale === "ar" ? "أنشئ حسابًا جديدًا" : "Create your account",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: locale === "ar" ? "البريد الإلكتروني" : "Email",
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
  });
}
