import { expect, test } from "@playwright/test";

test("teacher selects an approved plan before creating a BTEC draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let postedCourse: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
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
    return json([]);
  });

  await page.goto("/en/teacher/courses/new");
  await expect(
    page.getByRole("heading", { name: "Create a course draft" }),
  ).toBeVisible();
  const submit = page.getByRole("button", {
    name: /Create course|Create draft/i,
  });
  await expect(submit).toBeDisabled();
  await page.getByRole("textbox", { name: "Arabic title" }).fill("دورة");
  await page.getByRole("textbox", { name: "Arabic description" }).fill("وصف");
  await page.getByRole("checkbox", { name: "Free course" }).check();
  await page
    .getByRole("combobox", { name: "Specialization" })
    .selectOption("spec-1");
  await page.getByRole("combobox", { name: "Grade" }).selectOption("grade-1");
  await page
    .getByRole("combobox", { name: "Academic year" })
    .selectOption("year-1");
  await page
    .getByRole("combobox", { name: "Programme plan" })
    .selectOption("plan-1");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => postedCourse?.deliveryPlanId).toBe("plan-1");
  expect(postedCourse?.gradeId).toBe("grade-1");
  expect(postedCourse?.specializationId).toBe("spec-1");
  expect(pageErrors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
