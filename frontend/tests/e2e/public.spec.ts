import { expect, test } from "@playwright/test";

test("guest can open BETCCO and change to English", async ({ page }) => {
  await page.goto("/ar");
  await expect(
    page.getByRole("link", { name: "BETCCO", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "كل فكرة تبدأ بخطوة عملية." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "الصورة التالية" }).click();
  await expect(
    page.getByRole("heading", { name: "المهارة تكبر عندما تطبّقها معًا." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "التبديل إلى الإنجليزية" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    page.getByRole("heading", { name: /Learn\. Apply\. Achieve/i }),
  ).toBeVisible();
});

test("guest can discover BETCCO public learning content", async ({ page }) => {
  await page.goto("/en/blog");
  await expect(
    page.getByRole("heading", { name: "A blog for learning and applying" }),
  ).toBeVisible();

  await page.goto("/en/packages");
  await expect(
    page.getByRole("heading", {
      name: "Learning packages that save and connect the essentials",
    }),
  ).toBeVisible();

  await page.goto("/en/live");
  await expect(
    page.getByRole("heading", {
      name: "Live sessions that bring learning closer to practice",
    }),
  ).toBeVisible();
});

test("home uses the available space on a wide desktop without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/ar");

  const homeShell = page.locator("main .shell").first();
  await expect(homeShell).toBeVisible();
  await expect(homeShell).toHaveJSProperty("clientWidth", 1600);

  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(1920);
});

test("email confirmation remains on BETCCO and handles an incomplete link", async ({
  page,
}) => {
  await page.goto("/ar/confirm-email");
  await expect(
    page.getByRole("heading", { name: "تأكيد البريد الإلكتروني" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "رابط تأكيد البريد غير مكتمل. افتح الرابط الذي وصلك في رسالة BETCCO.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/confirm-email$/);
});
