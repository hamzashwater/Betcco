import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  incidents,
  incidentStatuses,
  incidentSeverities,
  assessment,
  deadlines,
  longSummary,
  longLegal,
  longClosure,
  type FixtureIncident,
} from "../fixtures/security-incident-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE. Canned HTTP responses exercise the real route.
// No persistence, authorization, legal compliance or external notification proof.
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
type Mode = "success" | "pending" | "error";
type Operation = "create" | "review" | "record" | "selected" | "queue" | "csrf";
const shortRows = (): FixtureIncident[] =>
  structuredClone(incidents).map((r, i) => ({
    ...r,
    summary: `RAW saved summary ${i} · ملخص محفوظ من الخادم`,
    closureSummary: r.closureSummary ? "RAW saved closure · إغلاق محفوظ" : null,
    breachAssessment: r.breachAssessment
      ? {
          ...r.breachAssessment,
          legalDecisionSummary: r.breachAssessment.legalDecisionSummary
            ? `RAW recorded human decision ${i} · قرار بشري مسجل`
            : null,
        }
      : null,
  }));
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const state = {
    read: "data",
    long: false,
    rows: shortRows(),
    modes: {
      create: "success",
      review: "success",
      record: "success",
      selected: "success",
      queue: "success",
      csrf: "success",
    } as Record<Operation, Mode>,
    response: structuredClone(shortRows()[1]),
    error: "SECURITY_INCIDENT_TRANSITION_INVALID",
  };
  const reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  const gates: Partial<Record<Operation, () => void>> = {};
  async function gate(operation: Operation) {
    if (state.modes[operation] === "pending")
      await new Promise<void>((resolve) => {
        gates[operation] = resolve;
      });
  }
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
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\/v1/, ""),
      method = request.method();
    if (path === "/security/antiforgery") {
      await gate("csrf");
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    }
    if (path === "/security-incidents" && method === "GET") {
      reads.push(path + url.search);
      expect(url.searchParams.get("pageSize")).toBe("50");
      expect([...url.searchParams.keys()]).toEqual(
        url.searchParams.has("status") ? ["pageSize", "status"] : ["pageSize"],
      );
      await gate("queue");
      if (state.modes.queue === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic incident query failure" },
        });
      const pool = state.long
        ? Array.from({ length: 50 }, (_, i) => ({
            ...state.rows[i % 8],
            id: `00000000-0000-4000-9000-${String(900 - i).padStart(12, "0")}`,
          }))
        : state.rows;
      const items =
        state.read === "empty"
          ? []
          : url.searchParams.has("status")
            ? pool.filter((r) => r.status === url.searchParams.get("status"))
            : pool;
      return route.fulfill({
        json: {
          items,
          page: 1,
          pageSize: 50,
          totalCount:
            state.read === "empty"
              ? 0
              : url.searchParams.has("status")
                ? 129
                : 843,
        },
      });
    }
    if (
      /^\/security-incidents\/[0-9a-f-]{36}$/.test(path) &&
      method === "GET"
    ) {
      reads.push(path);
      await gate("selected");
      if (state.modes.selected === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic selected incident refresh failure" },
        });
      return route.fulfill({ json: state.response });
    }
    if (path.startsWith("/security-incidents") && method !== "GET") {
      const operation =
        path === "/security-incidents" && method === "POST"
          ? "create"
          : /^\/security-incidents\/[0-9a-f-]{36}$/.test(path) &&
              method === "PUT"
            ? "review"
            : /^\/security-incidents\/[0-9a-f-]{36}\/notification-deadlines\/[0-9a-f-]{36}\/record$/.test(
                  path,
                ) && method === "POST"
              ? "record"
              : undefined;
      if (operation) {
        const body: unknown = request.postDataJSON();
        writes.push({ path, method, body });
        expect(Object.keys(body as object)).toEqual(
          operation === "create"
            ? [
                "title",
                "summary",
                "reasonCode",
                "severity",
                "potentialPersonalDataImpact",
              ]
            : operation === "review"
              ? [
                  "status",
                  "potentialPersonalDataImpact",
                  "legalNotificationRequired",
                  "markLegalConfirmation",
                  "legalDecisionSummary",
                  "closureSummary",
                  "reasonCode",
                ]
              : ["note"],
        );
        await gate(operation);
        if (state.modes[operation] === "error")
          return route.fulfill({ status: 409, json: { message: state.error } });
        return operation === "record"
          ? route.fulfill({ status: 204 })
          : route.fulfill({ json: state.response });
      }
    }
    if (path.startsWith("/security-incidents")) {
      unexpected.push(method + " " + path);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic incident request" },
      });
    }
    if (method !== "GET") unexpected.push(method + " " + path);
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/security-incidents`);
  return {
    state,
    reads,
    writes,
    unexpected,
    errors,
    gatePending: (operation: Operation) => Boolean(gates[operation]),
    release: async (operation: Operation) => {
      await expect.poll(() => Boolean(gates[operation])).toBe(true);
      gates[operation]!();
      delete gates[operation];
    },
  };
}
async function observeMutation(
  page: Page,
  context: Awaited<ReturnType<typeof prepare>>,
  method: "POST" | "PUT",
  path: string,
  action: () => Promise<unknown>,
) {
  // Register before the action. React mutation pending is earlier than dispatch,
  // particularly while api() awaits the existing antiforgery handshake.
  const [request] = await Promise.all([
    page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === method &&
        url.pathname === `/api/v1${path}` &&
        url.search === ""
      );
    }),
    action(),
  ]);
  const actual = {
    path,
    method: request.method(),
    body: request.postDataJSON() as unknown,
  };
  await expect.poll(() => context.writes.at(-1)).toEqual(actual);
  return actual;
}
test("isolated EN long queue: exact 50 rows, server order and final-row selection", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const c = await prepare(page, "en", "light"),
    t = en.adminWorkspace.securityIncidents,
    queue = page.getByRole("region", { name: t.incidents, exact: true }),
    rows = queue.getByRole("button"),
    start = performance.now();
  await expect(rows).toHaveCount(8);
  c.state.long = true;
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/security-incidents" &&
      url.search === "?pageSize=50"
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const navigationMs = performance.now() - start,
    response = await responsePromise,
    body = (await response.json()) as {
      items: FixtureIncident[];
      totalCount: number;
    };
  expect(response.status()).toBe(200);
  expect(body.items).toHaveLength(50);
  expect(new Set(body.items.map((r) => r.id)).size).toBe(50);
  expect(body.totalCount).toBe(843);
  await expect(rows).toHaveCount(50);
  expect(await rows.locator('[class*="rowTitle"]').allTextContents()).toEqual(
    body.items.map((r) => r.title),
  );
  const renderMs = performance.now() - start;
  await rows.nth(49).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(49)).toHaveAttribute("aria-pressed", "true");
  await expect(queue.locator('button[aria-pressed="true"]')).toHaveCount(1);
  expect(
    await rows.nth(49).evaluate((node) => {
      const b = node.getBoundingClientRect();
      return b.top < innerHeight && b.bottom > 0;
    }),
  ).toBe(true);
  expect(c.reads).toEqual([
    "/security-incidents?pageSize=50",
    "/security-incidents?pageSize=50",
  ]);
  expect(c.errors).toEqual([]);
  expect(c.unexpected).toEqual([]);
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(
    info.outputPath("isolation.json"),
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        navigationMs,
        renderMs,
        completeMs: performance.now() - start,
        rowCount: await rows.count(),
        uniqueIds: 50,
        selectedId: body.items[49].id,
        reads: c.reads,
        writes: c.writes,
      },
      null,
      2,
    ),
  );
});
test("isolated AR deadline record: pending before dispatch and exact pre-registered POST", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const c = await prepare(page, "ar", "dark"),
    t = ar.adminWorkspace.securityIncidents,
    queue = page.getByRole("region", { name: t.incidents, exact: true });
  await expect(queue.getByRole("button")).toHaveCount(8);
  const incident = c.state.rows[5],
    deadline = incident.breachAssessment!.notificationDeadlines[0];
  expect(incident.status).not.toBe("Closed");
  expect(incident.breachAssessment!.legalConfirmedAtUtc).toBeTruthy();
  expect(incident.breachAssessment!.legalNotificationRequired).toBe(true);
  expect(deadline.recordedAtUtc).toBeNull();
  await queue.getByRole("button").filter({ hasText: incident.title }).click();
  const detail = page.getByRole("complementary", { name: t.incidentWorkspace }),
    row = detail.getByRole("article", { name: t.affectedIndividuals }),
    note = row.getByRole("textbox", { name: t.externalActionNote }),
    button = row.getByRole("button");
  await expect(button).toHaveText(t.record);
  await note.fill("  RAW external action note · سجل إجراء خارجي  ");
  await expect(button).toBeEnabled();
  c.state.modes.csrf = "pending";
  c.state.modes.record = "pending";
  c.state.response = {
    ...incident,
    breachAssessment: assessment({
      ...incident.breachAssessment!,
      notificationDeadlines:
        incident.breachAssessment!.notificationDeadlines.map((d) => ({
          ...d,
          recordedAtUtc: d.id === deadline.id ? "2026-10-11T11:30:00Z" : null,
        })),
    }),
  };
  const path = `/security-incidents/${incident.id}/notification-deadlines/${deadline.id}/record`;
  let pendingBeforeDispatch:
    { writes: typeof c.writes; note: string; csrfAwaited: boolean } | undefined;
  const actual = await observeMutation(page, c, "POST", path, async () => {
    await button.click();
    await expect(button).toBeDisabled();
    await expect.poll(() => c.gatePending("csrf")).toBe(true);
    // Deterministic reproduction: pending UI exists before any POST can be sent.
    expect(c.writes).toEqual([]);
    pendingBeforeDispatch = {
      writes: [...c.writes],
      note: await note.inputValue(),
      csrfAwaited: c.gatePending("csrf"),
    };
    c.state.modes.csrf = "success";
    await c.release("csrf");
  });
  expect(actual).toEqual({
    path,
    method: "POST",
    body: { note: "RAW external action note · سجل إجراء خارجي" },
  });
  await expect(button).toBeDisabled();
  c.state.modes.record = "success";
  await c.release("record");
  await expect(row.getByText(t.actionRecorded, { exact: false })).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect
    .poll(() => c.reads.slice(-2))
    .toEqual([
      `/security-incidents/${incident.id}`,
      "/security-incidents?pageSize=50",
    ]);
  expect(c.errors).toEqual([]);
  expect(c.unexpected).toEqual([]);
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(
    info.outputPath("isolation.json"),
    JSON.stringify(
      {
        classification: "MOCKED UI-CONTRACT EVIDENCE",
        locale: "ar",
        selectedIncidentId: incident.id,
        deadlineId: deadline.id,
        fixture: {
          status: incident.status,
          legalConfirmedAtUtc: incident.breachAssessment!.legalConfirmedAtUtc,
          legalNotificationRequired:
            incident.breachAssessment!.legalNotificationRequired,
          recordedAtUtc: deadline.recordedAtUtc,
        },
        pendingBeforeDispatch,
        actual,
        reads: c.reads,
        writes: c.writes,
      },
      null,
      2,
    ),
  );
});
for (const locale of ["en", "ar"] as const)
  test(`${locale}: recovery diagnosis of rendered select semantics`, async ({
    page,
  }, info) => {
    const c = await prepare(page, locale, "light"),
      t = (locale === "en" ? en : ar).adminWorkspace.securityIncidents;
    const queue = page.getByRole("region", { name: t.incidents, exact: true });
    await expect(queue.getByRole("button")).toHaveCount(8);
    await page
      .getByRole("button", { name: t.logIncident, exact: true })
      .click();
    const form = page.getByRole("form", {
        name: t.createWorkbench,
        exact: true,
      }),
      severity = form.getByRole("combobox", { name: t.severity, exact: true });
    await expect(form).toBeVisible();
    await expect(severity).toHaveCount(1);
    await expect(severity).toBeEnabled();
    await expect(severity).toHaveValue("Medium");
    const dom = await severity.evaluate((node) => {
      const select = node as HTMLSelectElement;
      return {
        tag: select.tagName,
        id: select.id,
        explicitRole: select.getAttribute("role"),
        disabled: select.disabled,
        value: select.value,
        labels: Array.from(select.labels ?? []).map((label) => ({
          text: label.textContent,
          htmlFor: label.htmlFor,
          controlsSelect: label.control === select,
          containsSelect: label.contains(select),
          outerHTML: label.outerHTML,
        })),
        options: Array.from(select.options).map((o) => ({
          value: o.value,
          label: o.label,
          selected: o.selected,
        })),
      };
    });
    expect(dom.labels).toHaveLength(1);
    expect(dom.labels[0].controlsSelect).toBe(true);
    expect(dom.labels[0].containsSelect).toBe(true);
    const originalLabelCount = await form
        .getByLabel(t.severity, { exact: true })
        .count(),
      severityAria = await severity.ariaSnapshot();
    for (const value of incidentSeverities) {
      await severity.selectOption(value);
      await expect(severity).toHaveValue(value);
    }
    expect(c.writes).toEqual([]);
    await queue
      .getByRole("button")
      .filter({ hasText: "RAW Incident 0" })
      .click();
    const detail = page.getByRole("complementary", {
        name: t.incidentWorkspace,
      }),
      reviewStatus = detail.getByRole("combobox", {
        name: t.status,
        exact: true,
      });
    await expect(reviewStatus).toHaveValue("Assessing");
    await reviewStatus.selectOption("Closed");
    const closureControl = detail.getByRole("textbox", {
      name: t.closureSummary,
      exact: true,
    });
    await closureControl.fill("  RAW closure draft  ");
    await expect(closureControl).toHaveValue("  RAW closure draft  ");
    const closureDom = await closureControl.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      return {
        value: textarea.value,
        textContent: textarea.textContent,
        labels: Array.from(textarea.labels ?? []).map((label) => ({
          text: label.textContent,
          controlsTextarea: label.control === textarea,
        })),
      };
    });
    mkdirSync(info.outputDir, { recursive: true });
    writeFileSync(
      info.outputPath("semantics.json"),
      JSON.stringify(
        {
          classification: "MOCKED UI-CONTRACT EVIDENCE",
          locale,
          formMounted: await form.count(),
          dom,
          originalLabelCount,
          severityAria,
          reviewStatusLabelCount: await detail
            .getByLabel(t.status, { exact: true })
            .count(),
          reviewStatusAria: await reviewStatus.ariaSnapshot(),
          closureDom,
          closureLabelCount: await detail
            .getByLabel(t.closureSummary, { exact: true })
            .count(),
          closureAria: await closureControl.ariaSnapshot(),
          reads: c.reads,
          writes: c.writes,
          pageErrors: c.errors,
          unexpected: c.unexpected,
        },
        null,
        2,
      ),
    );
  });
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      test(`${locale} ${theme} ${viewport.width}: Security incident governance workspace`, async ({
        page,
      }, info) => {
        test.setTimeout(240_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          copy = locale === "en" ? en : ar,
          t = copy.adminWorkspace.securityIncidents;
        const queue = page.getByRole("region", {
            name: t.incidents,
            exact: true,
          }),
          detail = page.getByRole("complementary", {
            name: t.incidentWorkspace,
          }),
          rows = queue.getByRole("button"),
          filter = queue.getByRole("combobox"),
          status = detail.getByRole("combobox", {
            name: t.status,
            exact: true,
          }),
          reason = detail.getByLabel(t.reviewReasonCode, { exact: true }),
          impact = detail.getByLabel(t.thereMayBePersonaldataImpact),
          trigger = detail.getByLabel(
            t.theAuthorisedLegalReviewerDeterminedThatTheArticle20NotificationT,
          ),
          legal = detail.getByLabel(t.article20TriggerassessmentReason),
          confirmation = detail.getByLabel(
            t.iRecordTheAuthorisedLegalReviewDecisionOnTheArticle20Notification,
          ),
          closure = detail.getByRole("textbox", {
            name: t.closureSummary,
            exact: true,
          }),
          reviewForm = detail.getByRole("form", { name: t.reviewDraft }),
          save = reviewForm.locator('button[type="submit"]'),
          create = page.getByRole("region", { name: t.createWorkbench }),
          createSeverity = create.getByRole("combobox", {
            name: t.severity,
            exact: true,
          }),
          createSubmit = create.locator('button[type="submit"]');
        const captures: string[] = [],
          captureBounds: {
            name: string;
            x: number;
            y: number;
            width: number;
            height: number;
            detail: {
              x: number;
              y: number;
              width: number;
              height: number;
            } | null;
          }[] = [];
        async function themeCheck() {
          const toggle = page.getByRole("button", {
            name: copy.navigation.theme.toggle,
          });
          if (!(await page.locator("html").getAttribute("data-theme")))
            await toggle.click();
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await toggle.click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
        }
        async function ready(count = 8) {
          await expect(rows).toHaveCount(count);
          await themeCheck();
        }
        async function capture(name: string) {
          await themeCheck();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBe(true);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          const b = await page
            .getByRole("heading", {
              name: t.securityIncidentRegister,
              exact: true,
            })
            .locator("xpath=ancestor::section[1]")
            .boundingBox();
          expect(b).not.toBeNull();
          captureBounds.push({
            name,
            ...b!,
            detail: await detail.boundingBox(),
          });
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            fullPage: true,
          });
          captures.push(name);
        }
        async function reload() {
          c.state.read = "data";
          c.state.long = false;
          c.state.rows = shortRows();
          for (const k of Object.keys(c.state.modes) as Operation[])
            c.state.modes[k] = "success";
          await page.reload({ waitUntil: "domcontentloaded" });
          await ready();
        }
        async function select(i: number) {
          await rows.nth(i).click();
          await expect(rows.nth(i)).toHaveAttribute("aria-pressed", "true");
          await expect(
            detail.getByRole("heading", {
              name: c.state.rows[i].title,
              exact: true,
            }),
          ).toBeVisible();
        }
        async function legalLocked() {
          for (const control of [impact, trigger, legal, confirmation])
            await expect(control).toBeDisabled();
        }
        await ready();
        expect(c.reads).toEqual(["/security-incidents?pageSize=50"]);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        expect(
          await filter
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => (o as HTMLOptionElement).value),
            ),
        ).toEqual(["", ...incidentStatuses]);
        await expect(
          queue.getByText(t.matchingTotal.replace("{count}", "843")),
        ).toBeVisible();
        expect(
          await rows.locator('[class*="rowTitle"]').allTextContents(),
        ).toEqual(c.state.rows.map((r) => r.title));
        await capture("01-populated-register-create-closed");
        c.state.long = true;
        const longResponse = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/v1/security-incidents" &&
            new URL(response.url()).search === "?pageSize=50",
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        expect((await longResponse).status()).toBe(200);
        await ready(50);
        await capture("02-long-queue-page-50");
        await rows.nth(49).focus();
        await page.keyboard.press("Enter");
        await expect(rows.nth(49)).toHaveAttribute("aria-pressed", "true");
        await capture("03-long-queue-bottom-keyboard-selected");
        await reload();
        for (const s of incidentStatuses) {
          await filter.selectOption(s);
          await ready(2);
          expect(c.reads.at(-1)).toBe(
            `/security-incidents?pageSize=50&status=${s}`,
          );
          await capture(`04-filter-${s}`);
        }
        c.state.read = "empty";
        await filter.selectOption("");
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(
          queue.getByText(t.thereAreNoIncidentsInThisStatus),
        ).toBeVisible();
        await capture("05-successful-empty");
        c.state.modes.queue = "pending";
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(queue.getByRole("status")).toHaveText(t.loadingIncidents);
        await expect(rows).toHaveCount(0);
        await capture("06-initial-loading");
        c.state.modes.queue = "error";
        await c.release("queue");
        await expect(queue.getByRole("alert")).toHaveText(
          "Synthetic incident query failure",
        );
        await expect(
          queue.getByText(t.thereAreNoIncidentsInThisStatus),
        ).toHaveCount(0);
        await capture("07-cold-query-error");
        await reload();
        await page
          .getByRole("button", { name: t.logIncident, exact: true })
          .click();
        await expect(
          create.getByLabel(t.reasonCode, { exact: true }),
        ).toHaveValue("SECURITY_REVIEW");
        await expect(createSeverity).toHaveValue("Medium");
        expect(
          await createSeverity
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => (o as HTMLOptionElement).value),
            ),
        ).toEqual(incidentSeverities);
        await capture("08-create-open-defaults");
        await createSubmit.click();
        expect(c.writes).toEqual([]);
        await expect(create.getByLabel(t.incidentTitle)).toBeFocused();
        await capture("09-create-native-invalid");
        await create.getByLabel(t.incidentTitle).fill("  RAW new incident  ");
        await create
          .getByLabel(t.reasonCode, { exact: true })
          .fill("  RAW_CREATE_REASON  ");
        await create
          .getByLabel(t.conciseOperationalSummary)
          .fill("  RAW create draft · مسودة إدخال  ");
        await create.getByLabel(t.theIncidentMayAffectPersonalData).check();
        for (const severity of incidentSeverities) {
          await createSeverity.selectOption(severity);
          await capture(`10-create-severity-${severity}`);
        }
        c.state.modes.create = "pending";
        const createRequest = await observeMutation(
          page,
          c,
          "POST",
          "/security-incidents",
          () => createSubmit.click(),
        );
        await expect(createSubmit).toBeDisabled();
        await expect(createSubmit).toHaveAttribute("aria-busy", "true");
        await capture("11-create-pending");
        expect(createRequest).toEqual({
          path: "/security-incidents",
          method: "POST",
          body: {
            title: "RAW new incident",
            summary: "RAW create draft · مسودة إدخال",
            reasonCode: "RAW_CREATE_REASON",
            severity: "Critical",
            potentialPersonalDataImpact: true,
          },
        });
        c.state.modes.create = "error";
        c.state.error = "Synthetic create conflict";
        await c.release("create");
        await expect(create.getByRole("alert")).toHaveText(c.state.error);
        await expect(create.getByLabel(t.incidentTitle)).toHaveValue(
          "  RAW new incident  ",
        );
        await capture("12-create-error-draft-retained");
        c.state.modes.create = "success";
        c.state.response = {
          ...shortRows()[0],
          title: "RAW SERVER CREATED INCIDENT",
          severity: "Critical",
          breachAssessment: assessment({ potentialPersonalDataImpact: true }),
        };
        await observeMutation(page, c, "POST", "/security-incidents", () =>
          createSubmit.click(),
        );
        await expect(createSubmit).toHaveCount(0);
        await expect(
          detail.getByRole("heading", { name: c.state.response.title }),
        ).toBeVisible();
        await expect(create.getByRole("status")).toHaveText(t.incidentCreated);
        await capture("13-create-success-server-facts");
        await page
          .getByRole("button", { name: t.logIncident, exact: true })
          .click();
        await expect(create.getByLabel(t.incidentTitle)).toHaveValue("");
        await expect(
          create.getByLabel(t.reasonCode, { exact: true }),
        ).toHaveValue("SECURITY_REVIEW");
        await expect(
          create.getByLabel(t.theIncidentMayAffectPersonalData),
        ).not.toBeChecked();
        await expect(createSeverity).toHaveValue("Critical");
        await capture("14-create-reset-preserved-severity");
        await page
          .getByRole("button", { name: t.hideForm, exact: true })
          .click();
        for (let i = 0; i < 4; i++) {
          await select(i);
          if (i === 0) await expect(status).toHaveValue("Assessing");
          if (i === 3) {
            await legalLocked();
            await expect(status).toBeDisabled();
            await expect(save).toHaveCount(0);
            await expect(
              detail.getByRole("button", { name: t.record, exact: true }),
            ).toHaveCount(0);
          }
          await capture(
            `15-saved-${incidentStatuses[i]}-${incidentSeverities[i]}`,
          );
        }
        await select(0);
        await expect(impact).not.toBeChecked();
        await expect(trigger).toBeDisabled();
        await expect(closure).toHaveCount(0);
        await capture("16-no-impact-review-draft");
        await impact.check();
        await expect(trigger).toBeEnabled();
        await expect(trigger).not.toBeChecked();
        await expect(detail.locator("article")).toHaveCount(0);
        await capture("17-impact-no-inferred-trigger-no-deadlines");
        await trigger.check();
        await legal.fill("  RAW human-entered legal reason · قرار بشري  ");
        await capture("18-positive-trigger-reason-draft");
        await confirmation.check();
        await capture("19-human-legal-confirmation-draft-no-deadlines");
        await trigger.uncheck();
        await capture("20-negative-trigger-human-draft");
        c.state.modes.review = "pending";
        const reviewRequest = await observeMutation(
          page,
          c,
          "PUT",
          `/security-incidents/${incidents[0].id}`,
          () => save.click(),
        );
        await expect(save).toBeDisabled();
        await capture("21-review-pending");
        expect(reviewRequest).toEqual({
          path: `/security-incidents/${incidents[0].id}`,
          method: "PUT",
          body: {
            status: "Assessing",
            potentialPersonalDataImpact: true,
            legalNotificationRequired: false,
            markLegalConfirmation: true,
            legalDecisionSummary: "RAW human-entered legal reason · قرار بشري",
            closureSummary: null,
            reasonCode: "RAW_REASON_0",
          },
        });
        c.state.modes.review = "error";
        c.state.error = "LEGAL_DECISION_REASON_REQUIRED";
        await c.release("review");
        await expect(detail.getByRole("alert")).toHaveText(c.state.error);
        await expect(legal).toHaveValue(
          "  RAW human-entered legal reason · قرار بشري  ",
        );
        await expect(confirmation).toBeChecked();
        await capture("22-review-error-drafts-retained");
        await select(4);
        await legalLocked();
        await expect(
          detail.getByText(t.recordedTriggerDoesNotApply),
        ).toBeVisible();
        await expect(detail.locator("article")).toHaveCount(0);
        await expect(
          detail.getByText(t.authorizedUser, { exact: false }),
        ).toBeVisible();
        await capture("23-recorded-negative-trigger-immutable");
        await select(2);
        await legalLocked();
        await expect(detail.locator("article")).toHaveCount(2);
        await expect(
          detail.getByText("RAW-LEGAL-USER", { exact: false }),
        ).toBeVisible();
        await capture("24-recorded-positive-trigger-one-recorded");
        await page
          .getByRole("button", { name: t.logIncident, exact: true })
          .click();
        await create.getByLabel(t.theIncidentMayAffectPersonalData).check();
        await legalLocked();
        await expect(impact).toBeChecked();
        await expect(trigger).toBeChecked();
        await capture("25-create-review-impact-isolation");
        await page
          .getByRole("button", { name: t.hideForm, exact: true })
          .click();
        await select(5);
        const ledger = detail.getByRole("region", {
            name: t.reminderDeadlines,
          }),
          individuals = detail.getByRole("article", {
            name: t.affectedIndividuals,
          }),
          regulator = detail.getByRole("article", {
            name: t.regulatoryAuthority,
          }),
          note = individuals.getByLabel(t.externalActionNote),
          record = individuals.getByRole("button");
        await expect(individuals).toHaveAttribute(
          "data-audience",
          "AffectedIndividuals",
        );
        await expect(regulator).toHaveAttribute(
          "data-audience",
          "RegulatoryAuthority",
        );
        await expect(note).toHaveAttribute("maxlength", "1000");
        await expect(record).toBeDisabled();
        await capture("26-two-server-deadlines-unrecorded");
        await note.fill("   ");
        await expect(record).toBeDisabled();
        await capture("27-whitespace-deadline-note-blocked");
        await note.fill("  RAW external action note · سجل إجراء خارجي  ");
        await expect(record).toBeEnabled();
        await capture("28-valid-deadline-note");
        c.state.modes.record = "pending";
        const recordPath = `/security-incidents/${incidents[5].id}/notification-deadlines/${deadlines[0].id}/record`;
        const recordRequest = await observeMutation(
          page,
          c,
          "POST",
          recordPath,
          () => record.click(),
        );
        await expect(record).toBeDisabled();
        await expect(regulator.getByRole("button")).toBeDisabled();
        await capture("29-deadline-record-pending");
        expect(recordRequest).toEqual({
          path: `/security-incidents/${incidents[5].id}/notification-deadlines/${deadlines[0].id}/record`,
          method: "POST",
          body: { note: "RAW external action note · سجل إجراء خارجي" },
        });
        c.state.modes.record = "error";
        c.state.error = "Synthetic deadline conflict";
        await c.release("record");
        await expect(ledger.getByRole("alert")).toHaveText(c.state.error);
        await expect(note).toHaveValue(
          "  RAW external action note · سجل إجراء خارجي  ",
        );
        await capture("30-deadline-error-note-retained");
        c.state.modes.record = "success";
        c.state.modes.selected = "pending";
        await observeMutation(page, c, "POST", recordPath, () =>
          record.click(),
        );
        await expect(
          ledger.getByRole("status").filter({ hasText: t.refreshingSelected }),
        ).toBeVisible();
        await expect(record).toBeDisabled();
        await expect(
          individuals.getByText(t.actionRecorded, { exact: false }),
        ).toHaveCount(0);
        await capture("31-post-accepted-selected-get-pending");
        c.state.modes.selected = "error";
        await c.release("selected");
        await expect(ledger.getByRole("alert")).toContainText(
          "Synthetic selected incident refresh failure",
        );
        await expect(note).toHaveValue(
          "  RAW external action note · سجل إجراء خارجي  ",
        );
        await expect(record).toBeDisabled();
        await capture("32-post-accepted-selected-get-error");
        const beforeRetryWrites = c.writes.length;
        c.state.response = {
          ...shortRows()[5],
          breachAssessment: assessment({
            ...shortRows()[5].breachAssessment!,
            notificationDeadlines: deadlines.map((d, i) => ({
              ...d,
              recordedAtUtc: i === 0 ? "2026-10-11T11:30:00Z" : null,
            })),
          }),
        };
        c.state.modes.selected = "success";
        await ledger
          .getByRole("button", { name: t.retrySelectedRefresh })
          .click();
        await expect(
          individuals.getByText(t.actionRecorded, { exact: false }),
        ).toBeVisible();
        expect(c.writes.length).toBe(beforeRetryWrites);
        await expect(note).toHaveCount(0);
        await expect(regulator.getByRole("button")).toBeDisabled();
        await capture("33-bounded-get-only-retry-one-recorded");
        c.state.response = {
          ...c.state.response,
          breachAssessment: assessment({
            ...c.state.response.breachAssessment!,
            notificationDeadlines: deadlines.map((d) => ({
              ...d,
              recordedAtUtc: "2026-10-12T12:30:00Z",
            })),
          }),
        };
        await regulator
          .getByLabel(t.externalActionNote)
          .fill("Second external action");
        await observeMutation(
          page,
          c,
          "POST",
          `/security-incidents/${incidents[5].id}/notification-deadlines/${deadlines[1].id}/record`,
          () => regulator.getByRole("button").click(),
        );
        await expect(
          individuals.getByText(t.actionRecorded, { exact: false }),
        ).toBeVisible();
        await expect(
          regulator.getByText(t.actionRecorded, { exact: false }),
        ).toBeVisible();
        await expect(ledger.getByRole("button")).toHaveCount(0);
        await capture("34-both-recorded-server-facts");
        await select(1);
        await status.selectOption("Closed");
        await expect(closure).toHaveAttribute("maxlength", "2000");
        await closure.fill("  RAW closure draft  ");
        await capture("35-closure-draft-human-request");
        c.state.modes.review = "error";
        c.state.error = "LEGAL_CONFIRMATION_REQUIRED_BEFORE_CLOSURE";
        await observeMutation(
          page,
          c,
          "PUT",
          `/security-incidents/${incidents[1].id}`,
          () => save.click(),
        );
        await expect(reviewForm.getByRole("alert")).toHaveText(c.state.error);
        await expect(closure).toHaveValue("  RAW closure draft  ");
        await capture("36-closure-legal-confirmation-conflict");
        await select(5);
        await status.selectOption("Closed");
        await closure.fill("Unsent external records are not closure proof");
        c.state.error = "NOTIFICATION_RECORDS_REQUIRED_BEFORE_CLOSURE";
        await observeMutation(
          page,
          c,
          "PUT",
          `/security-incidents/${incidents[5].id}`,
          () => save.click(),
        );
        await expect(reviewForm.getByRole("alert")).toHaveText(c.state.error);
        await capture("37-closure-deadline-record-conflict");
        await select(1);
        await status.selectOption("Contained");
        await reason.fill("  RAW_REVIEW_REASON  ");
        c.state.modes.review = "success";
        c.state.modes.queue = "pending";
        c.state.response = {
          ...shortRows()[1],
          status: "Contained",
          containedAtUtc: "2026-10-11T13:45:00Z",
          reasonCode: "RAW_SERVER_REVIEW_REASON",
        };
        await observeMutation(
          page,
          c,
          "PUT",
          `/security-incidents/${incidents[1].id}`,
          () => save.click(),
        );
        await expect(reviewForm.getByRole("status")).toHaveText(t.reviewSaved);
        await expect(reason).toHaveValue("RAW_SERVER_REVIEW_REASON");
        const containedFact = detail
          .getByRole("term")
          .filter({ hasText: t.containedOn });
        await expect(containedFact).toHaveText(t.containedOn);
        await expect(
          containedFact.locator("..").getByRole("definition"),
        ).toHaveText(
          await page.evaluate(
            ({ locale, value }) =>
              new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(value)),
            { locale, value: c.state.response.containedAtUtc! },
          ),
        );
        await capture("38-review-success-server-contained-time");
        await status.selectOption("Closed");
        await closure.fill("RAW unsaved closure survives refresh failure");
        await legal.fill("RAW unsaved legal review survives refresh failure");
        c.state.modes.queue = "error";
        await c.release("queue");
        await expect(queue.getByRole("alert")).toHaveText(
          "Synthetic incident query failure",
        );
        await ready();
        await expect(closure).toHaveValue(
          "RAW unsaved closure survives refresh failure",
        );
        await expect(legal).toHaveValue(
          "RAW unsaved legal review survives refresh failure",
        );
        await expect(save).toBeEnabled();
        await capture("39-real-cached-queue-error-drafts-retained");
        await select(3);
        await legalLocked();
        await expect(save).toHaveCount(0);
        await expect(detail.getByRole("button")).toHaveCount(0);
        await capture("40-final-closed-no-actions");
        await reload();
        c.state.rows[3] = {
          ...structuredClone(incidents[3]),
          summary: longSummary,
          closureSummary: longClosure,
          breachAssessment: assessment({
            ...incidents[3].breachAssessment!,
            legalDecisionSummary: longLegal,
          }),
        };
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready();
        await select(3);
        await capture("41-long-bilingual-saved-summary-legal-closure");
        await reload();
        await filter.focus();
        await page.keyboard.press("Tab");
        await expect(rows.nth(0)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
        await expect(rows.nth(0).getByText(t.selectedIncident)).toBeVisible();
        expect(
          await rows.nth(0).evaluate((n) => getComputedStyle(n).outlineStyle),
        ).toBe("solid");
        await capture("42-keyboard-queue-selection-focus");
        await status.focus();
        await page.keyboard.press("Tab");
        await expect(reason).toBeFocused();
        await capture("43-keyboard-review-reason-focus");
        await page
          .getByRole("button", { name: t.logIncident, exact: true })
          .focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await expect(create.getByLabel(t.incidentTitle)).toBeFocused();
        await capture("44-keyboard-create-title-focus");
        await page
          .getByRole("button", { name: t.hideForm, exact: true })
          .click();
        await select(5);
        await note.focus();
        await page.keyboard.type("Keyboard external record draft");
        await page.keyboard.press("Tab");
        await expect(record).toBeFocused();
        expect(
          await record.evaluate((n) => getComputedStyle(n).outlineWidth),
        ).toBe("3px");
        await capture("45-keyboard-deadline-action-focus");
        const targetHeights = await page
          .locator(
            'section[class*="workspace"] :is(button, select, input:not([type="checkbox"]), textarea)',
          )
          .evaluateAll((nodes) =>
            nodes
              .filter((n) => n.getClientRects().length)
              .map((n) => Math.round(n.getBoundingClientRect().height)),
          );
        expect(targetHeights.every((height) => height >= 44)).toBe(true);
        await page.setViewportSize({
          width: Math.max(320, Math.round(viewport.width / 2)),
          height: viewport.height,
        });
        await capture("46-200-percent-reflow-proxy");
        await page.setViewportSize({ width: 320, height: 844 });
        await capture("47-narrow-320-stress");
        expect(c.errors).toEqual([]);
        expect(c.unexpected).toEqual([]);
        expect(c.reads.every((p) => p.startsWith("/security-incidents"))).toBe(
          true,
        );
        writeFileSync(
          info.outputPath("contracts.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              locale,
              theme,
              viewport,
              reflowWidth: Math.max(320, Math.round(viewport.width / 2)),
              captureScope:
                "Full real route at scroll top; workspace and selected-detail bounds permit labeled crops",
              captures,
              captureBounds,
              targetHeights,
              reads: c.reads,
              writes: c.writes,
              unexpected: c.unexpected,
              pageErrors: c.errors,
            },
            null,
            2,
          ),
        );
      });
