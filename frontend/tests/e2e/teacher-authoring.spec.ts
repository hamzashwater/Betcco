import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  authoringCourse,
  authoringResponse,
} from "../fixtures/teacher-authoring";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
// MOCKED UI-CONTRACT EVIDENCE: production renderer, intercepted synthetic API.
const coursePath = `/teacher/courses/${authoringCourse.id}`;
const sections = [
  "details",
  "access",
  "announcements",
  "curriculum",
  "assignments",
  "review",
];
const region = (page: Page, name: string) =>
  page.locator(`[data-authoring-region="${name}"]`);
test.afterEach(async ({}, info) => {
  const p = info.outputPath("scenario.json");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        title: info.title,
        status: info.status,
        expectedStatus: info.expectedStatus,
      },
      null,
      2,
    ),
  );
});
async function prepare(
  page: Page,
  locale: "en" | "ar",
  theme = "light",
  mode = "data",
  status = "Draft",
) {
  const state = { mode, status, uploadError: false, saveError: false };
  const writes: { path: string; method: string; raw: string | null }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((theme) => {
    localStorage.setItem("betcco-theme", theme);
    localStorage.setItem(
      "betcco-cookie-consent",
      JSON.stringify({
        necessary: true,
        preferences: false,
        analytics: false,
        marketing: false,
        savedAt: new Date().toISOString(),
      }),
    );
  }, theme);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace(/^\/api\/v1/, "");
    if (p === "/security/antiforgery")
      return route.fulfill({ json: { token: "synthetic-token" } });
    if (req.method() !== "GET") {
      writes.push({ path: p, method: req.method(), raw: req.postData() });
      if (p.endsWith("/resources") && state.uploadError)
        return route.fulfill({
          status: 409,
          json: { message: "RAW upload conflict" },
        });
      if (p === coursePath && state.saveError)
        return route.fulfill({
          status: 409,
          json: { message: "RAW concurrency conflict" },
        });
      if (p === `${coursePath}/submit`)
        return route.fulfill({
          json: {
            passed: false,
            reasons: ["RAW first validation", "RAW second validation"],
          },
        });
      return route.fulfill({ json: {} });
    }
    if (p === coursePath) {
      if (state.mode === "pending") return new Promise(() => {});
      if (state.mode === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic refresh failure" },
        });
    }
    if (p.startsWith("/teacher/") || p.startsWith("/gradebook/")) {
      const course = {
        ...authoringCourse,
        status: state.status,
        ...(state.mode === "empty" ? { modules: [], outcomes: [] } : {}),
      };
      return route.fulfill({ json: authoringResponse(p + url.search, course) });
    }
    return route.fulfill(roleShellRuntimeResponse(p, locale, ["Teacher"]));
  });
  await page.goto(
    `/${locale}/teacher/courses/${authoringCourse.id}?context=authoring#details`,
  );
  const copy = locale === "ar" ? ar : en;
  const toggle = page.getByRole("button", {
    name: copy.navigation.theme.toggle,
  });
  await expect(toggle).toBeVisible();
  if (!(await page.locator("html").getAttribute("data-theme")))
    await toggle.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    locale === "ar" ? "rtl" : "ltr",
  );
  return { state, writes, errors, copy };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function populated(page: Page, locale: "en" | "ar") {
  await expect(
    region(page, "CourseDetailsForm").getByLabel(
      (locale === "ar" ? ar : en).teacherWorkspace.courseDetails.englishTitle,
    ),
  ).toHaveValue(authoringCourse.englishTitle);
  await expect(
    page.getByText("RAW submission.pdf", { exact: true }),
  ).toBeVisible();
}
for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width}: populated six-region authoring canvas`, async ({
        page,
      }, info) => {
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme);
        await populated(page, locale);
        const nav = page.getByRole("navigation", {
          name: c.copy.teacherCourseWorkspace.navigation.label,
          exact: true,
        });
        expect(
          await nav
            .locator("a")
            .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
        ).toEqual(sections.map((s) => `#${s}`));
        for (const section of sections) {
          const link = nav.locator(`a[href="#${section}"]`);
          await link.click();
          await expect(page).toHaveURL((u) => u.hash === `#${section}`);
          await expect(link).toHaveAttribute("aria-current", "location");
          if (viewport.width < 1024)
            await expect(
              nav.getByText(
                c.copy.teacherAuthoringPresentation.currentSection.replace(
                  "{section}",
                  c.copy.teacherCourseWorkspace.navigation[
                    section as keyof typeof c.copy.teacherCourseWorkspace.navigation
                  ],
                ),
              ),
            ).toBeVisible();
          await noOverflow(page);
          await page.screenshot({ path: info.outputPath(`${section}.png`) });
        }
        for (const name of [
          "LearningAimEditor",
          "LessonEditor",
          "CourseworkDeadlineExtensionPanel",
          "AssignmentSubmissionCard",
          "TeacherPracticeReview",
          "TeacherComprehensiveReview",
        ]) {
          const item = region(page, name).first();
          await item.scrollIntoViewIfNeeded();
          if (name === "CourseworkDeadlineExtensionPanel")
            await item.getByRole("button").first().click();
          await noOverflow(page);
          await page.screenshot({ path: info.outputPath(`${name}.png`) });
        }
        const weights = await region(page, "ExistingCourseEditor").evaluate(
          (root) =>
            [...root.querySelectorAll("h1,h2,h3,h4,label,button,p")].map((e) =>
              Number(getComputedStyle(e).fontWeight),
            ),
        );
        expect(weights.every((w) => w <= 700)).toBe(true);
        expect(c.writes).toEqual([]);
        expect(c.errors).toEqual([]);
      });
    }
  for (const mode of ["pending", "error", "empty"])
    test(`${locale}: ${mode} factual course state`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const c = await prepare(page, locale, "dark", mode);
      if (mode === "pending")
        await expect(
          page.getByText(c.copy.teacherWorkspace.shared.loading, {
            exact: true,
          }),
        ).toBeVisible();
      else if (mode === "error")
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: c.copy.teacherAuthoringPresentation.loadError }),
        ).toBeVisible({ timeout: 15000 });
      else {
        await expect(region(page, "CourseDetailsForm")).toBeVisible();
        await expect(region(page, "ModuleEditor")).toHaveCount(0);
      }
      if (mode !== "empty")
        await expect(region(page, "ReviewSubmission")).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath("state.png") });
      expect(c.writes).toEqual([]);
      expect(c.errors).toEqual([]);
    });
  for (const status of ["Published", "SubmittedForReview", "Rejected"])
    test(`${locale}: ${status} existing edit guards`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 834, height: 1112 });
      const c = await prepare(page, locale, "light", "data", status);
      await populated(page, locale);
      const title = region(page, "CourseDetailsForm").getByLabel(
        c.copy.teacherWorkspace.courseDetails.englishTitle,
      );
      const submit = region(page, "ReviewSubmission").getByRole("button");
      if (status === "Rejected") {
        await expect(title).toBeEnabled();
        await expect(submit).toBeEnabled();
      } else {
        await expect(title).toBeDisabled();
        await expect(submit).toBeDisabled();
      }
      await page.screenshot({ path: info.outputPath("locked-context.png") });
      await region(page, "ReviewSubmission").scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("review-guard.png") });
      expect(c.writes).toEqual([]);
      expect(c.errors).toEqual([]);
    });
  test(`${locale}: unsaved fields and files survive hashes, Back and cached refresh error`, async ({
    page,
  }, info) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    const c = await prepare(page, locale, "dark");
    await populated(page, locale);
    const title = region(page, "CourseDetailsForm").getByLabel(
      c.copy.teacherWorkspace.courseDetails.englishTitle,
    );
    const lessonTitle = region(page, "LessonEditor").locator("input").nth(1);
    const feedback = region(page, "AssignmentSubmissionCard").getByPlaceholder(
      c.copy.teacherWorkspace.submissionReview.overallFeedback,
    );
    await title.fill("UNSAVED title");
    await lessonTitle.fill("UNSAVED lesson");
    await feedback.fill("UNSAVED review draft");
    await region(page, "CoverManager")
      .locator('input[type="file"]')
      .setInputFiles({
        name: "unsaved-cover.png",
        mimeType: "image/png",
        buffer: Buffer.from("synthetic"),
      });
    await region(page, "LessonEditor")
      .locator('input[type="file"]')
      .nth(1)
      .setInputFiles({
        name: "unsaved-evidence.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic"),
      });
    const nav = page.getByRole("navigation", {
      name: c.copy.teacherCourseWorkspace.navigation.label,
      exact: true,
    });
    for (const s of sections) await nav.locator(`a[href="#${s}"]`).click();
    await page.goBack();
    await expect(nav.locator('a[href="#assignments"]')).toHaveAttribute(
      "aria-current",
      "location",
    );
    const before = await region(page, "ExistingCourseEditor")
      .locator("a")
      .evaluateAll((a) => a.map((e) => e.getAttribute("href")));
    c.state.mode = "error";
    await page.clock.fastForward(31_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(
      page.getByText(c.copy.teacherAuthoringPresentation.loadError, {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(title).toHaveValue("UNSAVED title");
    await expect(lessonTitle).toHaveValue("UNSAVED lesson");
    await expect(feedback).toHaveValue("UNSAVED review draft");
    await expect(
      region(page, "CoverManager").getByText("unsaved-cover.png", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      region(page, "LessonEditor").getByText("unsaved-evidence.pdf", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await region(page, "ExistingCourseEditor")
        .locator("a")
        .evaluateAll((a) => a.map((e) => e.getAttribute("href"))),
    ).toEqual(before);
    await page
      .getByText(c.copy.teacherAuthoringPresentation.loadError, { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("cached-error.png") });
    await title.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("retained-title.png") });
    await region(page, "LessonEditor")
      .getByText("unsaved-evidence.pdf", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("retained-file.png") });
    expect(c.writes).toEqual([]);
    expect(c.errors).toEqual([]);
  });
  test(`${locale}: raw mutation feedback, upload failure and review validation order`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const c = await prepare(page, locale, "light");
    await populated(page, locale);
    c.state.saveError = true;
    c.state.uploadError = true;
    const title = region(page, "CourseDetailsForm").getByLabel(
      c.copy.teacherWorkspace.courseDetails.englishTitle,
    );
    await title.fill("UNSAVED concurrency draft");
    await region(page, "CourseDetailsForm")
      .getByRole("button", { name: c.copy.teacherWorkspace.courseDetails.save })
      .click();
    await expect(
      page.getByText("RAW concurrency conflict", { exact: true }),
    ).toBeVisible();
    await expect(title).toHaveValue("UNSAVED concurrency draft");
    await page.screenshot({ path: info.outputPath("concurrency.png") });
    await region(page, "LessonEditor")
      .locator('input[type="file"]')
      .nth(1)
      .setInputFiles({
        name: "failed-evidence.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic"),
      });
    await region(page, "LessonEditor")
      .getByRole("button", {
        name: c.copy.teacherWorkspace.lesson.uploadResources,
      })
      .click();
    await expect(
      page.getByText("RAW upload conflict", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("failed-evidence.pdf", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("upload-error.png") });
    await region(page, "ReviewSubmission").getByRole("button").click();
    await expect(
      region(page, "ReviewSubmission").getByRole("listitem"),
    ).toHaveText(["RAW first validation", "RAW second validation"]);
    await page.screenshot({ path: info.outputPath("validation.png") });
    expect(c.writes.map((w) => [w.method, w.path])).toEqual([
      ["PUT", coursePath],
      ["POST", "/teacher/courses/lessons/lesson-raw/resources"],
      ["POST", `${coursePath}/submit`],
    ]);
    expect(c.writes[1].raw).toContain('name="file"');
    expect(c.writes[1].raw).toContain('name="isDownloadable"');
    expect(c.writes[2].raw).toBeNull();
    expect(c.errors).toEqual([]);
  });
  test(`${locale}: locale keeps query/hash; keyboard focus, reduced motion and 200 percent reflow proxy`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 720, height: 450 });
    const c = await prepare(page, locale, "light");
    await populated(page, locale);
    const nav = page.getByRole("navigation", {
      name: c.copy.teacherCourseWorkspace.navigation.label,
      exact: true,
    });
    const link = nav.locator('a[href="#assignments"]');
    await nav.locator('a[href="#curriculum"]').focus();
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    expect(await link.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe(
      "solid",
    );
    expect(
      Number.parseFloat(
        await link.evaluate((e) => getComputedStyle(e).transitionDuration),
      ),
    ).toBeLessThanOrEqual(0.001);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("keyboard-reflow.png") });
    await page.keyboard.press("Enter");
    await expect(link).toHaveAttribute("aria-current", "location");
    await page
      .getByRole("button", {
        name: c.copy.navigation.accessibility.openMenu,
        exact: true,
      })
      .click();
    await page
      .getByRole("link", {
        name: c.copy.navigation.accessibility.switchLanguage,
      })
      .click();
    const alternate = locale === "en" ? "ar" : "en";
    await expect(page).toHaveURL(
      (u) =>
        u.pathname === `/${alternate}/teacher/courses/${authoringCourse.id}` &&
        u.search === "?context=authoring" &&
        u.hash === "#assignments",
    );
    await expect(region(page, "CourseDetailsForm")).toBeVisible();
    expect(c.writes).toEqual([]);
    expect(c.errors).toEqual([]);
  });
}
