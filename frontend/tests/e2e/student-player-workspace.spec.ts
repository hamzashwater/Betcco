import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  workspaceCourseId,
  workspaceLessonIds,
  workspacePlayer,
  workspaceResponse,
  workspaceUnits,
} from "../fixtures/player-workspace";

// MOCKED UI-CONTRACT EVIDENCE: production Next player, native media and focus,
// synthetic intercepted server responses. No backend/authorization proof.
async function prepare(
  page: Page,
  locale: "en" | "ar",
  theme: string,
  kind: keyof typeof workspaceLessonIds = "Text",
  state = "data",
  final = false,
) {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\/v1/, "");
    if (request.method() !== "GET") {
      writes.push(request.method() + " " + path);
      if (path === "/security/antiforgery")
        return route.fulfill({ json: { token: "synthetic-csrf" } });
      if (path === "/student/assignments/practice-target/submissions")
        return route.fulfill({
          json: { submissionId: "submission-target", versionNumber: 1 },
        });
      return route.fulfill({
        status: 400,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "synthetic-csrf" } });
    if (path.endsWith("/video"))
      return route.fulfill({
        contentType: "video/webm",
        body: readFileSync("tests/fixtures/player-workspace.webm"),
      });
    if (path.startsWith(`/learning/courses/${workspaceCourseId}/player`)) {
      if (state === "pending") return;
      if (state === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic cold error" },
        });
      const value = workspacePlayer(
        locale,
        url.searchParams.get("lessonId") || workspaceLessonIds[kind],
      );
      if (state === "empty") {
        value.modules = [];
        value.currentLessonId = "";
      }
      for (const lesson of value.modules.flatMap((m) => m.lessons))
        if (lesson.type === "Video") {
          lesson.lastPositionSeconds = 0;
          lesson.durationSeconds = 2;
        }
      return route.fulfill({ json: value });
    }
    if (state === "content" && path.endsWith("/learning-aim-practice")) {
      const units = workspaceUnits();
      units[0].aims[1].contentComplete = false;
      units[0].aims[1].contentCompleted = 1;
      units[0].aims[1].practiceAvailable = false;
      units[0].aims[1].practiceStatus = "Locked";
      return route.fulfill({ json: units });
    }
    const data = workspaceResponse(
      path + url.search,
      locale,
      workspaceLessonIds[kind],
      final,
    );
    if (data !== undefined) return route.fulfill({ json: data });
    return route.fulfill(roleShellRuntimeResponse(path, locale, ["Student"]));
  });
  await page.goto(
    `/${locale}/student/learn/${workspaceCourseId}?lessonId=${workspaceLessonIds[kind]}`,
  );
  const toggle = page.getByRole("button", {
    name: (locale === "ar" ? ar : en).navigation.theme.toggle,
  });
  await expect(toggle).toBeVisible();
  if (!(await page.locator("html").getAttribute("data-theme"))) {
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  return { writes, errors };
}
for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width} Text: lesson continuity and expanded Unit rail`, async ({
        page,
      }, info) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const fixture = await prepare(page, locale, theme);
        const title = page.locator("#player-current-lesson");
        await expect(title).toBeVisible();
        expect(
          await title.evaluate((e) => getComputedStyle(e).fontWeight),
        ).toBe("700");
        await expect(
          page.getByRole("tablist", {
            name: copy.studentPlayerWorkspace.navigation,
          }),
        ).toBeVisible();
        await expect(page.locator("details").first()).toHaveAttribute(
          "open",
          "",
        );
        await expect(
          page.getByRole("button", {
            name: copy.studentWorkspace.coursePlayer.markComplete,
          }),
        ).toBeEnabled();
        const heading = page.getByRole("heading", {
          name: copy.studentProgressIntelligence.title,
        });
        await heading.scrollIntoViewIfNeeded();
        await page
          .locator(
            'section[aria-labelledby="student-progress-intelligence-heading"]',
          )
          .screenshot({ path: info.outputPath("journey.png") });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath("lesson.png") });
        if (viewport.width < 1024) {
          await page
            .getByRole("button", {
              name: copy.studentWorkspace.coursePlayer.courseContent,
              exact: true,
            })
            .click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.locator("a[aria-current]")).toBeFocused();
          expect(
            await dialog.evaluate((e) => getComputedStyle(e).animationName),
          ).toBe("none");
          await page.screenshot({
            path: info.outputPath("outline-dialog.png"),
          });
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByRole("button", {
              name: copy.studentWorkspace.coursePlayer.courseContent,
              exact: true,
            }),
          ).toBeFocused();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(fixture.writes).toEqual([]);
        expect(fixture.errors).toEqual([]);
      });
    }
  for (const kind of ["Video", "Assignment", "Locked", "Completed"] as const) {
    test(`${locale} ${kind}: server state and media/assignment boundaries`, async ({
      page,
    }, info) => {
      await page.setViewportSize(
        locale === "ar"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      );
      const fixture = await prepare(
        page,
        locale,
        locale === "ar" ? "dark" : "light",
        kind,
      );
      await expect(page.locator("#player-current-lesson")).toBeVisible();
      if (kind === "Locked")
        await expect(
          page
            .getByText(copy.studentWorkspace.coursePlayer.lockedPrerequisite)
            .first(),
        ).toBeVisible();
      if (kind === "Completed")
        await expect(
          page.getByRole("button", {
            name: copy.studentWorkspace.coursePlayer.completed,
            exact: true,
          }),
        ).toBeDisabled();
      if (kind === "Assignment")
        await expect(
          page.getByRole("heading", {
            name: copy.studentWorkspace.coursework.title,
          }),
        ).toBeVisible();
      if (kind === "Video") {
        const video = page.locator("video");
        await expect
          .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
          .toBeGreaterThan(1);
        const before = await video.evaluate(async (v: HTMLVideoElement) => {
          await v.play();
          await new Promise<void>((resolve) => {
            const pauseAfterFrame = () => {
              if (v.currentTime >= 0.1) {
                v.pause();
                resolve();
              } else v.requestVideoFrameCallback(pauseAfterFrame);
            };
            v.requestVideoFrameCallback(pauseAfterFrame);
          });
          return v.currentTime;
        });
        expect(before).toBeGreaterThanOrEqual(0.1);
        await page
          .getByRole("tab", { name: copy.studentPlayerWorkspace.notes })
          .click();
        expect(
          await video.evaluate((v: HTMLVideoElement) => v.currentTime),
        ).toBe(before);
        await expect(
          page.getByRole("button", {
            name: copy.studentWorkspace.coursePlayer.videoCompletion,
          }),
        ).toBeDisabled();
        await page.evaluate(() => scrollTo(0, 0));
      }
      await page.screenshot({
        path: info.outputPath(kind + ".png"),
        fullPage: true,
      });
      expect(fixture.writes).toEqual([]);
      expect(fixture.errors).toEqual([]);
    });
  }
  test(`${locale}: exact practice focus, note/question/file drafts and local keyboard navigation`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await prepare(page, locale, "dark");
    await page
      .getByRole("tab", { name: copy.studentPlayerWorkspace.notes })
      .click();
    const note = page.getByPlaceholder(
        copy.studentWorkspace.lessonWorkspace.notePlaceholder,
      ),
      question = page.getByPlaceholder(
        copy.studentWorkspace.lessonWorkspace.questionPlaceholder,
      );
    await note.fill("UNSAVED note مسودة");
    await question.fill("UNSENT question سؤال");
    await page
      .getByRole("tab", { name: copy.studentPlayerWorkspace.resources })
      .click();
    await page
      .getByRole("combobox", { name: copy.studentWorkspace.resources.filter })
      .selectOption("PDF");
    await page
      .getByRole("button", { name: copy.studentPlayerWorkspace.openPractice })
      .click();
    const target = page.locator("#player-practice-aim-aim-target");
    await expect(target).toBeFocused();
    await page.screenshot({ path: info.outputPath("practice-target.png") });
    await target
      .getByRole("button", { name: copy.learningPractice.common.continueDraft })
      .click();
    await target
      .getByRole("textbox", { name: copy.learningPractice.common.teacherNote })
      .fill("Unsubmitted practice comment");
    await target.locator("input[type=file]").setInputFiles({
      name: "draft.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic private draft"),
    });
    await page
      .getByRole("tab", { name: copy.studentPlayerWorkspace.gradebook })
      .click();
    await expect(
      page.getByRole("heading", {
        name: copy.studentWorkspace.gradebook.heading,
      }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("gradebook.png") });
    await page
      .getByRole("tab", { name: copy.studentPlayerWorkspace.notes })
      .click();
    await expect(note).toHaveValue("UNSAVED note مسودة");
    await expect(question).toHaveValue("UNSENT question سؤال");
    await page.screenshot({ path: info.outputPath("notes.png") });
    await page
      .getByRole("tab", { name: copy.studentPlayerWorkspace.practice })
      .click();
    await expect(target.getByRole("textbox")).toHaveValue(
      "Unsubmitted practice comment",
    );
    await expect(target.getByText("draft.txt")).toBeVisible();
    const tab = page.getByRole("tab", {
      name: copy.studentPlayerWorkspace.practice,
    });
    await tab.focus();
    await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    await expect(
      page.getByRole("tab", { name: copy.studentPlayerWorkspace.resources }),
    ).toBeFocused();
    await expect(
      page.getByRole("combobox", {
        name: copy.studentWorkspace.resources.filter,
      }),
    ).toHaveValue("PDF");
    await page.screenshot({ path: info.outputPath("resources.png") });
    expect(fixture.writes).toEqual([
      "POST /student/assignments/practice-target/submissions",
    ]);
    expect(fixture.errors).toEqual([]);
  });
  test(`${locale}: Final Unit target and 200 percent reflow`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const fixture = await prepare(page, locale, "light", "Text", "data", true);
    await page
      .getByRole("button", { name: copy.studentPlayerWorkspace.openPractice })
      .click();
    await expect(page.locator("#player-practice-unit-unit-one")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("unit-practice-reflow.png"),
    });
    expect(fixture.writes).toEqual([]);
  });
  test(`${locale}: Journey content action opens the existing outline without guessing a lesson`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      locale === "en"
        ? { width: 1440, height: 900 }
        : { width: 390, height: 844 },
    );
    const fixture = await prepare(page, locale, "light", "Text", "content");
    await expect(page.locator("#player-current-lesson")).toBeVisible();
    if (locale === "en")
      await page
        .getByRole("button", {
          name: copy.studentWorkspace.coursePlayer.hideContent,
          exact: true,
        })
        .click();
    await page
      .getByRole("button", { name: copy.studentPlayerWorkspace.viewContent })
      .click();
    const outline =
      locale === "en"
        ? page.locator("#player-course-content")
        : page.getByRole("dialog");
    await expect(outline.locator("a[aria-current]")).toBeFocused();
    await expect(page).toHaveURL(
      new RegExp(`lessonId=${workspaceLessonIds.Text}$`),
    );
    await page.screenshot({
      path: info.outputPath("journey-content-outline.png"),
    });
    expect(fixture.writes).toEqual([]);
  });
  for (const state of ["pending", "error", "empty"])
    test(`${locale} ${state}: factual player query state`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const fixture = await prepare(page, locale, "dark", "Text", state);
      if (state === "pending")
        await expect(
          page.locator("#main-content").getByRole("status"),
        ).toHaveText(copy.studentWorkspace.loading);
      else if (state === "error")
        await expect(
          page.locator("#main-content [role=alert]").first(),
        ).toBeVisible();
      else
        await expect(
          page.getByText(copy.studentWorkspace.coursePlayer.noPublishedLesson),
        ).toBeVisible();
      await page.screenshot({ path: info.outputPath(state + ".png") });
      expect(fixture.writes).toEqual([]);
    });
}
