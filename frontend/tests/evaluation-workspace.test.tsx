import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentArea } from "@/features/student/student-area";
import { EvaluationCurrentState } from "@/features/student/student-evaluation-presentation";
import { EvaluationAppeals } from "@/features/student/evaluation-appeals";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  evaluationPage,
  evaluationRow,
  evaluationDraft,
} from "./fixtures/evaluation-workspace";
const apiMock = vi.hoisted(() => vi.fn());
const navigationState = vi.hoisted(() => ({ resumeId: "" }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(
      navigationState.resumeId ? `resume=${navigationState.resumeId}` : "",
    ),
}));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  navigationState.resumeId = "";
});
function mount(node: React.ReactNode, locale: "en" | "ar") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? ar : en}
    >
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
for (const locale of ["en", "ar"] as const) {
  const copy = locale === "ar" ? ar : en;
  describe(`${locale} branch-aware evaluation presentation`, () => {
    it("retains restored evidence edits and local files when only the saved Draft refresh fails", async () => {
      navigationState.resumeId = "standard-draft";
      let fail = false;
      apiMock.mockImplementation((path) =>
        path === "/evaluations/standard-draft"
          ? fail
            ? Promise.reject(new Error("synthetic draft refresh failure"))
            : Promise.resolve(evaluationDraft())
          : Promise.resolve({ available: false }),
      );
      const client = mount(
        <StudentArea segment={["evaluations", "new"]} />,
        locale,
      );
      const evidence = await screen.findByRole("textbox", {
        name: "A.P1",
      });
      fireEvent.change(evidence, {
        target: { value: "UNSAVED evidence مسودة" },
      });
      const input = screen.getByLabelText(
        copy.forms.filePicker.chooseInput.replace(
          "{label}",
          copy.studentWorkspace.evaluationWizard.files.label,
        ),
      );
      fireEvent.change(input, {
        target: {
          files: [
            new File(["synthetic"], "unsaved.pdf", { type: "application/pdf" }),
          ],
        },
      });
      fail = true;
      await client.invalidateQueries({
        queryKey: ["evaluation-detail", "standard-draft"],
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.studentWorkspace.evaluationWizard.resume.loadError,
      );
      expect(evidence).toBe(screen.getByRole("textbox", { name: "A.P1" }));
      expect(evidence).toHaveValue("UNSAVED evidence مسودة");
      expect(screen.getByText("unsaved.pdf")).toBeVisible();
      expect(
        apiMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0);
    });
    it.each([
      "Draft",
      "PendingPayment",
      "Paid",
      "PendingAssignment",
      "Assigned",
      "UnderReview",
      "NeedsRevision",
      "Completed",
      "Closed",
      "PaymentFailed",
      "Cancelled",
      "Refunded",
      "RAW-UNKNOWN",
      "__proto__",
      "toString",
    ])(
      "shows only the actual current %s stage without a grade or fabricated history",
      (status) => {
        mount(
          <EvaluationCurrentState
            status={status}
            branch="standard"
            fundingUnknown
          >
            <span>{status}</span>
          </EvaluationCurrentState>,
          locale,
        );
        const region = screen.getByRole("region", {
          name: copy.studentEvaluationPresentation.lifecycle,
        });
        expect(within(region).getAllByRole("listitem")).toHaveLength(1);
        expect(within(region).getByText(status)).toBeVisible();
        expect(region).toHaveTextContent(
          copy.studentEvaluationPresentation.statusNotGrade,
        );
        expect(region).toHaveTextContent(
          copy.studentEvaluationPresentation.fundingUnknown,
        );
        if (["RAW-UNKNOWN", "__proto__", "toString"].includes(status))
          expect(region).toHaveTextContent(
            copy.studentEvaluationPresentation.states.unknown,
          );
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
        expect(
          screen.queryByText(/Merit|Distinction|NotYetAchieved/),
        ).toBeNull();
      },
    );
    it("keeps branch routes, zero-price funding uncertainty, supplied outcomes and feedback order", async () => {
      const rows = [
        evaluationRow("ordinary-result", "Completed"),
        evaluationRow("revision", "NeedsRevision"),
        evaluationRow("standard/id space", "Draft"),
        evaluationRow("resit-draft", "Draft", "resit"),
        evaluationRow("retake", "Completed", "retake"),
      ];
      apiMock.mockImplementation((path) =>
        Promise.resolve(
          path.startsWith("/evaluations/mine")
            ? evaluationPage(rows)
            : { items: [], page: 1, pageSize: 10, hasNextPage: false },
        ),
      );
      mount(<StudentArea segment={["evaluations"]} />, locale);
      const cards = await screen.findAllByRole("article");
      expect(cards).toHaveLength(5);
      for (const grade of within(cards[0]).getAllByText("NotYetAchieved"))
        expect(grade).toBeVisible();
      expect(within(cards[0]).queryByRole("link")).toBeNull();
      expect(
        screen.getByRole("link", {
          name: copy.studentWorkspace.myEvaluations.actions.continueStandard,
        }),
      ).toHaveAttribute(
        "href",
        `/${locale}/student/evaluations/new?resume=standard%2Fid%20space`,
      );
      expect(
        screen.getByRole("link", {
          name: copy.studentWorkspace.myEvaluations.resit.continue,
        }),
      ).toHaveAttribute("href", `/${locale}/student/evaluations/resit-draft`);
      expect(
        screen.getAllByText(copy.studentEvaluationPresentation.fundingUnknown),
      ).toHaveLength(5);
      expect(
        within(cards[4]).getByText(
          copy.studentEvaluationPresentation.historicalRetake,
        ),
      ).toBeVisible();
      const notes = cards[1].querySelectorAll("time");
      expect([...notes].map((n) => n.getAttribute("datetime"))).toEqual([
        "2026-10-01T12:00:00Z",
        "2026-10-02T12:00:00Z",
      ]);
      expect(
        within(cards[1]).getByText(
          copy.studentEvaluationPresentation.sameRequestRevision,
        ),
      ).toBeVisible();
      expect(
        apiMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0);
    });
    it("retains cached rows and unsaved revision files when refresh fails, then resubmits the same request in original order only once", async () => {
      let fail = false,
        release: () => void = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const order: string[] = [];
      apiMock.mockImplementation((path, init) => {
        if (init?.method === "POST") {
          order.push(path);
          return path.endsWith("/resubmit") ? pending : Promise.resolve();
        }
        if (path.startsWith("/evaluations/mine"))
          return fail
            ? Promise.reject(new Error("synthetic refresh failure"))
            : Promise.resolve(
                evaluationPage([
                  evaluationRow("same-request", "NeedsRevision"),
                ]),
              );
        return Promise.resolve({
          items: [],
          page: 1,
          pageSize: 10,
          hasNextPage: false,
        });
      });
      const client = mount(<StudentArea segment={["evaluations"]} />, locale);
      const card = (await screen.findAllByRole("article"))[0];
      const input = card.querySelector('input[type="file"]')!;
      fireEvent.change(input, {
        target: {
          files: [
            new File(["evidence"], "revision.pdf", { type: "application/pdf" }),
          ],
        },
      });
      fireEvent.click(within(card).getByRole("checkbox"));
      fail = true;
      await client.invalidateQueries({ queryKey: ["evaluations", "mine"] });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.studentWorkspace.myEvaluations.errors.load,
      );
      expect(screen.getByText("revision.pdf")).toBeVisible();
      expect(within(card).getByRole("checkbox")).toBeChecked();
      const submit = within(card).getByRole("button", {
        name: copy.studentWorkspace.evaluationRevision.actions.submit,
      });
      fail = false;
      fireEvent.click(submit);
      await waitFor(() => expect(submit).toBeDisabled());
      fireEvent.click(submit);
      expect(order).toEqual([
        "/evaluations/same-request/files",
        "/evaluations/same-request/authenticity-declaration",
        "/evaluations/same-request/resubmit",
      ]);
      release();
      await waitFor(() => expect(submit).toBeEnabled());
    }, 15000);
    it("keeps the appeal selector tied to completed results and preserves trimmed payload, pending prevention and raw failure", async () => {
      let reject: (e: Error) => void = () => {};
      const pending = new Promise((_, r) => {
        reject = r;
      });
      apiMock.mockImplementation((path, init) => {
        if (init?.method === "POST") return pending;
        return Promise.resolve(
          path.startsWith("/evaluations/mine")
            ? evaluationPage([
                evaluationRow("released", "Completed"),
                evaluationRow("in-review", "UnderReview"),
              ])
            : [],
        );
      });
      mount(<EvaluationAppeals />, locale);
      await screen.findByRole("option", { name: /released/ });
      expect(screen.queryByRole("option", { name: /in-review/ })).toBeNull();
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "released" },
      });
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "  RAW appeal reason more than ten  " },
      });
      const submit = screen.getByRole("button", {
        name: copy.studentWorkspace.evaluationAppeals.form.submit,
      });
      fireEvent.click(submit);
      await waitFor(() => expect(submit).toBeDisabled());
      fireEvent.click(submit);
      expect(
        apiMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toEqual([
        [
          "/evaluation-appeals",
          {
            method: "POST",
            body: JSON.stringify({
              evaluationRequestId: "released",
              reason: "RAW appeal reason more than ten",
            }),
          },
        ],
      ]);
      reject(new Error("RAW appeal failure"));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "RAW appeal failure",
      );
      expect(screen.getByRole("textbox")).toHaveValue(
        "  RAW appeal reason more than ten  ",
      );
    });
  });
}
