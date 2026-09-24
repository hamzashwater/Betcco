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
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message
          .text()
          .startsWith(
            "Executing inline script violates the following Content Security Policy",
          )
      )
        consoleErrors.push(message.text());
    });
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
            code: "1",
            arabicTitle: "أنظمة تكنولوجيا المعلومات",
            englishTitle: "Information Technology Systems",
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
    await expect(page.locator('a[href="#assignments"]')).toBeVisible();
    await expect(page.locator('a[href="#quizzes"]')).toHaveCount(0);
    await expect(page.getByText(/question bank|بنك الأسئلة/i)).toHaveCount(0);
    await expect(
      page.locator("option").filter({ hasText: /quiz|اختبار/i }),
    ).toHaveCount(0);
    const selector = page.getByRole("combobox", {
      name: scenario.locale === "ar" ? "الوحدة الأكاديمية" : "Academic unit",
    });
    await expect(selector).toBeVisible();
    await expect(selector.locator("option[value='entry-1']")).toBeAttached();
    await expect(selector.locator("option[value='entry-1']")).toHaveText(
      scenario.locale === "ar"
        ? /الوحدة 1 — أنظمة تكنولوجيا المعلومات/
        : /Unit 1 — Information Technology Systems/,
    );
    await selector.selectOption("entry-1");
    await page
      .getByRole("button", {
        name: scenario.locale === "ar" ? "إضافة الوحدة" : "Add module",
      })
      .click();
    await expect.poll(() => postedEntryId).toBe("entry-1");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
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
  { locale: "en", width: 1280, title: "Information Technology Systems" },
  { locale: "ar", width: 1280, title: "أنظمة تكنولوجيا المعلومات" },
  { locale: "en", width: 390, title: "Information Technology Systems" },
]) {
  test(`student sees canonical unit delivery in ${scenario.locale} at ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message
          .text()
          .startsWith(
            "Executing inline script violates the following Content Security Policy",
          )
      )
        consoleErrors.push(message.text());
    });
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/cart")
        return route.fulfill({ json: { items: [] } });
      if (path === "/api/v1/catalog/courses")
        return route.fulfill({ json: { items: [], totalCount: 0 } });
      if (path === "/api/v1/taxonomy")
        return route.fulfill({
          json: { tracks: [], grades: [], specializations: [], subjects: [] },
        });
      if (path === "/api/v1/student-tools/overview")
        return route.fulfill({ json: { notes: [], bookmarks: [] } });
      if (path.startsWith("/api/v1/gradebook/student/courses/"))
        return route.fulfill({
          json: {
            courseId: "course-1",
            courseTitle: "Example course",
            lessonProgressPercent: 0,
            lessonsCompleted: 0,
            lessonsTotal: 2,
            assignmentsCompleted: 0,
            assignmentsTotal: 1,
            predictedGrade: {
              predictedGrade: "NotYetAchieved",
              passAchieved: 0,
              passRequired: 0,
              meritAchieved: 0,
              meritRequired: 0,
              distinctionAchieved: 0,
              distinctionRequired: 0,
            },
            units: [],
            criteria: [],
          },
        });
      return route.fulfill({ json: [] });
    });
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ json: { displayName: "Student", roles: ["Student"] } }),
    );
    await page.route("**/api/v1/learning/courses/course-1/player*", (route) =>
      route.fulfill({
        json: {
          id: "course-1",
          title: "Example course",
          resumeLessonId: "lesson-1",
          currentLessonId:
            new URL(route.request().url()).searchParams.get("lessonId") ===
            "lesson-2"
              ? "lesson-2"
              : "lesson-1",
          previousLessonId:
            new URL(route.request().url()).searchParams.get("lessonId") ===
            "lesson-2"
              ? "lesson-1"
              : null,
          nextLessonId:
            new URL(route.request().url()).searchParams.get("lessonId") ===
            "lesson-2"
              ? null
              : "lesson-2",
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
                {
                  id: "legacy-lesson",
                  title: "Historical quiz",
                  type: "LegacyArchived",
                  body: "Historical only",
                  durationSeconds: 0,
                  isLocked: false,
                  resources: [],
                  video: null,
                  isCompleted: true,
                  lastPositionSeconds: 0,
                },
                {
                  id: "lesson-2",
                  title: "Course assignment",
                  type: "Assignment",
                  body: "Complete the coursework",
                  durationSeconds: 0,
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
    await page.route("**/api/v1/learning/my-courses*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              courseId: "course-1",
              arabicTitle: "دورة تجريبية",
              englishTitle: "Example course",
              localizedTitle:
                scenario.locale === "ar" ? "دورة تجريبية" : "Example course",
              completedLessons: 1,
              totalLessons: 2,
              publishedModuleCount: 1,
              progressPercent: 50,
              progressState: "InProgress",
              hasCover: false,
              teacherName: "Teacher",
              enrolledAtUtc: "2026-09-01T00:00:00Z",
              accessAvailable: true,
            },
          ],
          page: 1,
          pageSize: 12,
          totalCount: 1,
          summary: {
            totalCourses: 1,
            notStarted: 0,
            inProgress: 1,
            completed: 0,
            completedLessons: 1,
            totalLessons: 2,
            progressPercent: 50,
          },
        },
      }),
    );
    await page.goto(`/${scenario.locale}/student/courses`);
    await page
      .locator(`a[href="/${scenario.locale}/student/learn/course-1"]`)
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${scenario.locale}/student/learn/course-1$`),
    );
    await expect(page.getByText(scenario.title).first()).toBeVisible();
    await expect(page.getByText("First lesson").first()).toBeVisible();
    await expect(page.getByText("Historical quiz")).toHaveCount(0);
    await expect(page.getByText("Course assignment").first()).toBeVisible();
    await page.getByRole("link", { name: "Course assignment" }).click();
    await expect(page.getByText("Complete the coursework")).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
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
