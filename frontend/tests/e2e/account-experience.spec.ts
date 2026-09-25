import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

const roles = ["student", "teacher", "support", "admin"] as const;
const locales = ["en", "ar"] as const;
const widths = [1280, 390] as const;

for (const { locale, width } of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 390 },
] as const) {
  test(`recovery login choice in ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    let recoverySubmitted = false;
    let authenticated = false;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/security/antiforgery")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ token: "test-token" }),
        });
      if (path === "/api/v1/auth/login") {
        const body = route.request().postDataJSON() as {
          twoFactorCode?: string | null;
          twoFactorRecoveryCode?: string | null;
        };
        if (body.twoFactorRecoveryCode) {
          recoverySubmitted = body.twoFactorCode == null;
          authenticated = true;
          return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              user: { roles: ["Teacher"], requiresMfaEnrollment: false },
            }),
          });
        }
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: "TWO_FACTOR_REQUIRED" }),
        });
      }
      if (path === "/api/v1/auth/me")
        return route.fulfill(
          authenticated
            ? {
                contentType: "application/json",
                body: JSON.stringify({
                  roles: ["Teacher"],
                  requiresMfaEnrollment: false,
                }),
              }
            : { status: 401, contentType: "application/json", body: "{}" },
        );
      if (path === "/api/v1/notifications")
        return route.fulfill({ contentType: "application/json", body: "[]" });
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await page.goto(`/${locale}/login`);
    await page
      .getByRole("textbox", {
        name: locale === "ar" ? "البريد الإلكتروني" : "Email",
      })
      .fill("teacher@example.test");
    await page
      .getByLabel(locale === "ar" ? "كلمة المرور" : "Password", { exact: true })
      .fill("T!estPassword123");
    await page
      .getByRole("button", { name: locale === "ar" ? "دخول" : "Sign in" })
      .click();
    const useRecovery = page.getByRole("button", {
      name: locale === "ar" ? "استخدام رمز استرداد" : "Use a recovery code",
    });
    await expect(useRecovery).toBeVisible();
    await useRecovery.click();
    const input = page.getByRole("textbox", {
      name: locale === "ar" ? "رمز الاسترداد" : "Recovery code",
    });
    await expect(input).not.toHaveAttribute("maxlength", "6");
    await input.fill("example-recovery-code");
    await page
      .getByRole("button", { name: locale === "ar" ? "دخول" : "Sign in" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/dashboard$`));
    expect(recoverySubmitted).toBe(true);
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test("staff can leave an unfinished MFA enrollment", async ({ page }) => {
  let signedOut = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me")
      return route.fulfill(
        signedOut
          ? { status: 401, contentType: "application/json", body: "{}" }
          : {
              contentType: "application/json",
              body: JSON.stringify({
                roles: ["SupportAdmin"],
                requiresMfaEnrollment: true,
              }),
            },
      );
    if (path === "/api/v1/auth/two-factor")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          isEnabled: false,
          hasAuthenticator: false,
          isRequired: true,
        }),
      });
    if (path === "/api/v1/security/antiforgery")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ token: "browser-test-token" }),
      });
    if (path === "/api/v1/auth/logout") {
      signedOut = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/v1/notifications")
      return route.fulfill({ contentType: "application/json", body: "[]" });
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.goto("/en/about");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/en\/about$/);
  await expect(
    page.getByRole("heading", {
      name: "Clear learning built around application",
    }),
  ).toBeVisible();
  await page.goto("/en/support/accounts");
  await expect(page).toHaveURL(/\/en\/staff\/security$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
});

for (const { locale, width } of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "ar", width: 390 },
] as const) {
  test(`mandatory staff MFA enrollment in ${locale} at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let enabled = false;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/auth/me")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            displayName: "Admin",
            roles: ["Admin"],
            requiresMfaEnrollment: !enabled,
          }),
        });
      if (path === "/api/v1/security/antiforgery")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ token: "browser-test-token" }),
        });
      if (path === "/api/v1/auth/two-factor")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            isEnabled: enabled,
            hasAuthenticator: enabled,
            isRequired: true,
            recoveryCodesLeft: enabled ? 2 : 0,
          }),
        });
      if (path === "/api/v1/auth/two-factor/setup")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            sharedKey: "BROWSERTESTKEY",
            authenticatorUri: "otpauth://totp/Betcco?secret=BROWSERTESTKEY",
          }),
        });
      if (path === "/api/v1/auth/two-factor/enable") {
        enabled = true;
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            recoveryCodes: ["example-1", "example-2"],
            recoveryCodesLeft: 2,
          }),
        });
      }
      if (path === "/api/v1/auth/logout") return route.fulfill({ status: 204 });
      if (path === "/api/v1/admin/dashboard") {
        if (!enabled)
          return route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ code: "MFA_ENROLLMENT_REQUIRED" }),
          });
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            period: "30d",
            fromUtc: "2026-09-01T00:00:00Z",
            toUtc: "2026-09-30T00:00:00Z",
            students: 0,
            activeStudents: 0,
            teachers: 0,
            activeTeachers: 0,
            courses: 0,
            publishedCourses: 0,
            units: 0,
            enrollments: 0,
            assignments: 0,
            pendingReviews: 0,
            pendingApprovals: 0,
            pendingEvaluations: 0,
            evaluationsAwaitingVerification: 0,
            completionRate: 0,
            orders: 0,
            activeSubscriptions: 0,
            refunds: 0,
            revenue: 0,
            trend: [],
          }),
        });
      }
      if (path === "/api/v1/notifications")
        return route.fulfill({ contentType: "application/json", body: "[]" });
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });

    await page.goto(`/${locale}/about`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/${locale}/about$`));
    await expect(page.locator("#main-content")).toBeVisible();
    await page.goto(`/${locale}/admin/dashboard`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/security$`));
    await expect(
      page.getByText(
        locale === "ar"
          ? /المصادقة الثنائية إلزامية/
          : /Multi-factor authentication is required/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: locale === "ar" ? "تسجيل الخروج" : "Sign out",
      }),
    ).toBeVisible();
    const blocked = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/dashboard");
      return { status: response.status, code: (await response.json()).code };
    });
    expect(blocked).toEqual({ status: 403, code: "MFA_ENROLLMENT_REQUIRED" });
    const setupButton = page.getByRole("button", {
      name:
        locale === "ar"
          ? "إعداد تطبيق المصادقة"
          : "Set up an authenticator app",
    });
    await setupButton.focus();
    await expect(setupButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("BROWSERTESTKEY")).toBeVisible();
    await page
      .getByRole("textbox", {
        name:
          locale === "ar"
            ? "أدخل الرمز المكوّن من 6 أرقام"
            : "Enter the 6-digit code",
      })
      .fill("123456");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "تأكيد التفعيل" : "Confirm and enable",
      })
      .click();
    await expect(page.getByText("example-1")).toBeVisible();
    await page
      .getByRole("checkbox", {
        name:
          locale === "ar"
            ? "حفظت الرموز في مكان آمن"
            : "I saved these codes securely",
      })
      .check();
    await page
      .getByRole("button", { name: locale === "ar" ? "متابعة" : "Continue" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/dashboard$`));
    await expect(
      page.getByRole("heading", {
        name: locale === "ar" ? "لوحة الأدمن" : "Admin dashboard",
      }),
    ).toBeVisible();
    const permitted = await page.evaluate(
      async () => (await fetch("/api/v1/admin/dashboard")).status,
    );
    expect(permitted).toBe(200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("#main-content")
        .evaluate((element) => getComputedStyle(element).direction),
    ).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(errors).toEqual([]);
  });
}

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
