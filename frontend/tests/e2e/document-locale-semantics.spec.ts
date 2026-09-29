import { expect, test, type ConsoleMessage } from "@playwright/test";

const localizedRoutes = [
  { path: "/ar", locale: "ar", direction: "rtl" },
  { path: "/en", locale: "en", direction: "ltr" },
  { path: "/ar/login", locale: "ar", direction: "rtl" },
  { path: "/en/login", locale: "en", direction: "ltr" },
] as const;

for (const route of localizedRoutes) {
  test(`${route.path} returns root document locale semantics in server HTML`, async ({
    page,
  }) => {
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

    const response = await page.goto(route.path, { waitUntil: "load" });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    const serverHtml = await response!.text();
    expect(serverHtml).toMatch(
      new RegExp(
        `<html\\b[^>]*\\blang="${route.locale}"[^>]*\\bdir="${route.direction}"`,
      ),
    );
    expect(serverHtml.match(/<html\b/gi)).toHaveLength(1);
    expect(serverHtml.match(/<body\b/gi)).toHaveLength(1);

    await expect(page.locator("html")).toHaveAttribute("lang", route.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", route.direction);
    await expect(page.locator("a.skip-link")).toBeAttached();
    await page.waitForLoadState("networkidle");
    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
  });
}

test("/ keeps redirecting to the default Arabic locale", async ({ page }) => {
  const response = await page.request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/ar");
});

test("unsupported locale remains a not-found route", async ({ page }) => {
  const response = await page.request.get("/fr");

  expect(response.status()).toBe(404);
});

test("client navigation between localized routes updates document semantics", async ({
  page,
}) => {
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

  await page.goto("/ar", { waitUntil: "load" });
  const languageLink = page.getByRole("link", {
    name: "التبديل إلى الإنجليزية",
  });
  await languageLink.focus();
  await languageLink.press("Enter");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
});
