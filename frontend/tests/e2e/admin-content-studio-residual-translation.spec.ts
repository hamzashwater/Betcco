import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };

for (const locale of ["ar", "en"] as const) {
  test(`Content Studio fallback and raw error in ${locale} (mocked UI contracts)`, async ({
    page,
  }) => {
    const copy = (locale === "ar" ? ar : en).adminContent;
    await page.setViewportSize({
      width: locale === "ar" ? 390 : 1280,
      height: 844,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Fetch may reject with a non-Error value. Inject only this failure boundary,
    // leaving React Query, next-intl, forms and the real API wrapper running.
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      let injected = false;
      window.fetch = async (input, init) => {
        if (
          !injected &&
          String(input) === "/api/v1/admin/content/blog" &&
          init?.method === "POST"
        ) {
          injected = true;
          return Promise.reject({ code: "MOCK_NON_ERROR_REJECTION" });
        }
        return original(input, init);
      };
    });
    const writes: { path: string; method: string; body: unknown }[] = [];
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { id: "admin", roles: ["Admin"], displayName: "Admin" },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/admin/content/blog") && request.method() === "POST") {
        writes.push({
          path,
          method: request.method(),
          body: request.postDataJSON(),
        });
        return route.fulfill({
          status: 503,
          json: { message: "RAW SERVER ERROR" },
        });
      }
      if (path.endsWith("/admin/users"))
        return route.fulfill({ json: { items: [] } });
      if (path.endsWith("/cart"))
        return route.fulfill({ json: { items: [], total: 0 } });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/${locale}/admin/content`);
    await expect(
      page.getByRole("heading", { name: copy.title, exact: true }),
    ).toBeVisible();
    const form = page.locator("form").filter({
      has: page.getByRole("heading", { name: copy.article, exact: true }),
    });
    const values = {
      slug: "audit-test",
      arabicTitle: "عنوان خام",
      englishTitle: "RAW TITLE",
      arabicExcerpt: "مقتطف خام",
      englishExcerpt: "RAW EXCERPT",
      arabicBody: "محتوى خام",
      englishBody: "RAW BODY",
    };
    for (const key of Object.keys(values) as (keyof typeof values)[])
      await form.getByLabel(copy[key], { exact: true }).fill(values[key]);
    const save = form.getByRole("button", { name: copy.save, exact: true });
    await save.click();
    await expect(page.getByRole("status")).toHaveText(copy.requestFailed);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("status")).toHaveText("RAW SERVER ERROR");
    expect(writes).toEqual([
      {
        path: "/api/v1/admin/content/blog",
        method: "POST",
        body: { ...values, isPublished: false },
      },
    ]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.BETCCO_I18N_EVIDENCE_DIR ?? "test-results"}/content-studio-residual-${locale}.png`,
      fullPage: true,
    });
  });
}
