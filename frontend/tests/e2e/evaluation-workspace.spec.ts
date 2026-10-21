import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
import {
  evaluationScope,
  evaluationDraft,
  evaluationRow,
  evaluationPage,
} from "../fixtures/evaluation-workspace";

// MOCKED UI-CONTRACT EVIDENCE: actual Next app/native controls, synthetic
// intercepted responses/writes. No provider, persistence or authorization proof.
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
  mode = "new",
  status = "Draft",
) {
  const state = {
    included: false,
    fail: false,
    submitPending: false,
    authenticity: true,
    status,
    rows: [evaluationRow("standard-result", status)],
    releaseSubmit: () => {},
  };
  const writes: { path: string; body: unknown; key: string | undefined }[] = [];
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
      path = url.pathname.replace(/^\/api\/v1/, "");
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "synthetic-csrf" } });
    if (req.method() !== "GET") {
      const multipart = (req.headers()["content-type"] ?? "").includes(
        "multipart/form-data",
      );
      const raw = req.postData();
      const body = multipart
        ? "multipart evidence"
        : raw
          ? JSON.parse(raw)
          : null;
      writes.push({ path, body, key: req.headers()["idempotency-key"] });
      if (path === "/evaluations/scoped")
        return route.fulfill({
          json: {
            id: "standard-draft",
            criteria: ["A.P1"],
            price: 12.5,
            currency: "JOD",
          },
        });
      if (path.endsWith("/checkout")) {
        if (state.fail)
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic checkout failure" },
          });
        const resit = path.includes("resit-request");
        if (resit) state.status = "PendingPayment";
        return route.fulfill({
          json: {
            includedCreditApplied: !resit && state.included,
            paymentId: "synthetic-payment",
            provider: "PayTabs",
            redirectUrl: null,
            total: 12.5,
            currency: "JOD",
          },
        });
      }
      if (path.endsWith("/authenticity-declaration")) {
        state.authenticity = true;
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/resubmit")) {
        if (state.submitPending)
          await new Promise<void>((resolve) => {
            state.releaseSubmit = resolve;
          });
        state.rows = [evaluationRow("standard-revision", "UnderReview")];
        return route.fulfill({ json: {} });
      }
      if (path === "/evaluation-appeals")
        return route.fulfill({
          status: 409,
          json: { message: "RAW appeal failure" },
        });
      if (path.endsWith("/files") || path.endsWith("/evidence"))
        return route.fulfill({ json: {} });
      return route.fulfill({
        status: 400,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (path === "/evaluations/assessment-scopes") {
      if (mode === "options-pending") return;
      return state.fail || mode === "options-error"
        ? route.fulfill({
            status: 503,
            json: { message: "Synthetic options failure" },
          })
        : route.fulfill({ json: [evaluationScope] });
    }
    if (path.endsWith("/included-credit"))
      return route.fulfill({ json: { available: state.included } });
    if (path.startsWith("/evaluations/mine")) {
      if (mode === "list-pending") return;
      if (state.fail || mode === "list-error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic history failure" },
        });
      return route.fulfill({
        json: evaluationPage(mode === "list-empty" ? [] : state.rows),
      });
    }
    if (path.startsWith("/student/resit-authorizations"))
      return route.fulfill({
        json: {
          items:
            mode === "authorized"
              ? [
                  {
                    authorizationId: "authorization",
                    originalEvaluationRequestId: "original-request",
                    resitEvaluationRequestId: null,
                    authorizedAtUtc: "2026-10-01T12:00:00Z",
                    activatedAtUtc: null,
                    state: "Authorized",
                    academic: evaluationScope,
                  },
                ]
              : [],
          page: 1,
          pageSize: 10,
          hasNextPage: false,
        },
      });
    if (
      path === "/evaluations/resit-request" ||
      path === "/evaluations/standard-draft"
    ) {
      if (mode === "resume-error" || state.fail)
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic resume failure" },
        });
      const value = evaluationDraft(
        path.split("/").pop(),
        state.status,
        path.endsWith("resit-request"),
      );
      value.hasAuthenticityDeclaration = state.authenticity;
      return route.fulfill({ json: value });
    }
    if (path === "/evaluation-appeals/mine")
      return route.fulfill({
        json: [
          {
            id: "appeal",
            evaluationRequestId: "standard-result",
            status: "UnderReview",
            reason: "RAW submitted appeal reason",
            decisionRationale: null,
            createdAtUtc: "2026-10-01T12:00:00Z",
            reviewedAtUtc: null,
            withdrawnAtUtc: null,
          },
        ],
      });
    return route.fulfill(roleShellRuntimeResponse(path, locale, ["Student"]));
  });
  const suffix =
    mode === "resit"
      ? "evaluations/resit-request"
      : mode === "appeals"
        ? "appeals"
        : mode.startsWith("list") || mode === "authorized"
          ? "evaluations"
          : mode.startsWith("resume")
            ? "evaluations/new?resume=standard-draft"
            : "evaluations/new";
  await page.goto(`/${locale}/student/${suffix}`);
  await applyTheme(page, locale, theme);
  return { state, writes, errors };
}
async function applyTheme(page: Page, locale: "en" | "ar", theme: string) {
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
}
async function selectScope(page: Page, locale: "en" | "ar") {
  const scope = (locale === "ar" ? ar : en).studentWorkspace.evaluationWizard
    .scope;
  for (const [label, value] of [
    [scope.qualification, "Q:V1"],
    [scope.grade, "g"],
    [scope.specialization, "s"],
    [scope.unit, "U1"],
    [scope.assessment, "scope-1"],
  ])
    await page
      .getByRole("combobox", { name: label, exact: true })
      .selectOption(value);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      for (const mode of ["new", "resume"]) {
        test(`${locale} ${theme} ${viewport.width} ${mode}: academic scope and saved evidence`, async ({
          page,
        }, info) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: "reduce" });
          const contract = await prepare(page, locale, theme, mode);
          await expect(
            page.getByRole("heading", {
              name: copy.studentWorkspace.evaluationWizard.header.title,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("list", {
              name: copy.studentEvaluationPresentation.preparation,
            }),
          ).toBeVisible();
          expect(
            await page
              .getByRole("heading", { level: 1 })
              .evaluate((e) => getComputedStyle(e).fontWeight),
          ).toBe("700");
          if (mode === "new") {
            await expect(
              page.getByText(
                `03 · ${copy.studentEvaluationPresentation.submissionRoute}`,
                { exact: true },
              ),
            ).toBeVisible();
            await page.screenshot({ path: info.outputPath("new.png") });
            await selectScope(page, locale);
            await expect(
              page.getByText(
                copy.studentWorkspace.evaluationWizard.credit.unavailable,
                { exact: true },
              ),
            ).toBeVisible();
            await page.screenshot({
              path: info.outputPath("academic-selection.png"),
            });
          } else {
            await expect(
              page.getByRole("link", { name: "saved-evidence.pdf" }),
            ).toHaveAttribute(
              "href",
              "/api/v1/evaluations/standard-draft/files/saved-file",
            );
            await expect(
              page.getByRole("textbox", { name: "A.P1", exact: true }),
            ).toHaveValue("RAW saved evidence narrative");
            await page
              .getByRole("textbox", { name: "A.P1", exact: true })
              .fill("UNSAVED evidence مسودة");
            await page.locator("form input[type=file]").setInputFiles({
              name: "additional.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("Synthetic evidence"),
            });
            await page.screenshot({
              path: info.outputPath("resumed-draft.png"),
            });
          }
          await noOverflow(page);
          expect(contract.writes).toEqual([]);
          expect(contract.errors).toEqual([]);
        });
      }
  for (const status of [
    "Completed",
    "NeedsRevision",
    "UnderReview",
    "RAW-UNKNOWN",
    "Draft-resit",
    "Draft-retake",
  ]) {
    test(`${locale} list ${status}: supplied result, branch and feedback`, async ({
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
        "list",
      );
      const branch = status.endsWith("resit")
        ? "resit"
        : status.endsWith("retake")
          ? "retake"
          : "standard";
      contract.state.rows = [
        evaluationRow(
          "current-request",
          status.startsWith("Draft") ? "Draft" : status,
          branch,
        ),
      ];
      // A route navigation requests the new synthetic server snapshot.
      await page.goto(`/${locale}/student/evaluations`);
      await applyTheme(page, locale, locale === "ar" ? "dark" : "light");
      const card = page.getByRole("article").first();
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("region", {
          name: copy.studentEvaluationPresentation.lifecycle,
        }),
      ).toHaveAttribute("data-evaluation-branch", branch);
      if (status === "Completed") {
        await expect(
          card.getByText("NotYetAchieved", { exact: true }).first(),
        ).toBeVisible();
        await expect(card.getByRole("link")).toHaveCount(0);
      }
      if (status === "NeedsRevision") {
        await expect(
          card.getByRole("button", {
            name: copy.studentWorkspace.evaluationRevision.actions.submit,
          }),
        ).toBeDisabled();
        await expect(card.locator("time")).toHaveCount(2);
        await expect(
          card.getByText(
            copy.studentEvaluationPresentation.sameRequestRevision,
          ),
        ).toBeVisible();
      }
      await card.screenshot({ path: info.outputPath("request.png") });
      await noOverflow(page);
      expect(contract.writes).toEqual([]);
      expect(contract.errors).toEqual([]);
    });
  }
  for (const status of [
    "Draft",
    "PendingPayment",
    "UnderReview",
    "Completed",
    "NeedsRevision",
  ]) {
    test(`${locale} Resit ${status}: distinct request with no revision inference`, async ({
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
        "resit",
        status,
      );
      await expect(
        page.getByRole("region", {
          name: copy.studentEvaluationPresentation.lifecycle,
        }),
      ).toHaveAttribute("data-evaluation-branch", "resit");
      await expect(
        page.getByRole("button", {
          name: copy.studentWorkspace.evaluationRevision.actions.submit,
        }),
      ).toHaveCount(0);
      if (status === "Draft")
        await expect(
          page.getByRole("button", {
            name: copy.studentWorkspace.resitWorkflow.detail.payment.continue,
          }),
        ).toBeEnabled();
      await page.screenshot({ path: info.outputPath("resit.png") });
      await noOverflow(page);
      expect(contract.writes).toEqual([]);
      expect(contract.errors).toEqual([]);
    });
  }
  for (const mode of [
    "options-pending",
    "options-error",
    "resume-error",
    "list-pending",
    "list-error",
    "list-empty",
    "authorized",
  ]) {
    test(`${locale} ${mode}: factual loading/error/empty or authorization`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const contract = await prepare(page, locale, "light", mode);
      if (mode === "options-error")
        await expect(
          page.getByText(copy.studentWorkspace.evaluationWizard.errors.options),
        ).toBeVisible({ timeout: 15000 });
      if (mode === "resume-error")
        await expect(
          page.getByText(
            copy.studentWorkspace.evaluationWizard.resume.loadError,
          ),
        ).toBeVisible({ timeout: 15000 });
      if (mode === "list-error")
        await expect(page.getByRole("main").getByRole("alert")).toContainText(
          copy.studentWorkspace.myEvaluations.errors.load,
          { timeout: 15000 },
        );
      if (mode === "list-empty")
        await expect(
          page.getByText(copy.studentEvaluationPresentation.empty),
        ).toBeVisible();
      if (mode === "authorized")
        await expect(
          page.getByRole("button", {
            name: copy.studentWorkspace.resitWorkflow.opportunities.start,
          }),
        ).toBeEnabled();
      if (mode.endsWith("pending"))
        await expect(page.getByRole("status").first()).toBeVisible();
      await page.screenshot({ path: info.outputPath("state.png") });
      expect(contract.writes).toEqual([]);
    });
  }
  for (const included of [false, true]) {
    test(`${locale} scoped ${included ? "included-credit" : "paid-session"}: prepare/upload/declaration/checkout`, async ({
      page,
    }, info) => {
      const contract = await prepare(page, locale, "dark");
      contract.state.included = included;
      await page.setViewportSize(
        locale === "ar"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      );
      await selectScope(page, locale);
      await page.locator("form input[type=file]").setInputFiles({
        name: "initial.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("Synthetic evidence"),
      });
      await page
        .getByRole("button", {
          name: copy.studentWorkspace.evaluationWizard.actions.save,
        })
        .click();
      await expect(
        page.getByRole("textbox", { name: "A.P1", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "A.P1", exact: true })
        .fill("RAW new criterion narrative");
      await page.getByRole("checkbox").check();
      await page.screenshot({ path: info.outputPath("prepared.png") });
      await page
        .getByRole("button", {
          name: included
            ? copy.studentWorkspace.evaluationWizard.actions.included
            : copy.studentWorkspace.evaluationWizard.actions.payment,
          exact: true,
        })
        .click();
      await expect
        .poll(
          () =>
            contract.writes.filter((w) => w.path.endsWith("/checkout")).length,
        )
        .toBe(1);
      expect(
        contract.writes.filter((w) => w.path.endsWith("/files")),
      ).toHaveLength(1);
      const checkout = contract.writes.find((w) =>
        w.path.endsWith("/checkout"),
      )!;
      expect(checkout.body).toEqual({
        paymentMethod: "Card",
        expectIncludedCredit: included,
      });
      expect(checkout.key).toBeTruthy();
      if (included)
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/student/evaluations$`),
        );
      else
        await expect(
          page.getByText(
            copy.studentWorkspace.evaluationWizard.developmentPayment
              .sessionTitle,
            { exact: true },
          ),
        ).toBeVisible();
      await page.screenshot({ path: info.outputPath("checkout-result.png") });
      expect(contract.errors).toEqual([]);
    });
  }
  test(`${locale} revision: cached draft, pending protection and same-request resubmission`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await page.clock.install();
    const contract = await prepare(page, locale, "dark", "list");
    contract.state.rows = [evaluationRow("standard-revision", "NeedsRevision")];
    await page.setViewportSize(
      locale === "ar"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    await page.goto(`/${locale}/student/evaluations`);
    await applyTheme(page, locale, "dark");
    const card = page.getByRole("article").first();
    await card.locator("input[type=file]").setInputFiles({
      name: "revision.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Synthetic revision"),
    });
    await card.getByRole("checkbox").check();
    contract.state.fail = true;
    // Retain the production provider's 30-second staleTime; age the browser
    // clock before a synthetic reconnect rather than changing query options.
    await page.clock.fastForward(31_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      copy.studentWorkspace.myEvaluations.errors.load,
      { timeout: 15000 },
    );
    await expect(card.getByText("revision.pdf", { exact: true })).toBeVisible();
    await expect(card.getByRole("checkbox")).toBeChecked();
    await page.screenshot({ path: info.outputPath("cached-error.png") });
    await page.getByRole("main").getByRole("alert").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("cached-error-notice.png") });
    contract.state.fail = false;
    contract.state.submitPending = true;
    const submit = card.getByRole("button", {
      name: copy.studentWorkspace.evaluationRevision.actions.submit,
    });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect.poll(() => contract.writes.length).toBe(3);
    expect(contract.writes.map((w) => w.path)).toEqual([
      "/evaluations/standard-revision/files",
      "/evaluations/standard-revision/authenticity-declaration",
      "/evaluations/standard-revision/resubmit",
    ]);
    await page.screenshot({ path: info.outputPath("resubmit-pending.png") });
    contract.state.releaseSubmit();
    await expect(page.getByText("UnderReview", { exact: true })).toBeVisible();
    expect(contract.errors).toEqual([]);
  });
  test(`${locale} appeal failure: preserve reason and completed-result selection`, async ({
    page,
  }, info) => {
    const contract = await prepare(
      page,
      locale,
      "light",
      "appeals",
      "Completed",
    );
    await page.setViewportSize(
      locale === "ar"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    await page.getByRole("combobox").selectOption("standard-result");
    await page
      .getByRole("textbox")
      .fill("RAW appeal reason explaining the request");
    await page
      .getByRole("button", {
        name: copy.studentWorkspace.evaluationAppeals.form.submit,
      })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "RAW appeal failure",
    );
    await expect(page.getByRole("textbox")).toHaveValue(
      "RAW appeal reason explaining the request",
    );
    await page.screenshot({ path: info.outputPath("appeal-error.png") });
    expect(contract.writes).toHaveLength(1);
  });
  test(`${locale} resumed Draft refresh failure: retain evidence and file selection`, async ({
    page,
  }, info) => {
    await page.clock.install();
    const contract = await prepare(page, locale, "dark", "resume");
    await page.setViewportSize(
      locale === "ar"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    const evidence = page.getByRole("textbox", { name: "A.P1", exact: true });
    await evidence.fill("UNSAVED evidence مسودة");
    await page.locator("form input[type=file]").setInputFiles({
      name: "unsaved.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Synthetic evidence"),
    });
    contract.state.fail = true;
    await page.clock.fastForward(31_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      copy.studentWorkspace.evaluationWizard.resume.loadError,
      { timeout: 15000 },
    );
    await expect(evidence).toHaveValue("UNSAVED evidence مسودة");
    await expect(page.getByText("unsaved.pdf", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("cached-draft-error.png") });
    await page.getByRole("main").getByRole("alert").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("cached-draft-error-notice.png"),
    });
    expect(contract.writes).toEqual([]);
  });
  test(`${locale} checkout failure: preserve current request and show factual error`, async ({
    page,
  }, info) => {
    const contract = await prepare(page, locale, "light", "resume");
    await page.setViewportSize(
      locale === "ar"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    contract.state.fail = true;
    await page
      .getByRole("button", {
        name: copy.studentWorkspace.evaluationWizard.actions.payment,
        exact: true,
      })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      copy.studentWorkspace.evaluationWizard.errors.checkout,
    );
    expect(
      contract.writes.filter((w) => w.path === "/evaluations/scoped"),
    ).toHaveLength(0);
    expect(
      contract.writes.filter((w) => w.path.endsWith("/checkout")),
    ).toHaveLength(1);
    await page.screenshot({ path: info.outputPath("checkout-error.png") });
  });
  test(`${locale} reflow and keyboard: native preparation controls`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const contract = await prepare(page, locale, "dark");
    const select = page.getByRole("combobox", {
      name: copy.studentWorkspace.evaluationWizard.scope.qualification,
      exact: true,
    });
    await select.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(select).toBeFocused();
    expect(
      await select.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("reflow-focus.png") });
    expect(contract.writes).toEqual([]);
  });
}
