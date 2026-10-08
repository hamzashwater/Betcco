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
import { AdminArea } from "@/features/admin/admin-area";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  courseApprovals,
  courseDetail,
  pendingEvaluations,
  underReviewEvaluations,
} from "./fixtures/admin-evaluations-approvals";
const apiMock = vi.hoisted(() => vi.fn());
const assignmentProps = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/admin/evaluations",
}));
// The three child features are outside this slice. Isolate the parent's copy
// and exercise its actual assignment callback without changing child contracts.
vi.mock("@/features/admin/assessment-coordination-queue", () => ({
  AssessmentCoordinationQueue: () => null,
}));
vi.mock("@/features/admin/resit-coordination-panel", () => ({
  ResitCoordinationPanel: () => null,
}));
vi.mock("@/features/admin/eligible-evaluator-assignment", () => ({
  EligibleEvaluatorAssignment: (props: {
    evaluation: { id: string };
    onAssigned: () => void;
  }) => {
    assignmentProps(props);
    return (
      <button onClick={props.onAssigned}>
        Mock assignment {props.evaluation.id}
      </button>
    );
  },
}));
const clients: QueryClient[] = [];
function read(path: string) {
  if (path === "/auth/me") return { roles: ["Admin"] };
  if (path === "/evaluations/pending-assignment") return pendingEvaluations;
  if (path === "/evaluations/under-review") return underReviewEvaluations;
  if (path === "/admin/courses/approvals") return courseApprovals;
  if (/^\/admin\/courses\/course-\d$/.test(path))
    return courseDetail(path.split("/").at(-1));
  throw Error(`Unexpected read ${path}`);
}
function setup(
  locale: "ar" | "en",
  segment: "evaluations" | "course-approvals",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const invalidations = vi.spyOn(client, "invalidateQueries"),
    messages = locale === "ar" ? ar : en;
  const t = createTranslator({ locale, messages, namespace: "adminWorkspace" });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AdminArea segment={[segment]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, invalidations, copy: messages.adminWorkspace, t };
}
function writes() {
  return apiMock.mock.calls.filter(([, o]) => o?.method);
}
function keys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([v]) => (v as { queryKey: string[] }).queryKey[0]);
}
function deferred() {
  let resolve!: (v?: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function courseCard(locale: "ar" | "en", index = 0) {
  return within(
    screen
      .getByRole("heading", {
        name:
          locale === "ar"
            ? courseApprovals[index].arabicTitle
            : courseApprovals[index].englishTitle,
      })
      .closest("article")!,
  );
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o?.method ? {} : read(p)),
    );
  assignmentProps.mockClear();
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
describe.each(["ar", "en"] as const)(
  "Admin evaluations/approvals %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    describe("AdminEvaluations", () => {
      it.each(["Admin", "InternalVerifier", "LeadInternalVerifier", "Teacher"])(
        "keeps exact IV role gating for %s",
        async (role) => {
          apiMock.mockImplementation((p: string) =>
            Promise.resolve(p === "/auth/me" ? { roles: [role] } : read(p)),
          );
          const { copy, client } = setup(locale, "evaluations");
          await screen.findByRole("heading", { name: copy.evaluations.title });
          const allowed = role !== "Teacher";
          expect(
            apiMock.mock.calls.some(([p]) => p === "/evaluations/under-review"),
          ).toBe(allowed);
          expect(client.getQueryData(["current-user"])).toEqual({
            roles: [role],
          });
          expect(client.getQueryData(["pending-evaluations"])).toEqual(
            pendingEvaluations,
          );
          const query = client
            .getQueryCache()
            .find({ queryKey: ["under-review-evaluations"] })!;
          expect(query.isActive()).toBe(allowed);
          const heading = screen.getByText(copy.evaluations.verificationTitle);
          if (allowed) expect(heading).toBeVisible();
          else expect(heading).not.toBeVisible();
        },
      );
      it("preserves raw result/criterion/evidence data, section interpolation and per-request fields", async () => {
        const { copy, t } = setup(locale, "evaluations"),
          c = copy.evaluations;
        await screen.findByText("Distinction");
        for (const text of [
          c.eyebrow,
          c.description,
          c.verificationDescription,
          c.calculatedResult,
          "Pass",
          "Achieved",
          "Raw assessor comment",
          "Raw student narrative",
          c.emptyEvidence,
        ])
          for (const element of screen.getAllByText(text))
            expect(element).toBeVisible();
        expect(
          screen.getByText(
            `${t("evaluations.section", { section: "A' {raw}" })}:`,
          ),
        ).toBeVisible();
        const notes = screen.getAllByPlaceholderText(c.notesPlaceholder);
        expect(notes).toHaveLength(2);
        expect(notes[0]).toHaveAttribute("maxlength", "4000");
        fireEvent.change(notes[0], { target: { value: "First request only" } });
        expect(notes[1]).toHaveValue("");
        const dates = screen.getAllByLabelText(new RegExp(c.deadline));
        expect(dates[0]).toHaveAttribute("type", "datetime-local");
        fireEvent.change(dates[0], { target: { value: "2030-01-03T12:00" } });
        expect(dates[1]).toHaveValue("");
        expect(screen.getByText(copy.shared.unavailable)).toBeVisible();
      });
      it("passes the pending entity unchanged and preserves parent assignment success invalidations", async () => {
        const { copy, invalidations } = setup(locale, "evaluations");
        fireEvent.click(
          await screen.findByRole("button", {
            name: "Mock assignment pending-1",
          }),
        );
        expect(assignmentProps).toHaveBeenCalledWith(
          expect.objectContaining({
            evaluation: pendingEvaluations[0],
            onAssigned: expect.any(Function),
          }),
        );
        expect(screen.getByRole("status")).toHaveTextContent(
          copy.evaluations.assigned,
        );
        expect(keys(invalidations)).toEqual([
          "pending-evaluations",
          "assessment-coordination",
          "admin-dashboard",
        ]);
      });
      it("renders both empty states without fabricating data", async () => {
        apiMock.mockImplementation((p: string) =>
          Promise.resolve(p === "/auth/me" ? { roles: ["Admin"] } : []),
        );
        const { copy } = setup(locale, "evaluations");
        expect(
          await screen.findByText(copy.evaluations.emptyPending),
        ).toBeVisible();
        expect(
          screen.getByText(copy.evaluations.emptyVerification),
        ).toBeVisible();
      });
      it.each([
        "/auth/me",
        "/evaluations/pending-assignment",
        "/evaluations/under-review",
      ])("keeps loading for pending %s", async (path) => {
        apiMock.mockImplementation((p: string) =>
          p === path ? new Promise(() => {}) : Promise.resolve(read(p)),
        );
        const { container, copy } = setup(locale, "evaluations");
        await waitFor(() =>
          expect(
            container.querySelector('[aria-busy="true"]'),
          ).toHaveTextContent(copy.shared.loadingIndicator),
        );
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      });
      it.each([
        "/auth/me",
        "/evaluations/pending-assignment",
        "/evaluations/under-review",
      ])("keeps localized load error for %s", async (path) => {
        apiMock.mockImplementation((p: string) =>
          p === path
            ? Promise.reject(Error("Read failure"))
            : Promise.resolve(read(p)),
        );
        const { copy } = setup(locale, "evaluations");
        expect(await screen.findByRole("alert")).toHaveTextContent(
          copy.evaluations.loadError,
        );
      });
      it.each([false, true])(
        "approves with nullable untrimmed notes and forced null due date, with note=%s",
        async (withNote) => {
          const { copy, invalidations } = setup(locale, "evaluations"),
            c = copy.evaluations;
          const approve = (
            await screen.findAllByRole("button", { name: c.approve })
          )[0];
          expect(approve).toBeEnabled();
          if (withNote)
            fireEvent.change(
              screen.getAllByPlaceholderText(c.notesPlaceholder)[0],
              { target: { value: "  Raw note  " } },
            );
          fireEvent.change(
            screen.getAllByLabelText(new RegExp(c.deadline))[0],
            {
              target: { value: "2030-01-03T12:00" },
            },
          );
          fireEvent.click(approve);
          await waitFor(() =>
            expect(writes()).toEqual([
              [
                "/evaluations/evaluation-1/internal-verification",
                {
                  method: "POST",
                  body: JSON.stringify({
                    approve: true,
                    comment: withNote ? "  Raw note  " : null,
                    resubmissionDueAtUtc: null,
                  }),
                },
              ],
            ]),
          );
          await waitFor(() =>
            expect(keys(invalidations)).toEqual([
              "under-review-evaluations",
              "admin-dashboard",
            ]),
          );
        },
      );
      it("preserves blank/missing-date/pending guards and resubmits with exact timezone conversion", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy, invalidations } = setup(locale, "evaluations"),
          c = copy.evaluations;
        const button = (
            await screen.findAllByRole("button", {
              name: c.requestResubmission,
            })
          )[0],
          approve = screen.getAllByRole("button", { name: c.approve })[0];
        const note = screen.getAllByPlaceholderText(c.notesPlaceholder)[0],
          date = screen.getAllByLabelText(new RegExp(c.deadline))[0];
        expect(button).toBeDisabled();
        expect(approve).toBeEnabled();
        fireEvent.change(note, { target: { value: "  " } });
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        expect(button).toBeDisabled();
        fireEvent.change(date, { target: { value: "" } });
        fireEvent.change(note, { target: { value: "  Resubmit raw  " } });
        expect(button).toBeDisabled();
        fireEvent.change(date, { target: { value: "2030-01-03T12:00" } });
        expect(button).toBeEnabled();
        fireEvent.click(button);
        await waitFor(() => expect(button).toBeDisabled());
        expect(approve).toBeDisabled();
        expect(writes()).toEqual([
          [
            "/evaluations/evaluation-1/internal-verification",
            {
              method: "POST",
              body: JSON.stringify({
                approve: false,
                comment: "  Resubmit raw  ",
                resubmissionDueAtUtc: new Date(
                  "2030-01-03T12:00",
                ).toISOString(),
              }),
            },
          ],
        ]);
        await act(async () => pending.resolve({}));
        await waitFor(() =>
          expect(keys(invalidations)).toEqual([
            "under-review-evaluations",
            "admin-dashboard",
          ]),
        );
      });
      it.each([true, false])(
        "keeps raw Error precedence and non-Error fallback, Error=%s",
        async (isError) => {
          apiMock.mockImplementation((p: string, o?: RequestInit) =>
            o?.method
              ? Promise.reject(isError ? Error("Raw IV rejection") : "failure")
              : Promise.resolve(read(p)),
          );
          const { copy } = setup(locale, "evaluations");
          fireEvent.click(
            (
              await screen.findAllByRole("button", {
                name: copy.evaluations.approve,
              })
            )[0],
          );
          expect(await screen.findByRole("alert")).toHaveTextContent(
            isError ? "Raw IV rejection" : copy.evaluations.verifyError,
          );
        },
      );
    });
    describe("CourseApprovals", () => {
      it("preserves exact query, server title/subject, counts, cover/subject/status copy and lazy preview", async () => {
        const { copy, client } = setup(locale, "course-approvals");
        await screen.findByRole("heading", {
          name: copy.courseApprovals.title,
        });
        expect(apiMock).toHaveBeenCalledWith("/admin/courses/approvals");
        expect(client.getQueryData(["approvals"])).toEqual(courseApprovals);
        const card = courseCard(locale),
          c = copy.courseApprovals;
        expect(
          card.getByText(
            new RegExp(locale === "ar" ? "مادة الخادم" : "Server subject"),
          ),
        ).toHaveTextContent(
          `2 ${c.modules} · 3 ${c.lessons} · 4 ${c.files} · ${c.coverUploaded}`,
        );
        expect(card.getByText(c.subjectPendingReview)).toBeVisible();
        expect(card.getByText(c.awaitingReview)).toBeVisible();
        expect(courseCard(locale, 1).getByText(c.approved)).toBeVisible();
        expect(
          apiMock.mock.calls.some(([p]) =>
            /^\/admin\/courses\/course-/.test(p),
          ),
        ).toBe(false);
      });
      it("requires opening that exact course before approving; toggling/swapping preserves the guard", async () => {
        const { copy, client } = setup(locale, "course-approvals"),
          c = copy.courseApprovals;
        await screen.findByRole("heading", { name: c.title });
        const first = courseCard(locale),
          third = courseCard(locale, 2);
        expect(
          first.getByRole("button", { name: c.approveAfterReview }),
        ).toBeDisabled();
        expect(
          third.getByRole("button", { name: c.approveAfterReview }),
        ).toBeDisabled();
        fireEvent.click(first.getByRole("button", { name: c.reviewContent }));
        await waitFor(() =>
          expect(
            client.getQueryData(["approval-course", "course-1"]),
          ).toBeDefined(),
        );
        expect(
          first.getByRole("button", { name: c.approveAfterReview }),
        ).toBeEnabled();
        expect(
          third.getByRole("button", { name: c.approveAfterReview }),
        ).toBeDisabled();
        fireEvent.click(first.getByRole("button", { name: c.hideContent }));
        expect(
          first.getByRole("button", { name: c.approveAfterReview }),
        ).toBeDisabled();
        fireEvent.click(third.getByRole("button", { name: c.reviewContent }));
        expect(
          third.getByRole("button", { name: c.approveAfterReview }),
        ).toBeEnabled();
        expect(
          first.getByRole("button", { name: c.approveAfterReview }),
        ).toBeDisabled();
      });
      it.each(["approve", "empty", "custom"] as const)(
        "keeps %s review payload and invalidations",
        async (mode) => {
          const { copy, invalidations } = setup(locale, "course-approvals"),
            c = copy.courseApprovals;
          await screen.findByRole("heading", { name: c.title });
          const card = courseCard(locale);
          if (mode !== "empty")
            fireEvent.change(card.getByPlaceholderText(c.reasonPlaceholder), {
              target: { value: "  Raw reason  " },
            });
          if (mode === "approve")
            fireEvent.click(
              card.getByRole("button", { name: c.reviewContent }),
            );
          fireEvent.click(
            card.getByRole("button", {
              name:
                mode === "approve" ? c.approveAfterReview : c.returnForRevision,
            }),
          );
          await waitFor(() =>
            expect(writes()).toEqual([
              [
                "/admin/courses/course-1/review",
                {
                  method: "POST",
                  body: JSON.stringify({
                    approved: mode === "approve",
                    reason:
                      mode === "approve"
                        ? null
                        : mode === "empty"
                          ? "Needs revision"
                          : "  Raw reason  ",
                  }),
                },
              ],
            ]),
          );
          await waitFor(() =>
            expect(keys(invalidations)).toEqual([
              "approvals",
              "admin-dashboard",
            ]),
          );
        },
      );
      it("disables reviewed-course approval while review is pending", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy } = setup(locale, "course-approvals"),
          c = copy.courseApprovals;
        await screen.findByRole("heading", { name: c.title });
        const card = courseCard(locale);
        fireEvent.click(card.getByRole("button", { name: c.reviewContent }));
        fireEvent.click(
          card.getByRole("button", { name: c.approveAfterReview }),
        );
        await waitFor(() =>
          expect(
            card.getByRole("button", { name: c.approveAfterReview }),
          ).toBeDisabled(),
        );
        await act(async () => pending.resolve({}));
      });
      it("publishes separately without a body, invalidates and closes the selected preview", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending.promise : Promise.resolve(read(p)),
        );
        const { copy, invalidations } = setup(locale, "course-approvals"),
          c = copy.courseApprovals;
        await screen.findByRole("heading", { name: c.title });
        const card = courseCard(locale, 1);
        expect(
          card.queryByRole("button", { name: c.returnForRevision }),
        ).not.toBeInTheDocument();
        fireEvent.click(card.getByRole("button", { name: c.reviewContent }));
        await waitFor(() =>
          expect(
            card.getByText(copy.courseApprovalPreview.learningOutcomes),
          ).toBeVisible(),
        );
        const publish = card.getByRole("button", { name: c.publish });
        fireEvent.click(publish);
        await waitFor(() => expect(publish).toBeDisabled());
        expect(writes()).toEqual([
          ["/admin/courses/course-2/publish", { method: "POST" }],
        ]);
        await act(async () => pending.resolve({}));
        await waitFor(() =>
          expect(keys(invalidations)).toEqual(["approvals", "admin-dashboard"]),
        );
        expect(
          card.queryByText(copy.courseApprovalPreview.learningOutcomes),
        ).not.toBeInTheDocument();
      });
      it.each(["review", "publish"] as const)(
        "keeps raw %s Error and localized non-Error fallback",
        async (action) => {
          let failure: unknown = Error("Raw course rejection");
          apiMock.mockImplementation((p: string, o?: RequestInit) =>
            o?.method ? Promise.reject(failure) : Promise.resolve(read(p)),
          );
          const { copy } = setup(locale, "course-approvals"),
            c = copy.courseApprovals;
          await screen.findByRole("heading", { name: c.title });
          const card = courseCard(locale, action === "review" ? 0 : 1),
            button = card.getByRole("button", {
              name: action === "review" ? c.returnForRevision : c.publish,
            });
          fireEvent.click(button);
          expect(await card.findByRole("alert")).toHaveTextContent(
            "Raw course rejection",
          );
          failure = "unstructured";
          fireEvent.click(button);
          await waitFor(() =>
            expect(card.getByRole("alert")).toHaveTextContent(c.requestError),
          );
        },
      );
      it("preserves review error precedence over a simultaneous publish failure", async () => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(
                Error(p.endsWith("review") ? "Review first" : "Publish second"),
              )
            : Promise.resolve(read(p)),
        );
        const { copy } = setup(locale, "course-approvals"),
          c = copy.courseApprovals;
        await screen.findByRole("heading", { name: c.title });
        fireEvent.click(
          courseCard(locale).getByRole("button", { name: c.returnForRevision }),
        );
        await courseCard(locale).findByRole("alert");
        fireEvent.click(
          courseCard(locale, 1).getByRole("button", { name: c.publish }),
        );
        await waitFor(() => expect(writes()).toHaveLength(2));
        await waitFor(() =>
          expect(courseCard(locale, 1).getByRole("alert")).toHaveTextContent(
            "Review first",
          ),
        );
      });
      it("localizes access denied and preserves the existing error presentation", async () => {
        apiMock.mockRejectedValue(Error("denied"));
        const { copy } = setup(locale, "course-approvals");
        expect(
          await screen.findByText(copy.courseApprovals.accessDenied),
        ).toBeVisible();
      });
      it("renders loading then the empty approvals state", async () => {
        const pending = deferred();
        apiMock.mockReturnValue(pending.promise);
        const { copy, container } = setup(locale, "course-approvals");
        expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent(
          copy.shared.loadingIndicator,
        );
        await act(async () => pending.resolve([]));
        expect(
          await screen.findByText(copy.courseApprovals.empty),
        ).toBeVisible();
      });
    });
    describe("CourseApprovalPreview", () => {
      async function open(index = 0) {
        const result = setup(locale, "course-approvals"),
          c = result.copy.courseApprovals;
        await screen.findByRole("heading", { name: c.title });
        fireEvent.click(
          courseCard(locale, index).getByRole("button", {
            name: c.reviewContent,
          }),
        );
        return { ...result, card: courseCard(locale, index) };
      }
      it("selects all bilingual server fields, keeps both outcomes and exact resource/cover URLs", async () => {
        const { copy, t, client, card } = await open(),
          detail = courseDetail(),
          c = copy.courseApprovalPreview;
        await card.findByText(c.learningOutcomes);
        expect(apiMock).toHaveBeenCalledWith("/admin/courses/course-1");
        expect(client.getQueryData(["approval-course", "course-1"])).toEqual(
          detail,
        );
        const fields =
          locale === "ar"
            ? [
                detail.arabicDescription,
                detail.modules[0].arabicTitle,
                detail.modules[0].lessons[0].arabicTitle,
                detail.modules[0].lessons[0].arabicBody!,
                detail.assignments[0].arabicTitle,
                detail.assignments[0].arabicInstructions,
                detail.assignments[0].criteria[0].arabicDescription,
              ]
            : [
                detail.englishDescription,
                detail.modules[0].englishTitle,
                detail.modules[0].lessons[0].englishTitle,
                detail.modules[0].lessons[0].englishBody!,
                detail.assignments[0].englishTitle,
                detail.assignments[0].englishInstructions,
                detail.assignments[0].criteria[0].englishDescription,
              ];
        const criterionDescription = fields.pop()!;
        for (const field of fields) expect(card.getByText(field)).toBeVisible();
        expect(card.getByText("A.P1").closest("li")).toHaveTextContent(
          criterionDescription,
        );
        expect(card.getByText(detail.outcomes[0].arabicText)).toBeVisible();
        expect(card.getByText(detail.outcomes[0].englishText)).toBeVisible();
        const image = card.getByRole("img", {
          name: t("courseApprovalPreview.coverAlt", {
            title: locale === "ar" ? detail.arabicTitle : detail.englishTitle,
          }),
        });
        expect(image).toHaveAttribute(
          "src",
          "/api/v1/admin/courses/course-1/cover",
        );
        expect(card.getByRole("link", { name: "raw-ملف.pdf" })).toHaveAttribute(
          "href",
          "/api/v1/admin/courses/resources/resource-1",
        );
        expect(card.getByText(`Video · 2 ${c.minutes}`)).toBeVisible();
        expect(card.getByText(c.emptyResources)).toBeVisible();
      });
      it.each([0, 1])(
        "keeps free/paid JOD presentation for course %s",
        async (index) => {
          const { card, copy } = await open(index);
          await card.findByText(copy.courseApprovalPreview.learningOutcomes);
          if (index === 1) {
            expect(
              card.getByText(copy.courseApprovalPreview.free),
            ).toBeVisible();
            expect(
              card.getByText(copy.courseApprovalPreview.noCover),
            ).toBeVisible();
          } else
            expect(
              card.getByText(
                (_, el) =>
                  el?.tagName === "STRONG" &&
                  el.textContent ===
                    formatLocalizedCurrency(19.5, "JOD", locale),
              ),
            ).toBeVisible();
        },
      );
      it("preserves actual attempts, rounded MB, uppercase extensions, resubmission and raw criterion bands", async () => {
        const { copy, card } = await open(),
          c = copy.courseApprovalPreview;
        await card.findByText(c.learningOutcomes);
        expect(
          card.getByText(
            `${c.submissionSettings}3 ${c.attempts} · 25MB · .PDF, .DOCX${c.resubmissionAllowed}`,
          ),
        ).toBeVisible();
        expect(
          card.getByText(
            `${c.submissionSettings}1 ${c.attempts} · 10MB · .TXT${c.noResubmission}`,
          ),
        ).toBeVisible();
        expect(card.getByText(c.published)).toBeVisible();
        expect(card.getByText(c.draft)).toBeVisible();
        expect(card.getByText("A.P1").closest("li")).toHaveTextContent(
          "A.P1 · Pass —",
        );
        expect(writes()).toEqual([]);
      });
      it("renders empty coursework without changing the assignments condition", async () => {
        apiMock.mockImplementation((p: string) =>
          Promise.resolve(
            p === "/admin/courses/course-1"
              ? { ...courseDetail(), assignments: [] }
              : read(p),
          ),
        );
        const { copy, card } = await open();
        expect(
          await card.findByText(copy.courseApprovalPreview.emptyCoursework),
        ).toBeVisible();
      });
      it("keeps preview loading and localized error states", async () => {
        const pending = deferred();
        apiMock.mockImplementation((p: string) =>
          p === "/admin/courses/course-1"
            ? pending.promise
            : Promise.resolve(read(p)),
        );
        const { copy, card } = await open();
        expect(card.getByText(copy.shared.loadingIndicator)).toBeVisible();
        await act(async () => pending.resolve(null));
        expect(
          await card.findByText(copy.courseApprovalPreview.loadError),
        ).toBeVisible();
      });
      it("keeps preview query failure separate from approval-list failure", async () => {
        apiMock.mockImplementation((p: string) =>
          p === "/admin/courses/course-1"
            ? Promise.reject(Error("Preview error"))
            : Promise.resolve(read(p)),
        );
        const { copy, card } = await open();
        expect(
          await card.findByText(copy.courseApprovalPreview.loadError),
        ).toBeVisible();
        expect(
          screen.queryByText(copy.courseApprovals.accessDenied),
        ).not.toBeInTheDocument();
      });
    });
  },
);
