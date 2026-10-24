import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  privacyRows as rows,
  requestStatuses,
  longResolution,
} from "../fixtures/privacy-request-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
// MOCKED UI-CONTRACT EVIDENCE. Review only; no actual identity procedure,
// fulfillment, legal compliance, erasure/export, authorization or persistence.
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
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const state = {
      read: "data",
      long: false,
      write: "success",
      response: {
        ...rows[0],
        status: "InReview",
        resolutionSummary: "SERVER CANONICAL NOTE",
      },
    },
    reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  let releaseRead: (() => void) | undefined,
    releaseWrite: (() => void) | undefined;
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
    if (path === "/security/antiforgery")
      return route.fulfill({ json: { token: "mocked-ui-contract-token" } });
    if (path === "/privacy/admin/requests" && request.method() === "GET") {
      expect(url.searchParams.get("pageSize")).toBe("50");
      expect([...url.searchParams.keys()]).toEqual(
        url.searchParams.has("status") ? ["pageSize", "status"] : ["pageSize"],
      );
      reads.push(path + url.search);
      if (state.read === "pending")
        await new Promise<void>((r) => {
          releaseRead = r;
        });
      if (state.read === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic privacy query failure" },
        });
      const pool = state.long
        ? Array.from({ length: 50 }, (_, i) => ({
            ...rows[i % 7],
            id: `00000000-0000-4000-8000-${String(900 - i).padStart(12, "0")}`,
          }))
        : rows;
      const items =
        state.read === "empty"
          ? []
          : url.searchParams.has("status")
            ? pool.filter((r) => r.status === url.searchParams.get("status"))
            : pool;
      return route.fulfill({
        json: {
          items: items.map((r) => ({
            ...r,
            ownerUserId: "SYNTHETIC-HIDDEN-OWNER",
            email: "hidden@example.test",
            identityVerifiedByUserId: "SYNTHETIC-HIDDEN-VERIFIER",
          })),
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
    if (request.method() !== "GET") {
      if (
        request.method() !== "PUT" ||
        !/^\/privacy\/admin\/requests\/[0-9a-f-]{36}$/.test(path)
      ) {
        unexpected.push(request.method() + " " + path);
        return route.fulfill({
          status: 409,
          json: { message: "Unexpected synthetic mutation" },
        });
      }
      writes.push({
        path,
        method: request.method(),
        body: request.postDataJSON(),
      });
      expect(Object.keys(request.postDataJSON())).toEqual([
        "status",
        "resolutionSummary",
        "markIdentityVerified",
      ]);
      if (state.write === "pending")
        await new Promise<void>((r) => {
          releaseWrite = r;
        });
      return state.write === "error"
        ? route.fulfill({
            status: 409,
            json: { message: "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED" },
          })
        : route.fulfill({ json: state.response });
    }
    if (path.startsWith("/privacy/")) {
      unexpected.push("GET " + path);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic privacy read" },
      });
    }
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/privacy`);
  return {
    state,
    reads,
    writes,
    unexpected,
    errors,
    releaseRead: () => {
      expect(releaseRead).toBeDefined();
      releaseRead!();
    },
    releaseWrite: () => {
      expect(releaseWrite).toBeDefined();
      releaseWrite!();
    },
  };
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ])
      test(`${locale} ${theme} ${viewport.width}: Human-review privacy queue`, async ({
        page,
      }, info) => {
        test.setTimeout(180_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          copy = locale === "en" ? en : ar,
          t = copy.adminWorkspace.privacyRequests;
        const queue = page.getByRole("region", { name: t.reviewQueue }),
          detail = page.getByRole("complementary", { name: t.requestFacts }),
          buttons = queue.getByRole("button"),
          filter = queue.getByRole("combobox"),
          status = detail.getByLabel(t.reviewStatus),
          note = detail.getByLabel(t.userfacingReviewNote),
          identity = detail.getByRole("checkbox"),
          save = detail.getByRole("button");
        const captures: string[] = [],
          captureBounds: {
            name: string;
            x: number;
            y: number;
            width: number;
            height: number;
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
        async function ready(count = 7) {
          await expect(buttons).toHaveCount(count);
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
            .getByRole("heading", { name: t.privacyRequests, exact: true })
            .locator("../..")
            .boundingBox();
          expect(b).not.toBeNull();
          captureBounds.push({ name, ...b! });
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            fullPage: true,
          });
          captures.push(name);
        }
        async function reload() {
          c.state.read = "data";
          c.state.long = false;
          c.state.write = "success";
          await page.reload();
          await ready();
        }
        async function select(index: number) {
          await buttons.nth(index).click();
          await expect(buttons.nth(index)).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expect(detail.locator("p[data-status]")).toHaveText(
            [
              t.submitted,
              t.identityCheckRequired,
              t.inReview,
              t.completed,
              t.rejected,
              t.cancelled,
              t.submitted,
            ][index],
          );
        }
        await ready();
        expect(c.reads).toEqual(["/privacy/admin/requests?pageSize=50"]);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(
          queue.getByText(t.matchingTotal.replace("{count}", "843")),
        ).toBeVisible();
        expect(
          await filter
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => (o as HTMLOptionElement).value),
            ),
        ).toEqual(["", ...requestStatuses]);
        await capture("01-populated-queue");
        c.state.long = true;
        await page.reload();
        await ready(50);
        await capture("02-long-queue-current-page-50");
        await reload();
        await capture("03-all-statuses");
        await filter.selectOption("Completed");
        await ready(1);
        expect(c.reads.at(-1)).toBe(
          "/privacy/admin/requests?pageSize=50&status=Completed",
        );
        await capture("04-server-status-filter");
        c.state.read = "empty";
        await filter.selectOption("Cancelled");
        await expect(
          queue.getByText(t.thereAreNoRequestsWithThisStatus),
        ).toBeVisible();
        await capture("05-status-filter-empty");
        await filter.selectOption("");
        await page.reload();
        await expect(
          queue.getByText(t.thereAreNoRequestsWithThisStatus),
        ).toBeVisible();
        await capture("06-successful-empty-all");
        c.state.read = "pending";
        await page.reload();
        await expect(queue.getByRole("status")).toHaveText(t.loadingRequests);
        await expect(buttons).toHaveCount(0);
        await capture("07-initial-loading");
        c.state.read = "error";
        c.releaseRead();
        await expect(queue.getByRole("alert")).toHaveText(
          "Synthetic privacy query failure",
        );
        await expect(
          queue.getByText(t.thereAreNoRequestsWithThisStatus),
        ).toHaveCount(0);
        await capture("08-cold-query-error");
        await reload();
        for (let i = 0; i < 6; i++) {
          await select(i);
          if (i === 0) await expect(status).toHaveValue("InReview");
          if (i >= 3) {
            await expect(status).toBeDisabled();
            await expect(status).toBeHidden();
            await expect(detail.locator("p[data-final-status]")).toHaveText(
              [t.completed, t.rejected, t.cancelled][i - 3],
            );
            await expect(note).toBeDisabled();
            await expect(identity).toBeDisabled();
            await expect(save).toHaveCount(0);
          }
          await capture(
            [
              "09-submitted-selected",
              "10-identity-verification-required",
              "11-in-review-no-description",
              "12-completed-locked",
              "13-rejected-locked",
              "14-cancelled-locked",
            ][i],
          );
        }
        await select(0);
        expect(await detail.locator('[class*="rawText"]').textContent()).toBe(
          rows[0].description,
        );
        await expect(detail.locator("description")).toHaveCount(0);
        await capture("15-long-raw-description");
        await expect(identity).not.toBeChecked();
        await expect(detail.getByText(t.verificationNotRecorded)).toBeVisible();
        await capture("16-identity-not-recorded");
        await select(2);
        await expect(identity).toBeChecked();
        await expect(identity).toBeDisabled();
        await expect(
          detail.getByText(t.verificationRecorded, { exact: false }),
        ).toBeVisible();
        await capture("17-identity-recorded");
        await select(0);
        await note.fill(longResolution);
        await status.selectOption("IdentityVerificationRequired");
        await identity.check();
        expect(c.writes).toEqual([]);
        await capture("18-review-note-draft");
        await note.fill("   ");
        await capture("19-whitespace-review-note");
        c.state.write = "pending";
        await save.click();
        await expect(save).toBeDisabled();
        await expect(save).toHaveAttribute("aria-busy", "true");
        await expect(detail.getByText(t.reviewDecisionSaved)).toHaveCount(0);
        await capture("20-review-pending");
        expect(c.writes.at(-1)).toEqual({
          path: `/privacy/admin/requests/${rows[0].id}`,
          method: "PUT",
          body: {
            status: "IdentityVerificationRequired",
            resolutionSummary: null,
            markIdentityVerified: true,
          },
        });
        c.state.write = "error";
        c.releaseWrite();
        await expect(detail.getByRole("alert")).toHaveText(
          "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED",
        );
        await expect(note).toHaveValue("   ");
        await expect(status).toHaveValue("IdentityVerificationRequired");
        await expect(identity).toBeChecked();
        await capture("21-review-error-drafts-retained");
        await select(1);
        await expect(detail.getByRole("alert")).toHaveCount(0);
        await expect(note).toHaveValue(rows[1].resolutionSummary!);
        await capture("22-selection-resets-review-outcome");
        await select(0);
        await status.selectOption("Completed");
        await note.fill("  RAW completion review draft  ");
        await identity.check();
        await expect(save).toBeEnabled();
        await save.click();
        await expect(detail.getByRole("alert")).toHaveText(
          "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED",
        );
        await expect(status).toHaveValue("Completed");
        await expect(note).toHaveValue("  RAW completion review draft  ");
        await capture("23-completion-server-conflict-not-eligibility");
        c.state.write = "success";
        c.state.read = "pending";
        await status.selectOption("InReview");
        await note.fill("  Accepted review draft  ");
        await save.click();
        await expect(detail.getByRole("status")).toHaveText(
          t.reviewDecisionSaved,
        );
        await expect(note).toHaveValue("SERVER CANONICAL NOTE");
        await expect(detail.locator("p[data-status]")).toHaveText(t.inReview);
        await ready();
        await capture("24-review-success-server-result");
        await status.selectOption("Rejected");
        await note.fill(longResolution);
        await identity.check();
        c.state.read = "error";
        c.releaseRead();
        await expect(queue.getByRole("alert")).toHaveText(
          "Synthetic privacy query failure",
        );
        await ready();
        await expect(status).toHaveValue("Rejected");
        await expect(note).toHaveValue(longResolution);
        await expect(identity).toBeChecked();
        await expect(detail.getByRole("status")).toHaveText(
          t.reviewDecisionSaved,
        );
        await capture("25-cached-rows-refresh-error-drafts-retained");
        await select(3);
        await expect(save).toHaveCount(0);
        await capture("26-final-locked-detail");
        await reload();
        await select(0);
        await note.fill(longResolution);
        await capture(
          locale === "ar"
            ? "27-long-arabic-copy"
            : "27-long-bilingual-raw-copy",
        );
        await filter.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(filter).toBeFocused();
        expect(
          await filter.evaluate((n) => getComputedStyle(n).outlineStyle),
        ).toBe("solid");
        expect(
          await filter.evaluate((n) => getComputedStyle(n).outlineOffset),
        ).toBe("2px");
        await capture("28-keyboard-filter-focus");
        await page.keyboard.press("Tab");
        await expect(buttons.nth(0)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(buttons.nth(0)).toHaveAttribute("aria-pressed", "true");
        await expect(buttons.nth(0).getByText(t.selectedRequest)).toBeVisible();
        await capture("29-keyboard-row-selection");
        await status.focus();
        await page.keyboard.press("Tab");
        await expect(note).toBeFocused();
        await capture("30-keyboard-review-note-focus");
        await page.setViewportSize({
          width: Math.max(320, Math.round(viewport.width / 2)),
          height: viewport.height,
        });
        await capture("31-200-percent-reflow-proxy");
        expect(c.errors).toEqual([]);
        expect(c.unexpected).toEqual([]);
        expect(await page.getByRole("main").textContent()).not.toMatch(
          /SYNTHETIC-HIDDEN|hidden@example\.test/,
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
                "Full real route at scroll top; target bounds recorded for labeled cropped previews",
              captures,
              captureBounds,
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
