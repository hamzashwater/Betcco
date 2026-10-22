import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import en from "../../messages/en.json" with { type: "json" };
import ar from "../../messages/ar.json" with { type: "json" };
import {
  identityItems,
  identityPage,
} from "../fixtures/account-identity-archetype";
import { roleShellRuntimeResponse } from "../fixtures/role-shell-runtime";

// MOCKED UI-CONTRACT EVIDENCE. Real production UI; synthetic intercepted HTTP.
// No backend mutation, delivery, authorization, account-security or WCAG proof.
const items = Array.from({ length: 25 }, (_, i) => ({
  ...identityItems[i % 8],
  id: i < 8 ? identityItems[i].id : `${identityItems[i % 8].id}-${i}`,
  displayName:
    i < 8
      ? identityItems[i].displayName
      : `${identityItems[i % 8].displayName} ${i}`,
}));
type Event = {
  kind: string;
  path?: string;
  body?: unknown;
  message?: string;
  accepted?: boolean;
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
async function prepare(page: Page, locale: "en" | "ar", theme: string) {
  const state = { read: "data", write: "immediate", writeError: false };
  const reads: string[] = [],
    writes: { path: string; body: unknown }[] = [],
    events: Event[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  let readRelease: (() => void) | undefined,
    writeRelease: (() => void) | undefined;
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
    if (request.method() === "GET" && path === "/admin/users") {
      reads.push(path + url.search);
      if (state.read === "pending")
        await new Promise<void>((resolve) => {
          readRelease = resolve;
        });
      if (state.read === "error")
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic private request failure" },
        });
      return route.fulfill({
        json:
          state.read === "empty" ? identityPage([], 0) : identityPage(items),
      });
    }
    if (request.method() !== "GET") {
      const allowed =
        path === "/admin/users/support-admins/invite" ||
        items.some((u) =>
          [
            `/admin/users/${u.id}/freeze`,
            `/admin/users/${u.id}/email-change/request`,
            `/admin/users/support-admins/${u.id}/resend-activation`,
            `/admin/users/support-admins/${u.id}/revoke-authority`,
          ].includes(path),
        );
      if (!allowed || request.method() !== "POST") {
        unexpected.push(request.method() + " " + path);
        return route.fulfill({
          status: 409,
          json: { message: "Unexpected synthetic mutation" },
        });
      }
      const body = request.postData() ? request.postDataJSON() : undefined;
      writes.push({ path, body });
      events.push({ kind: "POST", path, body });
      if (state.write === "pending")
        await new Promise<void>((resolve) => {
          writeRelease = resolve;
        });
      return state.writeError
        ? route.fulfill({
            status: 409,
            json: { message: "Synthetic private mutation failure" },
          })
        : route.fulfill({ status: 202, json: {} });
    }
    return route.fulfill(
      roleShellRuntimeResponse(path, locale, ["Admin", "SystemAdmin"]),
    );
  });
  await page.goto(`/${locale}/admin/account-identities`);
  const copy = locale === "en" ? en : ar,
    toggle = page.getByRole("button", { name: copy.navigation.theme.toggle });
  if (!(await page.locator("html").getAttribute("data-theme")))
    await toggle.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== theme)
    await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  return {
    state,
    reads,
    writes,
    events,
    unexpected,
    errors,
    releaseRead: () => {
      expect(readRelease).toBeDefined();
      readRelease!();
    },
    releaseWrite: () => {
      expect(writeRelease).toBeDefined();
      writeRelease!();
    },
  };
}
async function keyboardFocus(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(locator).toBeFocused();
  expect(
    await locator.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  expect(
    await locator.evaluate((el) => getComputedStyle(el).outlineOffset),
  ).toBe("2px");
}
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1112 },
      { width: 390, height: 844 },
    ]) {
      test(`${locale} ${theme} ${viewport.width}: People identities, exact actions and native confirmations`, async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewport);
        const c = await prepare(page, locale, theme),
          t = (locale === "en" ? en : ar).adminWorkspace.accountIdentities,
          main = page.getByRole("main"),
          rows = main.getByRole("article");
        const capture = async (name: string) => {
          // Verify the selected app theme on every capture, including reloads.
          // Theme initialization is an existing separate concern; exercise the
          // real toggle rather than assuming persisted preference was applied.
          const toggle = page.getByRole("button", {
            name: (locale === "en" ? en : ar).navigation.theme.toggle,
          });
          if (!(await page.locator("html").getAttribute("data-theme")))
            await toggle.click();
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await toggle.click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBe(true);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          await page.screenshot({
            path: info.outputPath(name + ".png"),
            fullPage: true,
          });
        };
        const confirmAction = async (button: Locator, accepted: boolean) => {
          let message = "";
          page.once("dialog", async (dialog) => {
            expect(dialog.type()).toBe("confirm");
            message = dialog.message();
            c.events.push({ kind: "confirm", message, accepted });
            if (accepted) await dialog.accept();
            else await dialog.dismiss();
          });
          await button.click();
          return message;
        };
        await expect(rows).toHaveCount(25);
        expect(c.reads[0]).toBe("/admin/users?role=Teacher&page=1");
        expect(
          await rows.getByRole("heading", { level: 2 }).allTextContents(),
        ).toEqual(items.map((u) => u.displayName));
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        expect(
          await main
            .getByRole("heading", { level: 1 })
            .evaluate((el) => getComputedStyle(el).fontWeight),
        ).toBe("700");
        const rowHeight = await rows
          .first()
          .evaluate((el) => el.getBoundingClientRect().height);
        if (viewport.width === 1440) {
          expect(rowHeight).toBeGreaterThanOrEqual(52);
          expect(rowHeight).toBeLessThanOrEqual(70);
        }
        for (let i = 0; i < items.length; i++) {
          const u = items[i],
            v = rows.nth(i);
          await expect(v.getByText(u.email, { exact: true })).toHaveAttribute(
            "dir",
            "ltr",
          );
          await expect(
            v.getByText(
              u.isFrozen
                ? t.frozen
                : !u.emailConfirmed
                  ? t.awaitingActivation
                  : t.active,
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            v.getByRole("button", { name: t.resend, exact: true }),
          ).toHaveCount(0);
          await expect(
            v.getByRole("button", { name: t.revoke, exact: true }),
          ).toHaveCount(0);
        }
        await capture("01-teacher-long-list-all-factual-statuses");
        await rows.first().locator("summary").click();
        await rows.nth(5).locator("summary").click();
        const firstInput = rows.first().getByLabel(t.newEmail, { exact: true }),
          otherInput = rows.nth(5).getByLabel(t.newEmail, { exact: true });
        const beforeDraft = c.reads.length;
        await firstInput.fill("first.draft@example.test");
        await otherInput.fill("other.draft@example.test");
        await rows.first().locator("summary").click();
        await rows.nth(5).locator("summary").click();
        await rows.nth(5).locator("summary").click();
        await rows.first().locator("summary").click();
        await expect(firstInput).toHaveValue("first.draft@example.test");
        await expect(otherInput).toHaveValue("other.draft@example.test");
        expect(c.reads).toHaveLength(beforeDraft);
        expect(c.writes).toHaveLength(0);
        await capture("02-per-user-drafts-and-mounted-disclosures");
        await rows.nth(2).locator("summary").click();
        await expect(
          rows.nth(2).getByLabel(t.newEmail, { exact: true }),
        ).toBeDisabled();
        await expect(
          rows.nth(2).getByRole("button", { name: t.changeEmail, exact: true }),
        ).toBeDisabled();
        await expect(
          rows.nth(2).getByText(t.activationRequired, { exact: true }),
        ).toBeVisible();
        await capture("03-disabled-email-before-activation");
        await main.getByRole("button", { name: t.next, exact: true }).click();
        await expect
          .poll(() => c.reads.at(-1))
          .toBe("/admin/users?role=Teacher&page=2");
        await expect(rows).toHaveCount(25);
        await capture("04-teacher-page-two");
        await main
          .getByRole("button", { name: t.supportAdmins, exact: true })
          .click();
        await expect(
          main.getByRole("button", { name: t.send, exact: true }),
        ).toBeVisible();
        await expect(rows).toHaveCount(25);
        await expect
          .poll(() => c.reads.at(-1))
          .toBe("/admin/users?role=SupportAdmin&page=1");
        await expect(
          main.getByRole("button", { name: t.previous, exact: true }),
        ).toBeDisabled();
        const supportRowHeights = await Promise.all(
          [0, 1, 2].map((index) =>
            rows.nth(index).evaluate((el) => el.getBoundingClientRect().height),
          ),
        );
        if (viewport.width === 1440)
          for (const height of supportRowHeights) {
            expect(height).toBeGreaterThanOrEqual(52);
            expect(height).toBeLessThanOrEqual(70);
          }
        for (let i = 0; i < items.length; i++)
          await expect(
            rows.nth(i).getByRole("button", { name: t.resend, exact: true }),
          ).toHaveCount(
            !items[i].emailConfirmed && items[i].mustChangePassword ? 1 : 0,
          );
        const danger = rows
            .first()
            .getByRole("button", { name: t.revoke, exact: true }),
          freeze = rows
            .first()
            .getByRole("button", { name: t.freeze, exact: true });
        expect(
          await danger.evaluate((el) => getComputedStyle(el).color),
        ).not.toBe(await freeze.evaluate((el) => getComputedStyle(el).color));
        await capture(
          "05-support-list-invite-resend-and-distinct-danger-action",
        );
        const name = main.getByLabel(t.name, { exact: true }),
          email = main.getByLabel(t.email, { exact: true }),
          send = main.getByRole("button", { name: t.send, exact: true });
        await expect(name).toHaveAttribute("minlength", "2");
        await expect(name).toHaveAttribute("maxlength", "160");
        await expect(email).toHaveAttribute("type", "email");
        await expect(email).toHaveAttribute("maxlength", "320");
        await rows.first().locator("summary").click();
        await rows.nth(5).locator("summary").click();
        await expect(firstInput).toHaveValue("first.draft@example.test");
        await expect(otherInput).toHaveValue("other.draft@example.test");
        await name.fill("Synthetic Support");
        await email.fill("invite@example.test");
        c.state.write = "pending";
        await send.click();
        await expect(send).toBeDisabled();
        await expect(send).toHaveAttribute("aria-busy", "true");
        await expect.poll(() => c.writes.length).toBe(1);
        expect(c.writes[0]).toEqual({
          path: "/admin/users/support-admins/invite",
          body: {
            displayName: "Synthetic Support",
            email: "invite@example.test",
          },
        });
        await capture("06-invite-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toContainText(t.inviteError);
        await expect(name).toHaveValue("Synthetic Support");
        await expect(email).toHaveValue("invite@example.test");
        await capture("07-invite-error-retains-inputs");
        c.state.writeError = false;
        await send.click();
        await expect.poll(() => c.writes.length).toBe(2);
        c.releaseWrite();
        await expect(main.getByRole("status")).toContainText(t.inviteSuccess);
        await expect(name).toHaveValue("");
        await expect(email).toHaveValue("");
        await expect(firstInput).toHaveValue("first.draft@example.test");
        await capture("08-invite-success-retains-other-workflow-drafts");
        await rows
          .first()
          .getByRole("button", { name: t.changeEmail, exact: true })
          .click();
        await expect.poll(() => c.writes.length).toBe(3);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/identity-z/email-change/request",
          body: { newEmail: "first.draft@example.test" },
        });
        await expect(main.getByRole("status")).toHaveCount(0);
        await capture("09-email-mutation-pending");
        c.state.writeError = true;
        c.releaseWrite();
        await expect(main.getByRole("alert")).toContainText(t.actionError);
        await expect(firstInput).toHaveValue("first.draft@example.test");
        await expect(otherInput).toHaveValue("other.draft@example.test");
        await capture("10-action-error-with-independent-drafts");
        c.state.writeError = false;
        await rows
          .first()
          .getByRole("button", { name: t.changeEmail, exact: true })
          .click();
        await expect.poll(() => c.writes.length).toBe(4);
        c.releaseWrite();
        await expect(main.getByRole("status")).toContainText(t.emailSuccess);
        await expect(firstInput).toHaveValue("");
        await expect(otherInput).toHaveValue("other.draft@example.test");
        await capture("11-email-success-clears-only-target-draft");
        c.state.write = "immediate";
        await rows
          .nth(2)
          .getByRole("button", { name: t.resend, exact: true })
          .click();
        await expect.poll(() => c.writes.length).toBe(5);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/support-admins/identity-pending/resend-activation",
          body: undefined,
        });
        await expect(main.getByRole("status")).toContainText(t.resendSuccess);
        await capture("12-eligible-resend-activation");
        const countBeforeCancel = c.writes.length;
        expect(await confirmAction(freeze, false)).toBe(t.freezeConfirmation);
        expect(c.writes).toHaveLength(countBeforeCancel);
        await capture("13-freeze-confirmation-cancelled-no-post");
        c.state.write = "pending";
        expect(await confirmAction(freeze, true)).toBe(t.freezeConfirmation);
        await expect.poll(() => c.writes.length).toBe(6);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/identity-z/freeze",
          body: { frozen: true },
        });
        await expect(freeze).toBeDisabled();
        await capture("14-freeze-confirmed-pending");
        c.releaseWrite();
        await expect(freeze).toBeEnabled();
        const reactivate = rows
          .nth(1)
          .getByRole("button", { name: t.reactivate, exact: true });
        expect(await confirmAction(reactivate, true)).toBe(
          t.reactivateConfirmation,
        );
        await expect.poll(() => c.writes.length).toBe(7);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/identity-frozen/freeze",
          body: { frozen: false },
        });
        await capture("15-reactivate-confirmed-pending");
        c.releaseWrite();
        await expect(reactivate).toBeEnabled();
        const revokeCopy = t.revokeConfirmation.replace(
          "{name}",
          items[0].displayName,
        );
        expect(await confirmAction(danger, false)).toBe(revokeCopy);
        expect(c.writes).toHaveLength(7);
        expect(await confirmAction(danger, true)).toBe(revokeCopy);
        await expect.poll(() => c.writes.length).toBe(8);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/support-admins/identity-z/revoke-authority",
          body: undefined,
        });
        await capture("16-distinct-revoke-confirmed-pending");
        c.releaseWrite();
        await expect(main.getByRole("status")).toContainText(t.revokeSuccess);
        await capture("17-revoke-success-existing-account-retention-copy");
        for (const control of [
          main.getByRole("button", { name: t.teachers, exact: true }),
          main.getByRole("button", { name: t.supportAdmins, exact: true }),
          name,
          email,
          send,
          freeze,
          reactivate,
          danger,
          rows.nth(2).getByRole("button", { name: t.resend, exact: true }),
        ])
          await keyboardFocus(page, control);
        const summary = rows.first().locator("summary");
        await summary.click();
        await keyboardFocus(page, summary);
        await page.keyboard.press("Enter");
        await expect(firstInput).toBeVisible();
        await expect(otherInput).toHaveValue("other.draft@example.test");
        await capture("18-keyboard-focus-and-disclosure");
        await firstInput.fill("keyboard.target@example.test");
        c.state.write = "immediate";
        await firstInput.press("Enter");
        await expect.poll(() => c.writes.length).toBe(9);
        expect(c.writes.at(-1)).toEqual({
          path: "/admin/users/identity-z/email-change/request",
          body: { newEmail: "keyboard.target@example.test" },
        });
        await page.setViewportSize({
          width: Math.max(320, Math.floor(viewport.width / 2)),
          height: Math.floor(viewport.height / 2),
        });
        await capture("19-half-viewport-reflow-proxy");
        await page.setViewportSize(viewport);
        c.state.read = "empty";
        await page.reload();
        await expect(main.getByText(t.empty, { exact: true })).toBeVisible();
        await expect(rows).toHaveCount(0);
        await capture("20-successful-empty");
        c.state.read = "pending";
        await page.reload();
        await expect(main.getByRole("status")).toContainText(t.loading);
        await expect(rows).toHaveCount(0);
        await capture("21-initial-pending");
        c.state.read = "error";
        c.releaseRead();
        await expect(main.getByRole("alert")).toContainText(t.loadError);
        await expect(main.getByText(t.empty, { exact: true })).toHaveCount(0);
        await capture("22-cold-load-error-generic-factual-copy");
        expect(c.unexpected).toEqual([]);
        expect(c.errors).toEqual([]);
        for (let i = 0; i < c.events.length; i++)
          if (
            c.events[i].kind === "POST" &&
            /\/(freeze|revoke-authority)$/.test(c.events[i].path ?? "")
          ) {
            expect(c.events[i - 1].kind).toBe("confirm");
            expect(c.events[i - 1].accepted).toBe(true);
          }
        writeFileSync(
          info.outputPath("contracts.json"),
          JSON.stringify(
            {
              classification: "MOCKED UI-CONTRACT EVIDENCE",
              locale,
              theme,
              viewport,
              rowHeight,
              supportRowHeights,
              reads: c.reads,
              writes: c.writes,
              events: c.events,
              unexpected: c.unexpected,
              pageErrors: c.errors,
              reflow:
                "Half CSS viewport width, minimum 320px. Not native browser zoom.",
            },
            null,
            2,
          ),
        );
      });
    }
