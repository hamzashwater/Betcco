import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message: ConsoleMessage) => {
    if (
      message.type() === "error" &&
      /hydration|react error #418|server rendered html/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  return { pageErrors, hydrationErrors };
}

async function openLocaleSwitcher(page: Page, mobile = false) {
  if (mobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "فتح القائمة" }).click();
    return page
      .getByRole("dialog", { name: "قائمة التنقل" })
      .getByRole("link", {
        name: "EN",
      });
  }

  return page.getByRole("link", { name: "التبديل إلى الإنجليزية" });
}

test("switches between locale roots with the correct document semantics", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  await page.goto("/ar");

  await (await openLocaleSwitcher(page)).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.getByRole("link", { name: "Switch to Arabic" }).click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveCount(1);
  await expect(page.locator("body")).toHaveCount(1);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.hydrationErrors).toEqual([]);
});

for (const [source, label, target] of [
  ["/ar/courses", "التبديل إلى الإنجليزية", "/en/courses"],
  ["/en/courses", "Switch to Arabic", "/ar/courses"],
]) {
  test(`preserves the public route when switching from ${source}`, async ({
    page,
  }) => {
    await page.goto(source);
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
  });
}

test("preserves exact query encoding and fragment through the mobile drawer", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const search = "?page=2&track=it&filter=grade%2F11%20science";
  await page.goto(`/ar/courses${search}#course-list`);
  const rejectNonessential = page.getByRole("button", {
    name: "رفض غير الضرورية",
  });
  await expect(rejectNonessential).toBeVisible();
  await rejectNonessential.click();
  await expect(
    page.getByRole("dialog", { name: "خيارات ملفات تعريف الارتباط" }),
  ).toHaveCount(0);
  const languageLink = await openLocaleSwitcher(page, true);
  await expect(languageLink).toHaveAttribute("href", "/en/courses");

  await languageLink.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/en/courses" &&
      url.search === search &&
      url.hash === "#course-list",
  );
  expect(new URL(page.url()).search).toBe(search);
  expect(new URL(page.url()).hash).toBe("#course-list");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveCount(1);
  await expect(page.locator("body")).toHaveCount(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.hydrationErrors).toEqual([]);
});

test("preserves a protected student route in the desktop switch target", async ({
  page,
}) => {
  await page.goto("/ar/student/dashboard");

  const languageLink = page.getByRole("link", {
    name: "التبديل إلى الإنجليزية",
  });
  await expect(languageLink).toHaveAttribute("href", "/en/student/dashboard");
});
