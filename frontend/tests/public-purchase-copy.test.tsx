import { CartView, StudentPurchaseAccess } from "@/features/cart/cart-view";
import { Checkout } from "@/features/cart/checkout";
import PayTabsResultPage from "@/app/[locale]/checkout/paytabs-result/page";
import {
  MembershipDirectory,
  PackageDirectory,
} from "@/features/public/public-content";
import { api } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  purchaseCart,
  purchaseMembership,
  purchasePackage,
  purchasePayment,
  purchaseSubscription,
} from "./helpers/public-purchase-fixtures";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
type Mode = "success" | "raw" | "fallback" | "pending";
let state: {
  roles: string[] | null;
  authPending: boolean;
  cart: "data" | "empty" | "error" | "pending";
  directory: "data" | "empty" | "error" | "pending";
  checkout: Mode;
  confirm: Mode;
  add: Mode;
  provider: string;
  status: string;
};
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    roles: ["Student"],
    authPending: false,
    cart: "data",
    directory: "data",
    checkout: "success",
    confirm: "success",
    add: "success",
    provider: "FakeCard",
    status: "Pending",
  };
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/auth/me") {
      if (state.authPending) return new Promise(() => {});
      if (!state.roles) throw new Error("Unauthorized");
      return { roles: state.roles };
    }
    if (options?.method) {
      const mode =
        path === "/payments/fake/confirm"
          ? state.confirm
          : path.includes("checkout")
            ? state.checkout
            : state.add;
      if (mode === "raw")
        throw new Error(
          path === "/payments/fake/confirm"
            ? "RAW confirmation failure خطأ"
            : "RAW checkout failure خطأ",
        );
      if (mode === "fallback") throw "Non-Error server rejection";
      if (mode === "pending") return new Promise(() => {});
      return {
        ...purchasePayment,
        provider: state.provider,
        status: state.status,
      };
    }
    if (path.startsWith("/cart?")) {
      if (state.cart === "pending") return new Promise(() => {});
      if (state.cart === "error") throw new Error("RAW cart failure");
      return {
        ...purchaseCart,
        items: state.cart === "empty" ? [] : purchaseCart.items,
      };
    }
    if (state.directory === "pending") return new Promise(() => {});
    if (state.directory === "error") throw new Error("RAW directory failure");
    if (state.directory === "empty") return [];
    if (path.startsWith("/memberships?")) return [purchaseMembership];
    if (path.startsWith("/course-subscriptions?"))
      return [purchaseSubscription];
    if (path.startsWith("/public/packages?")) return [purchasePackage];
    throw new Error(`Unexpected UI-contract API ${path}`);
  });
});
afterEach(cleanup);
function mount(child: React.ReactNode, locale: "ar" | "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
        timeZone="UTC"
      >
        {child}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
function money(amount: number, locale: "ar" | "en") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-JO", {
    style: "currency",
    currency: "JOD",
    currencyDisplay: "code",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount);
}
describe.each(["ar", "en"] as const)(
  "T7-A6.4 %s UI and financial contracts",
  (locale) => {
    const messages = locale === "ar" ? ar : en,
      m = messages.publicPurchase;
    it("student access localizes copy while preserving both public routes", () => {
      mount(<StudentPurchaseAccess locale={locale} />, locale);
      expect(
        screen.getByRole("heading", { name: m.cart.studentRequired }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: m.cart.signIn })).toHaveAttribute(
        "href",
        `/${locale}/login`,
      );
      expect(
        screen.getByRole("link", { name: m.cart.continueGuest }),
      ).toHaveAttribute("href", `/${locale}/courses`);
    });
    it.each([null, ["Teacher"], ["Student", "Teacher"]])(
      "cart role %j preserves the original includes-Student gate",
      async (roles) => {
        state.roles = roles;
        mount(<CartView />, locale);
        if (roles?.includes("Student"))
          expect(
            await screen.findByText(purchaseCart.items[0].title),
          ).toBeVisible();
        else {
          expect(
            await screen.findByRole("heading", {
              name: m.cart.studentRequired,
            }),
          ).toBeVisible();
          expect(
            vi.mocked(api).mock.calls.some(([p]) => p.startsWith("/cart?")),
          ).toBe(false);
        }
      },
    );
    it("cart keeps raw titles/types, JOD precision, item IDs, delete and invalidation", async () => {
      const { client } = mount(<CartView />, locale);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const title = await screen.findByText(purchaseCart.items[0].title);
      expect(screen.getByText("Course")).toBeVisible();
      expect(
        title.parentElement?.nextElementSibling?.querySelector("strong")
          ?.textContent,
      ).toBe(money(10.125, locale));
      expect(
        screen.getByText(m.cart.subtotal).nextElementSibling?.textContent,
      ).toBe(money(10.125, locale));
      expect(
        screen.getByText(m.cart.total).nextElementSibling?.textContent,
      ).toBe(money(8.12, locale));
      expect(
        screen.getByRole("link", { name: m.cart.checkout }),
      ).toHaveAttribute("href", `/${locale}/checkout`);
      fireEvent.click(screen.getByRole("button", { name: m.cart.removeItem }));
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          `/cart/items/${purchaseCart.items[0].id}`,
          { method: "DELETE" },
        ),
      );
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cart"] }),
      );
      expect(
        client.getQueryCache().find({ queryKey: ["cart", locale] }),
      ).toBeDefined();
    });
    it.each(["empty", "error", "pending"] as const)(
      "cart %s retains precedence and checkout guard",
      async (mode) => {
        state.cart = mode;
        const { container } = mount(<CartView />, locale);
        if (mode === "error")
          expect(await screen.findByRole("alert")).toHaveTextContent(
            m.cart.loadError,
          );
        if (mode === "empty") {
          expect(await screen.findByText(m.cart.empty)).toBeVisible();
          expect(
            screen.getByRole("link", { name: m.cart.checkout }),
          ).toHaveClass("pointer-events-none");
        }
        if (mode === "pending") {
          await waitFor(() =>
            expect(api).toHaveBeenCalledWith(`/cart?locale=${locale}`),
          );
          expect(
            container.querySelector('[aria-busy="true"]'),
          ).toBeInTheDocument();
        }
      },
    );
    it("checkout auth loading keeps purchase requests blocked", () => {
      state.authPending = true;
      const { container } = mount(<Checkout />, locale);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.checkout.create }),
      ).not.toBeInTheDocument();
    });
    it("checkout guest preserves access gate", async () => {
      state.roles = null;
      mount(<Checkout />, locale);
      expect(
        await screen.findByRole("heading", { name: m.cart.studentRequired }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: m.checkout.create }),
      ).not.toBeInTheDocument();
    });
    it.each([
      ["Card", "card"],
      ["BankTransfer", "bankTransfer"],
      ["EWallet", "wallet"],
    ] as const)(
      "%s payload remains technical while radio name is localized",
      async (value, key) => {
        mount(<Checkout />, locale);
        const button = await screen.findByRole("button", {
          name: m.checkout.create,
        });
        fireEvent.click(screen.getByRole("radio", { name: m.checkout[key] }));
        expect(
          screen.getByRole("radio", { name: m.checkout[key] }),
        ).toHaveAttribute("value", value);
        fireEvent.change(
          screen.getByRole("textbox", { name: m.checkout.coupon }),
          { target: { value: " RAW_coupon " } },
        );
        fireEvent.click(button);
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith("/cart/checkout", {
            method: "POST",
            headers: { "Idempotency-Key": expect.any(String) },
            body: JSON.stringify({
              couponCode: " RAW_coupon ",
              paymentMethod: value,
            }),
          }),
        );
        const options = vi
          .mocked(api)
          .mock.calls.find(([p]) => p === "/cart/checkout")?.[1];
        expect(options?.headers).toEqual({
          "Idempotency-Key": expect.stringMatching(/^[\da-f-]{36}$/i),
        });
        for (const [label, amount] of [
          [m.checkout.subtotal, 10.125],
          [m.checkout.discount, -2.005],
          [m.checkout.tax, 0.015],
        ] as const)
          expect(
            (await screen.findByText(label)).nextElementSibling?.textContent,
          ).toBe(money(amount, locale));
        expect(
          screen.getByText(
            (_, element) =>
              element?.tagName === "P" &&
              element.textContent === m.checkout.total + money(8.135, locale),
          ),
        ).toBeVisible();
        expect(screen.getByText(m.checkout.developmentNotice)).toBeVisible();
      },
    );
    it.each([
      "Processing",
      "Pending",
      "Completed",
      "Failed",
      "UnknownProviderState",
    ])(
      "raw %s state preserves existing provider gate without inventing settlement",
      async (status) => {
        state.status = status;
        state.provider = "PayTabs";
        mount(<Checkout />, locale);
        fireEvent.click(
          await screen.findByRole("button", { name: m.checkout.create }),
        );
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith(
            "/cart/checkout",
            expect.objectContaining({
              body: JSON.stringify({ couponCode: null, paymentMethod: "Card" }),
            }),
          ),
        );
        expect(
          screen.queryByRole("button", { name: m.checkout.confirmTest }),
        ).not.toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
        expect(
          vi
            .mocked(api)
            .mock.calls.some(([p]) => p === "/payments/fake/confirm"),
        ).toBe(false);
      },
    );
    it("Fake confirmation preserves IDs, event prefix and student destination", async () => {
      mount(<Checkout />, locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.checkout.create }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: m.checkout.confirmTest }),
      );
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("/payments/fake/confirm", {
          method: "POST",
          body: expect.any(String),
        }),
      );
      const body = JSON.parse(
        vi
          .mocked(api)
          .mock.calls.find(([p]) => p === "/payments/fake/confirm")![1]!
          .body as string,
      );
      expect(body).toEqual({
        paymentId: purchasePayment.paymentId,
        providerEventId: expect.stringMatching(/^test_[\da-f-]{36}$/i),
      });
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(`/${locale}/student/courses`),
      );
    });
    it.each(["raw", "fallback", "pending"] as const)(
      "checkout %s preserves error or disabled behavior",
      async (mode) => {
        state.checkout = mode;
        mount(<Checkout />, locale);
        const button = await screen.findByRole("button", {
          name: m.checkout.create,
        });
        fireEvent.click(button);
        if (mode === "pending")
          await waitFor(() => expect(button).toBeDisabled());
        else
          expect(await screen.findByRole("alert")).toHaveTextContent(
            mode === "raw"
              ? "RAW checkout failure خطأ"
              : m.checkout.requestFailed,
          );
      },
    );
    it.each(["pending", "fallback"] as const)(
      "Fake confirmation %s preserves its guard and local fallback",
      async (mode) => {
        state.confirm = mode;
        mount(<Checkout />, locale);
        fireEvent.click(
          await screen.findByRole("button", { name: m.checkout.create }),
        );
        const button = await screen.findByRole("button", {
          name: m.checkout.confirmTest,
        });
        fireEvent.click(button);
        if (mode === "pending")
          await waitFor(() => expect(button).toBeDisabled());
        else
          expect(await screen.findByRole("alert")).toHaveTextContent(
            m.checkout.requestFailed,
          );
        expect(push).not.toHaveBeenCalled();
      },
    );
    it("checkout error wins over an earlier confirmation error", async () => {
      state.confirm = "raw";
      mount(<Checkout />, locale);
      const create = await screen.findByRole("button", {
        name: m.checkout.create,
      });
      fireEvent.click(create);
      fireEvent.click(
        await screen.findByRole("button", { name: m.checkout.confirmTest }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "RAW confirmation failure خطأ",
      );
      state.checkout = "raw";
      fireEvent.click(create);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "RAW checkout failure خطأ",
        ),
      );
    });
    it("PayTabs return retains verification-in-progress meaning and creates no payment request", () => {
      mount(<PayTabsResultPage />, locale);
      expect(
        screen.getByRole("heading", { name: m.result.title }),
      ).toBeVisible();
      expect(screen.getByText(m.result.description)).toBeVisible();
      expect(api).not.toHaveBeenCalled();
    });
    it.each(["membership", "subscription"] as const)(
      "%s checkout preserves raw directory, endpoint, coupon and Card",
      async (kind) => {
        mount(<MembershipDirectory />, locale);
        const raw =
          kind === "membership" ? purchaseMembership : purchaseSubscription;
        const title = await screen.findByText(raw.title);
        expect(title).toBeVisible();
        expect(title.parentElement?.textContent).toContain(
          money(raw.price, locale).trim(),
        );
        expect(screen.getByText(raw.interval)).toBeVisible();
        fireEvent.change(
          screen.getByRole("textbox", { name: m.memberships.coupon }),
          { target: { value: "raw-coupon" } },
        );
        fireEvent.click(title.parentElement!.querySelector("button")!);
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith(
            `/${kind === "membership" ? "memberships" : "course-subscriptions"}/${raw.id}/checkout`,
            {
              method: "POST",
              headers: { "Idempotency-Key": expect.any(String) },
              body: JSON.stringify({
                couponCode: "raw-coupon",
                paymentMethod: "Card",
              }),
            },
          ),
        );
        expect(
          await screen.findByText(m.memberships.developmentNotice),
        ).toBeVisible();
        fireEvent.click(
          screen.getByRole("button", { name: m.memberships.confirmTest }),
        );
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith("/payments/fake/confirm", {
            method: "POST",
            body: expect.any(String),
          }),
        );
        const body = JSON.parse(
          vi
            .mocked(api)
            .mock.calls.find(([p]) => p === "/payments/fake/confirm")![1]!
            .body as string,
        );
        expect(body).toEqual({
          paymentId: purchasePayment.paymentId,
          providerEventId: expect.stringMatching(
            /^membership_test_[\da-f-]{36}$/i,
          ),
        });
      },
    );
    it.each(["raw", "fallback", "pending"] as const)(
      "membership %s retains raw error precedence and guard",
      async (mode) => {
        state.checkout = mode;
        mount(<MembershipDirectory />, locale);
        const title = await screen.findByText(purchaseMembership.title),
          button = title.parentElement!.querySelector("button")!;
        fireEvent.click(button);
        if (mode === "pending")
          await waitFor(() => expect(button).toBeDisabled());
        else
          expect(await screen.findByRole("alert")).toHaveTextContent(
            mode === "raw"
              ? "RAW checkout failure خطأ"
              : m.memberships.requestFailed,
          );
      },
    );
    it.each(["pending", "fallback"] as const)(
      "membership confirmation %s preserves guard and fallback",
      async (mode) => {
        state.confirm = mode;
        mount(<MembershipDirectory />, locale);
        const title = await screen.findByText(purchaseMembership.title);
        fireEvent.click(title.parentElement!.querySelector("button")!);
        const button = await screen.findByRole("button", {
          name: m.memberships.confirmTest,
        });
        fireEvent.click(button);
        if (mode === "pending")
          await waitFor(() => expect(button).toBeDisabled());
        else
          expect(await screen.findByRole("alert")).toHaveTextContent(
            m.memberships.requestFailed,
          );
        expect(push).not.toHaveBeenCalled();
      },
    );
    it("membership non-Fake result retains no test-confirmation path", async () => {
      state.provider = "PayTabs";
      mount(<MembershipDirectory />, locale);
      const title = await screen.findByText(purchaseMembership.title);
      fireEvent.click(title.parentElement!.querySelector("button")!);
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          `/memberships/${purchaseMembership.id}/checkout`,
          expect.anything(),
        ),
      );
      expect(
        screen.queryByRole("button", { name: m.memberships.confirmTest }),
      ).not.toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
    it("membership Teacher gate preserves login and avoids checkout", async () => {
      state.roles = ["Teacher"];
      mount(<MembershipDirectory />, locale);
      const button = await screen.findByRole("button", {
        name: m.memberships.signIn,
      });
      fireEvent.click(button);
      expect(push).toHaveBeenCalledWith(`/${locale}/login`);
      expect(
        vi.mocked(api).mock.calls.some(([p]) => p.endsWith("/checkout")),
      ).toBe(false);
    });
    it.each(["empty", "error", "pending"] as const)(
      "directories %s preserve existing empty/loading precedence",
      async (mode) => {
        state.directory = mode;
        const { container } = mount(<MembershipDirectory />, locale);
        if (mode === "pending") {
          expect(
            screen.queryByText(m.memberships.empty),
          ).not.toBeInTheDocument();
        } else
          expect(await screen.findByText(m.memberships.empty)).toBeVisible();
        cleanup();
        const view = mount(<PackageDirectory />, locale);
        if (mode === "pending")
          expect(
            view.container.querySelector('[aria-busy="true"]'),
          ).toBeInTheDocument();
        else
          expect(
            await screen.findByRole("link", { name: m.packages.browseCourses }),
          ).toHaveAttribute("href", `/${locale}/courses`);
        expect(container).toBeDefined();
      },
    );
    it.each([null, ["Teacher"]])(
      "package role %j preserves login/student gate",
      async (roles) => {
        state.roles = roles;
        mount(<PackageDirectory />, locale);
        await screen.findByText(purchasePackage.title);
        const name = roles
          ? messages.publicContent.packages.add
          : messages.publicContent.packages.login;
        const button = screen.getByRole("button", { name });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        if (!roles) expect(push).toHaveBeenCalledWith(`/${locale}/login`);
        else
          expect(await screen.findByRole("status")).toHaveTextContent(
            messages.publicContent.packages.studentOnly,
          );
        expect(
          vi
            .mocked(api)
            .mock.calls.some(([p]) => p.startsWith("/cart/packages/")),
        ).toBe(false);
      },
    );
    it("package preserves raw data, server discount, ID, cart invalidation and view-cart route", async () => {
      const { client } = mount(<PackageDirectory />, locale),
        invalidate = vi.spyOn(client, "invalidateQueries");
      const title = await screen.findByText(purchasePackage.title);
      expect(screen.getByText(purchasePackage.courses[0].title)).toBeVisible();
      expect(title.parentElement?.querySelector("strong")?.textContent).toBe(
        money(17.125, locale),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: messages.publicContent.packages.add,
        }),
      );
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          `/cart/packages/${purchasePackage.id}?locale=${locale}`,
          { method: "POST" },
        ),
      );
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cart"] }),
      );
      expect(
        await screen.findByRole("link", {
          name: messages.publicContent.packages.viewCart,
        }),
      ).toHaveAttribute("href", `/${locale}/cart`);
    });
  },
);
