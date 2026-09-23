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
    let postedPlan: Record<string, unknown> | undefined;
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
      if (path.endsWith("/academic-taxonomy/specializations"))
        return route.fulfill({
          json: [
            {
              id: "spec-1",
              learningTrackId: "track-1",
              slug: "information-technology",
              arabicName: "تقنية المعلومات",
              englishName: "Information Technology",
              isVisible: true,
              sortOrder: 10,
            },
          ],
        });
      if (path.endsWith("/academic-taxonomy/grades"))
        return route.fulfill({
          json: [
            {
              id: "grade-1",
              learningTrackId: "track-1",
              slug: "grade-11",
              arabicName: "الحادي عشر",
              englishName: "Grade 11",
              isVisible: true,
              sortOrder: 10,
            },
          ],
        });
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
              qualificationArabicName:
                "بيرسون بيتيك المستوى الثالث في تكنولوجيا المعلومات",
              qualificationEnglishName:
                "Pearson BTEC Level 3 Information Technology",
              versionCode: "2026",
              isActive: true,
              specializationId: "spec-1",
              specializationEnglishName: "Information Technology",
              specializationArabicName: "تقنية المعلومات",
            },
            {
              id: "version-2",
              qualificationCode: "BTEC-L2-IT",
              qualificationArabicName:
                "بيرسون بيتيك المستوى الثاني في تكنولوجيا المعلومات",
              qualificationEnglishName:
                "Pearson BTEC Level 2 Information Technology",
              versionCode: "ISSUE-1",
              isActive: true,
              specializationId: "spec-1",
              specializationEnglishName: "Information Technology",
              specializationArabicName: "تقنية المعلومات",
            },
          ]),
        });
      if (path.endsWith("/qualification-versions/version-1/units"))
        return route.fulfill({
          json: paged([
            {
              id: "unit-1",
              code: "1",
              arabicTitle: "أنظمة تكنولوجيا المعلومات",
              englishTitle: "Information Technology Systems",
              isActive: true,
            },
            {
              id: "unit-2",
              code: "2",
              arabicTitle: "إنشاء الأنظمة لإدارة المعلومات",
              englishTitle: "Creating Systems to Manage Information",
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
              qualificationArabicName:
                "بيرسون بيتيك المستوى الثالث في تكنولوجيا المعلومات",
              qualificationEnglishName:
                "Pearson BTEC Level 3 Information Technology",
              qualificationVersionCode: "2026",
              academicYearId: "year-1",
              academicYearCode: "AY-FLEX",
              isActive: true,
              entryCount: 1,
              gradeId: "grade-1",
              gradeEnglishName: "Grade 11",
              gradeArabicName: "الحادي عشر",
            },
            entries: [
              {
                id: "entry-1",
                unitDefinitionId: "unit-1",
                unitCode: "1",
                unitArabicTitle: "أنظمة تكنولوجيا المعلومات",
                unitEnglishTitle: "Information Technology Systems",
                academicTermId: "term-1",
                termCode: "BLOCK-A",
                sortOrder: 10,
              },
            ],
          },
        });
      if (path.endsWith("/plans") && route.request().method() === "POST") {
        postedPlan = route.request().postDataJSON();
        return route.fulfill({ json: { id: "plan-2" } });
      }
      if (path.endsWith("/plans"))
        return route.fulfill({
          json: paged([
            {
              id: "plan-1",
              qualificationVersionId: "version-1",
              qualificationCode: "BTEC-L3-IT",
              qualificationArabicName:
                "بيرسون بيتيك المستوى الثالث في تكنولوجيا المعلومات",
              qualificationEnglishName:
                "Pearson BTEC Level 3 Information Technology",
              qualificationVersionCode: "2026",
              academicYearId: "year-1",
              academicYearCode: "AY-FLEX",
              isActive: true,
              entryCount: 1,
              gradeId: "grade-1",
              gradeEnglishName: "Grade 11",
              gradeArabicName: "الحادي عشر",
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
      page.getByText(
        scenario.locale === "ar"
          ? /الوحدة 1 — أنظمة تكنولوجيا المعلومات/
          : /Unit 1 — Information Technology Systems/,
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("combobox", {
          name:
            scenario.locale === "ar"
              ? "وحدة BTEC القانونية"
              : "Canonical BTEC Unit",
        })
        .locator("option[value='unit-2']"),
    ).toHaveText(
      scenario.locale === "ar"
        ? "الوحدة 2 — إنشاء الأنظمة لإدارة المعلومات"
        : "Unit 2 — Creating Systems to Manage Information",
    );
    if (scenario.locale === "en" && scenario.width === 1280) {
      await page
        .getByRole("combobox", { name: "Qualification version" })
        .selectOption("version-2");
      await page
        .getByRole("combobox", { name: "Grade" })
        .selectOption("grade-1");
      await page.getByRole("button", { name: "Create plan" }).click();
      await expect.poll(() => postedPlan?.gradeId).toBe("grade-1");
      expect(postedPlan?.qualificationVersionId).toBe("version-2");
      expect(postedPlan?.academicYearId).toBe("year-1");
    }
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
