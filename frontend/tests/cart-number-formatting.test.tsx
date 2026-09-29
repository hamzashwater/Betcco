import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartView } from "@/features/cart/cart-view";
import { Checkout } from "@/features/cart/checkout";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function renderCart(locale: "ar" | "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CartView />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function renderCheckout() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Checkout />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.restoreAllMocks();
});

describe("CartView localized money", () => {
  it.each([
    ["ar", "ar-JO"],
    ["en", "en-JO"],
  ] as const)(
    "formats item and totals with active locale %s",
    async (locale, intlLocale) => {
      apiMock.mockImplementation((path: string) => {
        if (path === "/auth/me") return Promise.resolve({ roles: ["Student"] });
        if (path.startsWith("/cart?"))
          return Promise.resolve({
            id: "cart-1",
            items: [
              {
                id: "item-1",
                referenceId: "course-1",
                itemType: "Course",
                title: "Sample course",
                price: 5,
              },
            ],
            subtotal: 5,
            discount: 0,
            total: 5,
            currency: "JOD",
          });
        return Promise.reject(new Error(`Unexpected API path: ${path}`));
      });

      renderCart(locale);
      const expected = new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: "JOD",
        currencyDisplay: "code",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(5);

      const courseTitle = await screen.findByText("Sample course");
      expect(courseTitle).toBeVisible();
      const itemAmount =
        courseTitle.parentElement?.nextElementSibling?.querySelector(
          "strong",
        )?.textContent;
      const subtotalLabel = locale === "ar" ? "الإجمالي" : "Subtotal";
      const totalLabel = locale === "ar" ? "المجموع" : "Total";
      const subtotal =
        screen.getByText(subtotalLabel).nextElementSibling?.textContent;
      const total =
        screen.getByText(totalLabel).nextElementSibling?.textContent;
      expect([itemAmount, subtotal, total]).toEqual([
        expected,
        expected,
        expected,
      ]);
    },
  );

  it("formats checkout subtotal, discount, tax, and total as Intl currency", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ roles: ["Student"] });
      if (path === "/cart/checkout")
        return Promise.resolve({
          paymentId: "payment-1",
          status: "Pending",
          provider: "FakeCard",
          checkoutReference: "checkout-1",
          redirectUrl: null,
          subtotal: 10,
          discount: 2,
          tax: 1,
          total: 9,
          currency: "JOD",
          paymentMethod: "Card",
        });
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderCheckout();
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: "Create checkout session" }),
      );

    const format = (amount: number) =>
      new Intl.NumberFormat("en-JO", {
        style: "currency",
        currency: "JOD",
        currencyDisplay: "code",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(amount);
    for (const [label, amount] of [
      ["Subtotal", 10],
      ["Discount", -2],
      ["Tax", 1],
    ] as const) {
      const summaryLabel = await screen.findByText(label);
      expect(summaryLabel.nextElementSibling?.textContent).toBe(format(amount));
    }
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.replace(/\s+/gu, " ").trim() ===
            `Total: ${format(9).replace(/\s+/gu, " ").trim()}`,
      ),
    ).toBeVisible();
  });
});
