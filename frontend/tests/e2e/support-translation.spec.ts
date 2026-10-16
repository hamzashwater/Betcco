import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  supportDetail,
  supportList,
  supportSummary,
  supportTarget,
} from "../helpers/support-fixtures";

type RequestRecord = { path: string; method: string; body: string | null };
async function json(route: Route, value: unknown, status = 200) {
  if (status === 204) await route.fulfill({ status });
  else await route.fulfill({ json: value, status });
  return true;
}
async function mockSurface(
  page: Page,
  roles: () => string[],
  handle: (route: Route, url: URL) => Promise<boolean>,
) {
  const requests: RequestRecord[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Deliberate API failures/CSP diagnostics are not hydration/translation errors.
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|react error|MISSING_MESSAGE|INVALID_MESSAGE/i.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    requests.push({
      path: path + url.search,
      method: route.request().method(),
      body: route.request().postData(),
    });
    if (await handle(route, url)) return;
    if (path.endsWith("/auth/me"))
      return json(route, {
        id: "raw-viewer-17",
        displayName: "RAW Viewer",
        roles: roles(),
      });
    if (path.endsWith("/security/antiforgery"))
      return json(route, { token: "test-token" });
    if (path.endsWith("/settings/public")) return json(route, {});
    if (path.endsWith("/taxonomy"))
      return json(route, {
        tracks: [],
        grades: [],
        specializations: [],
        subjects: [],
      });
    if (path.endsWith("/cart")) return json(route, { items: [] });
    return json(route, []);
  });
  return { requests, errors };
}
async function capture(page: Page, label: string, locale: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("main")
      .first()
      .evaluate((element) => getComputedStyle(element).direction),
  ).toBe(locale === "ar" ? "rtl" : "ltr");
  const directory = process.env.BETCCO_SUPPORT_EVIDENCE_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    await page.screenshot({
      path: join(directory, `${label}-full.png`),
      fullPage: true,
    });
    await page
      .locator("main")
      .first()
      .screenshot({ path: join(directory, `${label}.png`) });
  }
}
async function dismissCookies(page: Page, label: string) {
  const button = page.getByRole("button", { name: label, exact: true });
  if (await button.count()) await button.click();
}

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  const messages = scenario.locale === "ar" ? ar : en,
    copy = messages.supportWorkspace;
  test(`Support accounts ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    let permitted = false,
      holdTargets = true,
      releaseViewer: (() => void) | undefined,
      releaseTargets: (() => void) | undefined,
      releaseFreeze: (() => void) | undefined;
    const viewerHold = new Promise<void>((resolve) => {
      releaseViewer = resolve;
    });
    const targetsHold = new Promise<void>((resolve) => {
      releaseTargets = resolve;
    });
    const freezeHold = new Promise<void>((resolve) => {
      releaseFreeze = resolve;
    });
    const target = { ...supportTarget };
    const { requests, errors } = await mockSurface(
      page,
      () => (permitted ? ["SupportAdmin"] : ["Student"]),
      async (route, url) => {
        if (url.pathname.endsWith("/auth/me")) {
          await viewerHold;
          return json(route, {
            id: "raw-viewer-17",
            displayName: "RAW Viewer",
            roles: permitted ? ["SupportAdmin"] : ["Student"],
          });
        }
        if (url.pathname === "/api/v1/admin/users/freeze-targets") {
          if (holdTargets) await targetsHold;
          return json(route, { items: [{ ...target }], totalCount: 26 });
        }
        if (url.pathname === "/api/v1/admin/users/raw-account-17/freeze") {
          await freezeHold;
          target.isFrozen = route.request().postDataJSON().frozen as boolean;
          return json(route, null, 204);
        }
        return false;
      },
    );
    await page.goto(`/${scenario.locale}/support/accounts`);
    await expect(
      page.getByText(copy.account.loading, { exact: true }),
    ).toBeVisible();
    await dismissCookies(page, messages.cookieConsent.reject);
    await capture(
      page,
      `accounts-${scenario.locale}-viewer-loading`,
      scenario.locale,
    );
    releaseViewer?.();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      copy.account.denied,
    );
    expect(
      requests.some((request) =>
        request.path.startsWith("/api/v1/admin/users/"),
      ),
    ).toBe(false);
    await capture(page, `accounts-${scenario.locale}-denied`, scenario.locale);
    permitted = true;
    await page.reload();
    await expect(page.getByText(copy.account.loadingAccounts)).toBeVisible();
    await capture(
      page,
      `accounts-${scenario.locale}-targets-loading`,
      scenario.locale,
    );
    holdTargets = false;
    releaseTargets?.();
    await expect(page.getByText(supportTarget.displayName)).toBeVisible();
    await expect(page.getByText(supportTarget.email)).toHaveAttribute(
      "dir",
      "ltr",
    );
    await capture(page, `accounts-${scenario.locale}-list`, scenario.locale);
    const rawSearch = "  RAW بحث  ";
    await page
      .getByRole("textbox", { name: copy.account.searchLabel })
      .fill(rawSearch);
    await page
      .locator("main")
      .getByRole("button", { name: copy.account.search, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        requests.some(
          (request) =>
            request.path.startsWith("/api/v1/admin/users/freeze-targets?") &&
            new URL(request.path, "https://test.invalid").searchParams.get(
              "search",
            ) === rawSearch,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: copy.account.next }).click();
    await expect
      .poll(() => requests.some((request) => request.path.endsWith("&page=2")))
      .toBe(true);
    await expect(
      page.getByRole("button", { name: copy.account.next }),
    ).toBeDisabled();
    await page.getByRole("button", { name: copy.account.teachers }).click();
    await expect
      .poll(() =>
        requests.some(
          (request) =>
            request.path.startsWith("/api/v1/admin/users/freeze-targets?") &&
            new URL(request.path, "https://test.invalid").searchParams.get(
              "role",
            ) === "Teacher" &&
            request.path.endsWith("&page=1"),
        ),
      )
      .toBe(true);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: copy.account.freeze }).click();
    expect(
      requests.some(
        (request) =>
          request.method === "POST" && request.path.endsWith("/freeze"),
      ),
    ).toBe(false);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(copy.account.confirmFreeze);
      await dialog.accept();
    });
    await page.getByRole("button", { name: copy.account.freeze }).click();
    await expect(
      page.getByRole("button", { name: copy.account.freeze }),
    ).toBeDisabled();
    await capture(
      page,
      `accounts-${scenario.locale}-freeze-pending`,
      scenario.locale,
    );
    releaseFreeze?.();
    await expect(
      page.getByRole("button", { name: copy.account.reactivate }),
    ).toBeVisible();
    await capture(page, `accounts-${scenario.locale}-frozen`, scenario.locale);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(copy.account.confirmReactivate);
      await dialog.accept();
    });
    await page.getByRole("button", { name: copy.account.reactivate }).click();
    await expect(
      page.getByRole("button", { name: copy.account.freeze }),
    ).toBeEnabled();
    expect(
      requests
        .filter(
          (request) =>
            request.method === "POST" && request.path.endsWith("/freeze"),
        )
        .map((request) => JSON.parse(request.body ?? "null")),
    ).toEqual([{ frozen: true }, { frozen: false }]);
    expect(errors).toEqual([]);
  });

  test(`Student Support ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    let listState: "loading" | "empty" | "data" = "loading",
      replyError = false;
    let releaseList: (() => void) | undefined,
      releaseCreate: (() => void) | undefined,
      releaseReply: (() => void) | undefined;
    const listHold = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const createHold = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const replyHold = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    let detail = structuredClone(supportDetail);
    const { requests, errors } = await mockSurface(
      page,
      () => ["Student"],
      async (route, url) => {
        if (
          url.pathname === "/api/v1/support/tickets" &&
          route.request().method() === "GET"
        ) {
          if (listState === "loading") await listHold;
          return json(
            route,
            listState === "empty"
              ? { ...supportList, items: [], totalCount: 0 }
              : { ...supportList, items: [{ ...detail, messages: undefined }] },
          );
        }
        if (
          url.pathname === "/api/v1/support/tickets" &&
          route.request().method() === "POST"
        ) {
          await createHold;
          const payload = route.request().postDataJSON() as {
            subject: string;
            category: string;
            message: string;
          };
          detail = {
            ...detail,
            id: "raw-created-ticket-19",
            subject: payload.subject,
            category: payload.category,
          };
          return json(route, { id: detail.id, status: "Open" });
        }
        if (url.pathname.endsWith("/messages")) {
          if (replyError)
            return json(route, { message: "RAW reply failure رفض خام" }, 409);
          await replyHold;
          const payload = route.request().postDataJSON() as { message: string };
          detail.messages.push({
            id: "raw-new-message-19",
            body: payload.message,
            createdAtUtc: "2026-09-22T12:00:00Z",
            isFromCurrentUser: true,
          });
          return json(route, null, 204);
        }
        if (url.pathname.startsWith("/api/v1/support/tickets/"))
          return json(route, detail);
        return false;
      },
    );
    await page.goto(`/${scenario.locale}/student/support`);
    await expect(page.locator("main [aria-busy]").first()).toBeVisible();
    await dismissCookies(page, messages.cookieConsent.reject);
    await capture(page, `student-${scenario.locale}-loading`, scenario.locale);
    listState = "empty";
    releaseList?.();
    await expect(page.getByText(copy.center.studentEmpty)).toBeVisible();
    await capture(
      page,
      `student-${scenario.locale}-empty-new-form`,
      scenario.locale,
    );
    listState = "data";
    await page.reload();
    await expect(page.getByText(/RAW learner message/u)).toBeVisible();
    expect(await page.getByText(/RAW learner message/u).textContent()).toBe(
      supportDetail.messages[0].body,
    );
    await expect(page.getByText(supportSummary.category)).toBeVisible();
    await expect(page.getByText(supportSummary.subject)).toHaveCount(2);
    await expect(page.getByText(copy.center.securityWarning)).toBeVisible();
    await capture(
      page,
      `student-${scenario.locale}-list-detail`,
      scenario.locale,
    );
    const options = page
      .getByRole("combobox", { name: copy.center.category })
      .locator("option");
    expect(
      await options.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLOptionElement).value),
      ),
    ).toEqual(["General", "Technical", "Payment", "Course", "Safety"]);
    await page
      .getByRole("textbox", { name: copy.center.subject })
      .fill("  RAW created موضوع  ");
    await page
      .getByRole("textbox", { name: copy.center.openingMessage })
      .fill("  RAW opening رسالة  ");
    await page
      .getByRole("combobox", { name: copy.center.category })
      .selectOption("Payment");
    await page.getByRole("button", { name: copy.center.openTicket }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: copy.center.sending }),
    ).toBeDisabled();
    await capture(
      page,
      `student-${scenario.locale}-create-pending`,
      scenario.locale,
    );
    releaseCreate?.();
    await expect(
      page.getByRole("textbox", { name: copy.center.subject }),
    ).toHaveValue("");
    await expect(
      page.getByRole("combobox", { name: copy.center.category }),
    ).toHaveValue("General");
    await expect(page.getByText("RAW created موضوع")).toHaveCount(2);
    expect(
      JSON.parse(
        requests.find(
          (request) =>
            request.method === "POST" &&
            request.path === "/api/v1/support/tickets",
        )?.body ?? "null",
      ),
    ).toEqual({
      subject: "RAW created موضوع",
      category: "Payment",
      message: "RAW opening رسالة",
    });
    await capture(
      page,
      `student-${scenario.locale}-created-selected`,
      scenario.locale,
    );
    await page
      .getByPlaceholder(copy.center.replyPlaceholder)
      .fill("  RAW reply رد  ");
    await page.getByRole("button", { name: copy.center.sendReply }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByPlaceholder(copy.center.replyPlaceholder),
    ).toBeDisabled();
    await capture(
      page,
      `student-${scenario.locale}-reply-pending`,
      scenario.locale,
    );
    releaseReply?.();
    await expect(
      page.getByPlaceholder(copy.center.replyPlaceholder),
    ).toHaveValue("");
    await expect(page.getByText("RAW reply رد", { exact: true })).toBeVisible();
    expect(
      JSON.parse(
        requests.find(
          (request) =>
            request.path ===
            "/api/v1/support/tickets/raw-created-ticket-19/messages",
        )?.body ?? "null",
      ),
    ).toEqual({ message: "RAW reply رد" });
    replyError = true;
    await page.getByPlaceholder(copy.center.replyPlaceholder).fill("retry");
    await page.getByRole("button", { name: copy.center.sendReply }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "RAW reply failure رفض خام",
    );
    await capture(
      page,
      `student-${scenario.locale}-raw-error`,
      scenario.locale,
    );
    detail.status = "Closed";
    await page.reload();
    await expect(
      page.getByPlaceholder(copy.center.closedPlaceholder),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: copy.center.sendReply }),
    ).toBeDisabled();
    await capture(page, `student-${scenario.locale}-closed`, scenario.locale);
    expect(errors).toEqual([]);
  });

  test(`Admin Support ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const detail = structuredClone(supportDetail);
    let releaseStatus: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const { requests, errors } = await mockSurface(
      page,
      () => ["Admin"],
      async (route, url) => {
        if (url.pathname === "/api/v1/support/tickets")
          return json(route, {
            ...supportList,
            items: [{ ...supportSummary, status: detail.status }],
          });
        if (url.pathname.endsWith("/status")) {
          await hold;
          detail.status = route.request().postDataJSON().status as string;
          return json(route, null, 204);
        }
        if (url.pathname.startsWith("/api/v1/support/tickets/"))
          return json(route, detail);
        return false;
      },
    );
    await page.goto(`/${scenario.locale}/admin/support`);
    await expect(
      page.getByRole("heading", { name: copy.center.adminTitle }),
    ).toBeVisible();
    await dismissCookies(page, messages.cookieConsent.reject);
    await expect(page.getByText(/RAW support answer/u)).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.center.openTicket }),
    ).toHaveCount(0);
    await capture(
      page,
      `admin-${scenario.locale}-list-detail-controls`,
      scenario.locale,
    );
    await page.getByRole("button", { name: copy.center.startWork }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: copy.center.resolve, exact: true }),
    ).toBeDisabled();
    await capture(
      page,
      `admin-${scenario.locale}-status-pending`,
      scenario.locale,
    );
    releaseStatus?.();
    await expect(
      page.getByRole("button", { name: copy.center.startWork }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: copy.center.resolve, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: copy.center.resolve, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: copy.center.close, exact: true })
      .click();
    await expect(
      page.getByPlaceholder(copy.center.closedPlaceholder),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: copy.center.sendReply }),
    ).toBeDisabled();
    expect(
      requests
        .filter(
          (request) =>
            request.path.endsWith("/status") && request.method === "POST",
        )
        .map((request) => JSON.parse(request.body ?? "null")),
    ).toEqual([
      { status: "InProgress" },
      { status: "Resolved" },
      { status: "Closed" },
    ]);
    await capture(page, `admin-${scenario.locale}-closed`, scenario.locale);
    expect(errors).toEqual([]);
  });
}
