import { expect, test } from "@playwright/test";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };

for (const locale of ["ar", "en"] as const) {
  test(`wallet translated lifecycle in ${locale} (mocked UI contracts)`, async ({
    page,
  }) => {
    const copy = (locale === "ar" ? ar : en).adminWorkspace.wallet;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let status = "Requested";
    const writes: { path: string; body: unknown }[] = [];
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (v: unknown) => route.fulfill({ json: v });
      if (path.endsWith("/auth/me"))
        return json({ id: "admin", roles: ["Admin"], displayName: "Admin" });
      if (path.endsWith("/security/antiforgery"))
        return json({ token: "test-token" });
      if (path.endsWith("/commerce-catalog/commission"))
        return json({ platformCommissionPercent: 30, teacherSharePercent: 70 });
      if (path.endsWith("/commerce-catalog/sales-tax"))
        return json({ salesTaxPercent: 0 });
      if (path.endsWith("/admin/wallet"))
        return json({
          platformBalance: 30,
          confirmedPlatformCommission: 30,
          currency: "EUR",
          recentSales: [],
          payouts: [
            {
              id: "p",
              teacherUserId: "t",
              teacherName: "RAW Teacher",
              teacherEmail: "raw@example.test",
              amount: 50,
              currency: "USD",
              method: "BankTransfer",
              destinationMasked: "•••• 4321",
              status,
              reviewNote: "SERVER NOTE",
              createdAtUtc: "2026-10-10T12:00:00Z",
            },
          ],
        });
      if (path.includes("/admin/wallet/payouts/")) {
        writes.push({
          path,
          body: route.request().postData()
            ? route.request().postDataJSON()
            : null,
        });
        status = path.endsWith("/approve")
          ? "Approved"
          : path.endsWith("/execute")
            ? "Paid"
            : "Settled";
        return json({ status });
      }
      if (path.endsWith("/cart")) return json({ items: [], total: 0 });
      return json([]);
    });
    await page.goto(`/${locale}/admin/wallet`);
    await expect(
      page.getByRole("heading", { name: copy.walletAndPayouts, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Requested", { exact: true })).toBeVisible();
    await expect(page.getByText("•••• 4321", { exact: false })).toBeVisible();
    await page.getByLabel(copy.adminNote).fill(" untrimmed note ");
    await page.getByRole("button", { name: copy.approve, exact: true }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    expect(writes[0]).toEqual({
      path: "/api/v1/admin/wallet/payouts/p/approve",
      body: { note: " untrimmed note " },
    });
    await page
      .getByRole("button", { name: copy.executePayout, exact: true })
      .click();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: copy.settlePayout, exact: true })
      .click();
    await expect(page.getByText("Settled", { exact: true })).toBeVisible();
    expect(writes.slice(1)).toEqual([
      { path: "/api/v1/admin/wallet/payouts/p/execute", body: null },
      { path: "/api/v1/admin/wallet/payouts/p/settle", body: null },
    ]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.BETCCO_I18N_EVIDENCE_DIR ?? "test-results"}/wallet-${locale}.png`,
      fullPage: true,
    });
  });
}
