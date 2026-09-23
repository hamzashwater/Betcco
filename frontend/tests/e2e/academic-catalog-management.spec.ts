import { expect, test } from "@playwright/test";

for (const scenario of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "en", width: 390 },
] as const) {
  test(`admin catalogue shows provenance and creates a specialization in ${scenario.locale} at ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let postedSpecialization: Record<string, unknown> | undefined;
    let postedArabicLocalization: Record<string, unknown> | undefined;
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value: unknown) => route.fulfill({ json: value });
      if (path.endsWith("/auth/me"))
        return json({ id: "admin-1", roles: ["Admin"], displayName: "Admin" });
      if (path.endsWith("/security/antiforgery"))
        return json({ token: "test-token" });
      if (path.endsWith("/academic-records/units/unit-1/arabic-localization")) {
        postedArabicLocalization = route.request().postDataJSON();
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith("/academic-catalogue/versions"))
        return json([
          {
            id: "version-1",
            qualificationCode: "BTEC-L3-IT",
            qualificationArabicName:
              "مؤهل بيرسون BTEC الدولي للمستوى الثالث في تكنولوجيا المعلومات",
            qualificationEnglishName:
              "Pearson BTEC International Level 3 Information Technology",
            versionCode: "ISSUE-4",
            isActive: true,
          },
        ]);
      if (path.endsWith("/academic-catalogue/versions/version-1"))
        return json({
          version: {
            id: "version-1",
            qualificationCode: "BTEC-L3-IT",
            qualificationArabicName:
              "مؤهل بيرسون BTEC الدولي للمستوى الثالث في تكنولوجيا المعلومات",
            qualificationEnglishName:
              "Pearson BTEC International Level 3 Information Technology",
            versionCode: "ISSUE-4",
            isActive: true,
          },
          units: [
            {
              id: "unit-1",
              code: "6",
              arabicTitle: "تطوير المواقع الإلكترونية",
              englishTitle: "Website Development",
              source: "PearsonOfficial",
              arabicTitleSource: "BetccoLocalized",
              isActive: true,
              aims: [],
              definitions: [],
            },
          ],
        });
      if (path.endsWith("/taxonomy"))
        return json({
          tracks: [{ id: "track-1", name: "BTEC", isBtecFocused: true }],
        });
      if (
        path.endsWith("/academic-taxonomy/specializations") &&
        route.request().method() === "POST"
      ) {
        postedSpecialization = route.request().postDataJSON();
        return json({ id: "spec-2" });
      }
      if (path.endsWith("/academic-taxonomy/specializations"))
        return json([
          {
            id: "spec-1",
            learningTrackId: "track-1",
            slug: "information-technology",
            arabicName: "تقنية المعلومات",
            englishName: "Information Technology",
            isVisible: true,
            sortOrder: 10,
          },
        ]);
      if (path.endsWith("/academic-taxonomy/grades")) return json([]);
      if (path.endsWith("/qualification-registry"))
        return json([
          {
            id: "qualification-1",
            code: "BTEC-L3-IT",
            arabicName: "تقنية المعلومات",
            englishName: "Information Technology",
            specializationId: "spec-1",
            isActive: true,
            source: "PearsonOfficial",
            versions: [
              {
                id: "version-1",
                versionCode: "ISSUE-4",
                sourceReference: "Official spec",
                source: "PearsonOfficial",
                isActive: true,
              },
            ],
          },
        ]);
      return json([]);
    });

    await page.goto(`/${scenario.locale}/admin/academic-catalogue`);
    await expect(page.getByText("PearsonOfficial").first()).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name:
          scenario.locale === "ar"
            ? "الوحدة 6 — تطوير المواقع الإلكترونية"
            : "Unit 6 — Website Development",
      }),
    ).toBeVisible();
    await expect(page.getByText("English: Website Development")).toBeVisible();
    await expect(
      page.getByText("العربية: تطوير المواقع الإلكترونية"),
    ).toBeVisible();
    if (scenario.locale === "en" && scenario.width === 1280) {
      await page
        .getByRole("textbox", { name: "BETCCO Arabic display title" })
        .fill("تطوير مواقع الويب");
      await page
        .getByRole("button", { name: "Save Arabic display title" })
        .click();
      await expect
        .poll(() => postedArabicLocalization?.arabicTitle)
        .toBe("تطوير مواقع الويب");
    }
    await page
      .getByRole("textbox", { name: "Specialization slug" })
      .fill("engineering");
    await page
      .getByRole("textbox", { name: "Specialization Arabic name" })
      .fill("الهندسة");
    await page
      .getByRole("textbox", { name: "Specialization English name" })
      .fill("Engineering");
    await page
      .getByRole("button", {
        name: scenario.locale === "ar" ? "إضافة تخصص" : "Add specialization",
      })
      .click();
    await expect.poll(() => postedSpecialization?.slug).toBe("engineering");
    expect(postedSpecialization?.learningTrackId).toBe("track-1");
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (scenario.locale === "ar")
      expect(
        await page
          .locator("#main-content")
          .evaluate((element) => element.closest("[dir]")?.getAttribute("dir")),
      ).toBe("rtl");
  });
}
