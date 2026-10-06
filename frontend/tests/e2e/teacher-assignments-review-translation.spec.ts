import { expect, test } from "@playwright/test";
import arMessages from "../../messages/ar.json" with { type: "json" };
import enMessages from "../../messages/en.json" with { type: "json" };

// MOCKED UI-CONTRACT/BROWSER EVIDENCE. Backend authorization/storage is not exercised.
const course = {
  id: "course-1",
  isBtecFocused: false,
  arabicTitle: "دورة الخادم",
  englishTitle: "Server course",
  arabicDescription: "وصف",
  englishDescription: "Description",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: true,
  outcomes: [],
  modules: [],
};
const assignment = {
  id: "assignment-1",
  courseId: "course-1",
  arabicTitle: "مهمة الخادم",
  englishTitle: "Server assignment",
  arabicInstructions: "تعليمات الخادم",
  englishInstructions: "Server instructions",
  dueAtUtc: "2030-01-01T12:00:00Z",
  maxSubmissionAttempts: 2,
  maxScore: 100,
  allowResubmission: true,
  maxFileSizeBytes: 100 * 1024 * 1024,
  allowedFileExtensions: [".pdf"],
  isPublished: false,
  publicationStatus: "Draft",
  resources: [],
  criteria: [
    {
      id: "criterion-1",
      code: "A.P1",
      band: "Pass",
      arabicDescription: "معيار الخادم",
      englishDescription: "Server criterion",
      sortOrder: 1,
    },
  ],
};
const submission = {
  id: "submission-1",
  assignmentId: "assignment-1",
  studentUserId: "RAW-student",
  status: "Submitted",
  files: [{ id: "file-1", originalFileName: "RAW evidence.pdf" }],
  feedback: [],
};
for (const scenario of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 390 },
] as const) {
  test(`coursework, gradebook, extensions and reviews ${scenario.locale} ${scenario.width}px (mocked API)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const m = (scenario.locale === "ar" ? arMessages : enMessages)
      .teacherWorkspace;
    const errors: string[] = [],
      cspErrors: string[] = [],
      requests: string[] = [];
    const writes: Array<{ path: string; body: unknown; raw: string | null }> =
      [];
    const history: Array<Record<string, unknown>> = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        (message
          .text()
          .startsWith(
            "Executing inline script violates the following Content Security Policy",
          )
          ? cspErrors
          : errors
        ).push(message.text());
    });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      requests.push(`${request.method()} ${path}`);
      const json = (value: unknown) =>
        route.fulfill({ status: 200, json: value });
      if (path.endsWith("/auth/me"))
        return json({
          id: "teacher-1",
          roles: ["Teacher"],
          displayName: "RAW Teacher",
        });
      if (path.endsWith("/security/antiforgery"))
        return json({ token: "test-token" });
      if (request.method() === "POST") {
        const raw = request.postData();
        const body: unknown = raw ? request.postDataJSON() : null;
        writes.push({ path, body, raw });
        if (path.endsWith("/deadline-extensions"))
          history.push({
            id: "extension-1",
            ...(body as Record<string, unknown>),
            grantedAtUtc: "2030-01-01T12:00:00Z",
            revokedAtUtc: null,
          });
        return json(
          path.endsWith("/submit")
            ? { passed: true, reasons: [] }
            : { id: "created-1" },
        );
      }
      if (path === "/api/v1/teacher/courses/course-1") return json(course);
      if (path === "/api/v1/teacher/courses/course-1/assignments")
        return json([assignment]);
      if (path.endsWith("/teacher/assignments/submissions"))
        return json([submission]);
      if (path.endsWith("/deadline-extensions/eligible-students"))
        return json([
          { studentUserId: "student-1", displayName: "RAW Student" },
        ]);
      if (path.endsWith("/deadline-extensions")) return json(history);
      if (path.endsWith("/learning-access"))
        return json({
          items: [],
          prerequisiteCourses: [],
          rules: [],
          prerequisites: [],
        });
      if (path.startsWith("/api/v1/gradebook/"))
        return json({
          students: [
            {
              studentUserId: "student-1",
              studentName: "RAW Student",
              lessonProgressPercent: 50,
              assignmentsCompleted: 1,
              assignmentsTotal: 2,
              predictedGrade: { predictedGrade: "Merit" },
            },
          ],
          totalStudents: 1,
          page: 1,
          pageSize: 25,
        });
      return json([]);
    });
    await page.goto(`/${scenario.locale}/teacher/courses/course-1#assignments`);
    await page
      .getByRole("button", {
        name: (scenario.locale === "ar" ? arMessages : enMessages).cookieConsent
          .reject,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: m.assignments.title }),
    ).toBeVisible();
    const createForm = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: m.assignments.new }) });
    await expect(
      createForm.getByText(m.assignmentFileTypes.legend),
    ).toBeVisible();
    await createForm
      .getByPlaceholder(m.assignments.arabicTitle)
      .fill(" عنوان خام ");
    await createForm
      .getByPlaceholder(m.assignments.englishTitle)
      .fill(" Raw title ");
    await createForm
      .getByPlaceholder(m.assignments.arabicInstructions)
      .fill(" تعليمات خام ");
    await createForm
      .getByPlaceholder(m.assignments.englishInstructions)
      .fill(" Raw instructions ");
    await createForm
      .getByRole("button", { name: m.assignments.create })
      .click();
    await expect(
      createForm.getByPlaceholder(m.assignments.arabicTitle),
    ).toHaveValue("");
    expect(
      writes.find((w) => w.path === "/api/v1/teacher/assignments")?.body,
    ).toEqual({
      courseId: "course-1",
      moduleId: null,
      lessonId: null,
      learningAimId: null,
      arabicTitle: " عنوان خام ",
      englishTitle: " Raw title ",
      arabicInstructions: " تعليمات خام ",
      englishInstructions: " Raw instructions ",
      availableFromUtc: null,
      dueAtUtc: null,
      maxSubmissionAttempts: 2,
      maxScore: 100,
      allowResubmission: true,
      maxFileSizeBytes: 100 * 1024 * 1024,
      allowedFileExtensions: [
        ".pdf",
        ".docx",
        ".xlsx",
        ".pptx",
        ".png",
        ".jpg",
        ".jpeg",
        ".zip",
        ".txt",
      ],
    });
    await expect(
      page.getByRole("heading", { name: m.gradebook.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: m.gradebook.grades.Merit, exact: true }),
    ).toBeVisible();
    expect(
      requests.filter(
        (r) =>
          r.endsWith("/deadline-extensions") ||
          r.endsWith("/eligible-students"),
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: m.deadlineExtensions.title })
      .click();
    await page
      .getByLabel(m.deadlineExtensions.student)
      .selectOption("student-1");
    await page
      .getByLabel(m.deadlineExtensions.extendedDeadline)
      .fill("2030-01-02T12:00");
    await page
      .getByLabel(m.deadlineExtensions.reason, { exact: true })
      .fill(" Operational adjustment ");
    await expect(
      page.getByText(m.deadlineExtensions.privacyWarning),
    ).toBeVisible();
    await page
      .getByRole("button", { name: m.deadlineExtensions.grant })
      .click();
    await expect(
      page.getByText(m.deadlineExtensions.active, { exact: true }),
    ).toBeVisible();
    const iso = await page.evaluate(() =>
      new Date("2030-01-02T12:00").toISOString(),
    );
    expect(
      writes.find((w) => w.path.endsWith("/deadline-extensions"))?.body,
    ).toEqual({
      studentUserId: "student-1",
      extendedDueAtUtc: iso,
      reason: "Operational adjustment",
    });
    const review = page
      .locator("article")
      .filter({ has: page.getByRole("link", { name: "RAW evidence.pdf" }) });
    await expect(review.getByText(m.submissionReview.criteria)).toBeVisible();
    await review.getByRole("combobox").selectOption("Achieved");
    await review
      .getByPlaceholder(
        m.submissionReview.criterionFeedback.replace("{code}", "A.P1"),
      )
      .fill(" raw criterion ");
    await review
      .getByPlaceholder(m.submissionReview.overallFeedback)
      .fill(" raw overall ");
    await review
      .getByPlaceholder(m.submissionReview.privateNotes)
      .fill(" raw private ");
    await review.getByRole("button", { name: m.submissionReview.save }).click();
    await expect
      .poll(() => writes.find((w) => w.path.endsWith("/grade"))?.body)
      .toEqual({
        results: [
          {
            criterionId: "criterion-1",
            achievement: "Achieved",
            feedback: " raw criterion ",
          },
        ],
        overallFeedback: " raw overall ",
        privateTeacherNotes: " raw private ",
      });
    await page.getByRole("button", { name: m.reviewSubmission.submit }).click();
    await expect(page.getByText(m.reviewSubmission.success)).toBeVisible();
    expect(writes.find((w) => w.path.endsWith("/submit"))?.raw).toBeNull();
    expect(
      await page
        .locator("#assignments")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    if (scenario.locale === "ar")
      await expect(page.locator("[dir=rtl]").first()).toBeAttached();
    await testInfo.attach("coursework-review", {
      body: await page.locator("#assignments").screenshot(),
      contentType: "image/png",
    });
    await testInfo.attach("pre-existing-csp-console", {
      body: JSON.stringify(cspErrors),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}
