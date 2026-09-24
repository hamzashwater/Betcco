import { expect, test } from "@playwright/test";

const roles = ["student", "teacher", "support", "admin"] as const;
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
        page.on("dialog", (dialog) => void dialog.accept());
        let otherActive = true;
        await page.route("**/api/v1/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          let body: unknown = {};
          if (path === "/api/v1/security/antiforgery")
            body = { token: "browser-test-token" };
          if (path === "/api/v1/auth/me")
            body = {
              displayName: "Sam Learner",
              roles: [
                role === "admin"
                  ? "Admin"
                  : role === "teacher"
                    ? "Teacher"
                    : role === "support"
                      ? "SupportAdmin"
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
                ...(otherActive
                  ? [
                      {
                        id: "session-2",
                        deviceName: "Other device",
                        browserName: "Firefox",
                        loggedInAtUtc: "2026-09-20T10:00:00Z",
                        lastActiveAtUtc: "2026-09-23T10:00:00Z",
                        isCurrent: false,
                      },
                    ]
                  : []),
              ],
            };
          if (path === "/api/v1/auth/sessions/logout-others") {
            otherActive = false;
            body = { revokedCount: 1 };
          }
          if (path === "/api/v1/auth/change-password")
            return route.fulfill({ status: 204 });
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
            exact: true,
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
        await page
          .getByRole("button", {
            name:
              locale === "ar"
                ? "إنهاء الأجهزة الأخرى"
                : "Sign out other devices",
          })
          .click();
        await expect(
          page.getByText(
            locale === "ar"
              ? "تم إنهاء 1 من الجلسات الأخرى."
              : "1 other sessions signed out.",
          ),
        ).toBeVisible();
        await expect(page.getByText("Lenovo Laptop")).toBeVisible();
        await page
          .getByLabel(
            locale === "ar" ? "كلمة المرور الحالية" : "Current password",
          )
          .fill("T!estPassword123");
        await page
          .getByLabel(
            locale === "ar" ? "كلمة المرور الجديدة" : "New password",
            { exact: true },
          )
          .fill("N!ewPassword123");
        await page
          .getByLabel(
            locale === "ar" ? "تأكيد كلمة المرور" : "Confirm new password",
          )
          .fill("N!ewPassword123");
        await page
          .getByRole("button", {
            name: locale === "ar" ? "حفظ كلمة المرور" : "Save password",
          })
          .click();
        await expect(
          page.getByText(
            locale === "ar"
              ? "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى."
              : "Password changed and other sessions signed out.",
          ),
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

for (const { locale, width } of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "ar", width: 390 },
] as const) {
  test(`email and limited account controls in ${locale} at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => void dialog.accept());
    let frozen = false;
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/v1/security/antiforgery")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ token: "browser-test-token" }),
        });
      if (path === "/api/v1/auth/me")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            roles: ["SupportAdmin"],
            displayName: "Support One",
          }),
        });
      if (path === "/api/v1/auth/profile")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            displayName: "Sam Learner",
            email: "old@example.com",
            phone: null,
            marketingConsent: false,
          }),
        });
      if (path === "/api/v1/memberships/me")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ memberships: [], subscriptions: [] }),
        });
      if (path === "/api/v1/notifications")
        return route.fulfill({ contentType: "application/json", body: "[]" });
      if (path === "/api/v1/cart")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      if (path === "/api/v1/admin/users/freeze-targets")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "student-1",
                displayName: "Student One",
                email: "student@example.com",
                isFrozen: frozen,
              },
            ],
            totalCount: 1,
          }),
        });
      if (path === "/api/v1/admin/users/student-1/freeze") {
        frozen = route.request().postDataJSON().frozen;
        return route.fulfill({ status: 204 });
      }
      if (path === "/api/v1/auth/email-change/request")
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ message: "Sent" }),
        });
      if (path === "/api/v1/auth/email-change/confirm")
        return route.fulfill({ status: 204 });
      if (path === "/api/v1/admin/users/teacher-1/email-change/request")
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ message: "Sent" }),
        });
      if (path === "/api/v1/admin/users/support-admins/invite")
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ id: "support-1" }),
        });
      if (path === "/api/v1/admin/users")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items:
              url.searchParams.get("role") === "Teacher"
                ? [
                    {
                      id: "teacher-1",
                      displayName: "Teacher One",
                      email: "teacher@example.com",
                      emailConfirmed: true,
                      isFrozen: false,
                      mustChangePassword: false,
                    },
                  ]
                : [],
            totalCount: url.searchParams.get("role") === "Teacher" ? 1 : 0,
          }),
        });
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });

    await page.goto(`/${locale}/student/account`);
    await page
      .getByRole("textbox", {
        name: locale === "ar" ? "البريد الجديد" : "New email",
      })
      .fill("new@example.com");
    await page
      .getByLabel(locale === "ar" ? "كلمة المرور الحالية" : "Current password")
      .fill("T!estPassword123");
    const studentRequest = page.waitForRequest((request) =>
      request.url().endsWith("/auth/email-change/request"),
    );
    const studentButton = page.getByRole("button", {
      name: locale === "ar" ? "إرسال رابط التحقق" : "Send confirmation link",
    });
    await studentButton.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(studentButton).toBeFocused();
    await page.keyboard.press("Enter");
    expect((await studentRequest).postDataJSON()).toEqual({
      newEmail: "new@example.com",
      currentPassword: "T!estPassword123",
    });
    await expect(page.getByRole("status")).toBeVisible();

    await page.goto(
      `/${locale}/change-email?userId=00000000-0000-0000-0000-000000000001&email=new%40example.com&proof=proof&mode=student`,
    );
    await page
      .getByRole("button", {
        name: locale === "ar" ? "تأكيد تغيير البريد" : "Confirm email change",
      })
      .click();
    await expect(page.getByRole("status")).toBeVisible();

    await page.goto(`/${locale}/admin/account-identities`);
    await page
      .getByPlaceholder(locale === "ar" ? "البريد الجديد" : "New email")
      .fill("teacher-new@example.com");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "طلب تغيير البريد" : "Request email change",
      })
      .click();
    await expect(page.getByRole("status")).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "مساعدو الإدارة" : "Support administrators",
      })
      .click();
    await page
      .getByRole("textbox", { name: locale === "ar" ? "الاسم" : "Name" })
      .fill("Support One");
    await page
      .getByRole("textbox", {
        name: locale === "ar" ? "بريد العمل" : "Work email",
      })
      .fill("support@example.com");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "إرسال الدعوة" : "Send invitation",
      })
      .click();
    await expect(page.getByRole("status")).toBeVisible();

    await page.goto(`/${locale}/support/accounts`);
    await page
      .getByRole("button", { name: locale === "ar" ? "تجميد" : "Freeze" })
      .click();
    await expect(
      page.getByRole("button", {
        name: locale === "ar" ? "إعادة تفعيل" : "Reactivate",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "إعادة تفعيل" : "Reactivate",
      })
      .click();
    await expect(
      page.getByRole("button", { name: locale === "ar" ? "تجميد" : "Freeze" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
