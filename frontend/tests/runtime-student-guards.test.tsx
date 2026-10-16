import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { CourseAssignmentPanel } from "@/features/student/student-area";
import { StudentResitDetail } from "@/features/student/student-resit-workflow";

const apiMock = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => new Map<string, () => Promise<unknown>>());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    // Observe real mutation handles, preserving the real hooks, state, callbacks,
    // error propagation and production JSX. Only invocation bypasses UI controls.
    useMutation: (...args: Parameters<typeof actual.useMutation>) => {
      const result = actual.useMutation(...args);
      const source = args[0].mutationFn?.toString() ?? "";
      for (const [name, marker] of [
        ["upload", "coursework.errors.startBeforeUpload"],
        ["submit", "coursework.errors.startBeforeSubmit"],
        ["confirm", "No development test payment is available."],
        ["checkout", "expectIncludedCredit"],
      ])
        if (source.includes(marker))
          captured.set(name, () => result.mutateAsync(undefined));
      return result;
    },
  };
});

function renderPage(node: React.ReactNode, locale: "en" | "ar") {
  const messages = locale === "ar" ? ar : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

async function invoke(name: string) {
  const callback = captured.get(name);
  if (!callback) throw new Error(`Actual mutation not captured: ${name}`);
  return callback();
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  captured.clear();
});

describe.each(["en", "ar"] as const)(
  "actual guard-to-alert contracts in %s",
  (locale) => {
    const messages = locale === "ar" ? ar : en;
    const coursework = messages.studentWorkspace.coursework;
    const payment = messages.studentWorkspace.resitWorkflow.detail.payment;

    it.each(["upload", "submit"] as const)(
      "%s rejects with no active submission and the same localized error reaches the real alert",
      async (kind) => {
        apiMock.mockImplementation((path: string) => {
          if (path === "/student/courses/course-1/assignments")
            return Promise.resolve([
              {
                id: "assignment-1",
                lessonId: "lesson-1",
                arabicTitle: "عنوان من الخادم",
                englishTitle: "Server title",
                arabicInstructions: "تعليمات الخادم",
                englishInstructions: "Server instructions",
                availableFromUtc: "2020-01-01T00:00:00Z",
                effectiveDueAtUtc: "2099-01-01T00:00:00Z",
                hasDeadlineExtension: false,
                maxSubmissionAttempts: 2,
                allowResubmission: true,
                maxFileSizeBytes: 5242880,
                allowedFileExtensions: [".pdf"],
                resources: [],
                criteria: [],
              },
            ]);
          if (path === "/student/assignments/mine") return Promise.resolve([]);
          if (path === "/student/assignments/assignment-1/submissions")
            return Promise.resolve({ submissionId: "submission-1" });
          throw new Error(`Unexpected request: ${path}`);
        });
        renderPage(
          <CourseAssignmentPanel courseId="course-1" lessonId="lesson-1" />,
          locale,
        );
        const start = await screen.findByRole("button", {
          name: coursework.actions.startSubmission,
        });
        expect(
          screen.queryByRole("button", { name: coursework.submission.submit }),
        ).not.toBeInTheDocument();
        const requestCount = apiMock.mock.calls.length;
        const expected =
          kind === "upload"
            ? coursework.errors.startBeforeUpload
            : coursework.errors.startBeforeSubmit;
        await act(async () => {
          await expect(invoke(kind)).rejects.toThrow(expected);
        });
        expect(apiMock).toHaveBeenCalledTimes(requestCount);
        expect(
          apiMock.mock.calls.some(([path]) => /\/files$|\/submit$/.test(path)),
        ).toBe(false);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        // The no-active UI hides this alert along with the controls. Opening the
        // existing panel exposes the retained real mutation error, with no injection.
        await userEvent.setup().click(start);
        expect(await screen.findByRole("alert")).toHaveTextContent(expected);
        expect(
          apiMock.mock.calls.some(([path]) => /\/files$|\/submit$/.test(path)),
        ).toBe(false);
        if (locale === "ar")
          expect(screen.getByRole("alert")).not.toHaveTextContent(
            "Start the submission before",
          );
      },
    );

    it.each(["absent", "PayTabs"] as const)(
      "%s session rejects without fake-confirm; the eligible presentation branch uses the existing translated fallback",
      async (initial) => {
        let status = "Draft";
        let provider = initial === "absent" ? "FakeCard" : initial;
        apiMock.mockImplementation((path: string) => {
          if (path === "/evaluations/evaluation-1")
            return Promise.resolve({
              id: "evaluation-1",
              status,
              price: 5,
              currency: "JOD",
              isResit: true,
              resitOfEvaluationRequestId: "original-1",
              academic: null,
              criteria: [],
              files: [
                {
                  id: "file-1",
                  originalFileName: "fresh.pdf",
                  scanStatus: "Clean",
                  createdAtUtc: "2026-01-01T00:00:00Z",
                },
              ],
              evidence: [],
              hasAuthenticityDeclaration: true,
              calculatedGrade: null,
              sectionResults: [],
              results: [],
              feedback: [],
            });
          if (path === "/evaluations/evaluation-1/checkout") {
            status = "PendingPayment";
            return Promise.resolve({
              includedCreditApplied: false,
              paymentId: "payment-1",
              provider,
              redirectUrl: null,
              total: 5,
              currency: "JOD",
            });
          }
          throw new Error(`Unexpected request: ${path}`);
        });
        renderPage(<StudentResitDetail evaluationId="evaluation-1" />, locale);
        const checkout = await screen.findByRole("button", {
          name: payment.continue,
        });
        if (initial === "PayTabs") {
          await userEvent.setup().click(checkout);
          expect(await screen.findByText(payment.pendingHelp)).toBeVisible();
        }
        expect(
          screen.queryByRole("button", { name: payment.completeTest }),
        ).not.toBeInTheDocument();
        const requestCount = apiMock.mock.calls.length;
        await act(async () => {
          await expect(invoke("confirm")).rejects.toThrow(
            "No development test payment is available.",
          );
        });
        expect(apiMock).toHaveBeenCalledTimes(requestCount);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        provider = "FakeCard";
        // Run the real checkout callback to enter the existing Fake presentation
        // branch. This exposes the retained technical error through unchanged JSX.
        await act(async () => {
          await invoke("checkout");
        });
        await waitFor(() =>
          expect(screen.getByRole("alert")).toHaveTextContent(
            payment.confirmTestError,
          ),
        );
        expect(
          screen.queryByText("No development test payment is available."),
        ).not.toBeInTheDocument();
        expect(
          apiMock.mock.calls.some(
            ([path]) => path === "/payments/fake/confirm",
          ),
        ).toBe(false);
      },
    );
  },
);
