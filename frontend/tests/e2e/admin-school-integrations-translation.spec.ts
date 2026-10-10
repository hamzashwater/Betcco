import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };

for (const locale of ["ar", "en"] as const) {
  test(`school integration safeguards in ${locale} (mocked UI contracts)`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: locale === "ar" ? 390 : 1280,
      height: 844,
    });
    const copy = (locale === "ar" ? ar : en).adminWorkspace.schoolIntegrations;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: { path: string; method: string; body: string | null }[] =
      [];
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (v: unknown) => route.fulfill({ json: v });
      if (path.endsWith("/auth/me"))
        return json({ id: "admin", roles: ["Admin"], displayName: "Admin" });
      if (path.endsWith("/security/antiforgery"))
        return json({ token: "test-token" });
      if (path.includes("/admin/integrations/school/")) {
        requests.push({
          path,
          method: route.request().method(),
          body: route.request().postData(),
        });
        return json({
          provider: "RAW Provider",
          message:
            route.request().method() === "POST"
              ? "RAW TEST MESSAGE"
              : "RAW STATUS MESSAGE",
          isConfigured: true,
          isReachable: route.request().method() === "POST",
        });
      }
      if (path.endsWith("/cart")) return json({ items: [], total: 0 });
      return json([]);
    });
    await page.goto(`/${locale}/admin/integrations`);
    await expect(
      page.getByRole("heading", { name: copy.schoolIntegrations, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("RAW STATUS MESSAGE", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.configured, { exact: true }),
    ).toBeVisible();
    expect(requests).toEqual([
      {
        path: "/api/v1/admin/integrations/school/status",
        method: "GET",
        body: null,
      },
    ]);
    await page
      .getByRole("button", { name: copy.testConnection, exact: true })
      .click();
    await expect(
      page.getByText("RAW TEST MESSAGE", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(copy.connected, { exact: true })).toBeVisible();
    expect(requests).toEqual([
      {
        path: "/api/v1/admin/integrations/school/status",
        method: "GET",
        body: null,
      },
      {
        path: "/api/v1/admin/integrations/school/test-connection",
        method: "POST",
        body: null,
      },
    ]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.BETCCO_I18N_EVIDENCE_DIR ?? "test-results"}/school-integrations-${locale}.png`,
      fullPage: true,
    });
  });
}
