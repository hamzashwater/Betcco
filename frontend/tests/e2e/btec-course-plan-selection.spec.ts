import { expect, test } from "@playwright/test";
import arMessages from "../../messages/ar.json" with { type: "json" };
import enMessages from "../../messages/en.json" with { type: "json" };

for (const locale of ["en", "ar"] as const) {
  test(`teacher selects a plan and edits setup/access/announcements (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: locale === "ar" ? 390 : 1440,
      height: 1000,
    });
    const m = (locale === "ar" ? arMessages : enMessages).teacherWorkspace;
    const posted: { path: string; method: string; body: unknown }[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let postedCourse: Record<string, unknown> | undefined;
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value: unknown) => route.fulfill({ json: value });
      if (
        route.request().method() !== "GET" &&
        !path.endsWith("/teacher/courses")
      ) {
        posted.push({
          path,
          method: route.request().method(),
          body: route.request().postDataJSON(),
        });
        return json({});
      }
      if (path.endsWith("/auth/me"))
        return json({
          id: "teacher-1",
          roles: ["Teacher"],
          displayName: "Teacher",
        });
      if (path.endsWith("/security/antiforgery"))
        return json({ token: "test-token" });
      if (path.endsWith("/taxonomy"))
        return json({
          tracks: [{ id: "track-1", name: "BTEC", isBtecFocused: true }],
          grades: [],
          specializations: [],
          subjects: [],
        });
      if (path.endsWith("/teacher/courses/available-delivery-plans"))
        return json([
          {
            id: "plan-1",
            gradeId: "grade-1",
            gradeEnglishName: "Grade 11",
            gradeArabicName: "الحادي عشر",
            learningTrackId: "track-1",
            academicYearId: "year-1",
            academicYearCode: "2026/27",
            qualificationVersionId: "version-1",
            qualificationCode: "BTEC-L3-IT",
            versionCode: "ISSUE-4",
            specializationId: "spec-1",
            specializationEnglishName: "Information Technology",
            specializationArabicName: "تقنية المعلومات",
          },
        ]);
      if (
        path.endsWith("/teacher/courses") &&
        route.request().method() === "POST"
      ) {
        postedCourse = route.request().postDataJSON();
        return json({ id: "course-1" });
      }
      if (path === "/api/v1/teacher/courses/course-1")
        return json({
          id: "course-1",
          isBtecFocused: false,
          arabicTitle: "عنوان الخادم",
          englishTitle: "Server course",
          arabicDescription: "وصف",
          englishDescription: "Description",
          status: "Draft",
          price: 0,
          isFree: true,
          hasCover: false,
          outcomes: [],
          modules: [],
        });
      if (path.endsWith("/learning-access"))
        return json({
          items: [
            {
              type: "Lesson",
              id: "lesson-1",
              arabicTitle: "درس الخادم",
              englishTitle: "Server lesson",
            },
          ],
          prerequisiteCourses: [
            {
              type: "Course",
              id: "prior-course",
              arabicTitle: "دورة سابقة",
              englishTitle: "Prior course",
            },
          ],
          rules: [],
          prerequisites: [],
        });
      if (path.includes("/gradebook/"))
        return json({ students: [], totalStudents: 0, page: 1, pageSize: 25 });
      return json([]);
    });

    await page.goto(`/${locale}/teacher/courses/new`);
    await expect(
      page.getByRole("heading", { name: m.courseSetup.title }),
    ).toBeVisible();
    const submit = page.getByRole("button", {
      name: m.courseSetup.submit,
    });
    await expect(submit).toBeDisabled();
    await page
      .getByRole("textbox", { name: m.courseDetails.arabicTitle })
      .fill("دورة");
    await page
      .getByRole("textbox", { name: m.courseDetails.arabicDescription })
      .fill("وصف");
    await page.getByRole("checkbox", { name: m.courseSetup.free }).check();
    await page
      .getByRole("combobox", { name: m.courseSetup.specialization })
      .selectOption("spec-1");
    await page
      .getByRole("combobox", { name: m.courseSetup.grade })
      .selectOption("grade-1");
    await page
      .getByRole("combobox", { name: m.courseSetup.academicYear })
      .selectOption("year-1");
    await page
      .getByRole("combobox", { name: m.courseSetup.programmePlan })
      .selectOption("plan-1");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(() => postedCourse?.deliveryPlanId).toBe("plan-1");
    expect(postedCourse?.gradeId).toBe("grade-1");
    expect(postedCourse?.specializationId).toBe("spec-1");
    expect(postedCourse?.englishTitle).toBe("دورة");
    expect(postedCourse?.englishDescription).toBe("وصف");
    expect(postedCourse?.price).toBe(0);
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/teacher/courses/course-1$`),
    );
    const details = page.locator("#details");
    await expect(
      details.getByRole("heading", { name: m.courseDetails.title }),
    ).toBeVisible();
    await details
      .getByRole("checkbox", { name: m.courseDetails.free })
      .uncheck();
    await details
      .getByRole("spinbutton", { name: m.courseDetails.price })
      .fill("8.125");
    await details.getByRole("button", { name: m.courseDetails.save }).click();
    await expect
      .poll(
        () =>
          posted.find(({ path }) => path.endsWith("/teacher/courses/course-1"))
            ?.body,
      )
      .toMatchObject({ price: 8.125, isFree: false });
    const access = page.locator("#access");
    await access
      .getByRole("combobox", { name: m.learningAccess.target })
      .selectOption("Lesson:lesson-1");
    await access
      .getByRole("combobox", { name: m.learningAccess.releaseMethod })
      .selectOption("DaysAfterEnrollment");
    await access
      .getByRole("spinbutton", { name: m.learningAccess.numberOfDays })
      .fill("7");
    await access
      .getByRole("button", { name: m.learningAccess.saveRelease })
      .click();
    await expect
      .poll(() =>
        posted.find(({ path }) => path.endsWith("/learning-access/release")),
      )
      .toMatchObject({
        method: "PUT",
        body: {
          targetType: "Lesson",
          targetId: "lesson-1",
          releaseMode: "DaysAfterEnrollment",
          specificDateUtc: null,
          daysAfterEnrollment: 7,
          previousContentType: null,
          previousContentId: null,
        },
      });
    await access
      .getByRole("combobox")
      .last()
      .selectOption("Course:prior-course");
    await access
      .getByRole("button", { name: m.learningAccess.addPrerequisite })
      .click();
    await expect
      .poll(() =>
        posted.find(({ path }) =>
          path.endsWith("/learning-access/prerequisites"),
        ),
      )
      .toMatchObject({
        method: "POST",
        body: {
          targetType: "Lesson",
          targetId: "lesson-1",
          requiredContentType: "Course",
          requiredContentId: "prior-course",
        },
      });
    const announcements = page.locator("#announcements");
    await announcements
      .getByPlaceholder(m.courseDetails.arabicTitle)
      .fill("إعلان");
    await announcements
      .getByPlaceholder(m.courseDetails.englishTitle)
      .fill("Announcement");
    await announcements.getByPlaceholder(m.announcements.arabicBody).fill("نص");
    await announcements
      .getByPlaceholder(m.announcements.englishBody)
      .fill("Body");
    await announcements
      .getByRole("checkbox", { name: m.announcements.publishNow })
      .uncheck();
    await announcements
      .getByRole("button", { name: m.announcements.saveDraft })
      .click();
    await expect
      .poll(() => posted.find(({ path }) => path.endsWith("/announcements")))
      .toMatchObject({
        method: "POST",
        body: {
          arabicTitle: "إعلان",
          englishTitle: "Announcement",
          arabicBody: "نص",
          englishBody: "Body",
          audience: "Course",
          courseModuleId: null,
          selectedStudentIds: [],
          publish: false,
        },
      });
    await expect(
      announcements.getByPlaceholder(m.courseDetails.arabicTitle),
    ).toHaveValue("");
    await expect(access.getByRole("combobox").last()).toHaveValue("");
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
