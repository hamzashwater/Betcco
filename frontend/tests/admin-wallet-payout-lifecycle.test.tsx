import { AdminArea } from "@/features/admin/admin-area";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/features/admin/commission-settings", () => ({
  CommissionSettings: () => null,
}));

const payoutId = "11111111-1111-1111-1111-111111111111";

function wallet(status: string) {
  return {
    platformBalance: 30,
    confirmedPlatformCommission: 30,
    currency: "JOD",
    recentSales: [],
    payouts: [
      {
        id: payoutId,
        teacherUserId: "teacher-1",
        teacherName: "Test Teacher",
        teacherEmail: "teacher@example.com",
        amount: 50,
        currency: "JOD",
        method: "BankTransfer",
        destinationMasked: "•••• 1234",
        status,
        reviewNote: null,
        createdAtUtc: "2026-09-26T12:00:00Z",
      },
    ],
  };
}

function renderWallet() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AdminArea segment={["wallet"]} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.restoreAllMocks();
});
describe("Admin payout lifecycle UI", () => {
  it("uses the execute contract and exposes settlement after provider payment", async () => {
    let status = "Approved";
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/admin/wallet") return Promise.resolve(wallet(status));
      if (path === `/admin/wallet/payouts/${payoutId}/execute`) {
        expect(options).toMatchObject({ method: "POST" });
        status = "Paid";
        return Promise.resolve({ status });
      }
      if (path === `/admin/wallet/payouts/${payoutId}/settle`) {
        expect(options).toMatchObject({ method: "POST" });
        status = "Settled";
        return Promise.resolve({ status });
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderWallet();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Execute payout" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/admin/wallet/payouts/${payoutId}/execute`,
        { method: "POST" },
      ),
    );
    expect(
      apiMock.mock.calls.some(
        ([path]) => path === `/admin/wallet/payouts/${payoutId}/pay`,
      ),
    ).toBe(false);

    await user.click(
      await screen.findByRole("button", { name: "Settle payout" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/admin/wallet/payouts/${payoutId}/settle`,
        { method: "POST" },
      ),
    );
    await waitFor(() => expect(screen.getByText("Settled")).toBeVisible());
    expect(
      screen.queryByRole("button", { name: "Execute payout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settle payout" }),
    ).not.toBeInTheDocument();
  });

  it("does not blindly re-execute a payout with an unknown provider result", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/admin/wallet")
        return Promise.resolve(wallet("ProviderResultUnknown"));
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderWallet();

    expect(await screen.findByText("ProviderResultUnknown")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Execute payout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settle payout" }),
    ).not.toBeInTheDocument();
  });
});
