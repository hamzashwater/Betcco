import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { studioFixture } from "../fixtures/content-studio-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
type Mode = "data" | "pending" | "error" | "empty";
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const fixture = studioFixture(),
    modes: Record<string, Mode> = {},
    gates = new Map<string, () => void>(),
    writes: { path: string; method: string; body: Record<string, unknown> }[] =
      [],
    reads: string[] = [],
    errors: string[] = [];
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
  const responses: Record<string, unknown> = {
    "/admin/content/teachers": fixture.teachers,
    "/admin/content/courses": fixture.courses,
    "/admin/content/blog": fixture.blog,
    "/admin/content/packages": fixture.packages,
    "/admin/content/live-sessions": fixture.sessions,
    "/admin/content/live-session-providers": fixture.providers,
    "/admin/users?role=Student&pageSize=100": fixture.students,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\/v1/, ""),
      key = path + url.search;
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    if (request.method() === "GET") {
      if (Object.hasOwn(responses, key) || path.endsWith("/attendance")) {
        reads.push(key);
        const mode = modes[key] ?? "data";
        if (mode === "pending")
          await new Promise<void>((r) => gates.set(key, r));
        if (mode === "error")
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic load failure" },
          });
        return route.fulfill({
          json:
            mode === "empty"
              ? path === "/admin/users"
                ? { items: [] }
                : []
              : path.endsWith("/attendance")
                ? fixture.attendance
                : responses[key],
        });
      }
      return route.fulfill(
        roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
      );
    }
    expect(["POST", "PUT"]).toContain(request.method());
    expect(path).toMatch(
      /^\/admin\/content\/(blog|packages(?:\/package-a)?|teachers\/teacher-[ab]\/profile|live-sessions(?:\/session-[ab]\/attendance)?)$/,
    );
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ path, method: request.method(), body });
    if (modes.write === "pending")
      await new Promise<void>((r) => gates.set("write", r));
    if (modes.write === "error")
      return route.fulfill({
        status: 409,
        json: { message: "Synthetic operation failure" },
      });
    if (path.endsWith("/attendance")) {
      expect(Object.keys(body).sort()).toEqual(["status", "studentUserId"]);
      expect(["Present", "Late", "Absent", "Excused"]).toContain(body.status);
      const row = fixture.attendance.find(
        (x) => x.studentUserId === body.studentUserId,
      );
      if (row) row.status = body.status as typeof row.status;
    }
    return route.fulfill({ status: 200, json: {} });
  });
  return { fixture, modes, gates, writes, reads, errors };
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const [width, height] of [
      [1440, 900],
      [834, 1112],
      [390, 844],
    ]) {
      test(`Content Studio ${locale} ${theme} ${width}×${height} MOCKED UI-CONTRACT EVIDENCE`, async ({
        page,
      }, info) => {
        test.setTimeout(180000);
        await page.setViewportSize({ width, height });
        const t = (locale === "en" ? en : ar).adminContent,
          ctx = await prepare(page, locale, theme);
        const captures: {
          name: string;
          file: string;
          width: number;
          height: number;
        }[] = [];
        let count = 0;
        const capture = async (name: string) => {
          const toggle = page
            .getByRole("button", {
              name: (locale === "ar" ? ar : en).navigation.theme.toggle,
              exact: true,
            })
            .first();
          if (!(await page.locator("html").getAttribute("data-theme")))
            await toggle.click();
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await toggle.click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => scrollTo(0, 0));
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            )
            .toBe(true);
          const file = String(++count).padStart(2, "0") + "-" + name + ".png";
          await page.screenshot({
            path: info.outputPath(file),
            fullPage: true,
          });
          captures.push({
            name,
            file,
            width: page.viewportSize()!.width,
            height: page.viewportSize()!.height,
          });
        };
        const nav = (label: string) =>
          page
            .getByRole("navigation", { name: t.workspaceNavigation })
            .getByRole("button", { name: label, exact: true });
        const form = (label: string) =>
          page.getByRole("form", { name: label, exact: true });
        await page.goto(`/${locale}/admin/content`);
        await expect(
          page.getByRole("heading", { name: t.title, exact: true }),
        ).toBeVisible();
        await expect(form(t.article).getByLabel(t.slug)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(
          page.getByText(
            locale === "ar"
              ? ctx.fixture.blog[0].arabicTitle
              : ctx.fixture.blog[0].englishTitle,
            { exact: true },
          ),
        ).toBeVisible();
        await capture("articles-blank-existing");
        const articleValues = {
          slug: "synthetic-article",
          arabicTitle: "عنوان عربي للاختبار",
          englishTitle: "Synthetic article title",
          arabicExcerpt: "ملخص المقال",
          englishExcerpt: "Article excerpt",
          arabicBody: "نص عربي طويل لاختبار التحرير والالتفاف. ".repeat(15),
          englishBody:
            "Long synthetic English article body for editing and wrapping. ".repeat(
              15,
            ),
        };
        for (const [key, value] of Object.entries(articleValues))
          await form(t.article)
            .getByLabel(t[key as keyof typeof t], { exact: true })
            .fill(value);
        await form(t.article).getByLabel(t.publish).check();
        await capture("articles-bilingual-published-draft");
        await nav(t.teachersNav).click();
        await expect(
          form(t.teacher).getByRole("button", { name: t.save, exact: true }),
        ).toBeDisabled();
        await capture("profile-no-selection");
        await form(t.teacher)
          .getByRole("combobox", { name: t.chooseTeacher, exact: true })
          .selectOption("teacher-a");
        await expect(
          form(t.teacher)
            .getByRole("combobox", { name: t.chooseTeacher, exact: true })
            .locator("option[value='frozen']"),
        ).toHaveCount(0);
        await form(t.teacher)
          .getByLabel(t.englishBio)
          .fill("A long synthetic teacher bio. ".repeat(12));
        await form(t.teacher).getByLabel(t.showProfile).uncheck();
        await capture("profile-selected-private-bilingual");
        await nav(t.articlesNav).click();
        await expect(form(t.article).getByLabel(t.englishBody)).toHaveValue(
          articleValues.englishBody,
        );
        for (const [label, success] of [
          [t.articlesNav, t.articleSaved],
          [t.teachersNav, t.profileSaved],
          [t.packagesNav, t.packageSaved],
          [t.sessionsNav, t.sessionSaved],
        ]) {
          await nav(label).click();
          const name =
            label === t.articlesNav
              ? t.article
              : label === t.teachersNav
                ? t.teacher
                : label;
          const f = form(name);
          if (label === t.packagesNav) {
            await f
              .getByRole("combobox", { name: t.managePackage, exact: true })
              .selectOption("package-a");
            await f.getByLabel(t.price).fill("19.987");
            await f.getByRole("checkbox", { name: /Second course/ }).check();
            await capture("package-edit-price-dates-courses");
          }
          if (label === t.sessionsNav) {
            await f
              .getByRole("combobox", { name: t.host, exact: true })
              .selectOption("teacher-a");
            await f.getByLabel(t.arabicTitle).fill("جلسة اختبار");
            await f
              .getByRole("textbox", { name: t.englishTitle, exact: true })
              .fill("Synthetic session");
            await f
              .getByLabel(t.starts, { exact: true })
              .fill("2026-10-29T12:00");
            await f
              .getByLabel(t.ends, { exact: true })
              .fill("2026-10-29T13:00");
            await f
              .getByLabel(t.joinUrl, { exact: true })
              .fill("https://example.test/join");
            await f
              .getByLabel(t.recordingUrl, { exact: true })
              .fill("https://example.test/recording");
            await f.getByLabel(t.capacity).fill("30");
            await capture("session-manual-general-host-schedule");
            await f
              .getByRole("combobox", { name: t.courseOptional, exact: true })
              .selectOption("course-a");
            await f
              .getByRole("combobox", { name: t.provider, exact: true })
              .selectOption("Zoom");
            await f.getByLabel(t.publish).check();
            await capture("session-course-provider-published");
          }
          ctx.modes.write = "error";
          const save = f.getByRole("button", {
            name: label === t.packagesNav ? t.update : t.save,
            exact: true,
          });
          await save.click();
          await expect(f.getByRole("status")).toHaveText(
            "Synthetic operation failure",
          );
          await capture(label + "-failure-draft-retained");
          ctx.modes.write = "pending";
          await save.click();
          await expect(
            f.getByRole("button", { name: t.saving, exact: true }),
          ).toBeDisabled();
          await capture(label + "-pending");
          await expect.poll(() => ctx.gates.has("write")).toBe(true);
          ctx.modes.write = "data";
          ctx.gates.get("write")!();
          ctx.gates.delete("write");
          await expect(f.getByRole("status")).toHaveText(success);
          await capture(label + "-success");
        }
        await nav(t.attendance).click();
        await capture("attendance-no-selection");
        await page
          .getByRole("combobox", { name: t.attendanceSession, exact: true })
          .selectOption("session-a");
        await expect(
          page.getByText("Synthetic learner 0", { exact: true }),
        ).toBeVisible();
        await capture("attendance-four-statuses");
        const row = page.getByLabel(
          t.attendanceStatus + " · Synthetic learner 0",
          { exact: true },
        );
        await row.selectOption("Excused");
        const update = row
          .locator("..")
          .getByRole("button", { name: t.updateAttendance, exact: true });
        await expect(update).toBeEnabled();
        await capture("attendance-row-correction");
        ctx.modes.write = "error";
        await update.click();
        await expect(
          page.locator('section[id^="content-"]:visible').getByRole("status"),
        ).toHaveText("Synthetic operation failure");
        await capture("attendance-error");
        ctx.modes.write = "pending";
        await update.click();
        await expect(update).toBeDisabled();
        await capture("attendance-pending");
        await expect.poll(() => ctx.gates.has("write")).toBe(true);
        ctx.modes.write = "data";
        ctx.gates.get("write")!();
        ctx.gates.delete("write");
        await expect(
          page.locator('section[id^="content-"]:visible').getByRole("status"),
        ).toHaveText(t.attendanceSaved);
        await expect(
          page.getByLabel(t.attendanceStatus + " · Synthetic learner 0", {
            exact: true,
          }),
        ).toHaveValue("Excused");
        await expect(
          page
            .getByRole("button", { name: t.updateAttendance, exact: true })
            .first(),
        ).toBeDisabled();
        await capture("attendance-success-server-synchronized");
        await page
          .getByRole("combobox", { name: t.attendanceStudent, exact: true })
          .selectOption("student-a");
        await page
          .getByRole("combobox", { name: t.attendanceStatus, exact: true })
          .selectOption("Late");
        await page
          .getByRole("button", { name: t.markAttendance, exact: true })
          .click();
        await expect(
          page.getByRole("combobox", {
            name: t.attendanceStudent,
            exact: true,
          }),
        ).toHaveValue("");
        expect(ctx.writes.at(-1)?.body).toEqual({
          studentUserId: "student-a",
          status: "Late",
        });
        await capture("attendance-marked");
        await nav(t.packagesNav).click();
        await form(t.packagesNav)
          .getByRole("combobox", { name: t.managePackage, exact: true })
          .selectOption("package-a");
        await form(t.packagesNav)
          .getByRole("combobox", { name: t.managePackage, exact: true })
          .selectOption("");
        await expect(form(t.packagesNav).getByLabel(t.slug)).toHaveValue("");
        await capture("package-new-explicit-reset");
        // Native button keyboard navigation: focused control, activation, preserved draft.
        await nav(t.articlesNav).focus();
        await page.keyboard.press("Tab");
        await expect(nav(t.teachersNav)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(form(t.teacher)).toBeVisible();
        await capture("keyboard-section-focus");
        await page.setViewportSize({ width: 720, height: height });
        await capture("reflow-200-percent-equivalent");
        await page.setViewportSize({ width, height });
        // Cached refresh uses the existing stale lifetime and installed focus listener.
        await nav(t.articlesNav).click();
        ctx.modes["/admin/content/blog"] = "error";
        await page.clock.install();
        await page.clock.fastForward(31000);
        await page.evaluate(() =>
          window.dispatchEvent(new Event("visibilitychange")),
        );
        await expect(
          page.locator('section[id^="content-"]:visible').getByRole("alert"),
        ).toContainText(t.refreshFailed);
        await expect(
          page.getByText(
            locale === "ar"
              ? ctx.fixture.blog[0].arabicTitle
              : ctx.fixture.blog[0].englishTitle,
            { exact: true },
          ),
        ).toBeVisible();
        await capture("articles-cached-refresh-failure");
        await page.clock.resume();
        // Fresh query-cache states are deliberately separate from draft navigation.
        for (const [name, path, mode, section] of [
          [
            "articles-cold-error",
            "/admin/content/blog",
            "error",
            t.articlesNav,
          ],
          [
            "providers-cold-error",
            "/admin/content/live-session-providers",
            "error",
            t.sessionsNav,
          ],
          [
            "packages-no-courses",
            "/admin/content/courses",
            "empty",
            t.packagesNav,
          ],
          [
            "attendance-empty",
            "/admin/content/live-sessions/session-a/attendance",
            "empty",
            t.attendance,
          ],
        ] as const) {
          for (const key of Object.keys(ctx.modes)) delete ctx.modes[key];
          ctx.modes[path] = mode;
          await page.reload();
          await nav(section).click();
          if (section === t.attendance)
            await page
              .getByRole("combobox", { name: t.attendanceSession, exact: true })
              .selectOption("session-a");
          await expect(
            page.getByRole("heading", { name: t.title, exact: true }),
          ).toBeVisible();
          await expect(
            page
              .locator('section[id^="content-"]:visible')
              .getByText(
                mode === "error"
                  ? t.loadFailed
                  : path.includes("courses")
                    ? t.noCourses
                    : t.attendanceEmpty,
                { exact: true },
              ),
          ).toBeVisible();
          await capture(name);
        }
        for (const key of Object.keys(ctx.modes)) delete ctx.modes[key];
        ctx.modes["/admin/content/live-session-providers"] = "pending";
        await page.reload();
        await nav(t.sessionsNav).click();
        await expect(
          form(t.sessionsNav).getByRole("combobox", {
            name: t.provider,
            exact: true,
          }),
        ).toBeDisabled();
        await capture("providers-loading");
        await expect
          .poll(() => ctx.gates.has("/admin/content/live-session-providers"))
          .toBe(true);
        ctx.gates.get("/admin/content/live-session-providers")!();
        await expect(
          form(t.sessionsNav).getByRole("combobox", {
            name: t.provider,
            exact: true,
          }),
        ).toBeEnabled();
        expect(ctx.reads).toContain("/admin/users?role=Student&pageSize=100");
        expect(ctx.errors).toEqual([]);
        mkdirSync(info.outputDir, { recursive: true });
        writeFileSync(
          info.outputPath("scenario.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              locale,
              theme,
              width,
              height,
              captures,
              reads: ctx.reads,
              writes: ctx.writes,
              errors: ctx.errors,
            },
            null,
            2,
          ),
        );
      });
    }

// Supplemental cases complete the original many-course/public-profile/long-name
// evidence requirements without changing the shared fixture or production owner.
for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"]) {
    test(`Content Studio stress ${locale} ${theme} MOCKED UI-CONTRACT EVIDENCE`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width: 390, height: 844 });
      const t = (locale === "en" ? en : ar).adminContent;
      const ctx = await prepare(page, locale, theme);
      const teacherName =
        "Synthetic long teacher name — اسم معلم افتراضي طويل لاختبار الالتفاف والظهور العام";
      const studentName =
        "Synthetic long student name — اسم طالب افتراضي طويل لاختبار التفاف سجل الحضور";
      ctx.fixture.teachers[0].displayName = teacherName;
      ctx.fixture.students.items[0].displayName = studentName;
      ctx.fixture.attendance[0].studentName = studentName;
      for (let i = 1; i <= 12; i++)
        ctx.fixture.courses.push({
          id: `course-stress-${i}`,
          arabicTitle: `دورة افتراضية طويلة لاختبار تكوين الباقات ${i}`,
          englishTitle: `Synthetic long English course ${i}`,
          price: 12.345,
          currency: "JOD",
        });
      const captures: {
        name: string;
        file: string;
        width: number;
        height: number;
      }[] = [];
      const capture = async (name: string) => {
        const toggle = page
          .getByRole("button", {
            name: (locale === "en" ? en : ar).navigation.theme.toggle,
            exact: true,
          })
          .first();
        if (!(await page.locator("html").getAttribute("data-theme")))
          await toggle.click();
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await toggle.click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => scrollTo(0, 0));
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        const file = `${String(captures.length + 1).padStart(2, "0")}-${name}.png`;
        await page.screenshot({ path: info.outputPath(file), fullPage: true });
        captures.push({
          name,
          file,
          width: page.viewportSize()!.width,
          height: page.viewportSize()!.height,
        });
      };
      const nav = (label: string) =>
        page
          .getByRole("navigation", { name: t.workspaceNavigation })
          .getByRole("button", { name: label, exact: true });
      await page.goto(`/${locale}/admin/content`);
      await nav(t.packagesNav).click();
      const f = page.getByRole("form", { name: t.packagesNav, exact: true });
      const courses = f.getByRole("group", {
        name: t.chooseCourses,
        exact: true,
      });
      await expect(courses.getByRole("checkbox")).toHaveCount(14);
      const verifyCourseRows = async (viewport: string) => {
        await capture(`packages-course-geometry-${viewport}`);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await courses.evaluate((group) =>
          Array.from(group.querySelectorAll("label")).map((label) => {
            const bounds = label.getBoundingClientRect();
            const walker = document.createTreeWalker(
              label,
              NodeFilter.SHOW_TEXT,
            );
            const lines: { top: number; bottom: number }[] = [];
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              for (const rect of range.getClientRects())
                lines.push({ top: rect.top, bottom: rect.bottom });
            }
            return {
              label: label.textContent,
              top: bounds.top,
              bottom: bounds.bottom,
              textTop: Math.min(...lines.map((line) => line.top)),
              textBottom: Math.max(...lines.map((line) => line.bottom)),
            };
          }),
        );
        writeFileSync(
          info.outputPath(`course-geometry-${viewport}.json`),
          JSON.stringify(geometry, null, 2),
        );
        const layout = await courses.evaluate((group) => {
          const properties = [
            "display",
            "grid-template-columns",
            "grid-template-rows",
            "grid-auto-rows",
            "min-width",
            "max-width",
            "min-height",
            "max-height",
            "flex-shrink",
            "flex-wrap",
            "white-space",
            "overflow-wrap",
            "word-break",
            "overflow",
            "text-overflow",
            "padding-inline-start",
            "padding-inline-end",
            "padding-block-start",
            "padding-block-end",
            "margin-inline-start",
            "margin-inline-end",
            "direction",
            "writing-mode",
            "font-family",
            "font-size",
            "line-height",
            "align-items",
            "gap",
          ];
          const describe = (element: Element | null) => {
            if (!element) return null;
            const box = element.getBoundingClientRect();
            const computed = getComputedStyle(element);
            return {
              tag: element.tagName,
              className: element.className,
              rect: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                top: box.top,
                bottom: box.bottom,
                left: box.left,
                right: box.right,
              },
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              css: Object.fromEntries(
                properties.map((p) => [p, computed.getPropertyValue(p)]),
              ),
            };
          };
          return {
            document: {
              width: innerWidth,
              height: innerHeight,
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              direction: document.documentElement.dir,
              theme: document.documentElement.dataset.theme,
            },
            hierarchy: [
              describe(group.parentElement?.parentElement ?? null),
              describe(group.parentElement),
              describe(group),
            ],
            rows: Array.from(group.querySelectorAll("label")).map((label) => ({
              text: label.textContent,
              html: label.outerHTML,
              row: describe(label),
              parent: describe(label.parentElement),
              children: Array.from(label.children).map(describe),
              previous: describe(label.previousElementSibling),
              next: describe(label.nextElementSibling),
              textNodes: Array.from(label.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((node) => {
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  return {
                    text: node.textContent,
                    rects: Array.from(range.getClientRects()).map((r) => ({
                      x: r.x,
                      y: r.y,
                      width: r.width,
                      height: r.height,
                      top: r.top,
                      bottom: r.bottom,
                    })),
                  };
                }),
            })),
          };
        });
        writeFileSync(
          info.outputPath(`course-layout-${viewport}.json`),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              test: info.title,
              project: info.project.name,
              locale,
              theme,
              browser: "Chromium",
              configuredViewport: page.viewportSize(),
              layout,
            },
            null,
            2,
          ),
        );
        expect(
          geometry.filter(
            (row) =>
              row.textTop < row.top - 1 || row.textBottom > row.bottom + 1,
          ),
          "Every course label must contain its complete wrapped text",
        ).toEqual([]);
      };
      const values = {
        slug: "synthetic-stress-package",
        arabicTitle: "باقة افتراضية للاختبار",
        englishTitle: "Synthetic stress package",
        arabicDescription: "وصف باقة افتراضية للاختبار",
        englishDescription: "Synthetic package description",
      };
      for (const [key, value] of Object.entries(values))
        await f
          .getByRole("textbox", { name: t[key as keyof typeof t], exact: true })
          .fill(value);
      await f
        .getByRole("spinbutton", { name: t.price, exact: true })
        .fill("25.123");
      await courses
        .getByRole("checkbox", { name: /Synthetic course with a long/ })
        .check();
      await courses
        .getByRole("checkbox", { name: /Synthetic long English course 12/ })
        .check();
      await expect(
        f.getByRole("spinbutton", { name: t.price, exact: true }),
      ).toHaveValue("25.123");
      await verifyCourseRows("mobile");
      await capture("packages-create-many-courses-mobile");
      await f.getByRole("button", { name: t.save, exact: true }).click();
      await expect(f.getByRole("status")).toHaveText(t.packageSaved);
      expect(ctx.writes.at(-1)).toEqual({
        path: "/admin/content/packages",
        method: "POST",
        body: {
          ...values,
          price: 25.123,
          availableFromUtc: null,
          availableUntilUtc: null,
          isPublished: false,
          courseIds: ["course-a", "course-stress-12"],
        },
      });
      await expect(
        f.getByRole("textbox", { name: t.slug, exact: true }),
      ).toHaveValue("");
      await capture("packages-create-success-mobile");
      await nav(t.teachersNav).click();
      const profile = page.getByRole("form", { name: t.teacher, exact: true });
      await profile
        .getByRole("combobox", { name: t.chooseTeacher, exact: true })
        .selectOption("teacher-a");
      await expect(
        profile.getByRole("checkbox", { name: t.showProfile, exact: true }),
      ).toBeChecked();
      await capture("profile-public-long-name-mobile");
      await nav(t.attendance).click();
      await page
        .getByRole("combobox", { name: t.attendanceSession, exact: true })
        .selectOption("session-a");
      const status = page.getByRole("combobox", {
        name: `${t.attendanceStatus} · ${studentName}`,
        exact: true,
      });
      await expect(status).toHaveValue("Present");
      await status.focus();
      await page.keyboard.press("ArrowDown");
      await expect(status).toHaveValue("Late");
      await expect(
        page
          .getByRole("button", { name: t.updateAttendance, exact: true })
          .first(),
      ).toBeEnabled();
      await page.keyboard.press("Tab");
      await expect(
        page
          .getByRole("button", { name: t.updateAttendance, exact: true })
          .first(),
      ).toBeFocused();
      await capture("attendance-long-name-keyboard-mobile");
      await page.setViewportSize({ width: 1440, height: 900 });
      await capture("attendance-long-name-desktop");
      await nav(t.packagesNav).click();
      await verifyCourseRows("desktop");
      await capture("packages-many-courses-desktop");
      expect(ctx.errors).toEqual([]);
      writeFileSync(
        info.outputPath("scenario.json"),
        JSON.stringify(
          {
            classification: "MOCKED UI-CONTRACT EVIDENCE",
            kind: "supplemental-stress",
            locale,
            theme,
            width: 390,
            height: 844,
            captures,
            returnedCourseCount: 14,
            reads: ctx.reads,
            writes: ctx.writes,
            errors: ctx.errors,
          },
          null,
          2,
        ),
      );
    });
  }
}

for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"]) {
    test(`Content Studio narrow ${locale} ${theme} MOCKED UI-CONTRACT EVIDENCE`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      const t = (locale === "en" ? en : ar).adminContent;
      const ctx = await prepare(page, locale, theme);
      const english =
        "SuperconductivityCharacterisationWithoutWordBreaks".repeat(4);
      const arabic = "اسمدورةعربيةطويلةمتصلةللاختبار".repeat(6);
      ctx.fixture.courses.push({
        id: "course-unbroken",
        arabicTitle: arabic,
        englishTitle: english,
        price: 12.345,
        currency: "JOD",
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`/${locale}/admin/content`);
      const themeToggle = page
        .getByRole("button", {
          name: (locale === "en" ? en : ar).navigation.theme.toggle,
          exact: true,
        })
        .first();
      if (!(await page.locator("html").getAttribute("data-theme")))
        await themeToggle.click();
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await themeToggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page
        .getByRole("navigation", { name: t.workspaceNavigation })
        .getByRole("button", { name: t.packagesNav, exact: true })
        .click();
      const form = page.getByRole("form", { name: t.packagesNav, exact: true });
      const group = form.getByRole("group", {
        name: t.chooseCourses,
        exact: true,
      });
      await expect(group.getByRole("checkbox")).toHaveCount(3);
      const checkbox = group.getByRole("checkbox", {
        name: new RegExp(english),
      });
      await expect(checkbox).toHaveAccessibleName(new RegExp(arabic));
      await checkbox.focus();
      await page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeFocused();
      await page.keyboard.press("Space");
      await expect(checkbox).not.toBeChecked();
      const captures: {
        name: string;
        file: string;
        width: number;
        height: number;
      }[] = [];
      const measurements: unknown[] = [];
      for (const [width, height] of [
        [320, 800],
        [360, 800],
        [390, 844],
        [834, 1112],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => document.fonts.ready);
        await checkbox.scrollIntoViewIfNeeded();
        const rows = await group.evaluate((element) =>
          Array.from(element.querySelectorAll("label")).map((label) => {
            const box = label.getBoundingClientRect();
            const input = label.querySelector("input")!.getBoundingClientRect();
            const walker = document.createTreeWalker(
              label,
              NodeFilter.SHOW_TEXT,
            );
            const lines: {
              top: number;
              bottom: number;
              left: number;
              right: number;
            }[] = [];
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              for (const r of range.getClientRects())
                if (r.width > 0)
                  lines.push({
                    top: r.top,
                    bottom: r.bottom,
                    left: r.left,
                    right: r.right,
                  });
            }
            return {
              text: label.textContent,
              height: box.height,
              outside: lines.some(
                (r) =>
                  r.top < box.top - 1 ||
                  r.bottom > box.bottom + 1 ||
                  r.left < box.left - 1 ||
                  r.right > box.right + 1,
              ),
              hitsInput: lines.some(
                (r) =>
                  Math.min(r.right, input.right) -
                    Math.max(r.left, input.left) >
                    1 &&
                  Math.min(r.bottom, input.bottom) -
                    Math.max(r.top, input.top) >
                    1,
              ),
            };
          }),
        );
        expect(
          rows.filter((row) => row.outside || row.hitsInput || row.height < 44),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(checkbox).toHaveAccessibleName(new RegExp(english));
        await expect(checkbox).toHaveAccessibleName(new RegExp(arabic));
        measurements.push({ width, height, rows });
        await page.evaluate(() => scrollTo(0, 0));
        const name = `unbroken-course-${width}`,
          file = `${name}.png`;
        await page.screenshot({ path: info.outputPath(file), fullPage: true });
        captures.push({ name, file, width, height });
      }
      expect(ctx.errors).toEqual([]);
      writeFileSync(
        info.outputPath("scenario.json"),
        JSON.stringify(
          {
            classification: "MOCKED UI-CONTRACT EVIDENCE",
            kind: "narrow-unbroken",
            locale,
            theme,
            width: 320,
            height: 800,
            captures,
            measurements,
            errors: ctx.errors,
          },
          null,
          2,
        ),
      );
    });
  }
}
