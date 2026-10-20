import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  continuityCourses,
  continuityOverview,
  continuityCourseId,
  continuityLessonId,
  resumeLessonId,
} from "../fixtures/student-continuity";

// MOCKED UI-CONTRACT EVIDENCE: actual production Next pages, native links,
// React Query and CSS. Synthetic GET data does not prove backend integration.
type State = "data" | "pending" | "empty" | "error" | "cached";
async function ensureTheme(page: Page, locale: "en" | "ar", theme: string) {
  const copy = locale === "ar" ? ar : en;
  const toggle = page.getByRole("button", {
    name: copy.navigation.theme.toggle,
  });
  await expect(toggle).toBeVisible();
  // Existing inline theme bootstrap may be blocked by the production CSP.
  // Its default looks dark without data-theme; the first native toggle sets dark.
  if (!(await page.locator("html").getAttribute("data-theme"))) {
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
async function prepare(
  page: Page,
  locale: "en" | "ar",
  theme: string,
  state: State,
) {
  const requests: string[] = [],
    writes: string[] = [];
  let failRefresh = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
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
  if (state === "cached") await page.clock.install();
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    requests.push(request.url());
    if (request.method() !== "GET") writes.push(request.method() + " " + path);
    if (path === `/catalog/courses/${continuityCourseId}/cover`) {
      return route.fulfill({
        contentType: "image/svg+xml",
        body: readFileSync("tests/fixtures/continuity-cover.svg"),
      });
    }
    const courses = path === "/learning/my-courses",
      overview = path === "/student-tools/overview";
    if (courses || overview) {
      if (state === "pending") await pending;
      if (state === "error" || failRefresh)
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic unavailable response" },
        });
      let data;
      if (courses) {
        data = continuityCourses(locale);
        if (state === "empty") {
          data.items = [];
          data.totalCount = 0;
          data.summary = {
            totalCourses: 0,
            notStarted: 0,
            inProgress: 0,
            completed: 0,
            completedLessons: 0,
            totalLessons: 0,
            progressPercent: 0,
          };
        }
      } else {
        data = continuityOverview(locale);
        if (state === "empty") {
          data.upcomingAssignments = [];
          data.pendingActions = [];
        }
      }
      return route.fulfill({ json: data });
    }
    if (path === `/learning/courses/${continuityCourseId}/player`) {
      const requested = url.searchParams.get("lessonId");
      return route.fulfill({
        json: {
          id: continuityCourseId,
          title: continuityCourses(locale).items[0].localizedTitle,
          resumeLessonId,
          currentLessonId: requested || resumeLessonId,
          requestedLessonRejected: false,
          modules: [
            {
              id: "module",
              title: "Synthetic module",
              isLocked: false,
              lessons: [
                {
                  id: resumeLessonId,
                  title: "Distinct resume lesson",
                  type: "Text",
                  body: "Resume body",
                  isLocked: false,
                  isCompleted: true,
                  resources: [],
                  lastPositionSeconds: 0,
                  durationSeconds: 0,
                },
                {
                  id: continuityLessonId,
                  title:
                    locale === "ar"
                      ? "درس التكليف المطلوب"
                      : "Requested assignment lesson",
                  type: "Assignment",
                  body: "Assignment context",
                  isLocked: false,
                  isCompleted: false,
                  resources: [],
                  lastPositionSeconds: 0,
                  durationSeconds: 0,
                },
              ],
            },
          ],
        },
      });
    }
    if (
      path === `/student/courses/${continuityCourseId}/assignments` ||
      path === "/student/assignments/mine"
    )
      return route.fulfill({ json: [] });
    return route.fulfill(roleShellRuntimeResponse(path, locale, ["Student"]));
  });
  return {
    requests,
    writes,
    release,
    async refreshWithFailure() {
      failRefresh = true;
      await page.clock.fastForward(31_001);
      await page.evaluate(() =>
        window.dispatchEvent(new Event("visibilitychange")),
      );
      // Existing retry:1 is retained; let its retry timer run normally in fake time.
      await expect
        .poll(
          () =>
            requests.filter((r) =>
              /learning\/my-courses|student-tools\/overview/.test(r),
            ).length,
        )
        .toBeGreaterThan(1);
      await page.clock.runFor(1500);
    },
  };
}

for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  const title = continuityCourses(locale).items[0].localizedTitle;
  for (const theme of ["light", "dark"]) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      for (const surface of ["dashboard", "courses"] as const) {
        test(`${locale} ${theme} ${viewport.width} ${surface}: continuation, covers, server order and reduced-motion focus`, async ({
          page,
        }, info) => {
          const fixture = await prepare(page, locale, theme, "data");
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.goto(`/${locale}/student/${surface}`);
          await ensureTheme(page, locale, theme);
          const main = page.locator("#main-content");
          await expect(
            main.getByRole("heading", { name: title, exact: true }),
          ).toBeVisible();
          const link = main.getByRole("link", {
            name: copy.studentCoursesLearningHub.courseActionLabel
              .replace(
                "{action}",
                copy.studentCoursesLearningHub.actions.InProgress,
              )
              .replace("{title}", title),
            exact: true,
          });
          await expect(link).toHaveAttribute(
            "href",
            `/${locale}/student/learn/${continuityCourseId}`,
          );
          await expect(main.locator("section[dir]").first()).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
          if (surface === "dashboard") {
            const current = main.getByRole("region", {
              name: copy.studentWorkspace.dashboard.continueLearning,
            });
            await expect(current.getByRole("progressbar")).toHaveCount(0);
            await expect(current.locator("img")).toHaveCount(0);
            const attention = main.getByRole("region", {
              name: copy.studentWorkspace.dashboard.pendingActions.heading,
            });
            await expect(attention.locator("a")).toHaveCount(4);
            expect(
              await attention
                .locator("a")
                .evaluateAll((links) =>
                  links.map((a) => a.getAttribute("href")),
                ),
            ).toEqual([
              `/${locale}/student/evaluations/resit-draft`,
              `/${locale}/student/evaluations`,
              `/${locale}/student/evaluations/new?resume=draft`,
              `/${locale}/student/evaluations`,
            ]);
            if (viewport.width === 390) {
              expect(
                (await link.boundingBox())!.y +
                  (await link.boundingBox())!.height,
              ).toBeLessThan(viewport.height - 64);
              expect((await attention.boundingBox())!.y).toBeLessThan(
                viewport.height - 64,
              );
            }
            expect(
              fixture.requests.filter((r) =>
                /learning\/my-courses|student-tools\/overview/.test(r),
              ),
            ).toHaveLength(2);
          } else {
            const cover = main.getByRole("img");
            await expect(cover).toBeVisible();
            expect(
              await cover.evaluate(
                (img) => (img as HTMLImageElement).naturalWidth,
              ),
            ).toBeGreaterThan(0);
            await expect(main.getByTestId("course-cover-fallback")).toHaveCount(
              2,
            );
            expect(await main.locator("h2,h3").allTextContents()).toEqual(
              expect.arrayContaining(
                continuityCourses(locale).items.map((c) => c.localizedTitle),
              ),
            );
            await expect(main.locator('a[href*="locked-course"]')).toHaveCount(
              0,
            );
            const animation = await main
              .getByRole("progressbar")
              .first()
              .evaluate((e) => getComputedStyle(e).animationName);
            expect(animation).toBe("none");
            if (viewport.width === 390)
              expect((await cover.boundingBox())!.height).toBe(72);
          }
          // Reach the continuation action using keyboard navigation; no pointer focus.
          for (let i = 0; i < 45; i++) {
            if (await link.evaluate((e) => e === document.activeElement)) break;
            await page.keyboard.press("Tab");
          }
          await expect(link).toBeFocused();
          const outline = await link.evaluate((e) => {
            const s = getComputedStyle(e);
            return { style: s.outlineStyle, width: s.outlineWidth };
          });
          expect(outline.style).not.toBe("none");
          expect(parseFloat(outline.width)).toBeGreaterThan(0);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath("data-focus.png"),
            fullPage: true,
          });
          expect(fixture.writes).toEqual([]);
        });
      }
    }
    for (const state of ["pending", "empty", "error", "cached"] as const) {
      for (const surface of ["dashboard", "courses"] as const) {
        test(`${locale} ${theme} mobile ${surface} ${state}: factual query state`, async ({
          page,
        }, info) => {
          const fixture = await prepare(page, locale, theme, state);
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(`/${locale}/student/${surface}`);
          await ensureTheme(page, locale, theme);
          const main = page.locator("#main-content");
          if (state === "cached") {
            await expect(
              main.getByRole("heading", { name: title, exact: true }),
            ).toBeVisible();
            await fixture.refreshWithFailure();
            await expect(main.getByRole("alert").first()).toContainText(
              copy.studentWorkspace.dashboard.courseRefreshError,
            );
            await expect(
              main.getByRole("heading", { name: title, exact: true }),
            ).toBeVisible();
            await expect(
              main.locator(
                `a[href="/${locale}/student/learn/${continuityCourseId}"]`,
              ),
            ).toHaveCount(1);
            if (surface === "dashboard")
              await expect(
                main.locator(`a[href*="?lessonId=${continuityLessonId}"]`),
              ).toHaveCount(1);
          } else if (state === "pending") {
            await expect(main.getByRole("status").first()).toHaveAttribute(
              "aria-busy",
              "true",
            );
            await expect(
              main.locator('a[href*="/student/learn/"]'),
            ).toHaveCount(0);
          } else if (state === "error") {
            await expect(main.getByRole("alert").first()).toBeVisible();
            await expect(
              main.locator('a[href*="/student/learn/"]'),
            ).toHaveCount(0);
            await expect(
              main.getByText(copy.studentCoursesLearningHub.empty.noCourses),
            ).toHaveCount(0);
          } else {
            await expect(
              main.getByText(copy.studentCoursesLearningHub.empty.noCourses),
            ).toBeVisible();
            await expect(main.getByRole("alert")).toHaveCount(0);
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(state + ".png"),
            fullPage: true,
          });
          fixture.release();
          expect(fixture.writes).toEqual([]);
        });
      }
    }
  }
  test(`${locale}: deadline opens a distinct Assignment lesson instead of the resume lesson`, async ({
    page,
  }, info) => {
    const fixture = await prepare(page, locale, "light", "data");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/student/dashboard`);
    await ensureTheme(page, locale, "light");
    const deadline = page.locator("#main-content").getByRole("link", {
      name: new RegExp(continuityOverview(locale).upcomingAssignments[0].title),
    });
    await expect(deadline).toHaveAttribute(
      "href",
      `/${locale}/student/learn/${continuityCourseId}?lessonId=${continuityLessonId}`,
    );
    await deadline.click();
    await expect(page).toHaveURL(new RegExp(`lessonId=${continuityLessonId}$`));
    const main = page.locator("#main-content");
    await expect(
      main.getByRole("heading", {
        name:
          locale === "ar"
            ? "درس التكليف المطلوب"
            : "Requested assignment lesson",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      main.getByRole("heading", {
        name: "Distinct resume lesson",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      fixture.requests.some((r) =>
        r.includes(`/player?locale=${locale}&lessonId=${continuityLessonId}`),
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("assignment-lesson.png"),
      fullPage: true,
    });
    expect(fixture.writes).toEqual([]);
  });
}
