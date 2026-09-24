import { expect, test } from "@playwright/test";

const roles = ["student", "teacher", "admin"] as const;
const locales = ["en", "ar"] as const;
const widths = [1280, 390] as const;

for (const role of roles) {
  for (const locale of locales) {
    for (const width of widths) {
      test(`${role} profile and security in ${locale} at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/api/v1/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          let body: unknown = {};
          if (path === "/api/v1/auth/me")
            body = {
              displayName: "Sam Learner",
              roles: [
                role === "admin"
                  ? "Admin"
                  : role === "teacher"
                    ? "Teacher"
                    : "Student",
              ],
            };
          if (path === "/api/v1/auth/profile")
            body = {
              displayName: "Sam Learner",
              email: "sam@example.com",
              phone: "+962700000000",
              marketingConsent: false,
            };
          if (path === "/api/v1/memberships/me")
            body = { memberships: [], subscriptions: [] };
          if (path === "/api/v1/auth/two-factor")
            body = { isEnabled: false, hasAuthenticator: false };
          if (path === "/api/v1/auth/sessions")
            body = {
              items: [
                {
                  id: "session-1",
                  deviceName: "Lenovo Laptop",
                  browserName: "Chrome",
                  ipAddress: "192.0.2.1",
                  loggedInAtUtc: "2026-09-20T10:00:00Z",
                  lastActiveAtUtc: "2026-09-23T10:00:00Z",
                  isCurrent: true,
                },
              ],
            };
          if (path === "/api/v1/notifications") body = [];
          if (path === "/api/v1/cart") body = { items: [] };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        });

        const profilePath = role === "student" ? "account" : "profile";
        await page.goto(`/${locale}/${role}/${profilePath}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          locale === "ar" ? "الملف الشخصي" : "Your profile",
        );
        await expect(
          page.getByRole("textbox", {
            name: locale === "ar" ? "الاسم" : "Name",
          }),
        ).toHaveValue("Sam Learner");
        await expect(
          page.getByRole("textbox", {
            name: locale === "ar" ? "البريد الإلكتروني" : "Email",
          }),
        ).toHaveValue("sam@example.com");
        expect(
          await page
            .locator("#main-content")
            .evaluate((element) => getComputedStyle(element).direction),
        ).toBe(locale === "ar" ? "rtl" : "ltr");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);

        await page.goto(`/${locale}/${role}/security`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          locale === "ar"
            ? "أمان الحساب والجلسات"
            : "Account security and sessions",
        );
        await expect(page.getByText("Lenovo Laptop")).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: locale === "ar" ? "إنهاء الكل" : "Sign out all",
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
