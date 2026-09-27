import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 1280, height: 800 },
  { locale: "en", width: 390, height: 844 },
] as const) {
  test(`student Resit preparation at ${scenario.locale} ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const errors: string[] = [];
    const writes: string[] = [];
    let activated = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "Student", roles: ["Student"] },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/cart")) return route.fulfill({ json: { items: [] } });
      if (path.includes("/evaluations/mine"))
        return route.fulfill({
          json: {
            items: [],
            page: 1,
            pageSize: 20,
            totalCount: 0,
            hasNextPage: false,
          },
        });
      if (
        path.includes("/student/resit-authorizations/") &&
        path.endsWith("/activate")
      ) {
        activated = true;
        return route.fulfill({
          json: {
            status: "Activated",
            resitEvaluationRequestId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          },
        });
      }
      if (path.endsWith("/student/resit-authorizations"))
        return route.fulfill({
          json: {
            items: [
              {
                authorizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                originalEvaluationRequestId:
                  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                resitEvaluationRequestId: activated
                  ? "cccccccc-cccc-cccc-cccc-cccccccccccc"
                  : null,
                authorizedAtUtc: "2026-09-27T00:00:00Z",
                activatedAtUtc: activated ? "2026-09-27T00:01:00Z" : null,
                state: activated ? "Activated" : "Authorized",
                academic: null,
              },
            ],
            page: 1,
            pageSize: 10,
            hasNextPage: false,
          },
        });
      if (path.endsWith("/evaluations/cccccccc-cccc-cccc-cccc-cccccccccccc"))
        return route.fulfill({
          json: {
            id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            status: "Draft",
            isResit: true,
            resitOfEvaluationRequestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            academic: null,
            criteria: ["A.P1"],
            files: [],
            evidence: [],
            hasAuthenticityDeclaration: false,
          },
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(`/${scenario.locale}/student/evaluations`);
    await expect(
      page.getByRole("button", {
        name: scenario.locale === "ar" ? "بدء إعادة التقييم" : "Start Resit",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: scenario.locale === "ar" ? "بدء إعادة التقييم" : "Start Resit",
      })
      .click();
    await expect(page).toHaveURL(
      /\/student\/evaluations\/cccccccc-cccc-cccc-cccc-cccccccccccc$/,
    );
    await expect(
      page.getByRole("heading", {
        name:
          scenario.locale === "ar"
            ? "تجهيز أدلة إعادة التقييم"
            : "Prepare Resit evidence",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        scenario.locale === "ar"
          ? /ستتاح خطوة الدفع والإرسال/
          : /Payment and submission will become available/,
      ),
    ).toBeVisible();
    expect(
      writes.some((path) =>
        /\/checkout|included-credit|\/payments\//.test(path),
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .locator(
          `[lang="${scenario.locale}"][dir="${scenario.locale === "ar" ? "rtl" : "ltr"}"]`,
        )
        .first(),
    ).toBeVisible();
  });
}
