import { expect, test, type Page } from "@playwright/test";

const courseId = "course-comprehensive";
const assignmentId = "final-unit-practice";
const submissionId = "final-submission";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (
      message
        .text()
        .startsWith(
          "Executing inline script violates the following Content Security Policy",
        )
    )
      return;
    if (
      message
        .text()
        .startsWith(
          "Applying inline style violates the following Content Security Policy",
        )
    )
      return;
    errors.push(message.text());
  });
  return errors;
}

for (const scenario of [
  { locale: "en", width: 1280 },
  { locale: "ar", width: 1280 },
  { locale: "en", width: 390 },
]) {
  test(`Final Unit Practice lifecycle ${scenario.locale} ${scenario.width}px (mocked API)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const errors = watchErrors(page);
    let role: "Student" | "Teacher" = "Student";
    let configured = false;
    let published = false;
    let updated = false;
    let criterionAttached = false;
    let resourceUploaded = false;
    let ready = false;
    let deadlineExpired = false;
    let draft = false;
    let uploaded = false;
    let submitted = false;
    let reviewed = false;
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (data: unknown) => route.fulfill({ json: data });
      if (path === "/api/v1/auth/me")
        return json({
          id: role.toLowerCase(),
          displayName: role,
          roles: [role],
        });
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
          lessonProgressPercent: ready ? 100 : 75,
          lessonsCompleted: ready ? 4 : 3,
          lessonsTotal: 4,
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
          resumeLessonId: null,
          currentLessonId: null,
          previousLessonId: null,
          nextLessonId: null,
          requestedLessonRejected: false,
          modules: [
            { id: "unit-1", title: "Unit one", isLocked: false, lessons: [] },
          ],
        });
      if (path === `/api/v1/student/courses/${courseId}/learning-aim-practice`)
        return json([
          {
            id: "unit-1",
            arabicTitle: "الوحدة الأولى",
            englishTitle: "Unit one",
            aims: Array.from({ length: 4 }, (_, index) => ({
              id: `aim-${index}`,
              code: String.fromCharCode(65 + index),
              arabicTitle: `هدف ${index + 1}`,
              englishTitle: `Aim ${index + 1}`,
              isUnlocked: true,
              contentTotal: 1,
              contentCompleted: 1,
              contentComplete: true,
              practiceAvailable: false,
              practiceStatus: "Finalized",
              trainingOutcome: "Pass",
              isComplete: ready || index < 3,
            })),
            finalPractice: {
              assignmentId: configured && published ? assignmentId : null,
              arabicTitle: "مهمة الوحدة",
              englishTitle: "Unit Practice",
              arabicInstructions: ready && published ? "ارفع عملك" : null,
              englishInstructions:
                ready && published ? "Upload your work" : null,
              isAvailable:
                configured &&
                published &&
                ready &&
                !deadlineExpired &&
                !submitted,
              unavailableReason: !published
                ? "NotConfigured"
                : !ready
                  ? "LearningAimsIncomplete"
                  : deadlineExpired
                    ? "DeadlineExpired"
                    : null,
              status: !published
                ? "NotConfigured"
                : reviewed
                  ? "Finalized"
                  : submitted
                    ? "Submitted"
                    : draft
                      ? "Draft"
                      : ready && !deadlineExpired
                        ? "Available"
                        : "Locked",
              trainingOutcome: reviewed ? "Merit" : null,
              strengths: reviewed ? "Strong evidence" : null,
              gaps: reviewed ? "Missing chart" : null,
              improvementGuidance: reviewed ? "Add a chart" : null,
              isTrainingComplete: reviewed,
              resources: [],
              criteria: [],
            },
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
                        ? [{ id: "file-1", originalFileName: "unit.pdf" }]
                        : [],
                    },
                  ],
                },
              ]
            : [],
        );
      if (path === `/api/v1/student/assignments/${assignmentId}/submissions`) {
        if (!published) return route.fulfill({ status: 404 });
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
              arabicTitle: "الوحدة الأولى",
              englishTitle: "Unit one",
              publicationStatus: "Published",
              learningAims: [],
              criteria: [
                {
                  id: "criterion-1",
                  code: "A.P1",
                  arabicDescription: "معيار الوحدة",
                  englishDescription: "Unit criterion",
                },
              ],
              lessons: [],
            },
          ],
        });
      if (path === `/api/v1/teacher/courses/${courseId}/comprehensive-practice`)
        return json(
          configured
            ? [
                {
                  id: assignmentId,
                  courseModuleId: "unit-1",
                  arabicTitle: "مهمة الوحدة",
                  englishTitle: "Unit Practice",
                  arabicInstructions: "ارفع عملك",
                  englishInstructions: "Upload your work",
                  isPublished: published,
                  publicationStatus: published ? "Published" : "Draft",
                  resources: resourceUploaded
                    ? [{ id: "resource-1", displayName: "brief.pdf" }]
                    : [],
                  criteria: criterionAttached
                    ? [
                        {
                          id: "link-1",
                          btecCriterionId: "criterion-1",
                          code: "A.P1",
                        },
                      ]
                    : [],
                },
              ]
            : [],
        );
      if (
        path ===
        `/api/v1/teacher/courses/${courseId}/comprehensive-practice/submissions`
      )
        return json(
          submitted
            ? [
                {
                  id: submissionId,
                  courseAssignmentId: assignmentId,
                  studentUserId: "student",
                  status: reviewed ? "Finalized" : "Submitted",
                  trainingOutcome: reviewed ? "Merit" : null,
                  files: [{ id: "file-1", originalFileName: "unit.pdf" }],
                },
              ]
            : [],
        );
      if (path === "/api/v1/teacher/comprehensive-practice") {
        configured = true;
        return json({ id: assignmentId });
      }
      if (path === `/api/v1/teacher/comprehensive-practice/${assignmentId}`) {
        updated = true;
        return route.fulfill({ status: 204 });
      }
      if (path === "/api/v1/teacher/assignments/criteria") {
        criterionAttached = true;
        return json({ id: "link-1" });
      }
      if (path === `/api/v1/teacher/assignments/${assignmentId}/resources`) {
        resourceUploaded = true;
        return route.fulfill({ status: 204 });
      }
      if (path === `/api/v1/teacher/assignments/${assignmentId}/publish`) {
        published = true;
        return route.fulfill({ status: 204 });
      }
      if (
        path ===
        `/api/v1/teacher/comprehensive-practice/submissions/${submissionId}/review`
      ) {
        reviewed = true;
        return route.fulfill({ status: 204 });
      }
      if (
        path === `/api/v1/teacher/courses/${courseId}/practice` ||
        path === `/api/v1/teacher/courses/${courseId}/practice/submissions`
      )
        return json([]);
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

    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    const finalArea = page.getByRole("region", {
      name:
        scenario.locale === "ar"
          ? "التدريب النهائي للوحدة"
          : "Final Unit Practice",
    });
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? /أهداف التعلم المكتملة: 3 \/ 4/
          : /Learning Aims complete: 3 \/ 4/,
      ),
    ).toBeVisible();
    await expect(
      finalArea.getByText(
        scenario.locale === "ar" ? "لم تُنشأ المهمة بعد" : "Not configured",
      ),
    ).toBeVisible();

    role = "Teacher";
    await page.goto(
      `/${scenario.locale}/teacher/courses/${courseId}#assignments`,
    );
    const teacherArea = page.getByRole("region", {
      name:
        scenario.locale === "ar"
          ? "التدريب النهائي للوحدات"
          : "Final Unit Practice",
    });
    await teacherArea
      .getByRole("button", {
        name:
          scenario.locale === "ar"
            ? "إنشاء مهمة الوحدة"
            : "Create Unit Practice",
      })
      .click();
    await teacherArea
      .getByLabel(
        scenario.locale === "ar" ? "العنوان بالعربية" : "Arabic title",
      )
      .fill("مهمة الوحدة");
    await teacherArea
      .getByLabel(
        scenario.locale === "ar" ? "العنوان بالإنجليزية" : "English title",
      )
      .fill("Unit Practice");
    await teacherArea
      .getByLabel(
        scenario.locale === "ar" ? "التعليمات بالعربية" : "Arabic instructions",
      )
      .fill("ارفع عملك");
    await teacherArea
      .getByLabel(
        scenario.locale === "ar"
          ? "التعليمات بالإنجليزية"
          : "English instructions",
      )
      .fill("Upload your work");
    await teacherArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "حفظ المهمة" : "Save Practice",
      })
      .click();
    await expect.poll(() => configured).toBe(true);

    ready = true;
    role = "Student";
    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? /أهداف التعلم المكتملة: 4 \/ 4/
          : /Learning Aims complete: 4 \/ 4/,
      ),
    ).toBeVisible();
    await expect(
      finalArea.getByText(
        scenario.locale === "ar" ? "لم تُنشأ المهمة بعد" : "Not configured",
      ),
    ).toBeVisible();
    await expect(
      finalArea.getByRole("button", {
        name: scenario.locale === "ar" ? "فتح التدريب" : "Open Practice",
      }),
    ).toHaveCount(0);

    role = "Teacher";
    await page.goto(
      `/${scenario.locale}/teacher/courses/${courseId}#assignments`,
    );
    await expect(
      teacherArea.getByText(
        scenario.locale === "ar" ? /مسودة غير منشورة/ : /Unpublished draft/,
      ),
    ).toBeVisible();
    await teacherArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "حفظ التعديلات" : "Save changes",
      })
      .click();
    await expect.poll(() => updated).toBe(true);
    await teacherArea
      .getByLabel(
        scenario.locale === "ar"
          ? "اختر معيارًا من الوحدة"
          : "Choose a criterion from this Unit",
      )
      .selectOption("criterion-1");
    await teacherArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "ربط المعيار" : "Attach criterion",
      })
      .click();
    await expect.poll(() => criterionAttached).toBe(true);
    await expect(teacherArea.getByText("A.P1")).toBeVisible();
    await teacherArea.locator('input[type="file"]').setInputFiles({
      name: "brief.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n"),
    });
    await teacherArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "رفع المواد" : "Upload resources",
      })
      .click();
    await expect.poll(() => resourceUploaded).toBe(true);
    await expect(teacherArea.getByText("brief.pdf")).toBeVisible();
    await teacherArea
      .getByRole("button", {
        name:
          scenario.locale === "ar"
            ? "نشر مهمة الوحدة"
            : "Publish Unit Practice",
      })
      .click();
    await expect.poll(() => published).toBe(true);

    ready = false;
    role = "Student";
    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? "أكمل جميع أهداف التعلم ومراجعاتها أولًا."
          : "Complete all Learning Aims and their reviews first.",
      ),
    ).toBeVisible();
    ready = true;
    deadlineExpired = true;
    await page.reload();
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? "انتهى الموعد النهائي لهذه المهمة التدريبية."
          : "The deadline for this Unit Practice has passed.",
      ),
    ).toBeVisible();
    await expect(
      finalArea.getByRole("button", {
        name: scenario.locale === "ar" ? "فتح التدريب" : "Open Practice",
      }),
    ).toHaveCount(0);
    deadlineExpired = false;
    await page.reload();
    role = "Student";
    await finalArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "فتح التدريب" : "Open Practice",
      })
      .click();
    await finalArea.locator('input[type="file"]').setInputFiles({
      name: "unit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n"),
    });
    await finalArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "رفع الملفات" : "Upload files",
      })
      .click();
    await expect(finalArea.getByText("unit.pdf")).toBeVisible();
    role = "Teacher";
    await page.goto(
      `/${scenario.locale}/teacher/courses/${courseId}#assignments`,
    );
    await expect(teacherArea.getByText("unit.pdf")).toHaveCount(0);
    role = "Student";
    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    await finalArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "متابعة المسودة" : "Continue draft",
      })
      .click();
    await finalArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "تسليم للمعلم" : "Submit to teacher",
      })
      .click();
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? /مُسلَّم، بانتظار مراجعة المعلم/
          : /Submitted, awaiting teacher review/,
      ),
    ).toBeVisible();

    role = "Teacher";
    await page.goto(
      `/${scenario.locale}/teacher/courses/${courseId}#assignments`,
    );
    await expect(teacherArea.getByText("unit.pdf")).toBeVisible();
    await teacherArea
      .getByLabel(
        scenario.locale === "ar" ? "النتيجة التدريبية" : "Training Outcome",
      )
      .selectOption("Merit");
    await teacherArea
      .getByLabel(scenario.locale === "ar" ? "نقاط القوة" : "Strengths")
      .fill("Strong evidence");
    await teacherArea
      .getByLabel(
        scenario.locale === "ar"
          ? "الفجوات والأدلة الناقصة"
          : "Gaps / missing evidence",
      )
      .fill("Missing chart");
    await teacherArea
      .getByLabel(
        scenario.locale === "ar" ? "إرشادات التحسين" : "Improvement guidance",
      )
      .fill("Add a chart");
    await teacherArea
      .getByRole("button", {
        name: scenario.locale === "ar" ? "اعتماد المراجعة" : "Finalize review",
      })
      .click();
    await expect.poll(() => reviewed).toBe(true);

    role = "Student";
    await page.goto(`/${scenario.locale}/student/learn/${courseId}`);
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? "اكتمل مسار التدريب للوحدة"
          : "Unit Training Complete",
      ),
    ).toBeVisible();
    await expect(finalArea.getByText(/Strong evidence/)).toBeVisible();
    await expect(finalArea.getByText(/Missing chart/)).toBeVisible();
    await expect(finalArea.getByText(/Add a chart/)).toBeVisible();
    await expect(
      finalArea.getByText(
        scenario.locale === "ar"
          ? /ليست نتيجة تقييم BTEC رسمي/
          : /not a formal BTEC assessment result/,
      ),
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
