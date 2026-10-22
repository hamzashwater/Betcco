import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminArea } from "@/features/admin/admin-area";
import { AssessmentCoordinationQueue } from "@/features/admin/assessment-coordination-queue";
import { EligibleEvaluatorAssignment } from "@/features/admin/eligible-evaluator-assignment";
import { ApiError } from "@/lib/api";
import { assessmentRequestMessage } from "@/features/admin/assessment-operations-state";
import { mount, deferred } from "./helpers/admin-governance-gradebook-render";
import {
  queuePage,
  pendingEvaluation,
  candidates,
} from "./fixtures/admin-assessment-coordination";
import { underReviewEvaluations } from "./fixtures/admin-evaluations-approvals";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
describe("UI-D01-14 real query observer states", () => {
  it.each([
    [401, false, "dashboard.signIn"],
    [401, true, "fallback"],
    [403, false, "courseApprovals.accessDenied"],
    [403, true, "courseApprovals.accessDenied"],
    [503, false, "fallback"],
  ] as const)(
    "presents actual HTTP %s with cached=%s without inventing authorization",
    (status, cached, expected) => {
      expect(
        assessmentRequestMessage(
          new ApiError(status, "Raw request failure"),
          "fallback",
          (key) => key,
          cached,
        ),
      ).toBe(expected);
      expect(
        assessmentRequestMessage(
          new Error("No HTTP evidence"),
          "fallback",
          (key) => key,
          cached,
        ),
      ).toBe("fallback");
    },
  );
  it("distinguishes filtered no-match from a successful unfiltered empty queue", async () => {
    apiMock.mockReset().mockResolvedValue(queuePage());
    const v = mount("en", <AssessmentCoordinationQueue />),
      t = v.copy.assessmentCoordination;
    await screen.findByRole("heading", { name: `${t.request} 12345678` });
    apiMock.mockResolvedValue({ ...queuePage(), items: [], totalCount: 0 });
    fireEvent.change(screen.getByLabelText(t.statusFilter), {
      target: { value: "Assigned" },
    });
    expect(await screen.findByText(v.copy.gradebook.empty)).toBeVisible();
    expect(screen.queryByText(t.empty)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t.statusFilter), {
      target: { value: "" },
    });
    expect(await screen.findByText(t.empty)).toBeVisible();
    expect(screen.queryByText(v.copy.gradebook.empty)).not.toBeInTheDocument();
  });
  it.each(["en", "ar"] as const)(
    "keeps cached queue order, blockers and a target draft through refresh failure in %s",
    async (locale) => {
      apiMock.mockReset().mockResolvedValue(queuePage());
      const v = mount(locale, <AssessmentCoordinationQueue />),
        t = v.copy.assessmentCoordination;
      await screen.findByRole("heading", { name: `${t.request} 12345678` });
      const articles = [...document.querySelectorAll("article")],
        order = articles.map((e) => e.textContent);
      fireEvent.click(
        within(articles[0] as HTMLElement).getByRole("button", {
          name: t.setTarget,
        }),
      );
      fireEvent.change(screen.getByLabelText(t.internalReason), {
        target: { value: "Unsaved staff reason" },
      });
      apiMock.mockRejectedValue(new Error("Synthetic refresh failure"));
      await act(async () => {
        await v.client.refetchQueries({
          queryKey: ["assessment-coordination"],
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(t.loadError);
      expect(screen.getByLabelText(t.internalReason)).toHaveValue(
        "Unsaved staff reason",
      );
      expect(
        [...document.querySelectorAll("article")]
          .slice(1)
          .map((e) => e.textContent),
      ).toEqual(order.slice(1));
      expect(screen.getByText(t.mappingBlocker)).toBeVisible();
      expect(screen.getByText(t.noEvaluatorBlocker)).toBeVisible();
      expect(screen.getByText(t.stateChangedBlocker)).toBeVisible();
      expect(apiMock.mock.calls.every(([, o]) => !o?.method)).toBe(true);
    },
  );
  it.each(["pending", "401", "403", "503", "empty"])(
    "never invents candidates or an assign action for %s with no usable data",
    async (mode) => {
      const held = deferred();
      apiMock
        .mockReset()
        .mockImplementation(() =>
          mode === "pending"
            ? held.promise
            : mode === "empty"
              ? Promise.resolve([])
              : Promise.reject(new ApiError(Number(mode), "Synthetic failure")),
        );
      const v = mount(
          "en",
          <EligibleEvaluatorAssignment
            evaluation={pendingEvaluation}
            onAssigned={vi.fn()}
          />,
        ),
        t = v.copy.evaluatorAssignment;
      if (mode === "pending") expect(screen.getByText(t.loading)).toBeVisible();
      else if (mode === "empty") await screen.findByText(t.empty);
      else
        expect(await screen.findByRole("alert")).toHaveTextContent(
          mode === "401"
            ? v.copy.dashboard.signIn
            : mode === "403"
              ? v.copy.courseApprovals.accessDenied
              : t.loadError,
        );
      expect(
        screen.queryByRole("button", { name: t.assign }),
      ).not.toBeInTheDocument();
      expect(apiMock.mock.calls.every(([, o]) => !o?.method)).toBe(true);
      held.resolve([]);
    },
  );
  it("retains the actual selected cached evaluator and submits the same request after refresh failure", async () => {
    const assigned = vi.fn();
    apiMock.mockReset().mockResolvedValue(candidates);
    const v = mount(
        "en",
        <EligibleEvaluatorAssignment
          evaluation={pendingEvaluation}
          onAssigned={assigned}
        />,
      ),
      t = v.copy.evaluatorAssignment;
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: candidates[1].id },
    });
    apiMock.mockRejectedValue(new Error("Synthetic refresh failure"));
    await act(async () => {
      await v.client.refetchQueries({ queryKey: ["eligible-evaluators"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(t.loadError);
    expect(screen.getByRole("combobox")).toHaveValue(candidates[1].id);
    apiMock.mockImplementation((p: string, o?: RequestInit) =>
      o?.method
        ? Promise.resolve()
        : Promise.reject(new Error("Synthetic refresh failure")),
    );
    fireEvent.click(screen.getByRole("button", { name: t.assign }));
    await waitFor(() => expect(assigned).toHaveBeenCalledOnce());
    expect(apiMock).toHaveBeenCalledWith(
      `/evaluations/${pendingEvaluation.id}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ teacherUserId: candidates[1].id }),
      },
    );
  });
  it.each(["en", "ar"] as const)(
    "keeps the cached Admin work queues, verification draft and local section links in %s",
    async (locale) => {
      apiMock
        .mockReset()
        .mockImplementation((p: string) =>
          Promise.resolve(
            p === "/auth/me"
              ? { roles: ["Admin"] }
              : p === "/evaluations/pending-assignment"
                ? [pendingEvaluation]
                : p === "/evaluations/under-review"
                  ? underReviewEvaluations
                  : p.startsWith("/assessment-coordination/queue")
                    ? queuePage()
                    : p.startsWith("/resits/authorizations")
                      ? { items: [], page: 1, pageSize: 10, hasNextPage: false }
                      : p.endsWith("/eligible-evaluators")
                        ? candidates
                        : [],
          ),
        );
      const v = mount(locale, <AdminArea segment={["evaluations"]} />),
        t = v.copy.evaluations;
      const notes = await screen.findAllByPlaceholderText(t.notesPlaceholder);
      fireEvent.change(notes[0], {
        target: { value: "Retained verification comment" },
      });
      apiMock.mockRejectedValue(new Error("Synthetic refresh failure"));
      await act(async () => {
        await v.client.refetchQueries({ queryKey: ["pending-evaluations"] });
        await v.client.refetchQueries({
          queryKey: ["under-review-evaluations"],
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(t.loadError);
      expect(notes[0]).toHaveValue("Retained verification comment");
      expect(screen.getAllByRole("button", { name: t.approve })).toHaveLength(
        2,
      );
      const nav = screen.getByRole("navigation", { name: t.title });
      expect(
        within(nav)
          .getAllByRole("link")
          .map((e) => e.getAttribute("href")),
      ).toEqual([
        "#assessment-coordination",
        "#assessment-assignment",
        "#assessment-resit",
        "#assessment-verification",
      ]);
      expect(apiMock.mock.calls.every(([, o]) => !o?.method)).toBe(true);
    },
  );
});
