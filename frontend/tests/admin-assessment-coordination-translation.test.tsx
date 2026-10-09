import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentCoordinationQueue } from "@/features/admin/assessment-coordination-queue";
import { EligibleEvaluatorAssignment } from "@/features/admin/eligible-evaluator-assignment";
import { ResitCoordinationPanel } from "@/features/admin/resit-coordination-panel";
import { ApiError } from "@/lib/api";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  adjustmentSummary,
  authorizations,
  candidates,
  pendingEvaluation,
  queueItems,
  queuePage,
  requestId,
  resitPage,
  revisionId,
} from "./fixtures/admin-assessment-coordination";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const clients: QueryClient[] = [];
const adjustmentPath = `/assessment-coordination/${revisionId}/reasonable-adjustments/revision-deadline`;
function read(path: string) {
  if (path.startsWith("/assessment-coordination/queue?"))
    return queuePage(path);
  if (path === adjustmentPath) return adjustmentSummary;
  if (path.endsWith("/eligible-evaluators")) return candidates;
  if (path.startsWith("/resits/authorizations?"))
    return resitPage(
      Number(new URL(path, "http://mock.invalid").searchParams.get("page")),
    );
  throw Error(`Unexpected read ${path}`);
}
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(
  locale: "ar" | "en",
  component: "queue" | "assignment" | "resit" = "queue",
  evaluation = pendingEvaluation,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const invalidations = vi.spyOn(client, "invalidateQueries"),
    onAssigned = vi.fn(),
    messages = locale === "ar" ? ar : en;
  const t = createTranslator({ locale, messages, namespace: "adminWorkspace" });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {component === "queue" ? (
          <AssessmentCoordinationQueue />
        ) : component === "resit" ? (
          <ResitCoordinationPanel />
        ) : (
          <EligibleEvaluatorAssignment
            evaluation={evaluation}
            onAssigned={onAssigned}
          />
        )}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    client,
    invalidations,
    onAssigned,
    t,
    copy: messages.adminWorkspace,
  };
}
function card(locale: "ar" | "en", id = requestId) {
  return screen
    .getByRole("heading", {
      name: `${locale === "ar" ? "طلب" : "Request"} ${id.slice(0, 8)}`,
    })
    .closest("article")!;
}
function writes() {
  return apiMock.mock.calls.filter(([, o]) => o?.method);
}
function refreshKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([v]) => (v as { queryKey: string[] }).queryKey);
}
function formFor(element: HTMLElement) {
  return element.closest("form")!;
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o?.method ? undefined : read(p)),
    );
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
describe.each(["ar", "en"] as const)(
  "Admin assessment coordination %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    describe("AssessmentCoordinationQueue", () => {
      it("keeps exact default query/key/polling/retry, all status/filter labels and academic server data", async () => {
        const { copy, client } = setup(locale),
          q = copy.assessmentCoordination;
        await screen.findByRole("heading", { name: q.title });
        await screen.findByText(q.evaluatorAvailable);
        expect(apiMock).toHaveBeenCalledWith(
          "/assessment-coordination/queue?page=1&pageSize=10",
        );
        const query = client
          .getQueryCache()
          .find({ queryKey: ["assessment-coordination", "", "", 1] })!;
        expect(query.options).toMatchObject({
          retry: false,
          refetchInterval: 60000,
        });
        const statuses = within(screen.getByLabelText(q.statusFilter)),
          targets = within(screen.getByLabelText(q.completionFilter));
        for (const [value, text] of Object.entries(q.statuses))
          expect(statuses.getByRole("option", { name: text })).toHaveValue(
            value,
          );
        for (const [value, text] of [
          ["NotSet", q.notSet],
          ["OnTrack", q.onTrack],
          ["Overdue", q.overdue],
        ])
          expect(targets.getByRole("option", { name: text })).toHaveValue(
            value,
          );
        const first = within(card(locale));
        expect(
          first.getByText(
            `QUAL V1 · UNIT-7 ${locale === "ar" ? "عنوان الوحدة من الخادم" : "Server Unit title"}`,
          ),
        ).toBeVisible();
        expect(
          screen.queryByText(
            locale === "ar" ? "Server Unit title" : "عنوان الوحدة من الخادم",
          ),
        ).not.toBeInTheDocument();
        expect(first.getByText(copy.shared.resit)).toBeVisible();
        expect(
          first.getByText(`${copy.shared.originalRequest} ORIGINAL`),
        ).toBeVisible();
        expect(
          within(card(locale, queueItems[1].id)).getByText(q.retake),
        ).toBeVisible();
        expect(
          first.queryByText("ORIGINAL-1234-2222-3333-444444444444"),
        ).not.toBeInTheDocument();
      });
      it("keeps all three blocker codes, availability guard and raw evaluator interpolation", async () => {
        const { copy, t } = setup(locale),
          q = copy.assessmentCoordination;
        await screen.findByText(q.mappingBlocker);
        expect(screen.getByText(q.noEvaluatorBlocker)).toBeVisible();
        expect(screen.getByText(q.stateChangedBlocker)).toBeVisible();
        expect(
          within(card(locale, queueItems[4].id)).getByText(
            q.academicUnavailable,
          ),
        ).toBeVisible();
        expect(
          within(card(locale, queueItems[1].id)).getByText(
            t("assessmentCoordination.evaluator", {
              name: queueItems[1].evaluatorDisplayName!,
            }),
          ),
        ).toBeVisible();
        expect(screen.getAllByText(q.evaluatorAvailable)).toHaveLength(1);
      });
      it("keeps completion states, overdue status semantics and every localized date path", async () => {
        const { copy } = setup(locale),
          q = copy.assessmentCoordination;
        await screen.findByText(q.evaluatorAvailable);
        const overdue = within(card(locale, queueItems[1].id)).getByRole(
          "status",
        );
        expect(overdue).toHaveTextContent(q.overdue);
        expect(overdue.textContent).toBe(
          `${q.overdue} · ${formatLocalizedDateTime(queueItems[1].expectedCompletionAtUtc, locale)}`,
        );
        expect(
          within(card(locale, queueItems[2].id)).getByText(
            (_, el) =>
              el?.textContent ===
              `${q.onTrack} · ${formatLocalizedDateTime(queueItems[2].expectedCompletionAtUtc, locale)}`,
          ),
        ).not.toHaveAttribute("role");
        expect(
          within(card(locale)).getByText(q.targetNotSet),
        ).not.toHaveAttribute("role");
        expect(
          within(card(locale)).getByText(
            (_, el) =>
              el?.textContent ===
              `${q.updated} ${formatLocalizedDateTime(queueItems[0].updatedAtUtc, locale)}`,
          ),
        ).toBeVisible();
        const revision = within(card(locale, revisionId));
        expect(revision.getByText(q.activeAdjustment)).toBeVisible();
        expect(
          revision.getByText(
            (_, el) =>
              el?.textContent ===
              formatLocalizedDateTime(
                queueItems[3].effectiveRevisionDueAtUtc,
                locale,
              ),
          ),
        ).toBeVisible();
        expect(
          revision.queryByText(
            (_, el) =>
              el?.textContent ===
              formatLocalizedDateTime(queueItems[3].revisionDueAtUtc, locale),
          ),
        ).not.toBeInTheDocument();
      });
      it("keeps bounded paging and resets page on both server-owned filters", async () => {
        const { copy, client, t } = setup(locale),
          q = copy.assessmentCoordination;
        await screen.findByText(q.evaluatorAvailable);
        expect(
          screen.getByRole("button", { name: copy.shared.previous }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: copy.shared.next }));
        await waitFor(() =>
          expect(
            client.getQueryData(["assessment-coordination", "", "", 2]),
          ).toBeDefined(),
        );
        fireEvent.change(screen.getByLabelText(q.statusFilter), {
          target: { value: "NeedsRevision" },
        });
        await waitFor(() =>
          expect(
            client.getQueryData([
              "assessment-coordination",
              "NeedsRevision",
              "",
              1,
            ]),
          ).toBeDefined(),
        );
        expect(apiMock).toHaveBeenCalledWith(
          "/assessment-coordination/queue?page=1&pageSize=10&status=NeedsRevision",
        );
        fireEvent.click(screen.getByRole("button", { name: copy.shared.next }));
        await waitFor(() =>
          expect(
            client.getQueryData([
              "assessment-coordination",
              "NeedsRevision",
              "",
              2,
            ]),
          ).toBeDefined(),
        );
        fireEvent.change(screen.getByLabelText(q.completionFilter), {
          target: { value: "Overdue" },
        });
        await waitFor(() =>
          expect(
            client.getQueryData([
              "assessment-coordination",
              "NeedsRevision",
              "Overdue",
              1,
            ]),
          ).toBeDefined(),
        );
        expect(apiMock).toHaveBeenCalledWith(
          "/assessment-coordination/queue?page=1&pageSize=10&status=NeedsRevision&expectedCompletionState=Overdue",
        );
        fireEvent.click(screen.getByRole("button", { name: copy.shared.next }));
        await screen.findByText(
          t("assessmentCoordination.pageSummary", { page: 2, count: 21 }),
        );
        fireEvent.click(screen.getByRole("button", { name: copy.shared.next }));
        await screen.findByText(
          t("assessmentCoordination.pageSummary", { page: 3, count: 21 }),
        );
        expect(
          screen.getByRole("button", { name: copy.shared.next }),
        ).toBeDisabled();
        fireEvent.click(
          screen.getByRole("button", { name: copy.shared.previous }),
        );
        await screen.findByText(
          t("assessmentCoordination.pageSummary", { page: 2, count: 21 }),
        );
      });
      it.each(["loading", "error", "empty"] as const)(
        "localizes queue %s",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "error"
                ? Promise.reject(Error("Queue failure"))
                : Promise.resolve({ ...queuePage(), items: [] }),
          );
          const { copy } = setup(locale),
            q = copy.assessmentCoordination;
          expect(
            await screen.findByText(
              state === "loading"
                ? q.loading
                : state === "error"
                  ? q.loadError
                  : q.empty,
            ),
          ).toBeVisible();
        },
      );
      async function editTarget() {
        const result = setup(locale);
        await screen.findByText(
          result.copy.assessmentCoordination.evaluatorAvailable,
        );
        const view = within(card(locale));
        fireEvent.click(
          view.getByRole("button", {
            name: result.copy.assessmentCoordination.setTarget,
          }),
        );
        const date = view.getByLabelText(
            result.copy.assessmentCoordination.expectedCompletion,
          ),
          reason = view.getByLabelText(
            result.copy.assessmentCoordination.internalReason,
          );
        return { ...result, view, date, reason, form: formFor(reason) };
      }
      it.each(["date", "blank", "long"] as const)(
        "rejects invalid expected completion %s without PUT",
        async (invalid) => {
          const { copy, date, reason, form } = await editTarget();
          fireEvent.change(date, {
            target: { value: invalid === "date" ? "" : "2030-01-03T12:00" },
          });
          fireEvent.change(reason, {
            target: {
              value:
                invalid === "blank"
                  ? "   "
                  : invalid === "long"
                    ? "x".repeat(501)
                    : "Reason",
            },
          });
          fireEvent.submit(form);
          expect(await screen.findByRole("alert")).toHaveTextContent(
            copy.assessmentCoordination.saveError,
          );
          expect(writes()).toEqual([]);
        },
      );
      it("saves exact trimmed reason/ISO date, prevents pending repeat, invalidates, closes and clears fields", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy, date, reason, form, view, invalidations } =
            await editTarget(),
          q = copy.assessmentCoordination;
        expect(date).toBeRequired();
        expect(date).toHaveAttribute("type", "datetime-local");
        expect(reason).toBeRequired();
        expect(reason).toHaveAttribute("maxlength", "500");
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        fireEvent.change(reason, {
          target: { value: `  ${"x".repeat(500)}  ` },
        });
        fireEvent.submit(form);
        await waitFor(() =>
          expect(view.getByRole("button", { name: q.saving })).toBeDisabled(),
        );
        expect(writes()).toEqual([
          [
            `/assessment-coordination/${requestId}/expected-completion`,
            {
              method: "PUT",
              body: JSON.stringify({
                expectedCompletionAtUtc: new Date(
                  "2030-01-03T12:00",
                ).toISOString(),
                reason: "x".repeat(500),
              }),
            },
          ],
        ]);
        await act(async () => pending.resolve(undefined));
        expect(
          (await view.findByText(q.savedTarget)).closest("p"),
        ).toHaveAttribute("role", "status");
        expect(refreshKeys(invalidations)).toEqual([
          ["assessment-coordination"],
        ]);
        expect(
          view.queryByLabelText(q.expectedCompletion),
        ).not.toBeInTheDocument();
        fireEvent.click(view.getByRole("button", { name: q.setTarget }));
        expect(view.getByLabelText(q.expectedCompletion)).toHaveValue("");
        expect(view.getByLabelText(q.internalReason)).toHaveValue("");
      });
      it("shows save failure and preserves typed fields", async () => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(Error("Staff save failure"))
            : Promise.resolve(read(p)),
        );
        const { copy, date, reason, form } = await editTarget();
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        fireEvent.change(reason, { target: { value: "Raw private note" } });
        fireEvent.submit(form);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          copy.assessmentCoordination.saveError,
        );
        expect(reason).toHaveValue("Raw private note");
      });
      async function openAdjustment() {
        const result = setup(locale);
        await screen.findByText(
          result.copy.assessmentCoordination.evaluatorAvailable,
        );
        const view = within(card(locale, revisionId));
        fireEvent.click(
          view.getByRole("button", {
            name: result.copy.assessmentCoordination.manageAdjustment,
          }),
        );
        return { ...result, view };
      }
      it("loads exact adjustment endpoint, private raw history/revocation reason and toggle clearing", async () => {
        const { copy, view } = await openAdjustment(),
          q = copy.assessmentCoordination;
        await view.findByText(q.history);
        expect(apiMock).toHaveBeenCalledWith(adjustmentPath);
        expect(view.getByText("Raw PRIVATE adjustment reason")).toBeVisible();
        expect(
          view.getByText(`${q.revoked} · Raw PRIVATE adjustment revocation`),
        ).toBeVisible();
        const reason = view.getByLabelText(q.privateReason),
          date = view.getByLabelText(q.adjustedDeadline);
        expect(reason).toBeRequired();
        expect(reason).toHaveAttribute("maxlength", "500");
        fireEvent.change(reason, { target: { value: "Private draft" } });
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        fireEvent.click(view.getByRole("button", { name: q.manageAdjustment }));
        expect(view.queryByText(q.history)).not.toBeInTheDocument();
        fireEvent.click(view.getByRole("button", { name: q.manageAdjustment }));
        await view.findByText(q.history);
        expect(view.getByLabelText(q.privateReason)).toHaveValue("");
        expect(view.getByLabelText(q.adjustedDeadline)).toHaveValue("");
        expect(
          apiMock.mock.calls.filter(([p]) => p === adjustmentPath),
        ).toHaveLength(2);
      });
      it.each(["loading", "error", "empty"] as const)(
        "localizes adjustment history %s",
        async (state) => {
          apiMock.mockImplementation((p: string) =>
            p === adjustmentPath
              ? state === "loading"
                ? new Promise(() => {})
                : state === "error"
                  ? Promise.reject(Error("History error"))
                  : Promise.resolve({ ...adjustmentSummary, history: [] })
              : Promise.resolve(read(p)),
          );
          const { copy, view } = await openAdjustment(),
            q = copy.assessmentCoordination;
          expect(
            await view.findByText(
              state === "loading"
                ? q.loadingHistory
                : state === "error"
                  ? q.historyError
                  : q.emptyHistory,
            ),
          ).toBeVisible();
        },
      );
      it.each(["date", "blank", "long"] as const)(
        "rejects invalid grant %s without POST",
        async (invalid) => {
          const { copy, view } = await openAdjustment(),
            q = copy.assessmentCoordination;
          const reason = await view.findByLabelText(q.privateReason),
            date = view.getByLabelText(q.adjustedDeadline);
          fireEvent.change(date, {
            target: { value: invalid === "date" ? "" : "2030-01-03T12:00" },
          });
          fireEvent.change(reason, {
            target: {
              value:
                invalid === "blank"
                  ? "   "
                  : invalid === "long"
                    ? "x".repeat(501)
                    : "Raw reason",
            },
          });
          fireEvent.submit(formFor(reason));
          expect(await view.findByRole("alert")).toHaveTextContent(
            q.adjustmentSaveError,
          );
          expect(writes()).toEqual([]);
        },
      );
      it("grants exact trimmed reason/ISO deadline, disables pending, clears fields and reloads history after invalidation", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy, view, invalidations } = await openAdjustment(),
          q = copy.assessmentCoordination;
        const reason = await view.findByLabelText(q.privateReason),
          date = view.getByLabelText(q.adjustedDeadline);
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        fireEvent.change(reason, {
          target: { value: "  Private extension rationale  " },
        });
        fireEvent.submit(formFor(reason));
        await waitFor(() =>
          expect(view.getByRole("button", { name: q.saving })).toBeDisabled(),
        );
        expect(writes()).toEqual([
          [
            adjustmentPath,
            {
              method: "POST",
              body: JSON.stringify({
                extendedDueAtUtc: new Date("2030-01-03T12:00").toISOString(),
                reason: "Private extension rationale",
              }),
            },
          ],
        ]);
        await act(async () => pending.resolve(undefined));
        await waitFor(() =>
          expect(
            apiMock.mock.calls.filter(
              ([p, o]) => p === adjustmentPath && !o?.method,
            ),
          ).toHaveLength(2),
        );
        expect(refreshKeys(invalidations)).toEqual([
          ["assessment-coordination"],
        ]);
        expect(view.getByLabelText(q.privateReason)).toHaveValue("");
        expect(view.getByLabelText(q.adjustedDeadline)).toHaveValue("");
      });
      it.each(["", "   ", "  Private revoke  "])(
        "revokes with optional/trimmed reason %s and reloads",
        async (reasonText) => {
          apiMock.mockImplementation((p: string, o?: RequestInit) =>
            Promise.resolve(
              o?.method
                ? undefined
                : p === adjustmentPath
                  ? { ...adjustmentSummary, activeAdjustmentId: "active-1" }
                  : read(p),
            ),
          );
          const { copy, view, invalidations } = await openAdjustment(),
            q = copy.assessmentCoordination;
          const reason = await view.findByLabelText(q.revocationReason);
          expect(reason).not.toBeRequired();
          expect(reason).toHaveAttribute("maxlength", "500");
          fireEvent.change(reason, { target: { value: reasonText } });
          fireEvent.submit(formFor(reason));
          await waitFor(() =>
            expect(writes()).toEqual([
              [
                `${adjustmentPath}/active-1/revoke`,
                {
                  method: "POST",
                  body: JSON.stringify({ reason: reasonText.trim() || null }),
                },
              ],
            ]),
          );
          await waitFor(() =>
            expect(
              apiMock.mock.calls.filter(
                ([p, o]) => p === adjustmentPath && !o?.method,
              ),
            ).toHaveLength(2),
          );
          expect(refreshKeys(invalidations)).toEqual([
            ["assessment-coordination"],
          ]);
          expect(view.getByLabelText(q.revocationReason)).toHaveValue("");
        },
      );
      it("rejects revocation over 500 characters and keeps optional-reason pending guard", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? pending.promise
            : Promise.resolve(
                p === adjustmentPath
                  ? { ...adjustmentSummary, activeAdjustmentId: "active-1" }
                  : read(p),
              ),
        );
        const { copy, view } = await openAdjustment(),
          q = copy.assessmentCoordination;
        const reason = await view.findByLabelText(q.revocationReason);
        fireEvent.change(reason, { target: { value: "x".repeat(501) } });
        fireEvent.submit(formFor(reason));
        expect(await view.findByRole("alert")).toHaveTextContent(
          q.adjustmentSaveError,
        );
        expect(writes()).toEqual([]);
        fireEvent.change(reason, { target: { value: "" } });
        fireEvent.submit(formFor(reason));
        await waitFor(() =>
          expect(view.getByRole("button", { name: q.revoking })).toBeDisabled(),
        );
        await act(async () => pending.resolve(undefined));
      });
      it.each([false, true])(
        "localizes grant/revoke mutation failure; revoke=%s",
        async (revoke) => {
          apiMock.mockImplementation((p: string, o?: RequestInit) =>
            o?.method
              ? Promise.reject(Error("Adjustment error"))
              : Promise.resolve(
                  p === adjustmentPath
                    ? {
                        ...adjustmentSummary,
                        activeAdjustmentId: revoke ? "active-1" : null,
                      }
                    : read(p),
                ),
          );
          const { copy, view } = await openAdjustment(),
            q = copy.assessmentCoordination;
          const reason = await view.findByLabelText(
            revoke ? q.revocationReason : q.privateReason,
          );
          if (!revoke) {
            fireEvent.change(reason, { target: { value: "Reason" } });
            fireEvent.change(view.getByLabelText(q.adjustedDeadline), {
              target: { value: "2030-01-03T12:00" },
            });
          }
          fireEvent.submit(formFor(reason));
          expect(await view.findByRole("alert")).toHaveTextContent(
            q.adjustmentSaveError,
          );
        },
      );
    });
    describe("EligibleEvaluatorAssignment", () => {
      it("preserves exact query/retry, raw candidate/student/status data, Resit original request and counts", async () => {
        const { copy, client } = setup(locale, "assignment"),
          c = copy.evaluatorAssignment;
        await screen.findByRole("option", { name: candidates[0].displayName });
        expect(apiMock).toHaveBeenCalledWith(
          `/evaluations/${requestId}/eligible-evaluators`,
        );
        expect(
          client
            .getQueryCache()
            .find({ queryKey: ["eligible-evaluators", requestId] })!.options
            .retry,
        ).toBe(false);
        for (const text of [
          c.title,
          pendingEvaluation.studentComment,
          pendingEvaluation.status,
          copy.shared.resit,
          `${copy.shared.originalRequest} ORIGINAL`,
          `3 ${c.files} · 2 ${c.criteria}`,
        ])
          expect(screen.getByText(text)).toBeVisible();
        expect(
          screen.getByRole("option", { name: candidates[1].displayName }),
        ).toHaveValue(candidates[1].id);
        expect(screen.getByRole("button", { name: c.assign })).toBeDisabled();
      });
      it("uses the no-note fallback only when the raw student comment is absent", async () => {
        const { copy } = setup(locale, "assignment", {
          ...pendingEvaluation,
          studentComment: "",
          isResit: false,
        });
        expect(
          await screen.findByText(copy.evaluatorAssignment.noStudentNote),
        ).toBeVisible();
        expect(screen.queryByText(copy.shared.resit)).not.toBeInTheDocument();
      });
      it.each(["loading", "error", "empty", "mapping"] as const)(
        "localizes candidate %s and preserves ApiError code classification",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "mapping"
                ? Promise.reject(
                    new ApiError(
                      409,
                      "Raw mapping",
                      "ACADEMIC_MAPPING_REQUIRED",
                    ),
                  )
                : state === "error"
                  ? Promise.reject(new ApiError(500, "Raw failure", "OTHER"))
                  : Promise.resolve([]),
          );
          const { copy } = setup(locale, "assignment"),
            c = copy.evaluatorAssignment;
          expect(
            await screen.findByText(
              state === "loading"
                ? c.loading
                : state === "mapping"
                  ? c.mappingBlocker
                  : state === "error"
                    ? c.loadError
                    : c.empty,
            ),
          ).toBeVisible();
          expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
        },
      );
      it("assigns only the selected teacher, disables pending repeat and calls onAssigned without local invalidations", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy, onAssigned, invalidations } = setup(locale, "assignment"),
          c = copy.evaluatorAssignment;
        await screen.findByRole("option", { name: candidates[0].displayName });
        fireEvent.change(screen.getByLabelText(c.selectEvaluator), {
          target: { value: "candidate-2" },
        });
        fireEvent.click(screen.getByRole("button", { name: c.assign }));
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: c.assigning }),
          ).toBeDisabled(),
        );
        expect(writes()).toEqual([
          [
            `/evaluations/${requestId}/assign`,
            {
              method: "POST",
              body: JSON.stringify({ teacherUserId: "candidate-2" }),
            },
          ],
        ]);
        expect(onAssigned).not.toHaveBeenCalled();
        await act(async () => pending.resolve(undefined));
        await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1));
        expect(invalidations).not.toHaveBeenCalled();
      });
      it.each([
        "UNIT_SPECIALISM_REQUIRED",
        "EVALUATOR_NOT_ELIGIBLE",
        "ASSIGNMENT_CONFLICT",
        "OTHER",
        null,
      ])("keeps assignment error classification for %s", async (code) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(
                code
                  ? new ApiError(409, "Raw message", code)
                  : Error("Ordinary error"),
              )
            : Promise.resolve(read(p)),
        );
        const { copy, onAssigned } = setup(locale, "assignment"),
          c = copy.evaluatorAssignment;
        await screen.findByRole("option", { name: candidates[0].displayName });
        fireEvent.change(screen.getByLabelText(c.selectEvaluator), {
          target: { value: "candidate-1" },
        });
        fireEvent.click(screen.getByRole("button", { name: c.assign }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          code && code !== "OTHER" ? c.staleError : c.assignError,
        );
        expect(onAssigned).not.toHaveBeenCalled();
      });
    });
    describe("ResitCoordinationPanel", () => {
      it("keeps exact read-only query and revoked/activated/authorized precedence including incomplete activation", async () => {
        const { copy, client } = setup(locale, "resit"),
          c = copy.resitCoordination;
        await screen.findByText(c.revoked);
        expect(apiMock).toHaveBeenCalledWith(
          "/resits/authorizations?page=1&pageSize=10",
        );
        expect(client.getQueryData(["resit-authorizations", 1])).toEqual(
          resitPage(),
        );
        expect(screen.getByRole("region", { name: c.region })).toBeVisible();
        expect(screen.getByRole("heading", { name: c.title })).toBeVisible();
        expect(screen.getByText(c.description)).toBeVisible();
        const cards = screen.getAllByRole("article");
        expect(within(cards[0]).getByText(c.authorized)).toBeVisible();
        expect(within(cards[1]).getByText(c.activated)).toBeVisible();
        expect(within(cards[2]).getByText(c.revoked)).toBeVisible();
        expect(within(cards[3]).getByText(c.authorized)).toBeVisible();
        expect(writes()).toEqual([]);
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.getAllByRole("button")).toHaveLength(2);
      });
      it("keeps short IDs, all date formatters and private raw staff/revocation reasons", async () => {
        const { copy } = setup(locale, "resit"),
          c = copy.resitCoordination;
        await screen.findByText(c.revoked);
        const view = within(screen.getAllByRole("article")[2]),
          item = authorizations[2];
        expect(
          view.getByText(`${copy.shared.originalRequest} ORIGINAL`),
        ).toBeVisible();
        expect(view.getByText(`${c.resitRequest} RESITREQ`)).toBeVisible();
        expect(
          view.queryByText(item.originalEvaluationRequestId),
        ).not.toBeInTheDocument();
        for (const date of [
          formatLocalizedDateTime(item.authorizedAtUtc, locale),
          `${c.activatedAt} ${formatLocalizedDateTime(item.activatedAtUtc, locale)}`,
          `${c.revokedAt} ${formatLocalizedDateTime(item.revokedAtUtc, locale)}`,
        ])
          expect(
            view.getByText((_, el) => el?.textContent === date),
          ).toBeVisible();
        expect(
          view.getByText(
            (_, el) => el?.textContent === `${c.privateReason} ${item.reason}`,
          ),
        ).toBeVisible();
        expect(
          view.getByText(
            (_, el) =>
              el?.textContent ===
              `${c.privateRevocationReason} ${item.revocationReason}`,
          ),
        ).toBeVisible();
      });
      it.each(["loading", "error", "empty"] as const)(
        "localizes Resit %s",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "error"
                ? Promise.reject(Error("History failure"))
                : Promise.resolve({ ...resitPage(), items: [] }),
          );
          const { copy } = setup(locale, "resit"),
            c = copy.resitCoordination;
          expect(
            await screen.findByText(
              state === "loading"
                ? c.loading
                : state === "error"
                  ? c.loadError
                  : c.empty,
            ),
          ).toBeVisible();
        },
      );
      it("keeps server hasNextPage and disables both navigation buttons while fetching", async () => {
        const second = deferred();
        apiMock.mockImplementation((p: string) =>
          p.includes("page=2") ? second.promise : Promise.resolve(read(p)),
        );
        const { copy, client } = setup(locale, "resit");
        await screen.findByText(copy.resitCoordination.revoked);
        const prev = screen.getByRole("button", { name: copy.shared.previous }),
          next = screen.getByRole("button", { name: copy.shared.next });
        expect(prev).toBeDisabled();
        expect(next).toBeEnabled();
        fireEvent.click(next);
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/resits/authorizations?page=2&pageSize=10",
          ),
        );
        expect(prev).toBeDisabled();
        expect(next).toBeDisabled();
        await act(async () => second.resolve(resitPage(2)));
        await waitFor(() =>
          expect(
            client.getQueryData(["resit-authorizations", 2]),
          ).toBeDefined(),
        );
        expect(prev).toBeEnabled();
        expect(next).toBeDisabled();
        expect(
          screen.getByText(`${copy.resitCoordination.page} 2`),
        ).toBeVisible();
        fireEvent.click(prev);
        await screen.findByText(`${copy.resitCoordination.page} 1`);
        expect(writes()).toEqual([]);
      });
    });
  },
);
