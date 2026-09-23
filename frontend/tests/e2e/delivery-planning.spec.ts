import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 1280, height: 800 },
  { locale: "en", width: 390, height: 844 },
] as const) {
  test(`delivery planning renders at ${scenario.locale} ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const paged = (items: unknown[]) => ({
        items,
        page: 1,
        pageSize: 100,
        totalCount: items.length,
      });
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "System administrator", roles: ["Admin"] },
        });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/academic-years"))
        return route.fulfill({
          json: paged([
            {
              id: "year-1",
              code: "AY-FLEX",
              startDate: "2026-08-10",
              endDate: "2027-07-05",
              isActive: true,
            },
          ]),
        });
      if (path.endsWith("/academic-years/year-1/terms"))
        return route.fulfill({
          json: paged([
            {
              id: "term-1",
              academicYearId: "year-1",
              code: "BLOCK-A",
              startDate: "2026-08-10",
              endDate: "2026-12-20",
              sortOrder: 10,
              isActive: true,
            },
          ]),
        });
      if (path.endsWith("/qualification-versions"))
        return route.fulfill({
          json: paged([
            {
              id: "version-1",
              qualificationCode: "BTEC-L3-IT",
              versionCode: "2026",
              isActive: true,
            },
          ]),
        });
      if (path.endsWith("/qualification-versions/version-1/units"))
        return route.fulfill({
          json: paged([
            {
              id: "unit-1",
              code: "U1",
              arabicTitle: "الوحدة الأولى",
              englishTitle: "Unit one",
              isActive: true,
            },
          ]),
        });
      if (path.endsWith("/plans/plan-1"))
        return route.fulfill({
          json: {
            plan: {
              id: "plan-1",
              qualificationVersionId: "version-1",
              qualificationCode: "BTEC-L3-IT",
              qualificationVersionCode: "2026",
              academicYearId: "year-1",
              academicYearCode: "AY-FLEX",
              isActive: true,
              entryCount: 1,
            },
            entries: [
              {
                id: "entry-1",
                unitDefinitionId: "unit-1",
                unitCode: "U1",
                unitArabicTitle: "الوحدة الأولى",
                unitEnglishTitle: "Unit one",
                academicTermId: "term-1",
                termCode: "BLOCK-A",
                sortOrder: 10,
              },
            ],
          },
        });
      if (path.endsWith("/plans"))
        return route.fulfill({
          json: paged([
            {
              id: "plan-1",
              qualificationVersionId: "version-1",
              qualificationCode: "BTEC-L3-IT",
              qualificationVersionCode: "2026",
              academicYearId: "year-1",
              academicYearCode: "AY-FLEX",
              isActive: true,
              entryCount: 1,
            },
          ]),
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(`/${scenario.locale}/admin/delivery-planning`);
    await expect(
      page.getByRole("heading", {
        name:
          scenario.locale === "ar"
            ? "تخطيط التسليم الأكاديمي"
            : "Academic delivery planning",
      }),
    ).toBeVisible();
    await expect(page.getByText("AY-FLEX").first()).toBeVisible();
    await expect(
      page.getByText(scenario.locale === "ar" ? /الوحدة الأولى/ : /Unit one/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (scenario.locale === "ar")
      await expect(page.locator('section[dir="rtl"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}
