import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";
// MOCKED UI-CONTRACT EVIDENCE: real native dialogs are observed by Playwright's
// dialog event, not replaced with a DOM modal. No financial persistence,
// authorization, JOD settlement, wallet accounting, deployment or WCAG proof.
const paths = {
  commission: "/admin/commerce-catalog/commission",
  tax: "/admin/commerce-catalog/sales-tax",
};
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
async function prepare(page: Page, theme: string, locale: "en" | "ar") {
  const state = { commission: "data", tax: "data", mutation: "success" },
    reads: string[] = [],
    writes: { path: string; method: string; body: unknown }[] = [],
    errors: string[] = [],
    unexpected: string[] = [];
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
    const owner =
      path === paths.commission
        ? "commission"
        : path === paths.tax
          ? "tax"
          : undefined;
    if (owner) {
      expect(url.search).toBe("");
      if (request.method() === "GET") {
        reads.push(path);
        if (state[owner] === "pending")
          await new Promise<void>((r) => {
            releaseRead = r;
          });
        if (state[owner] === "error")
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic query failure" },
          });
        return route.fulfill({
          json:
            owner === "commission"
              ? { platformCommissionPercent: 30, teacherSharePercent: 70 }
              : { salesTaxPercent: 7.125 },
        });
      }
      expect(request.method()).toBe("PUT");
      writes.push({
        path,
        method: request.method(),
        body: request.postDataJSON(),
      });
      if (state.mutation === "pending")
        await new Promise<void>((r) => {
          releaseWrite = r;
        });
      return state.mutation === "error"
        ? route.fulfill({
            status: 409,
            json: { message: "Synthetic retained financial failure" },
          })
        : route.fulfill({ status: 204 });
    }
    if (request.method() !== "GET") {
      unexpected.push(request.method() + " " + path);
      return route.fulfill({
        status: 409,
        json: { message: "Unexpected synthetic write" },
      });
    }
    if (path === "/admin/wallet")
      return route.fulfill({
        json: {
          platformBalance: 0,
          confirmedPlatformCommission: 0,
          currency: "JOD",
          recentSales: [],
          payouts: [],
        },
      });
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/wallet`);
  return {
    state,
    reads,
    writes,
    errors,
    unexpected,
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
    ]) {
      test(`${locale} ${theme} ${viewport.width}: Finance settings native confirmation workspace`, async ({
        page,
      }, info) => {
        test.setTimeout(180_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, theme, locale),
          copy = locale === "ar" ? ar : en,
          t = copy.commerceCatalog;
        const section = page.getByRole("region", { name: t.financeSettings }),
          forms = {
            commission: section.getByRole("form", { name: t.commissionTitle }),
            tax: section.getByRole("form", { name: t.salesTax }),
          };
        const input = (owner: "commission" | "tax") =>
            forms[owner].getByRole("spinbutton"),
          button = (owner: "commission" | "tax") =>
            forms[owner].getByRole("button");
        const captures: string[] = [],
          captureBounds: {
            name: string;
            x: number;
            y: number;
            width: number;
            height: number;
          }[] = [],
          dialogs: {
            owner: string;
            type: string;
            message: string;
            decision: string;
            writesBefore: number;
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
        async function ready() {
          await expect(input("commission")).toHaveValue("30");
          await expect(input("tax")).toHaveValue("7.125");
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
          const bounds = await section.boundingBox();
          expect(bounds).not.toBeNull();
          captureBounds.push({ name, ...bounds! });
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            fullPage: true,
          });
          captures.push(name);
        }
        async function reload() {
          c.state.commission = "data";
          c.state.tax = "data";
          c.state.mutation = "success";
          await page.reload();
          await ready();
        }
        async function confirm(
          owner: "commission" | "tax",
          accept: boolean,
          keyboard = false,
        ) {
          const count = c.writes.length;
          const observed = page.waitForEvent("dialog");
          const click = keyboard
            ? input(owner).press("Enter")
            : button(owner).click();
          const dialog = await observed;
          expect(dialog.type()).toBe("confirm");
          expect(dialog.message()).toBe(
            owner === "commission" ? t.commissionConfirm : t.taxConfirm,
          );
          expect(c.writes).toHaveLength(count);
          dialogs.push({
            owner,
            type: dialog.type(),
            message: dialog.message(),
            decision: accept ? "accept" : "dismiss",
            writesBefore: count,
          });
          if (accept) await dialog.accept();
          else await dialog.dismiss();
          await click;
          if (!accept) expect(c.writes).toHaveLength(count);
          else await expect.poll(() => c.writes.length).toBe(count + 1);
        }
        await ready();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        expect(c.reads).toEqual([paths.commission, paths.tax]);
        for (const owner of ["commission", "tax"] as const) {
          await expect(input(owner)).toHaveAttribute("dir", "ltr");
          await expect(input(owner)).toHaveAttribute("step", "0.001");
          expect(
            await button(owner).evaluate(
              (n) => n.getBoundingClientRect().height,
            ),
          ).toBeGreaterThanOrEqual(44);
        }
        await capture("01-both-settings-loaded");
        for (const owner of ["commission", "tax"] as const) {
          await reload();
          c.state[owner] = "pending";
          await page.reload();
          await expect(forms[owner].getByRole("status")).toHaveText(
            owner === "commission" ? t.commissionLoading : t.taxLoading,
          );
          await expect(input(owner)).toHaveValue("");
          await expect(button(owner)).toBeDisabled();
          await expect(
            button(owner === "commission" ? "tax" : "commission"),
          ).toBeEnabled();
          await capture(owner + "-initial-loading");
          c.state[owner] = "error";
          c.releaseRead();
          await expect(forms[owner].getByRole("alert")).toHaveText(
            owner === "commission" ? t.commissionUnavailable : t.taxUnavailable,
          );
          await expect(input(owner)).toHaveValue("");
          await expect(forms[owner].locator("dd")).toHaveText("—");
          await capture(owner + "-cold-query-error-no-fallback");
        }
        await reload();
        await input("commission").fill("31.125");
        await expect(forms.commission.getByText(t.localDraft)).toBeVisible();
        await expect(
          forms.commission.getByText(/68[.,]875|٦٨[٫.,]٨٧٥/),
        ).toBeVisible();
        await capture("06-valid-commission-draft-derived-preview");
        for (const value of ["-0.001", "100.001"]) {
          await input("commission").fill(value);
          await expect(button("commission")).toBeDisabled();
          await expect(
            forms.commission.getByText(t.invalidPercentage),
          ).toBeVisible();
          await capture(
            "commission-invalid-" +
              (value.startsWith("-") ? "below-zero" : "above-100"),
          );
        }
        for (const value of ["0", "100"]) {
          await input("commission").fill(value);
          await expect(button("commission")).toBeEnabled();
          await capture("commission-boundary-" + value);
        }
        await input("commission").fill("31.125");
        await input("tax").fill("8.625");
        await confirm("commission", false, true);
        await capture("commission-native-confirmation-cancelled");
        await expect(input("commission")).toHaveValue("31.125");
        c.state.mutation = "pending";
        await confirm("commission", true);
        await expect(button("commission")).toBeDisabled();
        await expect(button("tax")).toBeEnabled();
        await capture("commission-native-confirmed-pending");
        expect(c.writes.at(-1)).toEqual({
          method: "PUT",
          path: paths.commission,
          body: { platformCommissionPercent: 31.125 },
        });
        c.state.mutation = "error";
        c.releaseWrite();
        await expect(forms.commission.getByRole("alert")).toHaveText(
          "Synthetic retained financial failure",
        );
        await expect(input("commission")).toHaveValue("31.125");
        await expect(input("tax")).toHaveValue("8.625");
        await capture("commission-mutation-error-draft-retained");
        c.state.mutation = "success";
        await confirm("commission", true);
        await expect(forms.commission.getByRole("status")).toHaveText(
          t.commissionUpdated,
        );
        await expect(input("commission")).toHaveValue("30");
        await expect(input("tax")).toHaveValue("8.625");
        await capture("commission-success-tax-draft-preserved");
        await input("commission").fill("29.875");
        c.state.commission = "error";
        await confirm("commission", true);
        await expect(forms.commission.getByRole("alert")).toHaveText(
          t.commissionUnavailable,
        );
        await expect(input("commission")).toHaveValue("30");
        await expect(button("commission")).toBeEnabled();
        await capture("commission-cached-refresh-error-current-value-retained");
        await reload();
        await input("commission").fill("29.875");
        await input("tax").fill("8.625");
        await capture("tax-valid-draft");
        for (const value of ["-0.001", "100.001"]) {
          await input("tax").fill(value);
          await expect(button("tax")).toBeDisabled();
          await capture(
            "tax-invalid-" +
              (value.startsWith("-") ? "below-zero" : "above-100"),
          );
        }
        for (const value of ["0", "100"]) {
          await input("tax").fill(value);
          await expect(button("tax")).toBeEnabled();
          await capture("tax-boundary-" + value);
        }
        await input("tax").fill("8.625");
        await confirm("tax", false, true);
        await capture("tax-native-confirmation-cancelled");
        c.state.mutation = "pending";
        await confirm("tax", true);
        await expect(button("tax")).toBeDisabled();
        await expect(button("commission")).toBeEnabled();
        await capture("tax-native-confirmed-pending");
        expect(c.writes.at(-1)).toEqual({
          method: "PUT",
          path: paths.tax,
          body: { salesTaxPercent: 8.625 },
        });
        c.state.mutation = "error";
        c.releaseWrite();
        await expect(forms.tax.getByRole("alert")).toHaveText(
          "Synthetic retained financial failure",
        );
        await expect(input("tax")).toHaveValue("8.625");
        await expect(input("commission")).toHaveValue("29.875");
        await expect(forms.commission.getByRole("alert")).toHaveCount(0);
        await capture("tax-mutation-error-draft-retained");
        c.state.mutation = "success";
        await confirm("tax", true);
        await expect(forms.tax.getByRole("status")).toHaveText(t.taxUpdated);
        await expect(input("tax")).toHaveValue("7.125");
        await expect(input("commission")).toHaveValue("29.875");
        await capture("tax-success-commission-draft-preserved");
        c.state.tax = "error";
        await confirm("tax", true);
        await expect(forms.tax.getByRole("alert")).toHaveText(t.taxUnavailable);
        await expect(input("tax")).toHaveValue("7.125");
        await expect(button("tax")).toBeEnabled();
        await capture("tax-cached-refresh-error-current-value-retained");
        await reload();
        await input("commission").focus();
        await page.keyboard.press("Tab");
        await expect(button("commission")).toBeFocused();
        expect(
          await button("commission").evaluate(
            (n) => getComputedStyle(n).outlineStyle,
          ),
        ).toBe("solid");
        expect(
          await button("commission").evaluate(
            (n) => getComputedStyle(n).outlineOffset,
          ),
        ).toBe("2px");
        await capture("keyboard-commission-save-focus");
        await page.keyboard.press("Tab");
        await expect(input("tax")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(button("tax")).toBeFocused();
        await capture("keyboard-tax-save-focus");
        await capture(
          locale === "ar"
            ? "long-arabic-copy-real-catalogue"
            : "long-copy-real-catalogue",
        );
        await page.setViewportSize({
          width: Math.max(320, Math.round(viewport.width / 2)),
          height: viewport.height,
        });
        await capture("200-percent-reflow-proxy");
        expect(c.errors).toEqual([]);
        expect(c.unexpected).toEqual([]);
        expect(dialogs).toHaveLength(8);
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
                "Full real Admin Wallet route at scroll top; captureBounds identify the Commission Settings region. Unrelated wallet unchanged.",
              nativeConfirmationEvidence:
                "Playwright native confirm dialog events; screenshots capture underlying region after accept/dismiss, not OS dialog pixels",
              dialogs,
              captures,
              captureBounds,
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
    }
