import { expect, test, type Page } from "@playwright/test";

const courseId = "course-1";
const assignmentId = "practice-A";
const submissionId = "submission-A";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Executing inline script violates the following Content Security Policy") &&
      !message.text().startsWith("Applying inline style violates the following Content Security Policy")
    )
      errors.push(message.text());
  });
  return errors;
}

for (const scenario of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "en", width: 390 },
]) {
  test(`student learning aim practice flow ${scenario.locale} ${scenario.width}px (mocked API)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const errors = watchErrors(page);
    let contentDone = false;
    let draft = false;
    let uploaded = false;
    let submitted = false;
    let reviewed = false;
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (data: unknown) => route.fulfill({ json: data });
      if (path === "/api/v1/auth/me")
        return json({ displayName: "Student", roles: ["Student"] });
      if (path === "/api/v1/security/antiforgery")
        return json({ token: "test-token" });
      if (path === "/api/v1/cart") return json({ items: [] });
      if (path === "/api/v1/catalog/courses")
        return json({ items: [], totalCount: 0 });
      if (path === "/api/v1/taxonomy")
        return json({
          tracks: [],
          grades: [],
          specializations: [],
          subjects: [],
        });
      if (path === "/api/v1/student-tools/overview")
        return json({ notes: [], bookmarks: [] });
      if (path.startsWith("/api/v1/gradebook/student/courses/"))
        return json({
          courseId,
          courseTitle: "Course",
          lessonProgressPercent: contentDone ? 50 : 0,
          lessonsCompleted: contentDone ? 1 : 0,
          lessonsTotal: 2,
          assignmentsCompleted: 0,
          assignmentsTotal: 0,
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
        });
      if (path === `/api/v1/learning/courses/${courseId}/player`)
        return json({
          id: courseId,
          title: "Course",
          resumeLessonId: "lesson-A",
          currentLessonId: "lesson-A",
          previousLessonId: null,
          nextLessonId: reviewed ? "lesson-B" : null,
          requestedLessonRejected: false,
          modules: [
            {
              id: "unit-1",
              title: "Unit one",
              isLocked: false,
              lessons: [
                {
                  id: "lesson-A",
                  title: "Aim A content",
                  type: "Text",
                  body: "Learn A",
                  durationSeconds: 0,
                  isLocked: false,
                  resources: [],
                  video: null,
                  isCompleted: contentDone,
                  lastPositionSeconds: 0,
                },
                {
                  id: "lesson-B",
                  title: "Aim B content",
                  type: "Text",
                  body: reviewed ? "Learn B" : null,
                  durationSeconds: 0,
                  isLocked: !reviewed,
                  lockReason: "CompletePreviousLearningAim",
                  resources: [],
                  video: null,
                  isCompleted: false,
                  lastPositionSeconds: 0,
                },
              ],
            },
          ],
        });
      if (path === "/api/v1/learning/lessons/lesson-A/progress") {
        contentDone = true;
        return json({
          isCompleted: true,
          lastPositionSeconds: 0,
          lastVisitedAtUtc: new Date().toISOString(),
        });
      }
      if (path === `/api/v1/student/courses/${courseId}/learning-aim-practice`)
        return json([
          {
            id: "unit-1",
            arabicTitle: "الوحدة الأولى",
            englishTitle: "Unit one",
            aims: [
              {
                id: "aim-A",
                code: "A",
                arabicTitle: "هدف أ",
                englishTitle: "Aim A",
                isUnlocked: true,
                contentTotal: 1,
                contentCompleted: contentDone ? 1 : 0,
                contentComplete: contentDone,
                assignmentId,
                assignmentArabicTitle: "نشاط أ",
                assignmentEnglishTitle: "Practice A",
                arabicInstructions: "ارفع عملك",
                englishInstructions: "Upload your work",
                practiceAvailable: contentDone && !reviewed,
                practiceStatus: reviewed
                  ? "Finalized"
                  : submitted
                    ? "Submitted"
                    : draft
                      ? "Draft"
                      : contentDone
                        ? "Available"
                        : "Locked",
                trainingOutcome: reviewed ? "Merit" : null,
                strengths: reviewed ? "Strong evidence" : null,
                gaps: reviewed ? "Missing chart" : null,
                improvementGuidance: reviewed ? "Add a chart" : null,
                isComplete: reviewed,
              },
              {
                id: "aim-B",
                code: "B",
                arabicTitle: "هدف ب",
                englishTitle: "Aim B",
                isUnlocked: reviewed,
                contentTotal: 1,
                contentCompleted: 0,
                contentComplete: false,
                assignmentId: "practice-B",
                practiceAvailable: false,
                practiceStatus: "Locked",
                isComplete: false,
              },
            ],
          },
        ]);
      if (path === "/api/v1/student/assignments/mine")
        return json(
          draft || submitted || reviewed
            ? [
                {
                  id: submissionId,
                  assignmentId,
                  status: reviewed
                    ? "Finalized"
                    : submitted
                      ? "Submitted"
                      : "Draft",
                  versions: [
                    {
                      versionNumber: 1,
                      files: uploaded
                        ? [{ id: "file-1", originalFileName: "work.pdf" }]
                        : [],
                    },
                  ],
                },
              ]
            : [],
        );
      if (path === `/api/v1/student/assignments/${assignmentId}/submissions`) {
        draft = true;
        return json({ submissionId, versionNumber: 1, status: "Draft" });
      }
      if (
        path === `/api/v1/student/assignments/submissions/${submissionId}/files`
      ) {
        uploaded = true;
        return route.fulfill({ status: 204 });
      }
      if (
        path ===
        `/api/v1/student/assignments/submissions/${submissionId}/submit`
      ) {
        submitted = true;
        return route.fulfill({ status: 204 });
      }
      return json([]);
    });
    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    const area = page.getByRole("region", {
      name:
        scenario.locale === "ar"
          ? "أهداف التعلم والتدريب"
          : "Learning aims and practice",
    });
    await expect(
      area.getByText(
        scenario.locale === "ar" ? "المحتوى: 0 / 1" : "Content: 0 / 1",
      ).first(),
    ).toBeVisible();
    await expect(
      area.getByText(
        scenario.locale === "ar" ? "التدريب: مقفل" : "Practice: Locked",
      ).first(),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: scenario.locale === "ar" ? "تمييز كمكتمل" : "Mark complete",
      })
      .click();
    await expect(
      area.getByRole("button", {
        name: scenario.locale === "ar" ? "بدء التدريب" : "Start practice",
      }),
    ).toBeVisible();
    await area
      .getByRole("button", {
        name: scenario.locale === "ar" ? "بدء التدريب" : "Start practice",
      })
      .click();
    await area
      .locator('input[type="file"]')
      .setInputFiles({
        name: "work.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n"),
      });
    await area
      .getByRole("button", {
        name: scenario.locale === "ar" ? "رفع الملفات" : "Upload files",
      })
      .click();
    await expect(
      area.getByText(
        scenario.locale === "ar" ? "1 ملفات مرفوعة" : "1 uploaded files",
      ),
    ).toBeVisible();
    await area
      .getByRole("button", {
        name: scenario.locale === "ar" ? "تسليم للمعلم" : "Submit to teacher",
      })
      .click();
    await expect(
      area.getByText(
        scenario.locale === "ar"
          ? /مُسلَّم، بانتظار المراجعة/
          : /Practice: Submitted/,
      ),
    ).toBeVisible();
    reviewed = true;
    await page.reload();
    await expect(
      area.getByText(
        scenario.locale === "ar"
          ? /النتيجة التدريبية: جدارة \(Merit\)/
          : /Training Outcome: Merit/,
      ),
    ).toBeVisible();
    await expect(
      area.getByText(
        scenario.locale === "ar"
          ? /هذه نتيجة تدريبية تكوينية/
          : /This formative training result/,
      ),
    ).toBeVisible();
    await expect(area.getByText(/Strong evidence/)).toBeVisible();
    await expect(area.getByText(/Missing chart/)).toBeVisible();
    await expect(area.getByText(/Add a chart/)).toBeVisible();
    await expect(
      area.getByText(scenario.locale === "ar" ? /هدف ب/ : /Aim B/),
    ).toBeVisible();
    expect(errors).toEqual([]);
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

test("teacher finalizes a Merit review (mocked API)", async ({ page }) => {
  const errors = watchErrors(page);
  let reviewed: unknown;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/v1/auth/me")
      return json({
        id: "teacher",
        displayName: "Teacher",
        roles: ["Teacher"],
      });
    if (path === "/api/v1/security/antiforgery")
      return json({ token: "test-token" });
    if (path === `/api/v1/teacher/courses/${courseId}`)
      return json({
        id: courseId,
        isBtecFocused: true,
        arabicTitle: "دورة",
        englishTitle: "Course",
        arabicDescription: "وصف",
        englishDescription: "Description",
        status: "Published",
        price: 0,
        isFree: true,
        hasCover: false,
        outcomes: [],
        modules: [
          {
            id: "unit-1",
            unitDefinitionId: "canonical-1",
            arabicTitle: "وحدة",
            englishTitle: "Unit",
            publicationStatus: "Published",
            learningAims: [
              {
                id: "aim-A",
                code: "A",
                arabicTitle: "هدف أ",
                englishTitle: "Aim A",
                publicationStatus: "Published",
                sortOrder: 0,
                topics: [],
              },
            ],
            criteria: [],
            lessons: [],
          },
        ],
      });
    if (path === `/api/v1/teacher/courses/${courseId}/practice`)
      return json([
        {
          id: assignmentId,
          btecLearningAimId: "aim-A",
          arabicTitle: "نشاط",
          englishTitle: "Practice",
        },
      ]);
    if (path === `/api/v1/teacher/courses/${courseId}/practice/submissions`)
      return json([
        {
          id: submissionId,
          courseAssignmentId: assignmentId,
          studentUserId: "student",
          status: "Submitted",
          files: [{ id: "file", originalFileName: "work.pdf" }],
        },
      ]);
    if (
      path === `/api/v1/teacher/practice/submissions/${submissionId}/review`
    ) {
      reviewed = route.request().postDataJSON();
      return route.fulfill({ status: 204 });
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
        courseId,
        courseTitle: "Course",
        totalStudents: 0,
        page: 1,
        pageSize: 25,
        students: [],
      });
    return json([]);
  });
  await page.goto(`/en/teacher/courses/${courseId}#assignments`);
  await expect(page.getByText("work.pdf")).toBeVisible();
  await page.getByLabel("Training Outcome").selectOption("Merit");
  await page.getByLabel("Strengths").fill("Strong evidence");
  await page.getByLabel("Missing / gaps").fill("Missing chart");
  await page.getByLabel("Improvement guidance").fill("Add a chart");
  await page.getByRole("button", { name: "Finalize review" }).click();
  await expect
    .poll(() => reviewed)
    .toEqual({
      trainingOutcome: "Merit",
      strengths: "Strong evidence",
      gaps: "Missing chart",
      improvementGuidance: "Add a chart",
    });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
