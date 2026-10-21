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
import { StudentLearningAimPractice } from "@/features/learning/learning-aim-practice";
import { StudentComprehensivePractice } from "@/features/learning/comprehensive-practice";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  practiceUnit,
  practiceSubmission,
} from "./helpers/learning-practice-fixtures";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

const kinds = [
  ["aim", StudentLearningAimPractice],
  ["comprehensive", StudentComprehensivePractice],
] as const;
function data(status = "Available") {
  const unit = structuredClone(practiceUnit);
  Object.assign(unit.aims[0], {
    practiceStatus: status,
    trainingOutcome: undefined,
    bestTrainingOutcome: undefined,
    attemptHistory: [],
  });
  Object.assign(unit.finalPractice, { status, trainingOutcome: undefined });
  return [unit];
}
function mount(
  Component: (props: { courseId: string }) => React.JSX.Element | null,
  locale: "en" | "ar",
) {
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
      <QueryClientProvider client={client}>
        <Component courseId="raw-course" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
const writes = () =>
  apiMock.mock.calls.filter(([, init]) => init?.method === "POST");

describe.each(["en", "ar"] as const)(
  "%s formative practice stages",
  (locale) => {
    const copy = locale === "ar" ? ar : en;
    describe.each(kinds)("%s", (kind, Component) => {
      it.each(["Available", "Draft", "Submitted", "Finalized"])(
        "keeps %s distinct from content completion and official assessment",
        async (status) => {
          const units = data(status);
          units[0].aims[0].isComplete = false;
          units[0].finalPractice.isTrainingComplete = false;
          apiMock.mockImplementation((path) =>
            Promise.resolve(path === "/student/assignments/mine" ? [] : units),
          );
          mount(Component, locale);
          const stages = await screen.findByRole("list", {
            name: copy.studentPracticeWorkspace.stages,
          });
          expect(within(stages).getAllByRole("listitem")).toHaveLength(3);
          expect(stages).toHaveTextContent(
            copy.studentPracticeWorkspace.teacherReview,
          );
          expect(stages).toHaveTextContent(
            copy.studentPracticeWorkspace[
              status === "Finalized"
                ? "reviewReceived"
                : status === "Submitted"
                  ? "reviewPending"
                  : "notReviewed"
            ],
          );
          expect(
            screen.getByText(copy.learningPractice[kind].formativeDisclaimer),
          ).toBeVisible();
          if (["Submitted", "Finalized"].includes(status))
            expect(screen.queryByRole("button")).toBeNull();
          expect(
            screen.queryByText(
              copy.learningPractice.comprehensive.trainingComplete,
            ),
          ).toBeNull();
          expect(screen.queryByRole("progressbar")).toBeNull();
          expect(
            screen.queryByRole("link", {
              name: /ASSESS|Resit|Retake|Evaluation/,
            }),
          ).toBeNull();
          expect(writes()).toHaveLength(0);
        },
      );

      it("respects server availability despite completed content and remaining attempts", async () => {
        const units = data("Locked");
        units[0].aims[0].practiceAvailable = false;
        units[0].finalPractice.isAvailable = false;
        apiMock.mockImplementation((path) =>
          Promise.resolve(path === "/student/assignments/mine" ? [] : units),
        );
        mount(Component, locale);
        await screen.findByRole("list", {
          name: copy.studentPracticeWorkspace.stages,
        });
        expect(screen.queryByRole("button")).toBeNull();
        expect(writes()).toHaveLength(0);
      });

      it("does not turn an unknown server status into a completed or unreviewed stage", async () => {
        const units = data("RAW-UNKNOWN-STATUS");
        units[0].aims[0].practiceAvailable = false;
        units[0].finalPractice.isAvailable = false;
        apiMock.mockImplementation((path) =>
          Promise.resolve(path === "/student/assignments/mine" ? [] : units),
        );
        mount(Component, locale);
        const stages = await screen.findByRole("list", {
          name: copy.studentPracticeWorkspace.stages,
        });
        expect(stages).toHaveTextContent(
          copy.learningPractice.common.status.unknown,
        );
        expect(stages).not.toHaveTextContent(
          copy.studentPracticeWorkspace.notReviewed,
        );
        expect(stages).not.toHaveTextContent(
          copy.studentPracticeWorkspace.reviewReceived,
        );
        expect(screen.queryByRole("button")).toBeNull();
      });

      it.each(["pending", "error"])(
        "does not interpret mine %s without data as an absent submission",
        async (state) => {
          apiMock.mockImplementation((path) =>
            path === "/student/assignments/mine"
              ? state === "pending"
                ? new Promise(() => {})
                : Promise.reject(new Error("synthetic cold error"))
              : Promise.resolve(data()),
          );
          mount(Component, locale);
          expect(
            await screen.findByText(
              copy.learningPractice[kind][
                state === "pending" ? "loading" : "loadFailed"
              ],
            ),
          ).toBeVisible();
          expect(screen.queryByRole("button")).toBeNull();
          expect(
            screen.queryByRole("list", {
              name: copy.studentPracticeWorkspace.stages,
            }),
          ).toBeNull();
          expect(writes()).toHaveLength(0);
        },
      );

      it.each(["units", "mine"])(
        "preserves cached rows and Draft files/comment when %s refresh fails",
        async (failed) => {
          let fail = false;
          apiMock.mockImplementation((path, init) => {
            if (init?.method === "POST")
              return Promise.resolve({
                submissionId: "raw-submission-17",
                versionNumber: 2,
              });
            const isMine = path === "/student/assignments/mine";
            if (fail && (failed === "mine") === isMine)
              return Promise.reject(new Error("synthetic refresh error"));
            return Promise.resolve(
              isMine ? [practiceSubmission] : data("Draft"),
            );
          });
          const client = mount(Component, locale);
          fireEvent.click(
            await screen.findByRole("button", {
              name: copy.learningPractice.common.continueDraft,
            }),
          );
          const note = await screen.findByRole("textbox", {
            name: copy.learningPractice.common.teacherNote,
          });
          fireEvent.change(note, { target: { value: "UNSAVED مسودة" } });
          const input = screen.getByLabelText(
            copy.forms.filePicker.chooseInput.replace(
              "{label}",
              copy.learningPractice.common.workFiles,
            ),
          );
          const file = new File(["synthetic"], "draft.pdf", {
            type: "application/pdf",
          });
          fireEvent.change(input, { target: { files: [file] } });
          fail = true;
          await client.invalidateQueries({
            queryKey:
              failed === "mine"
                ? ["student-course-assignment-submissions"]
                : ["learning-aim-practice", "raw-course"],
          });
          expect(await screen.findByRole("alert")).toHaveTextContent(
            copy.learningPractice[kind].loadFailed,
          );
          expect(note).toBe(
            screen.getByRole("textbox", {
              name: copy.learningPractice.common.teacherNote,
            }),
          );
          expect(note).toHaveValue("UNSAVED مسودة");
          expect(screen.getByText("draft.pdf")).toBeVisible();
          expect(
            screen.getByRole("button", {
              name: copy.learningPractice.common.uploadFiles,
            }),
          ).toBeEnabled();
          expect(
            screen.getByRole("button", {
              name: copy.learningPractice.common.submitToTeacher,
            }),
          ).toBeEnabled();
          expect(writes()).toHaveLength(1);
        },
      );

      it("keeps pending upload disabled and displays the raw scan/rejection error without treating it as submitted", async () => {
        let rejectUpload: (error: Error) => void = () => {};
        const deferred = new Promise((_, reject) => {
          rejectUpload = reject;
        });
        apiMock.mockImplementation((path, init) => {
          if (init?.method === "POST")
            return path.endsWith("/files")
              ? deferred
              : Promise.resolve({
                  submissionId: "raw-submission-17",
                  versionNumber: 2,
                });
          return Promise.resolve(
            path === "/student/assignments/mine" ? [] : data("Draft"),
          );
        });
        mount(Component, locale);
        fireEvent.click(
          await screen.findByRole("button", {
            name:
              kind === "aim"
                ? copy.learningPractice.aim.startPractice
                : copy.learningPractice.comprehensive.openPractice,
          }),
        );
        await screen.findByRole("textbox");
        const file = new File(["synthetic"], "pending.pdf", {
          type: "application/pdf",
        });
        fireEvent.change(
          screen.getByLabelText(
            copy.forms.filePicker.chooseInput.replace(
              "{label}",
              copy.learningPractice.common.workFiles,
            ),
          ),
          { target: { files: [file] } },
        );
        const upload = screen.getByRole("button", {
          name: copy.learningPractice.common.uploadFiles,
        });
        fireEvent.click(upload);
        await waitFor(() => expect(upload).toBeDisabled());
        fireEvent.click(upload);
        expect(
          screen.getByRole("button", {
            name: copy.learningPractice.common.submitToTeacher,
          }),
        ).toBeDisabled();
        expect(
          writes().filter(([path]) => path.endsWith("/files")),
        ).toHaveLength(1);
        rejectUpload(new Error("RAW file rejected: scanning not complete"));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "RAW file rejected: scanning not complete",
        );
        expect(screen.getByText("pending.pdf")).toBeVisible();
        expect(
          screen.getByRole("button", {
            name: copy.learningPractice.common.submitToTeacher,
          }),
        ).toBeDisabled();
        expect(writes().some(([path]) => path.endsWith("/submit"))).toBe(false);
      });
    });
  },
);
