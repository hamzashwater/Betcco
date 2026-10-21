import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  workloadCourses,
  workloadStudents,
  workloadAnalytics,
  workloadAssignments,
} from "../fixtures/teacher-workload";
// MOCKED UI-CONTRACT EVIDENCE: actual production app; synthetic intercepted API.
test.afterEach(async ({}, info) => {
  const path = info.outputPath("scenario.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
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
type RouteName = "dashboard" | "courses" | "students" | "evaluations";
async function prepare(
  page: Page,
  locale: "en" | "ar",
  theme: string,
  routeName: RouteName,
  initial = "data",
) {
  const state = { mode: initial };
  const reads: string[] = [];
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
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace(/^\/api\/v1/, "");
    if (req.method() !== "GET") {
      writes.push(p);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic write" },
      });
    }
    reads.push(url.pathname + url.search);
    if (
      [
        "/teacher/courses",
        "/teacher/analytics",
        "/evaluations/assigned",
      ].includes(p)
    ) {
      if (state.mode === "pending") return new Promise(() => {});
      if (state.mode === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic refresh failure" },
        });
      const empty = state.mode === "empty";
      if (p === "/teacher/courses")
        return route.fulfill({ json: empty ? [] : workloadCourses });
      if (p === "/evaluations/assigned")
        return route.fulfill({ json: empty ? [] : workloadAssignments });
      if (url.searchParams.get("followUp") === "true") {
        const q = url.searchParams,
          term = q.get("search")?.toLocaleLowerCase(),
          attention = q.get("attention"),
          reason = q.get("reason");
        let students = empty
          ? []
          : workloadStudents.filter(
              (s) =>
                (!term || s.studentName.toLocaleLowerCase().includes(term)) &&
                (!attention || s.riskLevel === attention) &&
                (!reason || s.reasons.includes(reason)),
            );
        if (q.get("sort") === "progress")
          students = [...students].sort(
            (a, b) => a.progressPercent - b.progressPercent,
          );
        const pageNo = Number(q.get("page") ?? 1);
        return route.fulfill({
          json: {
            ...workloadAnalytics,
            studentsAtRisk: students.slice((pageNo - 1) * 10, pageNo * 10),
            studentsAtRiskCount: empty ? 0 : 13,
            filteredStudentsAtRiskCount: students.length,
            page: pageNo,
            pageSize: 10,
          },
        });
      }
      return route.fulfill({
        json: empty
          ? {
              ...workloadAnalytics,
              students: 0,
              pendingReviews: 0,
              averageLessonProgress: 0,
              studentsAtRisk: [],
              studentsAtRiskCount: 0,
            }
          : workloadAnalytics,
      });
    }
    return route.fulfill(roleShellRuntimeResponse(p, locale, ["Teacher"]));
  });
  await page.goto(`/${locale}/teacher/${routeName}`);
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
  return { state, reads, writes, errors, copy };
}
async function ready(page: Page, locale: "en" | "ar", route: RouteName) {
  const m = locale === "ar" ? ar : en;
  if (route === "evaluations")
    await expect(
      page
        .getByRole("region", {
          name: m.teacherWorkloadPresentation.assignedList,
        })
        .getByRole("link"),
    ).toHaveCount(55);
  else if (route === "students")
    await expect(
      page
        .getByRole("list", { name: m.teacherStudentFollowUp.studentListLabel })
        .locator(":scope > li"),
    ).toHaveCount(10);
  else
    await expect(
      page.getByRole("heading", {
        name:
          locale === "ar"
            ? workloadCourses[0].arabicTitle
            : workloadCourses[0].englishTitle,
        exact: true,
      }),
    ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      for (const route of [
        "dashboard",
        "courses",
        "students",
        "evaluations",
      ] as const)
        test(`${locale} ${theme} ${viewport.width} ${route} populated`, async ({
          page,
        }, info) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: "reduce" });
          const c = await prepare(page, locale, theme, route);
          await ready(page, locale, route);
          await noOverflow(page);
          if (route === "dashboard") {
            await expect(
              page
                .getByRole("main")
                .locator(`a[href="/${locale}/teacher/courses/new"]`),
            ).toHaveCount(1);
            const boxes = await Promise.all(
              [
                c.copy.teacherWorkloadPresentation.workload,
                c.copy.teacherCoursesManagement.title,
                c.copy.teacherWorkloadPresentation.context,
              ].map((name) =>
                page.getByRole("heading", { name, exact: true }).boundingBox(),
              ),
            );
            expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
            expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
            expect(
              c.reads.some((p) => p.includes("/evaluations/assigned")),
            ).toBe(false);
          }
          if (route !== "courses")
            expect(
              await page
                .getByRole("heading", { level: 1 })
                .evaluate((e) => getComputedStyle(e).fontWeight),
            ).toBe("700");
          await page.screenshot({ path: info.outputPath("viewport.png") });
          if (route === "dashboard") {
            const contextHeading = page.getByRole("heading", {
              name: c.copy.teacherWorkloadPresentation.context,
              exact: true,
            });
            const metrics = contextHeading.locator("..").getByRole("article");
            await expect(metrics).toHaveCount(7);
            for (const metric of await metrics.all())
              expect(
                await metric
                  .locator("p")
                  .nth(1)
                  .evaluate((e) => getComputedStyle(e).fontWeight),
              ).toBe("700");
            await contextHeading.scrollIntoViewIfNeeded();
            await page.screenshot({ path: info.outputPath("context.png") });
          }
          if (route === "evaluations") {
            const queue = page.getByRole("region", {
              name: c.copy.teacherWorkloadPresentation.assignedList,
            });
            expect(
              await queue
                .getByRole("link")
                .evaluateAll((a) => a.map((e) => e.getAttribute("href"))),
            ).toEqual(
              workloadAssignments.map(
                (a) => `/${locale}/teacher/evaluations/${a.id}`,
              ),
            );
            await queue.getByRole("link").last().scrollIntoViewIfNeeded();
            await page.screenshot({ path: info.outputPath("queue-end.png") });
          }
          expect(c.writes).toEqual([]);
          expect(c.errors).toEqual([]);
        });
  for (const route of [
    "dashboard",
    "courses",
    "students",
    "evaluations",
  ] as const)
    for (const mode of ["pending", "error", "empty"])
      test(`${locale} ${route} ${mode}: factual state`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const c = await prepare(page, locale, "dark", route, mode),
          main = page.getByRole("main");
        if (mode === "pending")
          await expect(
            main.locator('[aria-busy="true"]').first(),
          ).toBeVisible();
        else if (mode === "error")
          await expect(main.getByRole("alert").first()).toBeVisible();
        else
          await expect(
            main.getByText(
              route === "evaluations"
                ? c.copy.teacherWorkspace.evaluations.empty
                : route === "students"
                  ? c.copy.teacherStudentFollowUp.empty.noFollowUp
                  : c.copy.teacherCoursesManagement.empty.noCourses,
              { exact: true },
            ),
          ).toBeVisible();
        if (mode !== "empty") {
          await expect(
            main.getByText(c.copy.teacherWorkspace.evaluations.empty, {
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            main.getByText(c.copy.teacherStudentFollowUp.empty.noFollowUp, {
              exact: true,
            }),
          ).toHaveCount(0);
        }
        await noOverflow(page);
        await page.screenshot({ path: info.outputPath("state.png") });
        expect(c.writes).toEqual([]);
        expect(c.errors).toEqual([]);
      });
  for (const route of [
    "dashboard",
    "courses",
    "students",
    "evaluations",
  ] as const)
    test(`${locale} ${route} cache refresh failure retains usable context`, async ({
      page,
    }, info) => {
      await page.clock.install();
      await page.setViewportSize({ width: 390, height: 844 });
      const c = await prepare(page, locale, "dark", route);
      await ready(page, locale, route);
      let field;
      if (route === "courses") {
        field = page.getByLabel(c.copy.teacherCoursesManagement.searchLabel);
        await field.fill("Zeta");
      }
      if (route === "evaluations") {
        field = page.getByLabel(c.copy.teacherWorkloadPresentation.queueSearch);
        await field.fill("request-54");
      }
      const before = await page
        .getByRole("main")
        .getByRole("link")
        .evaluateAll((a) => a.map((e) => e.getAttribute("href")));
      c.state.mode = "error";
      await page.clock.fastForward(31_000);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
        window.dispatchEvent(new Event("online"));
      });
      await expect(
        page.getByRole("main").getByRole("alert").first(),
      ).toBeVisible({ timeout: 15000 });
      expect(
        await page
          .getByRole("main")
          .getByRole("link")
          .evaluateAll((a) => a.map((e) => e.getAttribute("href"))),
      ).toEqual(before);
      if (field)
        await expect(field).toHaveValue(
          route === "courses" ? "Zeta" : "request-54",
        );
      await page
        .getByRole("main")
        .getByRole("alert")
        .first()
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("cached-error.png") });
      if (field) {
        await field.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath("retained-filter.png") });
      }
      expect(c.writes).toEqual([]);
      expect(c.errors).toEqual([]);
    });
  test(`${locale} controls: course local filters, formal local filter, follow-up server paging`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    const c = await prepare(page, locale, "light", "courses"),
      m = c.copy;
    await ready(page, locale, "courses");
    const before = c.reads.filter((p) => p.includes("/teacher/courses")).length;
    await page
      .getByLabel(m.teacherCoursesManagement.sortLabel)
      .selectOption("content");
    await page
      .getByRole("button", {
        name: m.teacherCoursesManagement.filters.Draft,
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("list", { name: m.teacherCoursesManagement.courseListLabel })
        .getByRole("link"),
    ).toHaveCount(1);
    await page
      .getByLabel(m.teacherCoursesManagement.searchLabel)
      .fill("absent");
    await expect(
      page.getByText(m.teacherCoursesManagement.empty.noSearchResults),
    ).toBeVisible();
    expect(c.reads.filter((p) => p.includes("/teacher/courses")).length).toBe(
      before,
    );
    await page.screenshot({ path: info.outputPath("course-local-filter.png") });
    await page.goto(`/${locale}/teacher/evaluations`);
    await ready(page, locale, "evaluations");
    await page
      .getByLabel(m.teacherWorkloadPresentation.queueStatus)
      .selectOption("UnknownServerState");
    const queue = page.getByRole("region", {
      name: m.teacherWorkloadPresentation.assignedList,
    });
    await expect(queue.getByRole("link")).toHaveCount(1);
    await expect(queue.getByRole("link")).toHaveAttribute(
      "href",
      `/${locale}/teacher/evaluations/request-55`,
    );
    expect(
      c.reads.filter((p) => p.includes("/evaluations/assigned")),
    ).toHaveLength(1);
    await page.screenshot({ path: info.outputPath("formal-local-filter.png") });
    await page.goto(`/${locale}/teacher/students`);
    await ready(page, locale, "students");
    await page
      .getByRole("button", { name: m.teacherStudentFollowUp.next, exact: true })
      .click();
    await expect(
      page
        .getByRole("list", { name: m.teacherStudentFollowUp.studentListLabel })
        .locator(":scope > li"),
    ).toHaveCount(3);
    expect(
      c.reads.some((p) =>
        p.includes("followUp=true&page=2&pageSize=10&sort=priority"),
      ),
    ).toBe(true);
    await page
      .getByLabel(m.teacherStudentFollowUp.searchLabel)
      .fill("student 1");
    await expect
      .poll(() =>
        c.reads.some(
          (p) => p.includes("page=1") && p.includes("search=student+1"),
        ),
      )
      .toBe(true);
    await page
      .getByLabel(m.teacherStudentFollowUp.reasonFilterLabel)
      .selectOption("AwaitingPracticeReview");
    await expect
      .poll(() =>
        c.reads.some((p) => p.includes("reason=AwaitingPracticeReview")),
      )
      .toBe(true);
    await page
      .getByLabel(m.teacherStudentFollowUp.sortLabel)
      .selectOption("progress");
    await expect
      .poll(() => c.reads.some((p) => p.includes("sort=progress")))
      .toBe(true);
    await page
      .getByRole("button", {
        name: m.teacherStudentFollowUp.filters.High,
        exact: true,
      })
      .click();
    await expect
      .poll(() => c.reads.some((p) => p.includes("attention=High")))
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("server-follow-up-filter.png"),
    });
    expect(c.writes).toEqual([]);
    expect(c.errors).toEqual([]);
  });
  test(`${locale} keyboard focus, reduced motion and 200 percent reflow proxy`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const c = await prepare(page, locale, "light", "evaluations");
    await ready(page, locale, "evaluations");
    const search = page.getByLabel(
      c.copy.teacherWorkloadPresentation.queueSearch,
    );
    await search.focus();
    await page.keyboard.press("Tab");
    const status = page.getByLabel(
      c.copy.teacherWorkloadPresentation.queueStatus,
    );
    await expect(status).toBeFocused();
    expect(
      await status.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Tab");
    const firstRow = page
      .getByRole("region", {
        name: c.copy.teacherWorkloadPresentation.assignedList,
      })
      .getByRole("link")
      .first();
    await expect(firstRow).toBeFocused();
    expect(
      await firstRow.evaluate((e) => getComputedStyle(e).outlineOffset),
    ).toBe("-3px");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("keyboard-reflow.png") });
    await page.goto(`/${locale}/teacher/students`);
    await ready(page, locale, "students");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("follow-up-reflow.png") });
    expect(c.errors).toEqual([]);
  });
}
