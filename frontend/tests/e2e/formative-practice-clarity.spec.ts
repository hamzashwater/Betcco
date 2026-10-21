import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  workspaceCourseId,
  workspaceResponse,
} from "../fixtures/player-workspace";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  formativeMine,
  formativeStates,
  formativeUnits,
  type FormativeState,
} from "../fixtures/formative-practice";

// MOCKED UI-CONTRACT EVIDENCE. Actual Next player + native file controls, with
// synthetic intercepted responses. No backend, persistence or authorization proof.
test.afterEach(async ({}, info) => {
  const path = info.outputPath("scenario.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        label: "MOCKED UI-CONTRACT EVIDENCE",
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
  theme: string,
  initial: FormativeState = "draft",
  queryState = "data",
) {
  const state = {
    value: initial,
    uploaded: false,
    submitted: false,
    failRefresh: false,
    uploadMode: "success" as "success" | "pending" | "scan" | "rejected",
  };
  const writes: string[] = [];
  const errors: string[] = [];
  let releaseUpload: () => void = () => {};
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
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "synthetic-csrf" } });
    if (request.method() !== "GET") {
      writes.push(request.method() + " " + path);
      if (path.endsWith("/submissions")) {
        const kind = path.includes("/aim-practice/") ? "aim" : "final";
        return route.fulfill({
          json: { submissionId: `${kind}-submission`, versionNumber: 1 },
        });
      }
      if (path.endsWith("/files")) {
        if (state.uploadMode === "pending")
          await new Promise<void>((resolve) => {
            releaseUpload = resolve;
          });
        if (state.uploadMode === "scan" || state.uploadMode === "rejected")
          return route.fulfill({
            status: 409,
            json: {
              message:
                state.uploadMode === "scan"
                  ? "RAW server: evidence scanning is still pending"
                  : "RAW server: evidence was rejected",
            },
          });
        state.uploaded = true;
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/submit")) {
        state.submitted = true;
        state.value = "submitted";
        return route.fulfill({ json: {} });
      }
      return route.fulfill({
        status: 400,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (
      path.endsWith("/learning-aim-practice") ||
      path === "/student/assignments/mine"
    ) {
      const mine = path === "/student/assignments/mine";
      if (mine && queryState === "pending") return;
      if ((mine && queryState === "error") || state.failRefresh)
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic practice refresh failure" },
        });
      if (queryState === "empty") return route.fulfill({ json: [] });
      return route.fulfill({
        json: mine
          ? formativeMine(state.uploaded, state.submitted)
          : formativeUnits(state.value),
      });
    }
    const response = workspaceResponse(path, locale);
    return route.fulfill(
      response !== undefined
        ? { json: response }
        : roleShellRuntimeResponse(path, locale, ["Student"]),
    );
  });
  await page.goto(
    `/${locale}/student/learn/${workspaceCourseId}?lessonId=text-lesson`,
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
  await page
    .getByRole("tab", {
      name: copy.studentPlayerWorkspace.practice,
      exact: true,
    })
    .click();
  return { state, writes, errors, releaseUpload: () => releaseUpload() };
}
function article(page: Page, kind: "aim" | "final") {
  return page.locator(
    kind === "aim"
      ? "#player-practice-aim-raw-aim-17"
      : "#player-practice-unit-raw-unit-17",
  );
}

for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width}: formative content/practice/review checklist`, async ({
        page,
      }, info) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const contract = await prepare(page, locale, theme, "draft");
        for (const kind of ["aim", "final"] as const) {
          const target = article(page, kind);
          await expect(
            target.getByRole("list", {
              name: copy.studentPracticeWorkspace.stages,
            }),
          ).toBeVisible();
          await expect(target.getByRole("listitem")).toHaveCount(3);
          await expect(
            page.getByText(
              copy.learningPractice[kind === "aim" ? "aim" : "comprehensive"]
                .formativeDisclaimer,
            ),
          ).toBeVisible();
          await expect(
            target.getByRole("button", {
              name: copy.learningPractice.common.continueDraft,
            }),
          ).toBeEnabled();
          expect(
            await target
              .locator(kind === "aim" ? "h4" : "h2")
              .evaluate((e) => getComputedStyle(e).fontWeight),
          ).toBe("700");
          await target.scrollIntoViewIfNeeded();
          await target.screenshot({
            path: info.outputPath(`${kind}-draft.png`),
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(
          page
            .locator(`section[dir=${locale === "ar" ? "rtl" : "ltr"}]`)
            .first(),
        ).toBeVisible();
        expect(contract.writes).toEqual([]);
        expect(contract.errors).toEqual([]);
      });
    }
  for (const state of formativeStates.filter((s) => s !== "draft")) {
    test(`${locale} ${state}: server states, attempt history and final training distinction`, async ({
      page,
    }, info) => {
      await page.setViewportSize(
        locale === "ar"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      );
      const contract = await prepare(
        page,
        locale,
        locale === "ar" ? "dark" : "light",
        state,
      );
      for (const kind of ["aim", "final"] as const) {
        const target = article(page, kind);
        await expect(target).toBeVisible();
        if (
          kind === "aim" &&
          ["reviewed", "complete", "improvement"].includes(state)
        ) {
          const activity = target.locator("details").first();
          if (!(await activity.getAttribute("open"))) {
            // Empty open="" is truthy as a DOM property; avoid toggling an open disclosure.
            if (!(await activity.evaluate((e: HTMLDetailsElement) => e.open)))
              await activity.locator("summary").first().click();
          }
          await target
            .getByText(copy.learningPractice.aim.attemptHistory, {
              exact: true,
            })
            .click();
          await expect(target.getByText("RAW first gap")).toBeVisible();
          await expect(target.getByText("RAW latest gap")).toBeVisible();
        }
        if (state !== "improvement")
          await expect(target.getByRole("button")).toHaveCount(0);
        if (state === "complete" && kind === "final")
          await expect(
            target.getByText(
              copy.learningPractice.comprehensive.trainingComplete,
            ),
          ).toBeVisible();
        if (state === "reviewed" && kind === "final")
          await expect(
            target.getByText(
              copy.learningPractice.comprehensive.trainingComplete,
            ),
          ).toHaveCount(0);
        await target.screenshot({
          path: info.outputPath(`${kind}-${state}.png`),
        });
      }
      expect(contract.writes).toEqual([]);
      expect(contract.errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
  for (const query of ["pending", "error", "empty"]) {
    test(`${locale} ${query}: no unknown submission action`, async ({
      page,
    }, info) => {
      const contract = await prepare(page, locale, "light", "draft", query);
      if (query !== "empty")
        await expect(
          page.getByText(
            copy.learningPractice.aim[
              query === "pending" ? "loading" : "loadFailed"
            ],
            { exact: true },
          ),
        ).toBeVisible({ timeout: 15000 });
      else
        await expect(
          page.getByRole("list", {
            name: copy.studentPracticeWorkspace.stages,
          }),
        ).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: copy.learningPractice.common.continueDraft,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("tabpanel", {
          name: copy.studentPlayerWorkspace.practice,
          exact: true,
        })
        .screenshot({ path: info.outputPath(`${query}.png`) });
      expect(contract.writes).toEqual([]);
    });
  }
  for (const kind of ["aim", "final"] as const) {
    test(`${locale} ${kind}: draft, pending scan/rejection, retry, submit and cached refresh`, async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize(
        locale === "ar"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      );
      const contract = await prepare(
        page,
        locale,
        locale === "ar" ? "dark" : "light",
      );
      const target = article(page, kind);
      const region = page.getByRole("region", {
        name: copy.learningPractice[kind === "aim" ? "aim" : "comprehensive"]
          .title,
        exact: true,
      });
      await target
        .getByRole("button", {
          name: copy.learningPractice.common.continueDraft,
        })
        .click();
      const note = target.getByRole("textbox", {
        name: copy.learningPractice.common.teacherNote,
      });
      await note.fill("UNSAVED مسودة تدريب");
      await target.locator("input[type=file]").setInputFiles({
        name: `${kind}-evidence.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from("Synthetic evidence"),
      });
      await page
        .getByRole("tab", {
          name: copy.studentPlayerWorkspace.resources,
          exact: true,
        })
        .click();
      await page
        .getByRole("tab", {
          name: copy.studentPlayerWorkspace.practice,
          exact: true,
        })
        .click();
      await expect(note).toHaveValue("UNSAVED مسودة تدريب");
      await expect(
        target.getByText(`${kind}-evidence.pdf`, { exact: true }),
      ).toBeVisible();
      const upload = target.getByRole("button", {
        name: copy.learningPractice.common.uploadFiles,
      });
      contract.state.uploadMode = "pending";
      await upload.click();
      await expect(upload).toBeDisabled();
      await expect(
        target.getByRole("button", {
          name: copy.learningPractice.common.submitToTeacher,
        }),
      ).toBeDisabled();
      await target.screenshot({ path: info.outputPath("upload-pending.png") });
      contract.state.uploadMode = "scan";
      contract.releaseUpload();
      await expect(
        page.getByRole("alert").filter({
          hasText: "RAW server: evidence scanning is still pending",
        }),
      ).toBeVisible();
      await region.screenshot({ path: info.outputPath("scan-error.png") });
      contract.state.uploadMode = "rejected";
      await upload.click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "RAW server: evidence was rejected" }),
      ).toBeVisible();
      await region.screenshot({ path: info.outputPath("rejected.png") });
      contract.state.uploadMode = "success";
      await upload.click();
      const submit = target.getByRole("button", {
        name: copy.learningPractice.common.submitToTeacher,
      });
      await expect(submit).toBeEnabled();
      await expect(
        target.getByRole("link", { name: `${kind}-evidence.pdf` }),
      ).toHaveAttribute(
        "href",
        `/api/v1/assignments/submissions/${kind}-submission/files/${kind}-file`,
      );
      contract.state.failRefresh = true;
      await target
        .getByRole("button", { name: copy.learningPractice.common.saveNote })
        .click();
      await expect(region.getByRole("alert")).toHaveText(
        copy.learningPractice[kind === "aim" ? "aim" : "comprehensive"]
          .loadFailed,
        { timeout: 15000 },
      );
      await expect(note).toHaveValue("UNSAVED مسودة تدريب");
      await expect(submit).toBeEnabled();
      await region.screenshot({
        path: info.outputPath("cached-error-draft.png"),
      });
      contract.state.failRefresh = false;
      await submit.click();
      await expect(target.getByRole("button")).toHaveCount(0);
      await expect(
        target.getByText(copy.studentPracticeWorkspace.reviewPending, {
          exact: true,
        }),
      ).toBeVisible();
      await target.screenshot({ path: info.outputPath("submitted.png") });
      expect(contract.writes.filter((w) => w.endsWith("/submit"))).toHaveLength(
        1,
      );
      expect(contract.errors).toEqual([]);
    });
  }
  test(`${locale}: keyboard disclosure and approximate 200% reflow`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const contract = await prepare(page, locale, "dark", "complete");
    const target = article(page, "aim");
    const activity = target.locator("details").first();
    await activity.locator("summary").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(activity.locator("summary").first()).toBeFocused();
    expect(
      await activity
        .locator("summary")
        .first()
        .evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(activity).toHaveAttribute("open", "");
    await target
      .getByText(copy.learningPractice.aim.attemptHistory, { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(target.getByText("RAW first gap")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await target.screenshot({ path: info.outputPath("reflow-focus.png") });
    expect(contract.writes).toEqual([]);
  });
}
