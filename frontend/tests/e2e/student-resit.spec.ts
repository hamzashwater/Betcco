import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 1280, height: 800 },
  { locale: "en", width: 390, height: 844 },
] as const) {
  test(`student Resit payment at ${scenario.locale} ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const errors: string[] = [];
    const writes: string[] = [];
    let checkoutCount = 0;
    let activated = false;
    let status = "Draft";
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
            items:
              status === "PendingAssignment"
                ? [
                    {
                      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                      status,
                      price: 5,
                      currency: "JOD",
                      isRetake: false,
                      isResit: true,
                      resitOfEvaluationRequestId:
                        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                      retakeOfEvaluationRequestId: null,
                      criteria: ["A.P1"],
                      academic: null,
                      selectedCriteria: [],
                      submissionAttemptNumber: 1,
                      revisionDueAtUtc: null,
                      effectiveRevisionDueAtUtc: null,
                      calculatedGrade: null,
                      sectionResults: [],
                      results: [],
                      evidence: [],
                      feedback: [],
                    },
                  ]
                : [],
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
            status,
            price: 5,
            currency: "JOD",
            isResit: true,
            resitOfEvaluationRequestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            academic: null,
            criteria: ["A.P1"],
            files: [
              {
                id: "file-1",
                originalFileName: "fresh.pdf",
                scanStatus: "Clean",
                createdAtUtc: "2026-09-27T00:00:00Z",
              },
            ],
            evidence: [],
            hasAuthenticityDeclaration: true,
          },
        });
      if (path.endsWith("/checkout")) {
        checkoutCount += 1;
        expect(route.request().headers()["idempotency-key"]).toBeTruthy();
        expect(route.request().postDataJSON()).toEqual({
          paymentMethod: "Card",
          expectIncludedCredit: false,
        });
        status = "PendingPayment";
        return route.fulfill({
          json: {
            includedCreditApplied: false,
            paymentId: "payment-1",
            provider: "FakeCard",
            redirectUrl: null,
            total: 5,
            currency: "JOD",
          },
        });
      }
      if (path.endsWith("/payments/fake/confirm")) {
        status = "PendingAssignment";
        return route.fulfill({ json: { confirmed: true } });
      }
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
    const expectedResitPrice = new Intl.NumberFormat(
      scenario.locale === "ar" ? "ar-JO" : "en-JO",
      {
        style: "currency",
        currency: "JOD",
        currencyDisplay: "code",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      },
    ).format(5);
    await expect(
      page.getByText(
        scenario.locale === "ar"
          ? "السعر المحدد من الخادم:"
          : "Server-owned Resit review price:",
      ),
    ).toContainText(expectedResitPrice);
    await page
      .getByRole("button", {
        name:
          scenario.locale === "ar"
            ? "المتابعة إلى الدفع"
            : "Continue to payment",
      })
      .click();
    await expect(
      page.getByText(
        scenario.locale === "ar"
          ? /دفعة اختبارية/
          : /Development test payment only/,
      ),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name:
          scenario.locale === "ar"
            ? "إتمام الدفع الاختباري"
            : "Complete test payment",
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${scenario.locale}/student/evaluations$`),
    );
    await expect(page.getByText("PendingAssignment")).toBeVisible();
    expect(checkoutCount).toBe(1);
    expect(writes.some((path) => path.includes("included-credit"))).toBe(false);
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

test("real Resit provider checkout redirects without fake confirmation", async ({
  page,
}) => {
  const id = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const writes: string[] = [];
  await page.route("https://paytabs.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Provider checkout</h1>",
    }),
  );
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
    if (path.endsWith(`/evaluations/${id}`))
      return route.fulfill({
        json: {
          id,
          status: "Draft",
          price: 5,
          currency: "JOD",
          isResit: true,
          resitOfEvaluationRequestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          academic: null,
          criteria: [],
          files: [
            {
              id: "file-1",
              originalFileName: "fresh.pdf",
              scanStatus: "Clean",
              createdAtUtc: "2026-09-27T00:00:00Z",
            },
          ],
          evidence: [],
          hasAuthenticityDeclaration: true,
        },
      });
    if (path.endsWith("/checkout"))
      return route.fulfill({
        json: {
          includedCreditApplied: false,
          paymentId: "payment-1",
          provider: "PayTabs",
          redirectUrl: "https://paytabs.example/checkout",
          total: 5,
          currency: "JOD",
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(`/en/student/evaluations/${id}`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL("https://paytabs.example/checkout");
  await expect(
    page.getByRole("heading", { name: "Provider checkout" }),
  ).toBeVisible();
  expect(writes.filter((path) => path.endsWith("/checkout"))).toHaveLength(1);
  expect(writes.some((path) => path.includes("/payments/fake/confirm"))).toBe(
    false,
  );
});
