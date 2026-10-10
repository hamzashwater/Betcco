import { AdminArea } from "@/features/admin/admin-area";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import {
  mount,
  deferred,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/features/admin/commission-settings", () => ({
  CommissionSettings: () => null,
}));
const payout = {
  id: "p",
  teacherUserId: "t",
  teacherName: "RAW Teacher",
  teacherEmail: "raw@example.test",
  amount: 17.85,
  currency: "USD",
  method: "BankTransfer",
  destinationMasked: "•••• 4321",
  status: "Requested",
  reviewNote: "SERVER REVIEW NOTE",
  createdAtUtc: "2026-10-10T12:00:00Z",
};
const sale = {
  id: "s",
  courseTitle: "RAW COURSE",
  teacherName: "RAW Sale Teacher",
  netAmount: 123.45,
  platformCommission: 22.22,
  teacherEarning: 99.99,
  currency: "EUR",
};
const wallet = {
  platformBalance: 100.9,
  confirmedPlatformCommission: 30.7,
  currency: "EUR",
  payouts: [payout],
  recentSales: [sale],
};
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: RequestInit) =>
    Promise.resolve(o?.method ? {} : wallet),
  );
});
for (const locale of ["ar", "en"] as const) {
  const copy = (en: string) =>
    baseline.scopes.wallet.cases.find((c) => c.en === en)![locale];
  async function ready(data = wallet) {
    apiMock.mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o?.method ? {} : data),
    );
    const mounted = mount(locale, <AdminArea segment={["wallet"]} />);
    await screen.findByText(
      data.payouts[0]?.status ?? copy("No withdrawal requests yet."),
    );
    return mounted;
  }
  describe(`Wallet translations and payout contracts ${locale}`, () => {
    it("uses server currencies/amounts and raw status, names and masked destination", async () => {
      await ready();
      for (const value of [
        payout.teacherName,
        payout.teacherEmail,
        sale.courseTitle,
        sale.teacherName,
      ])
        expect(screen.getByText(value)).toBeVisible();
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent ===
              `${copy("Bank transfer")} — ${payout.destinationMasked}`,
        ),
      ).toBeVisible();
      expect(
        screen.getByText("Requested").previousElementSibling?.textContent,
      ).toBe(formatLocalizedCurrency(payout.amount, "USD", locale));
      for (const [label, amount] of [
        ["Net", 123.45],
        ["Platform 30%", 22.22],
        ["Teacher 70%", 99.99],
      ] as const)
        expect(
          screen.getByText(
            (_, e) =>
              e?.tagName === "P" &&
              e.textContent ===
                `${copy(label)}: ${formatLocalizedCurrency(amount, "EUR", locale)}`,
          ),
        ).toBeVisible();
      expect(screen.getByLabelText(copy("Admin note"))).toHaveValue(
        "SERVER REVIEW NOTE",
      );
      expect(screen.getByLabelText(copy("Admin note"))).toHaveAttribute(
        "maxlength",
        "1000",
      );
    });
    it.each([
      "Requested",
      "Approved",
      "Paid",
      "Settled",
      "Rejected",
      "ProviderResultUnknown",
    ])(
      "exposes only the existing actions for raw status %s",
      async (status) => {
        await ready({ ...wallet, payouts: [{ ...payout, status }] });
        for (const [label, expected] of [
          ["Approve", status === "Requested"],
          ["Reject and restore balance", status === "Requested"],
          ["Execute payout", status === "Approved"],
          ["Settle payout", status === "Paid"],
        ] as const) {
          const button = screen.queryByRole("button", { name: copy(label) });
          if (expected) expect(button).toBeEnabled();
          else expect(button).not.toBeInTheDocument();
        }
      },
    );
    it.each(["approve", "reject"])(
      "posts %s with null when the displayed server review note is untouched",
      async (action) => {
        const { invalidations } = await ready();
        await userEvent.click(
          screen.getByRole("button", {
            name: copy(
              action === "approve" ? "Approve" : "Reject and restore balance",
            ),
          }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            `/admin/wallet/payouts/p/${action}`,
            { method: "POST", body: JSON.stringify({ note: null }) },
          ),
        );
        expect(refreshKeys(invalidations)).toEqual([
          ["admin-wallet"],
          ["admin-dashboard"],
        ]);
      },
    );
    it.each([" untrimmed note ", "   ", ""])(
      "preserves the original note || null contract (%s)",
      async (note) => {
        await ready();
        fireEvent.change(screen.getByLabelText(copy("Admin note")), {
          target: { value: note },
        });
        await userEvent.click(
          screen.getByRole("button", { name: copy("Approve") }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/admin/wallet/payouts/p/approve",
            { method: "POST", body: JSON.stringify({ note: note || null }) },
          ),
        );
      },
    );
    it.each(["execute", "settle"])(
      "posts %s without any request body or /pay route",
      async (action) => {
        const { invalidations } = await ready({
          ...wallet,
          payouts: [
            { ...payout, status: action === "execute" ? "Approved" : "Paid" },
          ],
        });
        await userEvent.click(
          screen.getByRole("button", {
            name: copy(
              action === "execute" ? "Execute payout" : "Settle payout",
            ),
          }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            `/admin/wallet/payouts/p/${action}`,
            { method: "POST" },
          ),
        );
        expect(refreshKeys(invalidations)).toEqual([
          ["admin-wallet"],
          ["admin-dashboard"],
        ]);
        expect(
          apiMock.mock.calls.some(([p]) => String(p).endsWith("/pay")),
        ).toBe(false);
      },
    );
    it("blocks all payout buttons while any mutation is pending", async () => {
      await ready({
        ...wallet,
        payouts: [
          payout,
          { ...payout, id: "approved", status: "Approved" },
          { ...payout, id: "paid", status: "Paid" },
        ],
      });
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(wallet),
      );
      await userEvent.click(
        screen.getByRole("button", { name: copy("Approve") }),
      );
      for (const button of screen.getAllByRole("button"))
        expect(button).toBeDisabled();
      pending.resolve({});
    });
    it("uses the localized generic mutation error and retains data", async () => {
      await ready();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method
          ? Promise.reject(new Error("RAW ERROR MUST STAY HIDDEN"))
          : Promise.resolve(wallet),
      );
      await userEvent.click(
        screen.getByRole("button", { name: copy("Approve") }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy(
          "The wallet action could not be completed. Review the request status and try again.",
        ),
      );
      expect(screen.getByText(payout.teacherName)).toBeVisible();
      expect(
        screen.queryByText("RAW ERROR MUST STAY HIDDEN"),
      ).not.toBeInTheDocument();
    });
    it("preserves empty states and zero server amounts", async () => {
      await ready({
        ...wallet,
        platformBalance: 0,
        confirmedPlatformCommission: 0,
        payouts: [],
        recentSales: [],
      });
      expect(screen.getByText(copy("No verified sales yet."))).toBeVisible();
      expect(
        screen.getAllByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent === formatLocalizedCurrency(0, "EUR", locale),
        ),
      ).toHaveLength(2);
    });
    it("preserves the localized loading-failure state", async () => {
      apiMock.mockRejectedValue(new Error("RAW WALLET LOAD ERROR"));
      mount(locale, <AdminArea segment={["wallet"]} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy(
          "Unable to load the wallet. Confirm that you are signed in as an administrator.",
        ),
      );
    });
  });
}
