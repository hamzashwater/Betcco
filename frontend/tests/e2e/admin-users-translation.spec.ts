import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  identities,
  invitations,
  students,
  teachers,
} from "../fixtures/admin-users";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`Admin users/identities ${scenario.locale} — mocked UI-contract evidence`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en,
      copy = messages.adminWorkspace;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/auth/me"))
        return route.fulfill({
          json: { displayName: "Mock Admin", roles: ["Admin"] },
        });
      if (url.pathname.endsWith("/admin/users"))
        return route.fulfill({
          json:
            url.searchParams.get("role") === "Student"
              ? { items: students, totalCount: students.length }
              : url.searchParams.has("pageSize")
                ? { items: teachers, totalCount: teachers.length }
                : { items: identities, totalCount: 26 },
        });
      if (url.pathname.endsWith("/admin/users/teachers/invitations"))
        return route.fulfill({
          json: { items: invitations, totalCount: invitations.length },
        });
      if (url.pathname.endsWith("/notifications"))
        return route.fulfill({ json: [] });
      if (url.pathname.endsWith("/cart"))
        return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: {} });
    });
    const segment = scenario.locale === "en" ? "students" : "teachers";
    await page.goto(`/${scenario.locale}/admin/${segment}`);
    const c = segment === "students" ? copy.students : copy.teacherInvites;
    await expect(
      page.getByRole("heading", { name: c.title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    if (segment === "students") {
      const s = copy.students;
      await expect(page.getByLabel(s.searchLabel)).toHaveAttribute(
        "placeholder",
        s.searchPlaceholder,
      );
      const student = page
        .locator("article")
        .filter({ hasText: students[0].email });
      await expect(student.getByText(s.emailVerified)).toBeVisible();
      await student.getByRole("button", { name: s.resetDevice }).click();
      const modal = page.getByRole("dialog");
      await expect(
        modal.getByRole("heading", { name: s.resetTitle }),
      ).toBeVisible();
      await expect(modal).toContainText("Record a reason for the audit log.");
      await expect(
        modal.getByRole("button", { name: s.confirmReset }),
      ).toBeDisabled();
      await modal.getByLabel(s.resetReason).fill("Browser mock reason");
      await expect(
        modal.getByRole("button", { name: s.confirmReset }),
      ).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath("student-reset-dialog-en.png"),
      });
      await modal.getByRole("button", { name: copy.shared.cancel }).click();
      await student
        .getByRole("button", { name: s.delete, exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: s.deleteDialogLabel }),
      ).toContainText("Required payment and audit records remain for review.");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: copy.shared.cancel })
        .click();
      await page.getByLabel(s.selectAll, { exact: true }).check();
      await page
        .getByRole("button", { name: s.freezeSelected, exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: s.bulkActions.freeze }),
      ).toContainText("deletion and device resets are excluded.");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: copy.shared.cancel })
        .click();
    } else {
      const t = copy.teacherInvites;
      await expect(page.getByPlaceholder(t.namePlaceholder)).toBeVisible();
      await expect(
        page.getByRole("button", { name: t.send, exact: true }),
      ).toBeVisible();
      for (const status of Object.values(t.statuses))
        await expect(
          page.getByText(status, { exact: true }).first(),
        ).toBeVisible();
      const invite = page
        .locator("article")
        .filter({ hasText: invitations[0].email });
      await expect(
        invite.getByPlaceholder(t.reasonPlaceholder),
      ).toHaveAttribute("maxlength", "500");
      await expect(
        invite.getByRole("button", { name: t.revoke }),
      ).toBeDisabled();
      await invite
        .getByPlaceholder(t.reasonPlaceholder)
        .fill("سبب اختبار المتصفح");
      await expect(
        invite.getByRole("button", { name: t.revoke }),
      ).toBeEnabled();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`admin-${segment}-${scenario.locale}.png`),
      fullPage: true,
    });
    await page
      .getByRole("heading", { name: c.title, exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `admin-${segment}-${scenario.locale}-viewport.png`,
      ),
    });

    await page.goto(`/${scenario.locale}/admin/account-identities`);
    const a = copy.accountIdentities;
    await expect(page.getByRole("heading", { name: a.title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: a.revoke, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: a.supportAdmins, exact: true })
      .click();
    await expect(page.getByLabel(a.name, { exact: true })).toHaveAttribute(
      "minlength",
      "2",
    );
    await expect(page.getByLabel(a.email, { exact: true })).toHaveAttribute(
      "maxlength",
      "320",
    );
    const identity = page
      .locator("article")
      .filter({ hasText: identities[0].email });
    await expect(identity.getByText(a.active, { exact: true })).toBeVisible();
    const confirmations: string[] = [];
    page.on("dialog", async (dialog) => {
      confirmations.push(dialog.message());
      await dialog.dismiss();
    });
    await identity.getByRole("button", { name: a.freeze, exact: true }).click();
    expect(confirmations).toEqual([a.freezeConfirmation]);
    await identity.getByRole("button", { name: a.revoke, exact: true }).click();
    expect(confirmations[1]).toContain(identities[0].displayName);
    expect(confirmations[1]).toContain(
      scenario.locale === "ar" ? "سيُحتفظ بالحساب" : "The account will remain",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByRole("heading", { name: a.title }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `admin-identities-${scenario.locale}-viewport.png`,
      ),
    });
    await expect(page.locator("body")).not.toContainText("MISSING_MESSAGE");
    expect(errors).toEqual([]);
  });
}
