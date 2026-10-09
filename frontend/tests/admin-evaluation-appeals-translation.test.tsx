import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationAppealManagement } from "@/features/admin/evaluation-appeal-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import { appeal } from "./fixtures/admin-governance-gradebook";
import {
  deferred,
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const queue = "/evaluation-appeals/review-queue",
  pdf = "/assessment-pdf-reports/status",
  review = "/evaluation-appeals/appeal/review";
function read(p: string) {
  if (p === queue) return [appeal];
  if (p === pdf)
    return { isConfigured: false, unavailableReason: "RAW_PROVIDER_REASON" };
  throw Error(`Unexpected GET ${p}`);
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o ? undefined : read(p)),
    );
});
function setup(locale: "en" | "ar") {
  const v = mount(locale, <EvaluationAppealManagement />);
  return {
    ...v,
    c: v.copy.evaluationAppeals,
    ready: () => screen.findByText(appeal.reason),
  };
}
function writes() {
  return apiMock.mock.calls.filter(([, o]) => o?.method);
}
describe.each(["en", "ar"] as const)(
  "Appeals %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("keeps both GETs, query keys, retry=false, raw reason/status, locale dates, policy and default Rejected decision", async () => {
      const v = setup(locale);
      await v.ready();
      expect(screen.getByRole("heading", { name: v.c.title })).toBeVisible();
      expect(screen.getByText(v.c.description)).toBeVisible();
      expect(screen.getByText(v.c.rationaleHint)).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith(queue);
      expect(apiMock).toHaveBeenCalledWith(pdf);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["evaluation-appeals", "review-queue"],
        ["assessment-pdf-reports", "status"],
      ]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .every((q) => q.options.retry === false),
      ).toBe(true);
      expect(screen.getByText(appeal.status)).toBeVisible();
      expect(screen.getByText(appeal.reason).textContent).toBe(appeal.reason);
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "TIME" &&
            e.textContent ===
              formatLocalizedDateTime(appeal.createdAtUtc, locale),
        ),
      ).toHaveAttribute("datetime", appeal.createdAtUtc);
      const decision = screen.getByLabelText(v.c.decision);
      expect(decision).toHaveValue("Rejected");
      expect(
        within(decision).getByRole("option", { name: v.c.upheld }),
      ).toHaveValue("Upheld");
      expect(
        within(decision).getByRole("option", { name: v.c.rejected }),
      ).toHaveValue("Rejected");
      expect(writes()).toEqual([]);
    });
    it.each([false, true])(
      "preserves exact audit URL and conditional PDF URL with locale (configured=%s)",
      async (configured) => {
        apiMock.mockImplementation((p: string) =>
          Promise.resolve(
            p === pdf
              ? {
                  isConfigured: configured,
                  unavailableReason: "RAW_PROVIDER_REASON",
                }
              : read(p),
          ),
        );
        const v = setup(locale);
        await v.ready();
        expect(
          screen.getByRole("link", { name: v.c.auditExport }),
        ).toHaveAttribute(
          "href",
          "/api/v1/assessment-audit-exports/evaluation",
        );
        if (configured)
          expect(
            await screen.findByRole("link", { name: v.c.pdfReport }),
          ).toHaveAttribute(
            "href",
            `/api/v1/assessment-pdf-reports/evaluation?locale=${locale}`,
          );
        else
          expect(
            screen.queryByRole("link", { name: v.c.pdfReport }),
          ).not.toBeInTheDocument();
        expect(
          screen.queryByText("RAW_PROVIDER_REASON"),
        ).not.toBeInTheDocument();
      },
    );
    it.each(["Rejected", "Upheld"] as const)(
      "keeps DOM/minimum/pending guards, exact %s review payload, queue-only invalidation and retained draft",
      async (decision) => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o ? pending.promise : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        await v.ready();
        const rationale = screen.getByLabelText(v.c.rationale, {
            exact: false,
          }),
          button = () => screen.getByRole("button", { name: v.c.record });
        expect(rationale).toHaveAttribute("minlength", "10");
        expect(rationale).toHaveAttribute("maxlength", "4000");
        expect(rationale).not.toBeRequired();
        expect(button()).toBeDisabled();
        fireEvent.change(rationale, { target: { value: "  123456789  " } });
        expect(button()).toBeDisabled();
        fireEvent.change(rationale, { target: { value: "  1234567890  " } });
        expect(screen.getByLabelText(v.c.decision)).toHaveValue("Rejected");
        fireEvent.change(screen.getByLabelText(v.c.decision), {
          target: { value: decision },
        });
        expect(button()).toBeEnabled();
        fireEvent.click(button());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          review,
          {
            method: "POST",
            body: JSON.stringify({
              status: decision,
              decisionRationale: "1234567890",
            }),
          },
        ]);
        expect(
          screen.getByRole("button", { name: v.c.recording }),
        ).toBeDisabled();
        await act(async () => pending.resolve(undefined));
        await waitFor(() =>
          expect(refreshKeys(v.invalidations)).toEqual([
            ["evaluation-appeals", "review-queue"],
          ]),
        );
        expect(rationale).toHaveValue("  1234567890  ");
        expect(screen.getByLabelText(v.c.decision)).toHaveValue(decision);
        expect(writes()).toHaveLength(1);
      },
    );
    it.each([true, false])(
      "keeps raw Error.message precedence and localized non-Error queue fallback (Error=%s)",
      async (isError) => {
        apiMock.mockImplementation((p: string) =>
          p === queue
            ? Promise.reject(
                isError
                  ? Error("RAW_APPEAL_ERROR")
                  : { message: "DO_NOT_DISPLAY_OBJECT" },
              )
            : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          isError ? "RAW_APPEAL_ERROR" : v.c.loadError,
        );
        expect(apiMock.mock.calls.filter(([p]) => p === queue)).toHaveLength(1);
      },
    );
    it("keeps empty state and neutral loading marker distinct", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string) =>
        p === queue ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      expect(screen.getByText("…")).toBeVisible();
      expect(screen.queryByText(v.c.empty)).not.toBeInTheDocument();
      await act(async () => pending.resolve([]));
      expect(await screen.findByText(v.c.empty)).toBeVisible();
      expect(screen.queryByText("…")).not.toBeInTheDocument();
    });
    it("keeps failed review draft without inventing a grade mutation or new error paragraph", async () => {
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o
          ? Promise.reject(Error("RAW_REVIEW_ERROR"))
          : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.ready();
      fireEvent.change(screen.getByLabelText(v.c.rationale, { exact: false }), {
        target: { value: "Valid review rationale" },
      });
      fireEvent.click(screen.getByRole("button", { name: v.c.record }));
      await waitFor(() => expect(writes()).toHaveLength(1));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: v.c.record })).toBeEnabled(),
      );
      expect(refreshKeys(v.invalidations)).toEqual([]);
      expect(screen.queryByText("RAW_REVIEW_ERROR")).not.toBeInTheDocument();
      expect(
        screen.getByLabelText(v.c.rationale, { exact: false }),
      ).toHaveValue("Valid review rationale");
    });
  },
);
