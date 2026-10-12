import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import {
  purchaseCart,
  purchaseMembership,
  purchasePackage,
  purchasePayment,
  purchaseSubscription,
} from "../helpers/public-purchase-fixtures";

for (const scenario of [
  { locale: "en", width: 1280, height: 800 },
  { locale: "ar", width: 390, height: 844 },
] as const) {
  test(`purchase/membership/payment ${scenario.locale} (MOCKED UI-CONTRACT EVIDENCE)`, async ({
    page,
  }, testInfo) => {
    const messages = scenario.locale === "ar" ? ar : en,
      m = messages.publicPurchase;
    const errors: string[] = [],
      requests: {
        method: string;
        path: string;
        body: string | null;
        idempotency: string | undefined;
      }[] = [];
    let student = false,
      cartMode: "data" | "empty" | "error" = "data",
      holdCheckout = false,
      packageEmpty = false,
      releaseCheckout: (() => void) | undefined;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|react error|MISSING_MESSAGE|INVALID_MESSAGE/i.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    await page.setViewportSize(scenario);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      requests.push({
        method: request.method(),
        path: path + url.search,
        body: request.postData(),
        idempotency: request.headers()["idempotency-key"],
      });
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            id: "raw-user",
            displayName: "RAW User",
            roles: student ? ["Student"] : ["Teacher"],
          },
        });
      if (path.endsWith("/security/antiforgery"))
        return route.fulfill({ json: { token: "test-token" } });
      if (path.endsWith("/settings/public")) return route.fulfill({ json: {} });
      if (path.endsWith("/taxonomy"))
        return route.fulfill({
          json: { tracks: [], grades: [], specializations: [], subjects: [] },
        });
      if (path.endsWith("/notifications")) return route.fulfill({ json: [] });
      if (path.endsWith("/payments/fake/confirm"))
        return route.fulfill({
          status: 409,
          json: { message: "RAW provider failure خطأ" },
        });
      if (path.endsWith("/checkout")) {
        if (holdCheckout)
          await new Promise<void>((resolve) => {
            releaseCheckout = resolve;
          });
        return route.fulfill({ json: purchasePayment });
      }
      if (path.endsWith("/cart"))
        return cartMode === "error"
          ? route.fulfill({
              status: 503,
              json: { message: "RAW cart failure" },
            })
          : route.fulfill({
              json: {
                ...purchaseCart,
                items: cartMode === "empty" ? [] : purchaseCart.items,
              },
            });
      if (path.includes("/cart/items/") || path.includes("/cart/packages/"))
        return route.fulfill({ json: {} });
      if (path.endsWith("/memberships"))
        return route.fulfill({ json: [purchaseMembership] });
      if (path.endsWith("/course-subscriptions"))
        return route.fulfill({ json: [purchaseSubscription] });
      if (path.endsWith("/public/packages"))
        return route.fulfill({ json: packageEmpty ? [] : [purchasePackage] });
      return route.fulfill({
        json: { items: [], page: 1, pageSize: 12, totalCount: 0 },
      });
    });
    async function evidence(name: string) {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await expect(
        page.locator(
          `[lang="${scenario.locale}"][dir="${scenario.locale === "ar" ? "rtl" : "ltr"}"]`,
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await testInfo.attach(name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      if (process.env.BETCCO_EVIDENCE_DIR) {
        mkdirSync(process.env.BETCCO_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({
          path: `${process.env.BETCCO_EVIDENCE_DIR}/${scenario.locale}-${name}.png`,
          fullPage: true,
        });
      }
    }
    await page.goto(`/${scenario.locale}/cart`);
    await page
      .getByRole("button", { name: messages.cookieConsent.reject, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: m.cart.studentRequired }),
    ).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: m.cart.signIn, exact: true }),
    ).toHaveAttribute("href", `/${scenario.locale}/login`);
    expect(requests.some((r) => r.path.startsWith("/api/v1/cart?"))).toBe(
      false,
    );
    await evidence("purchase-gate");

    student = true;
    await page.goto(`/${scenario.locale}/cart`);
    await expect(
      page.getByRole("heading", { name: m.cart.title }),
    ).toBeVisible();
    await expect(
      page.getByText(purchaseCart.items[0].title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("main").getByText("Course", { exact: true }),
    ).toBeVisible();
    const money = (amount: number) =>
      new Intl.NumberFormat(scenario.locale === "ar" ? "ar-JO" : "en-JO", {
        style: "currency",
        currency: "JOD",
        currencyDisplay: "code",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(amount);
    expect(await page.locator("main strong").first().textContent()).toBe(
      money(10.125),
    );
    const remove = page.getByRole("button", { name: m.cart.removeItem });
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        requests.some(
          (r) =>
            r.method === "DELETE" &&
            r.path === `/api/v1/cart/items/${purchaseCart.items[0].id}`,
        ),
      )
      .toBe(true);
    await evidence("cart");
    const proceed = page.getByRole("link", { name: m.cart.checkout });
    await proceed.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${scenario.locale}/checkout$`));
    await expect(
      page.getByRole("heading", { name: m.checkout.title }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: m.checkout.coupon })
      .fill(" RAW_coupon ");
    await page.getByRole("radio", { name: m.checkout.bankTransfer }).check();
    await expect(
      page.getByRole("radio", { name: m.checkout.bankTransfer }),
    ).toHaveAttribute("value", "BankTransfer");
    holdCheckout = true;
    const create = page.getByRole("button", { name: m.checkout.create });
    await create.focus();
    await page.keyboard.press("Enter");
    await expect(create).toBeDisabled();
    await expect.poll(() => releaseCheckout !== undefined).toBe(true);
    const request = requests.find((r) => r.path === "/api/v1/cart/checkout")!;
    expect(request.method).toBe("POST");
    expect(request.body).toBe(
      JSON.stringify({
        couponCode: " RAW_coupon ",
        paymentMethod: "BankTransfer",
      }),
    );
    expect(request.idempotency).toMatch(/^[\da-f-]{36}$/i);
    holdCheckout = false;
    releaseCheckout!();
    await expect(page.getByText(m.checkout.developmentNotice)).toBeVisible();
    expect(
      await page
        .locator("main dt")
        .filter({ hasText: new RegExp("^" + m.checkout.discount + "$") })
        .locator("..")
        .locator("dd")
        .textContent(),
    ).toBe(money(-2.005));
    await evidence("checkout-fake-result");
    const confirm = page.getByRole("button", { name: m.checkout.confirmTest });
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "RAW provider failure خطأ",
    );
    const confirmRequest = requests.find(
      (r) => r.path === "/api/v1/payments/fake/confirm",
    )!;
    expect(JSON.parse(confirmRequest.body!)).toEqual({
      paymentId: purchasePayment.paymentId,
      providerEventId: expect.stringMatching(/^test_[\da-f-]{36}$/i),
    });
    await evidence("payment-error");

    await page.goto(`/${scenario.locale}/memberships`);
    await expect(
      page.getByRole("heading", { name: m.memberships.title }),
    ).toBeVisible();
    const member = page.getByRole("heading", {
      name: purchaseMembership.title,
    });
    await expect(member).toBeVisible();
    await expect(
      page.getByText(purchaseMembership.interval, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(purchaseSubscription.courseTitle, { exact: true }),
    ).toBeVisible();
    const start = member
      .locator("..")
      .getByRole("button", { name: m.memberships.start });
    await start.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(m.memberships.developmentNotice)).toBeVisible();
    const memberRequest = requests.find(
      (r) => r.path === `/api/v1/memberships/${purchaseMembership.id}/checkout`,
    )!;
    expect(memberRequest.method).toBe("POST");
    expect(memberRequest.body).toBe(
      JSON.stringify({ couponCode: null, paymentMethod: "Card" }),
    );
    await evidence("membership-fake-result");

    await page.goto(`/${scenario.locale}/packages`);
    await expect(
      page.getByRole("heading", { name: purchasePackage.title }),
    ).toBeVisible();
    await expect(
      page.getByText(purchasePackage.courses[0].title, { exact: true }),
    ).toBeVisible();
    const add = page.getByRole("button", {
      name: messages.publicContent.packages.add,
    });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText(
      messages.publicContent.packages.added,
    );
    await expect(
      page.getByRole("link", {
        name: messages.publicContent.packages.viewCart,
      }),
    ).toHaveAttribute("href", `/${scenario.locale}/cart`);
    expect(
      requests.some(
        (r) =>
          r.method === "POST" &&
          r.path ===
            `/api/v1/cart/packages/${purchasePackage.id}?locale=${scenario.locale}`,
      ),
    ).toBe(true);
    await evidence("package-added");
    packageEmpty = true;
    await page.goto(`/${scenario.locale}/packages`);
    const browse = page.getByRole("link", { name: m.packages.browseCourses });
    await expect(browse).toHaveAttribute("href", `/${scenario.locale}/courses`);
    await evidence("package-empty");
    await browse.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${scenario.locale}/courses$`));
    await page.goto(`/${scenario.locale}/checkout/paytabs-result`);
    await expect(
      page.getByRole("heading", { name: m.result.title }),
    ).toBeVisible();
    await expect(page.getByText(m.result.description)).toBeVisible();
    await evidence("provider-return");

    cartMode = "empty";
    await page.goto(`/${scenario.locale}/cart`);
    await expect(page.getByText(m.cart.empty)).toBeVisible();
    await expect(page.getByRole("link", { name: m.cart.checkout })).toHaveClass(
      /pointer-events-none/,
    );
    await evidence("cart-empty");
    cartMode = "error";
    await page.goto(`/${scenario.locale}/cart`);
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      m.cart.loadError,
    );
    await evidence("cart-error");
  });
}
