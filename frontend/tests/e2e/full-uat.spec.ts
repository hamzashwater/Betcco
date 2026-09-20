import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

test.describe.configure({ mode: "serial" });

const publicRoutes = [
  "/en",
  "/ar",
  "/en/courses",
  "/ar/courses",
  "/en/tracks",
  "/en/packages",
  "/en/memberships",
  "/en/live",
  "/en/blog",
  "/en/about",
  "/en/faq",
  "/en/contact",
  "/en/privacy",
  "/en/terms",
  "/en/refunds",
  "/en/cookies",
];

const studentRoutes = [
  "/en/student/dashboard",
  "/en/student/courses",
  "/en/student/evaluations",
  "/en/student/evaluations/new",
  "/en/student/appeals",
  "/en/student/planner",
  "/en/student/notes",
  "/en/student/bookmarks",
  "/en/student/certificates",
  "/en/student/purchases",
  "/en/student/account",
  "/en/student/security",
  "/en/student/support",
];

const teacherRoutes = [
  "/en/teacher/dashboard",
  "/en/teacher/courses",
  "/en/teacher/students",
  "/en/teacher/evaluations",
  "/en/teacher/wallet",
  "/en/teacher/security",
];

const adminRoutes = [
  "/en/admin/dashboard",
  "/en/admin/students",
  "/en/admin/teachers",
  "/en/admin/course-approvals",
  "/en/admin/evaluations",
  "/en/admin/internal-verification",
  "/en/admin/evaluation-appeals",
  "/en/admin/qualification-registry",
  "/en/admin/wallet",
  "/en/admin/content",
  "/en/admin/commerce",
  "/en/admin/audit-logs",
  "/en/admin/privacy",
  "/en/admin/security-incidents",
  "/en/admin/ratings",
  "/en/admin/support",
  "/en/admin/integrations",
  "/en/admin/security",
];

test("@public-matrix public pages remain usable in English LTR and Arabic RTL", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const route of publicRoutes) await assertRouteUsable(page, route);

  expect(pageErrors).toEqual([]);
});

test("@golden-path full-stack student, admin and teacher journey", async ({
  page,
  request,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const adminEmail = requiredEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requiredEnv("SEED_ADMIN_PASSWORD");

  const suffix = `${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
  const studentEmail = `uat-student-${suffix}@betcco.test`;
  const studentPassword = `Aa!${Date.now()}StudentUat`;

  await registerStudent(page, studentEmail, studentPassword);
  await signIn(
    page,
    studentEmail,
    studentPassword,
    /\/en\/student\/dashboard$/,
  );

  for (const route of studentRoutes) await assertRouteUsable(page, route);

  await page.goto("/en/courses/btec-programming-foundations");
  await expect(
    page.getByRole("heading", { name: "BTEC Programming Foundations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status")).toContainText("Course added to cart");
  await page.goto("/en/cart");
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("button", { name: "Create checkout session" }).click();
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(page).toHaveURL(/\/en\/student\/courses$/);
  await page
    .getByRole("link", { name: "Start learning: BTEC Programming Foundations" })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark complete" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.context().clearCookies();
  await page.goto("/en/login");
  await signIn(page, adminEmail, adminPassword, /\/en\/admin\/dashboard$/);

  for (const route of adminRoutes) await assertRouteUsable(page, route);

  const teacherEmail = `uat-teacher-${suffix}@betcco.test`;
  await page.goto("/en/admin/teachers");
  await page.getByPlaceholder("Teacher name").fill("UAT Teacher");
  await page.getByPlaceholder("Email").fill(teacherEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation sent");

  const resetUrl = await waitForTeacherResetUrl(request, teacherEmail);
  const teacherPassword = `Teacher!Uat${Date.now()}A`;
  const localizedResetUrl = new URL(resetUrl);
  localizedResetUrl.pathname = "/en/reset-password";
  await page.goto(localizedResetUrl.toString());
  await page.getByLabel("New password").fill(teacherPassword);
  await page.getByLabel("Confirm password").fill(teacherPassword);
  const resetResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/reset-password") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save password" }).click();
  expect((await resetResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/login$/);

  await signIn(
    page,
    teacherEmail,
    teacherPassword,
    /\/en\/teacher\/dashboard$/,
  );
  for (const route of teacherRoutes) await assertRouteUsable(page, route);

  expect(pageErrors).toEqual([]);
});

test("@mobile-student student workspace remains usable on mobile", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const suffix = `${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
  const studentEmail = `uat-student-${suffix}@betcco.test`;
  const studentPassword = `Aa!${Date.now()}StudentUat`;

  await registerStudent(page, studentEmail, studentPassword);
  await signIn(
    page,
    studentEmail,
    studentPassword,
    /\/en\/student\/dashboard$/,
  );
  for (const route of studentRoutes) await assertRouteUsable(page, route);

  expect(pageErrors).toEqual([]);
});

async function registerStudent(page: Page, email: string, password: string) {
  await page.goto("/en/register");
  await page.getByLabel("First name").fill("UAT");
  await page.getByLabel("Last name").fill("Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Country").selectOption("JO");
  await page.getByLabel("Phone").fill("0790000000");
  await page.getByLabel("Gender").selectOption("PreferNotToSay");
  await page.getByLabel("Date of birth").fill("2000-01-01");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  const createAccount = page.getByRole("button", { name: "Create account" });
  await expect(createAccount).toBeEnabled();
  await createAccount.click();
  await expect(page.getByRole("status")).toContainText("Account created");

  const status = await page.evaluate(async (studentEmail) => {
    const response = await fetch("/api/v1/auth/test/confirm-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: studentEmail }),
    });
    return response.status;
  }, email);
  expect(status).toBe(200);
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  target: RegExp,
) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(target);
}

async function assertRouteUsable(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `No navigation response for ${route}`).not.toBeNull();
  expect(
    response!.status(),
    `Unexpected HTTP status for ${route}`,
  ).toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
  const locale = route.split("/")[1];
  const direction = locale === "ar" ? "rtl" : "ltr";
  await expect(
    page.locator(`[lang="${locale}"][dir="${direction}"]`).first(),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page, route);
}

async function assertNoHorizontalOverflow(page: Page, route = page.url()) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect
    .soft(
      dimensions.scroll,
      `${route} horizontal overflow: scroll=${dimensions.scroll}, viewport=${dimensions.viewport}`,
    )
    .toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function waitForTeacherResetUrl(
  request: APIRequestContext,
  email: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await request.get("http://127.0.0.1:8025/api/v1/messages");
    if (list.ok()) {
      const payload = await list.json();
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      for (const message of messages) {
        const recipients = JSON.stringify(message.To ?? message.to ?? "");
        if (!recipients.includes(email)) continue;
        const id = message.ID ?? message.Id ?? message.id;
        if (!id) continue;
        const detailResponse = await request.get(
          `http://127.0.0.1:8025/api/v1/message/${id}`,
        );
        if (!detailResponse.ok()) continue;
        const detail = await detailResponse.json();
        const body = JSON.stringify(detail)
          .replaceAll("&amp;", "&")
          .replaceAll("=\\r\\n", "")
          .replaceAll("=\\n", "");
        const match = body.match(
          /https?:\/\/localhost:3000\/ar\/reset-password\?userId=[^"\s<]+&token=[^"\\\s<]+/,
        );
        if (match) return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Teacher invitation email was not captured for ${email}`);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing required UAT environment variable: ${name}`);
  return value;
}
