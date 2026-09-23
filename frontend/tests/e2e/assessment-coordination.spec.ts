import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 1280, height: 800 },
  { locale: "en", width: 390, height: 844 },
] as const) {
  test(`coordinator queue renders at ${scenario.locale} ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const pageErrors: string[] = [];
    let savedReason: string | null = null;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        path.endsWith("/expected-completion") &&
        route.request().method() === "PUT"
      ) {
        savedReason = route.request().postDataJSON()?.reason ?? null;
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "Reviewer", roles: ["CourseReviewer"] },
        });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.includes("/assessment-coordination/queue"))
        return route.fulfill({
          json: {
            items: [
              {
                id: "12345678-1111-2222-3333-444444444444",
                status: "PendingAssignment",
                updatedAtUtc: "2026-09-23T10:00:00Z",
                isRetake: true,
                qualificationCode: "Q",
                qualificationVersionCode: "V1",
                unitCode: "U1",
                unitEnglishTitle: "Unit",
                unitArabicTitle: "وحدة",
                evaluatorDisplayName: null,
                hasEligibleEvaluator: false,
                blockerCode: "NoEligibleEvaluator",
                expectedCompletionAtUtc: "2020-01-01T00:00:00Z",
                expectedCompletionState: "Overdue",
              },
            ],
            page: 1,
            pageSize: 10,
            totalCount: 1,
          },
        });
      if (path.endsWith("/evaluations/pending-assignment"))
        return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto(`/${scenario.locale}/admin/evaluations`);
    const queue = page.getByRole("region", {
      name:
        scenario.locale === "ar"
          ? "متابعة التقييمات"
          : "Assessment coordination",
    });
    await expect(queue).toBeVisible();
    await expect(queue.getByText(/Q V1 · U1/)).toBeVisible();
    await expect(
      queue.locator('p[role="status"]').filter({ hasText: /^(متأخر|Overdue)/ }),
    ).toBeVisible();
    await expect(
      queue.getByText(
        scenario.locale === "ar"
          ? "لا يوجد مقيّم مؤهل لهذه الوحدة حاليًا."
          : "No evaluator is currently eligible for this Unit.",
      ),
    ).toBeVisible();
    await queue
      .getByRole("button", {
        name:
          scenario.locale === "ar"
            ? "تعديل موعد الإنجاز"
            : "Revise completion target",
      })
      .click();
    await queue
      .getByLabel(
        scenario.locale === "ar"
          ? "موعد الإنجاز المتوقع"
          : "Expected completion",
      )
      .fill("2030-12-31T12:00");
    await queue
      .getByLabel(scenario.locale === "ar" ? "سبب داخلي" : "Internal reason")
      .fill("Coordination review");
    await queue
      .getByRole("button", {
        name: scenario.locale === "ar" ? "حفظ الموعد" : "Save target",
      })
      .click();
    await expect.poll(() => savedReason).toBe("Coordination review");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (scenario.locale === "ar")
      await expect(page.locator('div[dir="rtl"]').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}
