import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  queueItems,
  queuePage,
  pendingEvaluation,
  candidates,
  resitPage,
  adjustmentSummary,
} from "../fixtures/admin-assessment-coordination";
import { underReviewEvaluations } from "../fixtures/admin-evaluations-approvals";
import {
  plan,
  candidate,
  staff,
  taxonomy,
  appeal,
} from "../fixtures/admin-governance-gradebook";
import {
  staff as evaluators,
  units,
  historyPage,
} from "../fixtures/admin-evaluator-specialisms";
// MOCKED UI-CONTRACT EVIDENCE: production UI, synthetic intercepted API data.
test.afterEach(async ({}, info) => {
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(
    info.outputPath("scenario.json"),
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
  theme: string,
  routeName: string,
  initial = "data",
  roles = ["Admin"],
) {
  const state = { mode: initial },
    reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    errors: string[] = [];
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
      writes.push({ path: p, method: req.method(), body: req.postDataJSON() });
      return route.fulfill({
        status: 409,
        json: {
          message: "Synthetic expected-state conflict",
          code: "ASSIGNMENT_CONFLICT",
        },
      });
    }
    if (p === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    const targeted =
      p.startsWith("/assessment-coordination/") ||
      p.startsWith("/evaluations/") ||
      p.startsWith("/resits/") ||
      p.startsWith("/internal-verification/") ||
      p.startsWith("/evaluation-appeals/") ||
      p.startsWith("/admin/evaluator-specialisms");
    if (targeted) {
      reads.push(p + url.search);
      if (state.mode === "pending") return new Promise(() => {});
      if (["401", "403", "error"].includes(state.mode))
        return route.fulfill({
          status: state.mode === "error" ? 503 : Number(state.mode),
          json: { message: "Synthetic request failure" },
        });
    }
    if (p === "/evaluations/pending-assignment")
      return route.fulfill({
        json: state.mode === "empty" ? [] : [pendingEvaluation],
      });
    if (p === "/evaluations/under-review")
      return route.fulfill({
        json: state.mode === "empty" ? [] : underReviewEvaluations,
      });
    if (p.endsWith("/eligible-evaluators"))
      return route.fulfill({
        json: state.mode === "no-evaluator" ? [] : candidates,
      });
    if (p === "/assessment-coordination/queue") {
      const selected = url.searchParams.get("status"),
        target = url.searchParams.get("expectedCompletionState");
      const items =
        state.mode === "empty"
          ? []
          : queueItems.filter(
              (x) =>
                (!selected || x.status === selected) &&
                (!target || x.expectedCompletionState === target),
            );
      return route.fulfill({
        json: { ...queuePage(p + url.search), items, totalCount: items.length },
      });
    }
    if (p.endsWith("/reasonable-adjustments/revision-deadline"))
      return route.fulfill({ json: adjustmentSummary });
    if (p === "/resits/authorizations")
      return route.fulfill({
        json: {
          ...resitPage(),
          items: state.mode === "empty" ? [] : resitPage().items,
        },
      });
    if (p === "/internal-verification/plans")
      return route.fulfill({ json: state.mode === "empty" ? [] : [plan] });
    if (p === "/internal-verification/plans/eligible-staff")
      return route.fulfill({ json: staff });
    if (p.endsWith("/candidates")) return route.fulfill({ json: [candidate] });
    if (p === "/taxonomy") return route.fulfill({ json: taxonomy });
    if (p === "/evaluation-appeals/review-queue")
      return route.fulfill({ json: state.mode === "empty" ? [] : [appeal] });
    if (p === "/assessment-pdf-reports/status")
      return route.fulfill({
        json: { isConfigured: true, unavailableReason: null },
      });
    if (p === "/admin/evaluator-specialisms/staff")
      return route.fulfill({ json: evaluators });
    if (p === "/admin/evaluator-specialisms/units")
      return route.fulfill({ json: units });
    if (p === "/admin/evaluator-specialisms")
      return route.fulfill({
        json: {
          ...historyPage(),
          items: state.mode === "empty" ? [] : historyPage().items,
        },
      });
    const common = roleShellRuntimeResponse(p, locale, roles);
    return route.fulfill(
      common ?? {
        status: 503,
        json: { message: "Unconfigured synthetic read" },
      },
    );
  });
  await page.goto(`/${locale}/admin/${routeName}`);
  const copy = locale === "ar" ? ar : en,
    toggle = page.getByRole("button", {
      name: copy.navigation.theme.toggle,
      exact: true,
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
  return { state, reads, writes, errors, copy: copy.adminWorkspace };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function readableWorkingText(locator: Locator) {
  // Measure the rendered text against its nearest opaque working surface.
  // This checks the scoped accent/danger regression, not whole-site WCAG.
  const contrast = await locator.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = (channels: number[]) =>
      channels
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const foreground = luminance(rgb(getComputedStyle(element).color));
    let ancestor: Element | null = element;
    while (ancestor) {
      const channels = rgb(getComputedStyle(ancestor).backgroundColor);
      if (
        channels.length === 3 ||
        (channels.length === 4 && channels[3] === 1)
      ) {
        const background = luminance(channels);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      }
      ancestor = ancestor.parentElement;
    }
    throw new Error("No opaque working surface for contrast measurement");
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}
const routes = [
  "evaluations",
  "internal-verification",
  "evaluation-appeals",
  "evaluator-specialisms",
] as const;
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      for (const routeName of routes) {
        test(`${locale} ${theme} ${viewport.width} ${routeName}: populated work and selected detail`, async ({
          page,
        }, info) => {
          await page.setViewportSize(viewport);
          const c = await prepare(page, locale, theme, routeName),
            main = page.getByRole("main"),
            t = c.copy;
          if (routeName === "evaluations") {
            const queue = main.getByRole("region", {
              name: t.assessmentCoordination.title,
              exact: true,
            });
            await expect(queue.locator("article")).toHaveCount(
              queueItems.length,
            );
            for (const key of [
              "mappingBlocker",
              "noEvaluatorBlocker",
              "stateChangedBlocker",
            ] as const)
              await expect(
                queue.getByText(t.assessmentCoordination[key], { exact: true }),
              ).toBeVisible();
            await readableWorkingText(
              queue.locator('p[class*="text-red-"]').first(),
            );
            const nav = main.getByRole("navigation", {
              name: t.evaluations.title,
            });
            expect(
              await nav
                .getByRole("link")
                .evaluateAll((xs) => xs.map((x) => x.getAttribute("href"))),
            ).toEqual([
              "#assessment-coordination",
              "#assessment-assignment",
              "#assessment-resit",
              "#assessment-verification",
            ]);
            await page.screenshot({
              path: info.outputPath("queue.png"),
              fullPage: true,
            });
            await queue
              .getByLabel(t.assessmentCoordination.statusFilter)
              .selectOption("NeedsRevision");
            await expect(queue.locator("article")).toHaveCount(1);
            await queue
              .getByRole("button", {
                name: t.assessmentCoordination.setTarget,
                exact: true,
              })
              .click();
            await queue
              .getByLabel(t.assessmentCoordination.expectedCompletion, {
                exact: true,
              })
              .fill("2030-01-04T12:00");
            await queue
              .getByLabel(t.assessmentCoordination.internalReason, {
                exact: true,
              })
              .fill("Unsaved staff reason retained");
            await queue
              .getByRole("button", {
                name: t.assessmentCoordination.manageAdjustment,
                exact: true,
              })
              .click();
            await expect(
              queue.getByText(adjustmentSummary.history[0].reason, {
                exact: true,
              }),
            ).toBeVisible();
            await queue.screenshot({
              path: info.outputPath("selected-deadline-detail.png"),
            });
            await expect(
              main.getByRole("combobox", {
                name: t.evaluatorAssignment.selectEvaluator,
              }),
            ).toBeVisible();
            await main
              .getByRole("combobox", {
                name: t.evaluatorAssignment.selectEvaluator,
              })
              .selectOption(candidates[1].id);
            await main
              .locator("#assessment-assignment")
              .screenshot({ path: info.outputPath("assignment.png") });
            await main
              .locator("#assessment-resit")
              .screenshot({ path: info.outputPath("resit-relationships.png") });
            await main
              .locator("#assessment-verification")
              .screenshot({ path: info.outputPath("verification.png") });
          } else if (routeName === "internal-verification") {
            const choice = main.getByRole("button", {
              name: new RegExp(plan.selectionRationale),
            });
            await choice.click();
            await expect(choice).toHaveAttribute("aria-pressed", "true");
            const panel = main.locator("#iv-candidates"),
              select = panel.getByRole("combobox", {
                name: t.internalVerificationPlans.assignVerifier,
                exact: true,
              });
            await expect(select).toBeVisible();
            await readableWorkingText(
              panel.getByText(
                t.internalVerificationPlans.outcomeLabels.Distinction,
                { exact: true },
              ),
            );
            await expect(
              select.locator(`option[value="${candidate.assessorUserId}"]`),
            ).toHaveCount(0);
            await select.selectOption("verifier");
            await panel
              .getByRole("textbox", {
                name: t.internalVerificationPlans.sampleReason,
                exact: true,
              })
              .fill("Preserved independent sample rationale");
            await expect(
              panel.getByRole("button", {
                name: t.internalVerificationPlans.select,
                exact: true,
              }),
            ).toBeEnabled();
            await page.screenshot({
              path: info.outputPath("plan-and-selected-candidate.png"),
              fullPage: true,
            });
            await panel.screenshot({
              path: info.outputPath("selected-candidate.png"),
            });
          } else if (routeName === "evaluation-appeals") {
            await expect(
              main.getByText(appeal.reason, { exact: true }),
            ).toBeVisible();
            await expect(
              main.getByRole("link", {
                name: t.evaluationAppeals.auditExport,
                exact: true,
              }),
            ).toHaveAttribute(
              "href",
              `/api/v1/assessment-audit-exports/${appeal.evaluationRequestId}`,
            );
            await expect(
              main.getByRole("link", {
                name: t.evaluationAppeals.pdfReport,
                exact: true,
              }),
            ).toHaveAttribute(
              "href",
              `/api/v1/assessment-pdf-reports/${appeal.evaluationRequestId}?locale=${locale}`,
            );
            await main
              .getByLabel(t.evaluationAppeals.rationale)
              .fill("Preserved appeal decision rationale");
            await page.screenshot({
              path: info.outputPath("appeal-and-request-relationship.png"),
              fullPage: true,
            });
          } else {
            await main
              .getByLabel(t.evaluatorSpecialisms.evaluator)
              .selectOption(evaluators[0].id);
            await main
              .getByLabel(t.evaluatorSpecialisms.academicUnit)
              .selectOption(units[0].id);
            await expect(main.locator("article")).toHaveCount(3);
            expect(
              await main
                .locator("article")
                .evaluateAll((xs) => xs.map((x) => x.textContent)),
            ).toEqual(
              expect.arrayContaining([
                expect.stringContaining("Raw Active Evaluator One"),
                expect.stringContaining("Raw Revoked Evaluator"),
              ]),
            );
            await page.screenshot({
              path: info.outputPath("specialism-and-history.png"),
              fullPage: true,
            });
          }
          await noOverflow(page);
          expect(c.writes).toEqual([]);
          expect(c.errors).toEqual([]);
          const weights = await main
            .locator(
              "[class*=workspace] :is(h1,h2,h3,p,label,button), [class*=panel] :is(h1,h2,h3,p,label,button)",
            )
            .evaluateAll((xs) =>
              xs.map((x) => Number(getComputedStyle(x).fontWeight)),
            );
          expect(weights.length).toBeGreaterThan(0);
          expect(weights.every((w) => w <= 700)).toBe(true);
        });
      }
for (const locale of ["en", "ar"] as const)
  for (const mode of ["pending", "401", "403", "error", "empty"]) {
    test(`${locale} evaluations ${mode}: factual cold state without actions`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const c = await prepare(page, locale, "dark", "evaluations", mode),
        main = page.getByRole("main");
      if (mode === "pending")
        await expect(main.locator("[aria-busy]")).toBeVisible();
      else if (mode === "empty")
        await expect(
          main.getByText(c.copy.evaluations.emptyPending, { exact: true }),
        ).toBeVisible();
      else
        await expect(main.getByRole("alert")).toHaveText(
          mode === "401"
            ? c.copy.dashboard.signIn
            : mode === "403"
              ? c.copy.courseApprovals.accessDenied
              : c.copy.evaluations.loadError,
        );
      await expect(
        main.getByRole("button", {
          name: c.copy.evaluatorAssignment.assign,
          exact: true,
        }),
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath("state.png"),
        fullPage: true,
      });
      expect(c.writes).toEqual([]);
      await noOverflow(page);
    });
  }
for (const routeName of routes.slice(1))
  for (const mode of ["403", "error", "empty"]) {
    test(`ar ${routeName} ${mode}: retains factual independent state`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const c = await prepare(page, "ar", "light", routeName, mode),
        main = page.getByRole("main");
      if (mode !== "empty")
        await expect(main.getByRole("alert").first()).toBeVisible();
      else
        await expect(
          main.getByText(
            routeName === "internal-verification"
              ? c.copy.internalVerificationPlans.noPlans
              : routeName === "evaluation-appeals"
                ? c.copy.evaluationAppeals.empty
                : c.copy.evaluatorSpecialisms.emptyHistory,
            { exact: true },
          ),
        ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("state.png"),
        fullPage: true,
      });
      expect(c.writes).toEqual([]);
      await noOverflow(page);
    });
  }
for (const locale of ["en", "ar"] as const) {
  test(`${locale} assignment expected-state conflict preserves candidate and request`, async ({
    page,
  }, info) => {
    const c = await prepare(page, locale, "light", "evaluations"),
      panel = page.locator("#assessment-assignment"),
      t = c.copy.evaluatorAssignment;
    await panel.getByRole("combobox").selectOption(candidates[0].id);
    await panel.getByRole("button", { name: t.assign, exact: true }).click();
    await expect(panel.getByRole("alert")).toHaveText(t.staleError);
    await expect(panel.getByRole("combobox")).toHaveValue(candidates[0].id);
    expect(c.writes).toEqual([
      {
        path: `/evaluations/${pendingEvaluation.id}/assign`,
        method: "POST",
        body: { teacherUserId: candidates[0].id },
      },
    ]);
    await panel.screenshot({
      path: info.outputPath("expected-state-conflict.png"),
    });
  });
  test(`${locale} cached refresh error preserves queue, candidate and verification draft`, async ({
    page,
  }, info) => {
    await page.clock.install();
    const c = await prepare(page, locale, "dark", "evaluations"),
      main = page.getByRole("main"),
      t = c.copy;
    const queue = main.locator("#assessment-coordination");
    await expect(queue.locator("article")).toHaveCount(queueItems.length);
    await main
      .locator("#assessment-assignment")
      .getByRole("combobox")
      .selectOption(candidates[0].id);
    const notes = main.getByPlaceholder(t.evaluations.notesPlaceholder).first();
    await notes.fill("Retained draft during refresh failure");
    c.state.mode = "error";
    await page.clock.fastForward(61_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(
      main.getByText(t.evaluations.loadError, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(queue.getByRole("alert")).toHaveText(
      t.assessmentCoordination.loadError,
    );
    await expect(queue.locator("article")).toHaveCount(queueItems.length);
    await expect(notes).toHaveValue("Retained draft during refresh failure");
    await expect(
      main.locator("#assessment-assignment").getByRole("combobox"),
    ).toHaveValue(candidates[0].id);
    await page.screenshot({
      path: info.outputPath("cached-error.png"),
      fullPage: true,
    });
    expect(c.writes).toEqual([]);
  });
  test(`${locale} keyboard, 44px controls, reduced motion and reflow proxy`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 720, height: 450 });
    const c = await prepare(page, locale, "light", "evaluations"),
      main = page.getByRole("main"),
      nav = main.getByRole("navigation", { name: c.copy.evaluations.title });
    const first = nav.getByRole("link").first();
    await first.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    expect(await first.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe(
      "3px",
    );
    await first.press("Enter");
    await expect(page).toHaveURL(/#assessment-coordination$/);
    const sizes = await nav
      .getByRole("link")
      .evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect().height));
    expect(sizes.every((h) => h >= 44)).toBe(true);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath("keyboard-reflow.png"),
      fullPage: true,
    });
  });
}
test("coordinator capability does not acquire verification navigation", async ({
  page,
}) => {
  const c = await prepare(page, "en", "light", "evaluations", "data", [
      "CourseReviewer",
    ]),
    main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: c.copy.evaluations.title, exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", {
      name: c.copy.evaluations.verificationTitle,
      exact: true,
    }),
  ).toHaveCount(0);
  expect(c.reads.some((p) => p === "/evaluations/under-review")).toBe(false);
});
for (const locale of ["en", "ar"] as const) {
  test(`${locale} filtered no-match differs from successful empty`, async ({
    page,
  }, info) => {
    const c = await prepare(page, locale, "light", "evaluations"),
      queue = page.locator("#assessment-coordination");
    await expect(queue.locator("article")).toHaveCount(queueItems.length);
    c.state.mode = "empty";
    await queue
      .getByLabel(c.copy.assessmentCoordination.statusFilter)
      .selectOption("Assigned");
    await expect(
      queue.getByText(c.copy.gradebook.empty, { exact: true }),
    ).toBeVisible();
    await expect(
      queue.getByText(c.copy.assessmentCoordination.empty, { exact: true }),
    ).toHaveCount(0);
    await queue.screenshot({ path: info.outputPath("filtered-no-match.png") });
    await queue
      .getByLabel(c.copy.assessmentCoordination.statusFilter)
      .selectOption("");
    // Switching back to the still-fresh unfiltered key retains its actual
    // seven cached rows. A cold reload then obtains the successful empty API.
    await expect(queue.locator("article")).toHaveCount(queueItems.length);
    await page.reload();
    await expect(
      queue.getByText(c.copy.assessmentCoordination.empty, { exact: true }),
    ).toBeVisible();
    expect(c.writes).toEqual([]);
  });
  test(`${locale} no eligible evaluator exposes no assignment action`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const c = await prepare(
        page,
        locale,
        "dark",
        "evaluations",
        "no-evaluator",
      ),
      panel = page.locator("#assessment-assignment");
    await expect(
      panel.getByText(c.copy.evaluatorAssignment.empty, { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("combobox")).toHaveCount(0);
    await expect(
      panel.getByRole("button", {
        name: c.copy.evaluatorAssignment.assign,
        exact: true,
      }),
    ).toHaveCount(0);
    await panel.screenshot({
      path: info.outputPath("no-eligible-evaluator.png"),
    });
    expect(c.writes).toEqual([]);
  });
}
