import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { auditItems, auditPage } from "../fixtures/audit-log-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE: real production browser UI, intercepted synthetic
// data. No backend/database/auth/export-security/production/WCAG proof.
const longItems = Array.from({ length: 25 }, (_, i) => ({
  ...auditItems[i % 4],
  id: `event-${i}`,
  action: i < 4 ? auditItems[i].action : `${auditItems[i % 4].action}.${i}`,
}));
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
  const state = { mode: "data", exportMode: "pending" };
  const reads: string[] = [],
    exports: string[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  let releaseRead: (() => void) | undefined,
    releaseExport: (() => void) | undefined;
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
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\/v1/, "");
    if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (path === "/admin/audit-logs/export") {
      exports.push(url.search);
      if (state.exportMode === "pending")
        await new Promise<void>((resolve) => {
          releaseExport = resolve;
        });
      if (state.exportMode === "error")
        return route.fulfill({
          status: 400,
          json: {
            message: "Synthetic export rejection — retained raw server message",
          },
        });
      return route.fulfill({
        status: 200,
        body: "CreatedAtUtc,Actor,Action,EntityType,Outcome\nsynthetic server CSV",
        headers: {
          "content-type": "text/csv",
          "content-disposition":
            'attachment; filename="server-audit-evidence.csv"',
        },
      });
    }
    if (path === "/admin/audit-logs") {
      reads.push(url.search);
      if (state.mode === "pending")
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      if (state.mode === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic request unavailable" },
        });
      return route.fulfill({
        json:
          state.mode === "empty"
            ? auditPage(1, [], 0)
            : auditPage(Number(url.searchParams.get("page") ?? 1), longItems),
      });
    }
    return route.fulfill(roleShellRuntimeResponse(path, locale, ["Admin"]));
  });
  await page.goto(`/${locale}/admin/audit-logs`);
  const copy = locale === "en" ? en : ar;
  const toggle = page.getByRole("button", {
    name: copy.navigation.theme.toggle,
  });
  if (!(await page.locator("html").getAttribute("data-theme")))
    await toggle.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  return {
    state,
    reads,
    exports,
    unexpected,
    errors,
    releaseRead: () => {
      expect(releaseRead).toBeDefined();
      releaseRead!();
    },
    releaseExport: () => {
      expect(releaseExport).toBeDefined();
      releaseExport!();
    },
  };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width}: Audit Log full archetype states and contracts`, async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          t = (locale === "en" ? en : ar).auditLog;
        const main = page.getByRole("main"),
          rows = main.getByRole("article");
        const capture = async (name: string) => {
          await noOverflow(page);
          // Full-page images otherwise pin the fixed role header at the last
          // interaction's scroll offset, obscuring ledger content in evidence.
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          await page.screenshot({
            path: info.outputPath(`${name}.png`),
            fullPage: true,
          });
        };
        await expect(rows).toHaveCount(25);
        expect(
          await rows
            .locator("p")
            .filter({
              hasText:
                /^(Z\.LastAlphabetically|A\.FirstAlphabetically|Access\.Rejected|Provider\.Reported)$/,
            })
            .allTextContents(),
        ).toEqual(auditItems.map((i) => i.action));
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        const colors: string[] = [];
        for (let i = 0; i < 4; i++) {
          await expect(
            rows.nth(i).getByText(auditItems[i].entityId, { exact: true }),
          ).toBeVisible();
          const outcome = rows.nth(i).locator("[data-outcome]");
          await expect(outcome).toHaveText(auditItems[i].outcome);
          colors.push(
            await outcome.evaluate((el) => getComputedStyle(el).color),
          );
        }
        expect(new Set(colors).size).toBe(4);
        expect(
          await main
            .locator("h1")
            .evaluate((el) => getComputedStyle(el).fontWeight),
        ).toBe("700");
        expect(
          await main
            .getByRole("button", { name: t.previous, exact: true })
            .evaluate((el) => getComputedStyle(el).opacity),
        ).toBe("1");
        await capture("01-populated-all-outcomes-long-arabic");
        const first = rows.first();
        await first.locator("summary").filter({ hasText: t.details }).click();
        await expect(first.locator("pre").first()).toHaveText(
          auditItems[0].metadataJson,
          { useInnerText: false },
        );
        expect(await first.locator("pre").first().textContent()).toBe(
          auditItems[0].metadataJson,
        );
        for (const value of [
          auditItems[0].ipAddress,
          auditItems[0].correlationId,
          auditItems[0].userAgent,
        ])
          await expect(first.getByText(value, { exact: false })).toBeVisible();
        await first.locator("summary").filter({ hasText: t.changes }).click();
        expect(await first.locator("pre").allTextContents()).toEqual([
          auditItems[0].metadataJson,
          auditItems[0].oldValuesJson,
          auditItems[0].newValuesJson,
        ]);
        await capture("02-expanded-metadata-changes-long-identifiers");
        await first.locator("summary").filter({ hasText: t.details }).click();
        await first.locator("summary").filter({ hasText: t.changes }).click();
        const action = main.getByLabel(t.actionFilter),
          search = main.getByRole("textbox", { name: t.search, exact: true });
        const before = c.reads.length;
        await action.fill("  Applied.Action  ");
        await search.fill("  draft-no-local-match  ");
        await main.getByLabel(t.entityFilter).fill("  Record  ");
        await main
          .getByRole("combobox", { name: t.outcomeFilter, exact: true })
          .selectOption("RiskObserved");
        await main.getByLabel(t.fromDate, { exact: true }).fill("2026-10-20");
        await main.getByLabel(t.toDate, { exact: true }).fill("2026-10-22");
        expect(c.reads).toHaveLength(before);
        await expect(rows).toHaveCount(25);
        await capture("03-draft-unapplied-filters");
        c.state.mode = "pending";
        await main.getByRole("button", { name: t.search, exact: true }).click();
        await expect(main.getByRole("status")).toContainText(t.loading);
        await expect(rows).toHaveCount(25);
        await expect(
          main.getByRole("button", { name: t.next, exact: true }),
        ).toBeDisabled();
        expect(c.reads.at(-1)).toBe(
          "?page=1&pageSize=25&search=draft-no-local-match&action=Applied.Action&entityType=Record&outcome=RiskObserved&fromUtc=2026-10-20T00%3A00%3A00Z&toUtc=2026-10-22T23%3A59%3A59.999Z",
        );
        await capture("04-placeholder-retained-during-applied-query");
        c.state.mode = "data";
        c.releaseRead();
        await expect(main.getByRole("status")).toHaveCount(0);
        await expect(rows).toHaveCount(25); // Server data is not locally filtered/sorted.
        await capture("05-applied-filters");
        await action.fill("UNAPPLIED-DIFFERENT-DRAFT");
        await main
          .getByRole("button", { name: t.exportCsv, exact: true })
          .click();
        await expect(
          main.getByRole("button", { name: t.exporting, exact: true }),
        ).toBeDisabled();
        expect(c.exports.at(-1)).toContain("action=Applied.Action");
        expect(c.exports.at(-1)).not.toContain("UNAPPLIED");
        expect(c.exports.at(-1)).not.toMatch(/page=/);
        await capture("06-export-pending-applied-not-draft");
        c.state.exportMode = "error";
        c.releaseExport();
        await expect(main.getByRole("alert")).toContainText(
          "Synthetic export rejection",
        );
        await capture("07-export-error-retains-ledger");
        c.state.exportMode = "data";
        const downloadPromise = page.waitForEvent("download");
        await main
          .getByRole("button", { name: t.exportCsv, exact: true })
          .click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("server-audit-evidence.csv");
        await download.saveAs(info.outputPath("synthetic-server-export.csv"));
        await expect(main.getByRole("alert")).toHaveCount(0);
        await main.getByRole("button", { name: t.next, exact: true }).click();
        await expect(
          main.getByText(
            t.page.replace("{page}", "2").replace("{pageCount}", "3"),
            { exact: true },
          ),
        ).toBeVisible();
        expect(c.reads.at(-1)).toContain("page=2&pageSize=25");
        expect(c.reads.at(-1)).toContain("action=Applied.Action");
        await capture("08-page-two-server-pagination");
        await main
          .getByRole("button", { name: t.clearFilters, exact: true })
          .click();
        await expect(action).toHaveValue("");
        await expect(search).toHaveValue("");
        await expect(
          main.getByText(
            t.page.replace("{page}", "1").replace("{pageCount}", "3"),
            { exact: true },
          ),
        ).toBeVisible();
        // Native keyboard activation of a disclosure and focus-visible evidence.
        await action.fill("Keyboard.Applied");
        await action.press("Enter");
        await expect
          .poll(() => c.reads.at(-1))
          .toContain("action=Keyboard.Applied");
        const clear = main.getByRole("button", {
          name: t.clearFilters,
          exact: true,
        });
        await clear.focus();
        await page.keyboard.press("Enter");
        await expect(action).toHaveValue("");
        await expect(search).toHaveValue("");
        const summary = rows.first().locator("summary").first();
        await summary.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(summary).toBeFocused();
        expect(
          await summary.evaluate((el) => getComputedStyle(el).outlineStyle),
        ).toBe("solid");
        expect(
          await summary.evaluate((el) => getComputedStyle(el).outlineOffset),
        ).toBe("2px");
        await page.keyboard.press("Enter");
        await expect(summary.locator("..")).toHaveAttribute("open", "");
        await capture("09-keyboard-focus-open-details");
        await page.keyboard.press("Enter");
        await expect(summary.locator("..")).not.toHaveAttribute("open");
        await page.setViewportSize({
          width: Math.max(320, Math.floor(viewport.width / 2)),
          height: Math.floor(viewport.height / 2),
        });
        await capture("10-half-viewport-reflow-proxy");
        await page.setViewportSize(viewport);
        // An actual React Query reconnect refetch retains cached data and details.
        await page.clock.install();
        await page.clock.fastForward(31_000);
        c.state.mode = "pending";
        await page.evaluate(() => {
          window.dispatchEvent(new Event("offline"));
          window.dispatchEvent(new Event("online"));
        });
        await expect(main.getByRole("status")).toContainText(t.loading);
        await expect(rows).toHaveCount(25);
        await capture("11-background-refetch-retained");
        c.state.mode = "data";
        c.releaseRead();
        await expect(main.getByRole("status")).toHaveCount(0);
        await page.clock.resume();
        c.state.mode = "empty";
        await action.fill("no-match-server");
        await main.getByRole("button", { name: t.search, exact: true }).click();
        await expect(main.getByText(t.empty, { exact: true })).toBeVisible();
        await expect(rows).toHaveCount(0);
        await capture("12-successful-empty-current-query");
        c.state.mode = "pending";
        await page.reload();
        await expect(main.getByRole("status")).toContainText(t.loading);
        await expect(rows).toHaveCount(0);
        await expect(main.getByText(t.empty, { exact: true })).toHaveCount(0);
        await capture("13-initial-pending-no-data");
        c.state.mode = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toContainText(t.loadError);
        await expect(rows).toHaveCount(0);
        await capture("14-cold-error-no-invented-auth-message");
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
        writeFileSync(
          info.outputPath("contracts.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              reads: c.reads,
              exports: c.exports,
              outcomeColors: colors,
              unexpected: c.unexpected,
              pageErrors: c.errors,
              viewport,
              locale,
              theme,
              reflow: "Half viewport proxy, not native browser zoom",
            },
            null,
            2,
          ),
        );
      });
    }
