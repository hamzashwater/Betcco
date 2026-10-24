import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommissionSettings } from "@/features/admin/commission-settings";
import { formatLocalizedPercentage } from "@/i18n/number-format";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const commissionPath = "/admin/commerce-catalog/commission",
  taxPath = "/admin/commerce-catalog/sales-tax";
const commissionData = {
    platformCommissionPercent: 30,
    teacherSharePercent: 70,
  },
  taxData = { salesTaxPercent: 7.125 };
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(
        o
          ? {}
          : p === commissionPath
            ? commissionData
            : p === taxPath
              ? taxData
              : Promise.reject(Error("Unexpected request " + p)),
      ),
    );
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
describe.each(["en", "ar"] as const)(
  "Slice 5 Finance %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    const t = (locale === "ar" ? ar : en).commerceCatalog;
    function renderOwner() {
      const v = mount(locale, <CommissionSettings />);
      const commission = () =>
          screen.getByRole("form", { name: t.commissionTitle }),
        tax = () => screen.getByRole("form", { name: t.salesTax });
      const input = () => within(commission()).getByRole("spinbutton"),
        taxInput = () => within(tax()).getByRole("spinbutton");
      const button = () => within(commission()).getByRole("button"),
        taxButton = () => within(tax()).getByRole("button");
      return { ...v, commission, tax, input, taxInput, button, taxButton };
    }
    async function setup() {
      const v = renderOwner();
      await waitFor(() => expect(v.input()).toHaveValue(30));
      await waitFor(() => expect(v.taxInput()).toHaveValue(7.125));
      return v;
    }
    it("uses the two exact query keys, GET endpoints and no extra API fan-out", async () => {
      const v = await setup();
      expect(apiMock.mock.calls).toEqual([[commissionPath], [taxPath]]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([["platform-commission"], ["sales-tax"]]);
      expect(writes()).toEqual([]);
    });
    it("keeps real labels, required LTR number inputs with 0..100 and 0.001 precision, and two separate forms", async () => {
      const v = await setup();
      expect(screen.getAllByRole("form")).toHaveLength(2);
      expect(screen.getByLabelText(t.platformCommission)).toBe(v.input());
      expect(screen.getByLabelText(t.salesTax, { selector: "input" })).toBe(
        v.taxInput(),
      );
      for (const n of [v.input(), v.taxInput()])
        for (const [key, value] of Object.entries({
          type: "number",
          min: "0",
          max: "100",
          step: "0.001",
          dir: "ltr",
          required: "",
        }))
          expect(n).toHaveAttribute(key, value);
      expect(screen.getAllByRole("button")).toHaveLength(2);
    });
    it("preserves independent local drafts across successful source refresh and never saves on change/blur", async () => {
      const v = await setup();
      fireEvent.change(v.input(), { target: { value: "31.125" } });
      fireEvent.change(v.taxInput(), { target: { value: "8.625" } });
      fireEvent.blur(v.input());
      fireEvent.blur(v.taxInput());
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p === commissionPath
            ? { ...commissionData, platformCommissionPercent: 42 }
            : { salesTaxPercent: 9 },
        ),
      );
      await act(async () => {
        await v.client.invalidateQueries();
      });
      expect(v.input()).toHaveValue(31.125);
      expect(v.taxInput()).toHaveValue(8.625);
      expect(writes()).toEqual([]);
      expect(window.confirm).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          within(v.commission()).getByText(
            formatLocalizedPercentage(42, locale),
          ),
        ).toBeVisible(),
      );
    });
    it.each([0, 100])(
      "permits Commission endpoint %s and previews 100 minus its draft at exactly three decimals",
      async (value) => {
        const v = await setup();
        fireEvent.change(v.input(), { target: { value: String(value) } });
        expect(v.button()).toBeEnabled();
        expect(
          within(v.commission()).getByText(
            t.teacherShare.replace(
              "{percentage}",
              formatLocalizedPercentage(100 - value, locale, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              }),
            ),
          ),
        ).toBeVisible();
        fireEvent.submit(v.commission());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(JSON.parse(writes()[0][1].body)).toEqual({
          platformCommissionPercent: value,
        });
      },
    );
    it.each([0, 100])(
      "permits independent Sales Tax endpoint %s",
      async (value) => {
        const v = await setup();
        fireEvent.change(v.taxInput(), { target: { value: String(value) } });
        expect(v.taxButton()).toBeEnabled();
        fireEvent.submit(v.tax());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(JSON.parse(writes()[0][1].body)).toEqual({
          salesTaxPercent: value,
        });
      },
    );
    it.each([-0.001, 100.001])(
      "rejects Commission %s without confirmation/write and uses server Teacher Share preview",
      async (value) => {
        const v = await setup();
        fireEvent.change(v.input(), { target: { value: String(value) } });
        expect(v.button()).toBeDisabled();
        fireEvent.submit(v.commission());
        expect(window.confirm).not.toHaveBeenCalled();
        expect(writes()).toEqual([]);
        expect(
          within(v.commission()).getByText(
            t.teacherShare.replace(
              "{percentage}",
              formatLocalizedPercentage(70, locale, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              }),
            ),
          ),
        ).toBeVisible();
      },
    );
    it.each([-0.001, 100.001])(
      "rejects Sales Tax %s without confirmation/write",
      async (value) => {
        const v = await setup();
        fireEvent.change(v.taxInput(), { target: { value: String(value) } });
        expect(v.taxButton()).toBeDisabled();
        fireEvent.submit(v.tax());
        expect(window.confirm).not.toHaveBeenCalled();
        expect(writes()).toEqual([]);
      },
    );
    it.each(["Infinity", "-Infinity", "NaN"])(
      "rejects non-finite input %s in both validation paths even before native sanitization",
      async (value) => {
        const v = await setup();
        for (const [input, form, button] of [
          [v.input(), v.commission(), v.button()],
          [v.taxInput(), v.tax(), v.taxButton()],
        ]) {
          // Inject the event target value that a native number input normally sanitizes.
          Object.defineProperty(input, "value", {
            configurable: true,
            writable: true,
            value,
          });
          fireEvent.input(input);
          expect(button).toBeDisabled();
          fireEvent.submit(form);
        }
        expect(window.confirm).not.toHaveBeenCalled();
        expect(writes()).toEqual([]);
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s native confirmation cancellation produces zero writes",
      async (owner) => {
        const v = await setup();
        vi.mocked(window.confirm).mockReturnValue(false);
        const form = owner === "commission" ? v.commission() : v.tax();
        fireEvent.submit(form);
        expect(window.confirm).toHaveBeenCalledExactlyOnceWith(
          owner === "commission" ? t.commissionConfirm : t.taxConfirm,
        );
        expect(writes()).toEqual([]);
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s confirms before exact PUT, clears its draft only and invalidates only its exact keys",
      async (owner) => {
        const v = await setup();
        fireEvent.change(v.input(), { target: { value: "25.125" } });
        fireEvent.change(v.taxInput(), { target: { value: "8.625" } });
        const sequence: string[] = [];
        vi.mocked(window.confirm).mockImplementation((message) => {
          sequence.push("confirm:" + message);
          expect(writes()).toEqual([]);
          return true;
        });
        apiMock.mockImplementation((p: string, o?: RequestInit) => {
          if (o) {
            sequence.push("PUT:" + p);
            return Promise.resolve({});
          }
          return Promise.resolve(
            p === commissionPath
              ? { platformCommissionPercent: 22, teacherSharePercent: 78 }
              : { salesTaxPercent: 5 },
          );
        });
        fireEvent.submit(owner === "commission" ? v.commission() : v.tax());
        await screen.findByText(
          owner === "commission" ? t.commissionUpdated : t.taxUpdated,
        );
        expect(sequence).toEqual([
          "confirm:" +
            (owner === "commission" ? t.commissionConfirm : t.taxConfirm),
          "PUT:" + (owner === "commission" ? commissionPath : taxPath),
        ]);
        expect(writes()).toEqual([
          [
            owner === "commission" ? commissionPath : taxPath,
            {
              method: "PUT",
              body: JSON.stringify(
                owner === "commission"
                  ? { platformCommissionPercent: 25.125 }
                  : { salesTaxPercent: 8.625 },
              ),
            },
          ],
        ]);
        expect(refreshKeys(v.invalidations)).toEqual(
          owner === "commission"
            ? [["platform-commission"], ["admin-wallet"]]
            : [["sales-tax"]],
        );
        await waitFor(() =>
          expect(owner === "commission" ? v.input() : v.taxInput()).toHaveValue(
            owner === "commission" ? 22 : 5,
          ),
        );
        expect(owner === "commission" ? v.taxInput() : v.input()).toHaveValue(
          owner === "commission" ? 8.625 : 25.125,
        );
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s pending guard blocks duplicates while the other independent action remains eligible",
      async (owner) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o
            ? pending.promise
            : Promise.resolve(p === commissionPath ? commissionData : taxData),
        );
        const v = await setup();
        fireEvent.submit(owner === "commission" ? v.commission() : v.tax());
        await waitFor(() =>
          expect(
            owner === "commission" ? v.button() : v.taxButton(),
          ).toBeDisabled(),
        );
        expect(
          owner === "commission" ? v.taxButton() : v.button(),
        ).toBeEnabled();
        fireEvent.submit(owner === "commission" ? v.commission() : v.tax());
        expect(writes()).toHaveLength(1);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        await act(async () => pending.resolve({}));
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s failure retains both drafts and owns a factual error; later other success owns its own success",
      async (owner) => {
        const v = await setup();
        fireEvent.change(v.input(), { target: { value: "25.125" } });
        fireEvent.change(v.taxInput(), { target: { value: "8.625" } });
        apiMock.mockRejectedValueOnce(Error("RAW SERVER FAILURE"));
        fireEvent.submit(owner === "commission" ? v.commission() : v.tax());
        const failed = owner === "commission" ? v.commission() : v.tax(),
          other = owner === "commission" ? v.tax() : v.commission();
        expect(await within(failed).findByRole("alert")).toHaveTextContent(
          "RAW SERVER FAILURE",
        );
        expect(within(other).queryByRole("alert")).toBeNull();
        expect(v.input()).toHaveValue(25.125);
        expect(v.taxInput()).toHaveValue(8.625);
        expect(refreshKeys(v.invalidations)).toEqual([]);
        fireEvent.submit(other);
        await within(other).findByText(
          owner === "commission" ? t.taxUpdated : t.commissionUpdated,
        );
        expect(within(other).queryByRole("alert")).toBeNull();
        expect(within(failed).queryByText("RAW SERVER FAILURE")).toBeNull();
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s initial pending has scoped loading and disabled save, preserves the other setting and no fabricated preview",
      async (owner) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string) =>
          p === (owner === "commission" ? commissionPath : taxPath)
            ? pending.promise
            : Promise.resolve(p === commissionPath ? commissionData : taxData),
        );
        const v = renderOwner();
        await screen.findByText(
          owner === "commission" ? t.commissionLoading : t.taxLoading,
        );
        expect(
          owner === "commission" ? v.button() : v.taxButton(),
        ).toBeDisabled();
        await waitFor(() =>
          expect(owner === "commission" ? v.taxInput() : v.input()).toHaveValue(
            owner === "commission" ? 7.125 : 30,
          ),
        );
        expect(owner === "commission" ? v.input() : v.taxInput()).toHaveValue(
          null,
        );
        expect(writes()).toEqual([]);
        if (owner === "commission")
          expect(
            within(v.commission()).queryByText(
              t.teacherShare.replace(
                "{percentage}",
                formatLocalizedPercentage(100, locale, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                }),
              ),
            ),
          ).toBeNull();
        await act(async () =>
          pending.resolve(owner === "commission" ? commissionData : taxData),
        );
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s cold error never fabricates 0/30 or a preview, other setting remains usable",
      async (owner) => {
        apiMock.mockImplementation((p: string) =>
          p === (owner === "commission" ? commissionPath : taxPath)
            ? Promise.reject(Error("RAW QUERY ERROR"))
            : Promise.resolve(p === commissionPath ? commissionData : taxData),
        );
        const v = renderOwner();
        expect(await screen.findByRole("alert")).toHaveTextContent(
          owner === "commission" ? t.commissionUnavailable : t.taxUnavailable,
        );
        expect(owner === "commission" ? v.input() : v.taxInput()).toHaveValue(
          null,
        );
        await waitFor(() =>
          expect(
            owner === "commission" ? v.taxButton() : v.button(),
          ).toBeEnabled(),
        );
        expect(writes()).toEqual([]);
        expect(
          (owner === "commission" ? v.commission() : v.tax()).querySelector(
            "dd",
          ),
        ).toHaveTextContent("—");
      },
    );
    it.each(["commission", "tax"] as const)(
      "%s failed refresh retains actual cached server value and both drafts",
      async (owner) => {
        const v = await setup();
        fireEvent.change(v.input(), { target: { value: "25.125" } });
        fireEvent.change(v.taxInput(), { target: { value: "8.625" } });
        apiMock.mockRejectedValue(Error("REFRESH ERROR"));
        await act(async () => {
          await v.client.invalidateQueries({
            queryKey: [
              owner === "commission" ? "platform-commission" : "sales-tax",
            ],
          });
        });
        expect(await screen.findByRole("alert")).toHaveTextContent(
          owner === "commission" ? t.commissionUnavailable : t.taxUnavailable,
        );
        expect(v.input()).toHaveValue(25.125);
        expect(v.taxInput()).toHaveValue(8.625);
        expect(v.button()).toBeEnabled();
        expect(v.taxButton()).toBeEnabled();
        expect(writes()).toEqual([]);
      },
    );
    it("keyboard reaches both inputs and actions with native Enter confirmation", async () => {
      const v = await setup(),
        user = userEvent.setup();
      await user.tab();
      expect(v.input()).toHaveFocus();
      await user.tab();
      expect(v.button()).toHaveFocus();
      await user.tab();
      expect(v.taxInput()).toHaveFocus();
      await user.tab();
      expect(v.taxButton()).toHaveFocus();
      vi.mocked(window.confirm).mockReturnValue(false);
      await user.keyboard("{Enter}");
      expect(window.confirm).toHaveBeenCalledWith(t.taxConfirm);
      expect(writes()).toEqual([]);
    });
  },
);
