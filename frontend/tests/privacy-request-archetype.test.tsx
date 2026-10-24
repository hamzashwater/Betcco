import { PrivacyRequestManagement } from "@/features/admin/privacy-request-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "./helpers/admin-governance-gradebook-render";
import {
  privacyRows as rows,
  privacyPage,
  requestTypes,
  requestStatuses,
  longResolution,
} from "./fixtures/privacy-request-archetype";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const path = "/privacy/admin/requests?pageSize=50";
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o ? { ...rows[0], status: "InReview" } : privacyPage()),
    );
});
describe.each(["en", "ar"] as const)(
  "Privacy request human-review archetype %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    function renderOwner() {
      const v = mount(locale, <PrivacyRequestManagement />),
        t = v.copy.privacyRequests;
      const queue = () => screen.getByRole("region", { name: t.reviewQueue }),
        detail = () =>
          screen.getByRole("complementary", { name: t.requestFacts }),
        buttons = () => within(queue()).getAllByRole("button"),
        filter = () => within(queue()).getByRole("combobox");
      const status = () => screen.getByLabelText(t.reviewStatus),
        note = () => screen.getByLabelText(t.userfacingReviewNote),
        identity = () => screen.getByRole("checkbox"),
        save = () => within(detail()).getByRole("button");
      return {
        ...v,
        t,
        queue,
        detail,
        buttons,
        filter,
        status,
        note,
        identity,
        save,
      };
    }
    async function setup(index?: number) {
      const v = renderOwner();
      await waitFor(() => expect(v.buttons()).toHaveLength(7));
      if (index !== undefined) await userEvent.click(v.buttons()[index]);
      return v;
    }
    it("uses exact empty-status key, pageSize=50 GET, retry=false and no detail fan-out", async () => {
      const v = await setup(0);
      expect(apiMock.mock.calls).toEqual([[path]]);
      const queries = v.client.getQueryCache().getAll();
      expect(queries.map((q) => q.queryKey)).toEqual([
        ["admin-privacy-requests", ""],
      ]);
      expect(queries[0].options.retry).toBe(false);
      expect(writes()).toEqual([]);
    });
    it("keeps all six raw server filters, changes the server key/request and never client-filters returned rows", async () => {
      const v = await setup();
      expect(
        [...v.filter().querySelectorAll("option")].map((o) => o.value),
      ).toEqual(["", ...requestStatuses]);
      for (const status of requestStatuses) {
        fireEvent.change(v.filter(), { target: { value: status } });
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(path + "&status=" + status),
        );
        await waitFor(() => expect(v.buttons()).toHaveLength(7));
        expect(
          v.client
            .getQueryCache()
            .find({ queryKey: ["admin-privacy-requests", status], exact: true })
            ?.options.retry,
        ).toBe(false);
      }
      expect(apiMock.mock.calls).toEqual([
        [path],
        ...requestStatuses.map((s) => [path + "&status=" + s]),
      ]);
      expect(writes()).toEqual([]);
    });
    it("retains all seven request types and raw server row order, dates and server totalCount independent of seven loaded rows", async () => {
      const v = await setup();
      const labels = [
        v.t.dataAccess,
        v.t.dataCorrection,
        v.t.restrictProcessing,
        v.t.eraseOrConceal,
        v.t.objectToProfiling,
        v.t.portableCopy,
        v.t.withdrawMarketingConsent,
      ];
      expect(requestTypes).toHaveLength(7);
      v.buttons().forEach((b, i) => {
        expect(b.querySelector("span")).toHaveTextContent(labels[i]);
        expect(b).toHaveTextContent(
          formatLocalizedDateTime(rows[i].createdAtUtc, locale),
        );
      });
      expect(
        within(v.queue()).getByText(
          v.t.matchingTotal.replace("{count}", "843"),
        ),
      ).toBeVisible();
      expect(within(v.queue()).getByText(v.t.loadedScope)).toBeVisible();
    });
    it("Submitted defaults to InReview, keeps raw description and notes, and four staff targets only", async () => {
      const v = await setup(0);
      expect(v.status()).toHaveValue("InReview");
      expect(v.note()).toHaveValue("");
      expect(v.identity()).not.toBeChecked();
      expect(v.note()).toHaveAttribute("maxlength", "2000");
      expect(
        [...v.status().querySelectorAll("option")].map((o) => o.value),
      ).toEqual([
        "IdentityVerificationRequired",
        "InReview",
        "Completed",
        "Rejected",
      ]);
      expect(
        within(v.detail()).getByText(
          (_, el) => el?.textContent === rows[0].description,
        ),
      ).toHaveTextContent("RAW <description>");
      expect(writes()).toEqual([]);
    });
    it.each([1, 2, 3, 4])(
      "selection %s preserves non-Submitted status and exact summary/identity fact",
      async (index) => {
        const v = await setup(index);
        expect(v.status()).toHaveValue(rows[index].status);
        expect(v.note()).toHaveValue(rows[index].resolutionSummary);
        expect(v.identity()).toHaveProperty(
          "checked",
          Boolean(rows[index].identityVerifiedAtUtc),
        );
        if (index === 2)
          expect(
            within(v.detail()).queryByText("RAW description 2"),
          ).toBeNull();
        expect(writes()).toEqual([]);
      },
    );
    it.each([3, 4, 5])(
      "final row %s locks status/summary/identity, preserves resolution and has no Save or reopen action",
      async (index) => {
        const v = await setup(index);
        expect(v.status()).toBeDisabled();
        expect(v.status()).not.toBeVisible();
        expect(
          within(v.detail()).getByText(
            (_, el) =>
              el?.getAttribute("data-final-status") === rows[index].status,
          ),
        ).toBeVisible();
        expect(v.note()).toBeDisabled();
        expect(v.identity()).toBeDisabled();
        expect(within(v.detail()).queryByRole("button")).toBeNull();
        expect(v.note()).toHaveValue(rows[index].resolutionSummary);
        expect(within(v.detail()).getByText(v.t.finalLocked)).toBeVisible();
        expect(
          within(v.detail()).getByText(
            formatLocalizedDateTime(rows[index].resolvedAtUtc!, locale),
            { exact: false },
          ),
        ).toBeVisible();
        expect(writes()).toEqual([]);
      },
    );
    it("recorded verification disables the checkbox and displays its exact request timestamp, independent of a status draft", async () => {
      const v = await setup(2);
      expect(v.identity()).toBeChecked();
      expect(v.identity()).toBeDisabled();
      expect(
        within(v.detail()).getByText(
          v.t.verificationRecorded +
            " " +
            formatLocalizedDateTime(rows[2].identityVerifiedAtUtc!, locale),
        ),
      ).toBeVisible();
      fireEvent.change(v.status(), { target: { value: "Completed" } });
      expect(v.identity()).toBeDisabled();
      expect(writes()).toEqual([]);
    });
    it.each(["  RAW review note  ", "   "])(
      "sends exact PUT with trim/null and true boolean (%s), adopts server object and refetches queue",
      async (note) => {
        const v = await setup(0);
        fireEvent.change(v.status(), {
          target: { value: "IdentityVerificationRequired" },
        });
        fireEvent.change(v.note(), { target: { value: note } });
        await userEvent.click(v.identity());
        const updated = {
          ...rows[1],
          description: "RAW UPDATED SERVER DESCRIPTION",
          resolutionSummary: "SERVER CANONICAL NOTE",
          identityVerifiedAtUtc: "2026-10-20T10:00:00Z",
        };
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          Promise.resolve(o ? updated : privacyPage()),
        );
        await userEvent.click(v.save());
        await within(v.detail()).findByText(v.t.reviewDecisionSaved);
        expect(writes()).toEqual([
          [
            `/privacy/admin/requests/${rows[0].id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                status: "IdentityVerificationRequired",
                resolutionSummary: note.trim() || null,
                markIdentityVerified: true,
              }),
            },
          ],
        ]);
        await waitFor(() =>
          expect(apiMock.mock.calls.filter(([p]) => p === path)).toHaveLength(
            2,
          ),
        );
        expect(v.note()).toHaveValue("SERVER CANONICAL NOTE");
        expect(within(v.detail()).getByText(updated.description)).toBeVisible();
        expect(v.identity()).toBeChecked();
        expect(v.identity()).toBeDisabled();
        expect(v.buttons()[1]).toHaveAttribute("aria-pressed", "true");
        // onSuccess intentionally does not set nextStatus: preserve the existing draft.
        expect(v.status()).toHaveValue("IdentityVerificationRequired");
      },
    );
    it("keeps false identity and lets the server reject Completed rather than guessing fulfillment eligibility", async () => {
      const v = await setup(0);
      fireEvent.change(v.status(), { target: { value: "Completed" } });
      fireEvent.change(v.note(), { target: { value: "  Review only  " } });
      expect(v.save()).toBeEnabled();
      apiMock.mockRejectedValueOnce(
        Error("PRIVACY_IDENTITY_VERIFICATION_REQUIRED"),
      );
      await userEvent.click(v.save());
      expect(await within(v.detail()).findByRole("alert")).toHaveTextContent(
        "PRIVACY_IDENTITY_VERIFICATION_REQUIRED",
      );
      expect(JSON.parse(writes()[0][1].body)).toEqual({
        status: "Completed",
        resolutionSummary: "Review only",
        markIdentityVerified: false,
      });
      expect(v.status()).toHaveValue("Completed");
      expect(v.note()).toHaveValue("  Review only  ");
      expect(v.identity()).not.toBeChecked();
    });
    it("identity checked does not imply completion eligibility; fulfillment conflict remains factual and drafts remain", async () => {
      const v = await setup(0);
      fireEvent.change(v.status(), { target: { value: "Completed" } });
      fireEvent.change(v.note(), {
        target: { value: "  Exact retained draft  " },
      });
      await userEvent.click(v.identity());
      apiMock.mockRejectedValueOnce(
        Error("PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED"),
      );
      await userEvent.click(v.save());
      expect(await within(v.detail()).findByRole("alert")).toHaveTextContent(
        "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED",
      );
      expect(v.status()).toHaveValue("Completed");
      expect(v.note()).toHaveValue("  Exact retained draft  ");
      expect(v.identity()).toBeChecked();
      expect(
        within(v.detail()).queryByText(v.t.reviewDecisionSaved),
      ).toBeNull();
      await userEvent.click(v.buttons()[1]);
      expect(within(v.detail()).queryByRole("alert")).toBeNull();
      expect(v.status()).toHaveValue("IdentityVerificationRequired");
      expect(v.note()).toHaveValue(rows[1].resolutionSummary);
      expect(v.identity()).not.toBeChecked();
    });
    it("pending disabled save blocks duplicate native clicks with no success before response", async () => {
      const p = deferred<unknown>(),
        v = await setup(0);
      apiMock.mockImplementation((url: string, o?: RequestInit) =>
        o ? p.promise : Promise.resolve(privacyPage()),
      );
      await userEvent.click(v.save());
      await waitFor(() => expect(v.save()).toBeDisabled());
      expect(v.save()).toHaveAttribute("aria-busy", "true");
      await userEvent.click(v.save());
      expect(writes()).toHaveLength(1);
      expect(
        within(v.detail()).queryByText(v.t.reviewDecisionSaved),
      ).toBeNull();
      await act(async () => p.resolve({ ...rows[0], status: "InReview" }));
    });
    it("initial loading is distinct from empty/error, with no submission action", async () => {
      const p = deferred<unknown>();
      apiMock.mockReturnValue(p.promise);
      const v = renderOwner();
      expect(await screen.findByRole("status")).toHaveTextContent(
        v.t.loadingRequests,
      );
      expect(within(v.queue()).queryByRole("button")).toBeNull();
      expect(
        screen.queryByText(v.t.thereAreNoRequestsWithThisStatus),
      ).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(writes()).toEqual([]);
      await act(async () => p.resolve(privacyPage()));
    });
    it("cold error exposes exact server error, no fabricated empty/sign-in/denial and no retry", async () => {
      apiMock.mockRejectedValue(Error("RAW COLD QUERY FAILURE"));
      const v = renderOwner();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "RAW COLD QUERY FAILURE",
      );
      expect(within(v.queue()).queryByRole("button")).toBeNull();
      expect(
        screen.queryByText(v.t.thereAreNoRequestsWithThisStatus),
      ).toBeNull();
      expect(apiMock.mock.calls).toEqual([[path]]);
    });
    it("successful empty/filter empty is factual, with the independently returned total retained", async () => {
      apiMock.mockResolvedValue(privacyPage([]));
      const v = renderOwner();
      expect(
        await screen.findByText(v.t.thereAreNoRequestsWithThisStatus),
      ).toBeVisible();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        within(v.queue()).getByText(
          v.t.matchingTotal.replace("{count}", "843"),
        ),
      ).toBeVisible();
      fireEvent.change(v.filter(), { target: { value: "Cancelled" } });
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(path + "&status=Cancelled"),
      );
      expect(
        await screen.findByText(v.t.thereAreNoRequestsWithThisStatus),
      ).toBeVisible();
    });
    it("actual cached rows plus refetch error preserve selected request/drafts and server order", async () => {
      const v = await setup(0);
      fireEvent.change(v.status(), { target: { value: "Rejected" } });
      fireEvent.change(v.note(), { target: { value: longResolution } });
      await userEvent.click(v.identity());
      const nodes = [v.status(), v.note(), v.identity()];
      apiMock.mockRejectedValue(Error("RAW REFRESH FAILURE"));
      await act(async () => {
        await v.client.refetchQueries({
          queryKey: ["admin-privacy-requests", ""],
        });
      });
      expect(await within(v.queue()).findByRole("alert")).toHaveTextContent(
        "RAW REFRESH FAILURE",
      );
      expect(v.buttons()).toHaveLength(7);
      expect(v.buttons()[0]).toHaveAttribute("aria-pressed", "true");
      expect(v.status()).toBe(nodes[0]);
      expect(v.note()).toBe(nodes[1]);
      expect(v.identity()).toBe(nodes[2]);
      expect(v.status()).toHaveValue("Rejected");
      expect(v.note()).toHaveValue(longResolution);
      expect(v.identity()).toBeChecked();
      expect(v.save()).toBeEnabled();
      expect(writes()).toEqual([]);
    });
    it("actual review success remains success when its queue refetch fails; selecting another row resets success", async () => {
      const v = await setup(0);
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o
          ? Promise.resolve({ ...rows[0], status: "InReview" })
          : Promise.reject(Error("REFRESH AFTER SUCCESS")),
      );
      await userEvent.click(v.save());
      expect(await within(v.detail()).findByRole("status")).toHaveTextContent(
        v.t.reviewDecisionSaved,
      );
      expect(await within(v.queue()).findByRole("alert")).toHaveTextContent(
        "REFRESH AFTER SUCCESS",
      );
      expect(v.buttons()).toHaveLength(7);
      await userEvent.click(v.buttons()[1]);
      expect(
        within(v.detail()).queryByText(v.t.reviewDecisionSaved),
      ).toBeNull();
    });
    it("does not expose extra personal fields, execute data actions, fan out, auto-save or submit on changing fields", async () => {
      apiMock.mockResolvedValue(
        privacyPage(
          rows.map((r) => ({
            ...r,
            ownerUserId: "SYNTHETIC-HIDDEN-OWNER",
            email: "hidden@example.test",
            identityVerifiedByUserId: "SYNTHETIC-HIDDEN-VERIFIER",
          })),
        ),
      );
      const v = await setup(0);
      fireEvent.change(v.status(), { target: { value: "Completed" } });
      fireEvent.change(v.note(), { target: { value: "User-facing only" } });
      await userEvent.click(v.identity());
      expect(document.body.textContent).not.toMatch(
        /SYNTHETIC-HIDDEN|hidden@example\.test/,
      );
      expect(within(v.detail()).getAllByRole("button")).toHaveLength(1);
      expect(apiMock.mock.calls).toEqual([[path]]);
      expect(writes()).toEqual([]);
    });
    it("keyboard reaches filter, queue selection, review fields and save, with textual selected cue", async () => {
      const v = await setup(),
        user = userEvent.setup();
      await user.tab();
      expect(v.filter()).toHaveFocus();
      await user.tab();
      expect(v.buttons()[0]).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(v.buttons()[0]).toHaveAttribute("aria-pressed", "true");
      expect(
        within(v.buttons()[0]).getByText(v.t.selectedRequest),
      ).toBeVisible();
      await user.click(v.status());
      expect(v.status()).toHaveFocus();
      await user.tab();
      expect(v.note()).toHaveFocus();
      await user.tab();
      expect(v.identity()).toHaveFocus();
      await user.tab();
      expect(v.save()).toHaveFocus();
      expect(writes()).toEqual([]);
    });
  },
);
