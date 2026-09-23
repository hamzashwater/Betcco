import { expect, test } from "@playwright/test";

const course = {
  id: "course-1",
  isBtecFocused: true,
  deliveryPlanId: "plan-1",
  qualificationVersionId: null,
  arabicTitle: "دورة تجريبية",
  englishTitle: "Example course",
  arabicDescription: "وصف",
  englishDescription: "Description",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: false,
  outcomes: [],
  modules: [],
};

for (const scenario of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "en", width: 390 },
]) {
  test(`teacher selects canonical unit in ${scenario.locale} at ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let postedEntryId: string | undefined;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value: unknown) =>
        route.fulfill({ status: 200, json: value });
      if (path === "/api/v1/auth/me")
        return json({
          id: "teacher-1",
          roles: ["Teacher"],
          displayName: "Teacher",
        });
      if (path === "/api/v1/security/antiforgery")
        return json({ token: "test-token" });
      if (
        path === "/api/v1/teacher/courses/course-1" &&
        route.request().method() === "GET"
      )
        return json(course);
      if (path === "/api/v1/teacher/courses/course-1/academic-units")
        return json([
          {
            id: "unit-1",
            deliveryPlanEntryId: "entry-1",
            termCode: "T1",
            code: "U1",
            arabicTitle: "الوحدة الأولى",
            englishTitle: "Unit one",
            qualificationVersionId: "version-1",
            qualificationCode: "Q",
            versionCode: "2026",
          },
        ]);
      if (
        path === "/api/v1/teacher/courses/modules" &&
        route.request().method() === "POST"
      ) {
        postedEntryId = route.request().postDataJSON().deliveryPlanEntryId;
        return json({ id: "delivery-1" });
      }
      if (path.endsWith("/learning-access"))
        return json({
          items: [],
          prerequisiteCourses: [],
          rules: [],
          prerequisites: [],
        });
      if (path.startsWith("/api/v1/gradebook/teacher/courses/"))
        return json({
          courseId: "course-1",
          courseTitle: "Example course",
          totalStudents: 0,
          page: 1,
          pageSize: 25,
          students: [],
        });
      return json([]);
    });

    await page.goto(`/${scenario.locale}/teacher/courses/course-1#curriculum`);
    const selector = page.getByRole("combobox", {
      name: scenario.locale === "ar" ? "الوحدة الأكاديمية" : "Academic unit",
    });
    await expect(selector).toBeVisible();
    await expect(selector.locator("option[value='entry-1']")).toBeAttached();
    await selector.selectOption("entry-1");
    await page
      .getByRole("button", {
        name: scenario.locale === "ar" ? "إضافة الوحدة" : "Add module",
      })
      .click();
    await expect.poll(() => postedEntryId).toBe("entry-1");
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

for (const scenario of [
  { locale: "en", width: 1280, title: "Canonical unit" },
  { locale: "ar", width: 1280, title: "الوحدة المعتمدة" },
  { locale: "en", width: 390, title: "Canonical unit" },
]) {
  test(`student sees canonical unit delivery in ${scenario.locale} at ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ json: { displayName: "Student", roles: ["Student"] } }),
    );
    await page.route("**/api/v1/learning/courses/course-1/player*", (route) =>
      route.fulfill({
        json: {
          id: "course-1",
          title: "Example course",
          resumeLessonId: "lesson-1",
          currentLessonId: "lesson-1",
          previousLessonId: null,
          nextLessonId: null,
          requestedLessonRejected: false,
          modules: [
            {
              id: "delivery-1",
              title: scenario.title,
              isLocked: false,
              lessons: [
                {
                  id: "lesson-1",
                  title: "First lesson",
                  type: "Text",
                  body: "Course content",
                  durationSeconds: 60,
                  isLocked: false,
                  resources: [],
                  video: null,
                  isCompleted: false,
                  lastPositionSeconds: 0,
                },
              ],
            },
          ],
        },
      }),
    );
    await page.goto(`/${scenario.locale}/student/learn/course-1`);
    await expect(page.getByText(scenario.title).first()).toBeVisible();
    await expect(page.getByText("First lesson").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (scenario.locale === "ar")
      await expect(page.locator("section[dir]").first()).toHaveAttribute(
        "dir",
        "rtl",
      );
  });
}
