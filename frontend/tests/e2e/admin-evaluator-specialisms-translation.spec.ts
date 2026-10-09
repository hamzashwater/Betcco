import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  grants,
  paths,
  staff,
  units,
} from "../fixtures/admin-evaluator-specialisms";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`Evaluator specialisms ${scenario.locale} — MOCKED UI-CONTRACT EVIDENCE`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario);
    const messages = scenario.locale === "ar" ? ar : en,
      c = messages.adminWorkspace.evaluatorSpecialisms,
      shared = messages.adminWorkspace.shared;
    const errors: string[] = [],
      reads: string[] = [],
      writes: { path: string; method: string; body: unknown }[] = [];
    const items = grants.map((item) => ({ ...item }));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace(/^\/api\/v1/, "");
      if (request.method() === "POST") {
        writes.push({
          path: p,
          method: request.method(),
          body: request.postDataJSON(),
        });
        const item = items.find((item) => p === paths.revoke(item.id));
        if (item) item.revokedAtUtc = "2026-09-25T10:00:00Z";
        return route.fulfill({ status: 204 });
      }
      reads.push(p + url.search);
      if (p === "/auth/me")
        return route.fulfill({
          json: { displayName: "Synthetic Admin", roles: ["Admin"] },
        });
      if (p === paths.staff) return route.fulfill({ json: staff });
      if (p === paths.units) return route.fulfill({ json: units });
      if (p === paths.grant)
        return route.fulfill({
          json: {
            items,
            page: Number(url.searchParams.get("page")),
            pageSize: 25,
            totalCount: 51,
          },
        });
      if (p === "/notifications") return route.fulfill({ json: [] });
      if (p === "/cart") return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto(`/${scenario.locale}/admin/evaluator-specialisms`);
    await expect(
      page.getByRole("heading", { name: c.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      scenario.locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    await expect(page.getByText(c.description, { exact: true })).toBeVisible();
    const evaluator = page.getByRole("combobox", {
        name: c.evaluator,
        exact: true,
      }),
      unit = page.getByRole("combobox", { name: c.academicUnit, exact: true }),
      grant = page.getByRole("button", { name: c.grant, exact: true });
    await expect(evaluator).toBeEnabled();
    await expect(unit).toBeEnabled();
    for (const item of units)
      await expect(unit.locator(`option[value="${item.id}"]`)).toHaveText(
        `QUAL V1 · ${item.code} — ${scenario.locale === "ar" ? item.arabicTitle : item.englishTitle}`,
      );
    // Verify blank-field selection without cross-language fallback.
    const blank = scenario.locale === "ar" ? units[1] : units[2];
    expect(
      await unit.locator(`option[value="${blank.id}"]`).textContent(),
    ).toBe(`QUAL V1 · ${blank.code} — `);
    await expect(grant).toBeDisabled();
    await evaluator.selectOption(staff[0].id);
    await expect(grant).toBeDisabled();
    await unit.selectOption(units[0].id);
    await expect(grant).toBeEnabled();
    const row = (index: number) =>
      page.locator("article").filter({
        has: page.getByText(grants[index].evaluatorName, { exact: true }),
      });
    await expect(
      row(0).getByText("H1 — Raw English history fallback", { exact: true }),
    ).toBeVisible();
    await expect(
      row(1).getByText("H2 — عنوان السجل العربي", { exact: true }),
    ).toBeVisible();
    await expect(
      row(2).locator("span").filter({ hasText: c.revokedStatus }),
    ).toBeVisible();
    await expect(row(2).getByRole("button")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `specialisms-${scenario.locale}-${scenario.width}.png`,
      ),
      fullPage: true,
    });
    await row(2).screenshot({
      path: testInfo.outputPath(`revoked-history-${scenario.locale}.png`),
    });
    await grant.click();
    await expect(page.getByRole("status")).toHaveText(c.grantSuccess);
    expect(writes).toEqual([
      {
        path: paths.grant,
        method: "POST",
        body: { evaluatorUserId: staff[0].id, unitDefinitionId: units[0].id },
      },
    ]);
    await expect(evaluator).toHaveValue(staff[0].id);
    await expect(unit).toHaveValue(units[0].id);
    await row(0).getByRole("button", { name: c.revoke, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(c.revokeSuccess);
    expect(writes[1]).toEqual({
      path: paths.revoke(grants[0].id),
      method: "POST",
      body: { reason: null },
    });
    await expect(row(0).getByRole("button")).toHaveCount(0);
    await expect(
      row(0).locator("span").filter({ hasText: c.revokedStatus }),
    ).toBeVisible();
    await expect(
      row(1).getByRole("button", { name: c.revoke, exact: true }),
    ).toBeEnabled();
    const previous = page.getByRole("button", {
        name: shared.previous,
        exact: true,
      }),
      next = page.getByRole("button", { name: shared.next, exact: true });
    await expect(previous).toBeDisabled();
    await next.click();
    await expect.poll(() => reads.includes(paths.history(2))).toBe(true);
    await expect(previous).toBeEnabled();
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => reads.includes(paths.history(3))).toBe(true);
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(next).toBeEnabled();
    expect(reads).toEqual(
      expect.arrayContaining([paths.staff, paths.units, paths.history(1)]),
    );
    expect(writes).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
