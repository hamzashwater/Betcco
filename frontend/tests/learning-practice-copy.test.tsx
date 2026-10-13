import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { StudentComprehensivePractice } from "@/features/learning/comprehensive-practice";
import { StudentLearningAimPractice } from "@/features/learning/learning-aim-practice";
import {
  practiceSubmission,
  practiceUnit,
} from "./helpers/learning-practice-fixtures";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiError: class extends Error {},
}));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});
function provider(element: React.ReactNode, locale: "ar" | "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return {
    ...render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </NextIntlClientProvider>,
    ),
    invalidate,
  };
}

for (const [kind, Component] of [
  ["comprehensive", StudentComprehensivePractice],
  ["aim", StudentLearningAimPractice],
] as const) {
  describe(`${kind} real catalogue presentation`, () => {
    it.each(["ar", "en"] as const)(
      "preserves raw server titles, feedback, filenames, links, unknown status/outcomes and formative copy (%s)",
      async (locale) => {
        const value = structuredClone(practiceUnit);
        value.finalPractice.status = "RAW FutureStatus";
        value.aims[0].practiceStatus = "RAW FutureStatus";
        value.aims[0].trainingOutcome = "RAW FutureOutcome";
        apiMock.mockImplementation((path: string) =>
          Promise.resolve(
            path === "/student/assignments/mine"
              ? [practiceSubmission]
              : [value],
          ),
        );
        provider(<Component courseId="raw-course" />, locale);
        const messages = (locale === "ar" ? ar : en).learningPractice;
        expect(
          await screen.findByRole("region", { name: messages[kind].title }),
        ).toBeVisible();
        expect(
          screen.getByText(messages[kind].formativeDisclaimer),
        ).toBeVisible();
        expect(screen.getByText("RAW Strengths نقاط")).toBeVisible();
        expect(screen.getByText("RAW Gaps فجوات")).toBeVisible();
        expect(screen.getByText("RAW Guidance إرشاد")).toBeVisible();
        expect(
          screen.getByText(
            locale === "ar" ? "تعليمات خادم خام" : "RAW Server Instructions",
          ),
        ).toBeVisible();
        const link = screen.getByRole("link", { name: "RAW Current ملف.pdf" });
        expect(link).toHaveAttribute(
          "href",
          "/api/v1/assignments/submissions/raw-submission-17/files/raw-file-17",
        );
        if (kind === "aim") {
          expect(screen.getByText(/RAW FutureStatus/u)).toBeVisible();
          expect(screen.getByText(/RAW FutureOutcome/u)).toBeVisible();
          expect(
            within(
              screen.getByLabelText(messages.common.workFiles),
            ).queryByRole("link", { name: "RAW Earlier ملف.pdf" }),
          ).toBeNull();
        } else {
          expect(
            screen.getByText(messages.common.status.unknown),
          ).toBeVisible();
          expect(
            screen.getByRole("link", { name: "RAW Brief ملف.pdf" }),
          ).toHaveAttribute(
            "href",
            "/api/v1/assignments/raw-assignment-17/resources/raw-resource-17",
          );
          expect(screen.getByText("RAW-A.P1")).toBeVisible();
        }
      },
    );
    it.each(["ar", "en"] as const)(
      "keeps loading, error and empty distinct (%s)",
      async (locale) => {
        const messages = (locale === "ar" ? ar : en).learningPractice[kind];
        apiMock.mockImplementation(() => new Promise(() => {}));
        provider(<Component courseId="raw-course" />, locale);
        expect(screen.getByText(messages.loading)).toBeVisible();
        expect(screen.queryByText(messages.loadFailed)).toBeNull();
        cleanup();
        apiMock.mockRejectedValue(new Error("RAW query failure"));
        provider(<Component courseId="raw-course" />, locale);
        expect(await screen.findByText(messages.loadFailed)).toBeVisible();
        expect(screen.queryByText(messages.loading)).toBeNull();
        cleanup();
        apiMock.mockResolvedValue([]);
        const empty = provider(<Component courseId="raw-course" />, locale);
        await waitFor(() => expect(empty.container).toBeEmptyDOMElement());
      },
    );
    it.each(["ar", "en"] as const)(
      "retains start/note payload, sequential upload, final-submit guards, invalidation and raw error precedence (%s)",
      async (locale) => {
        const messages = (locale === "ar" ? ar : en).learningPractice;
        let started = false,
          submitted = false;
        const uploads: File[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstUpload = new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        apiMock.mockImplementation(
          async (path: string, options?: RequestInit) => {
            if (options?.method === "POST") {
              if (
                path === "/student/assignments/raw-assignment-17/submissions"
              ) {
                started = true;
                return { submissionId: "raw-submission-17", versionNumber: 2 };
              }
              if (path.endsWith("/files")) {
                if (!(options.body instanceof FormData))
                  throw new Error("Expected multipart evidence");
                const file = options.body.get("file");
                if (!(file instanceof File))
                  throw new Error("Expected unchanged evidence File");
                uploads.push(file);
                if (uploads.length === 1) await firstUpload;
                return;
              }
              if (path.endsWith("/submit")) {
                submitted = true;
                return;
              }
            }
            if (path === "/student/assignments/mine")
              return started
                ? [
                    {
                      ...practiceSubmission,
                      versions: [
                        {
                          versionNumber: 2,
                          files: uploads.map((file, index) => ({
                            id: `raw-file-${index}`,
                            originalFileName: file.name,
                          })),
                        },
                      ],
                    },
                  ]
                : [];
            const value = structuredClone(practiceUnit);
            value.finalPractice.status = submitted ? "Submitted" : "Available";
            value.aims[0].practiceStatus = submitted
              ? "Submitted"
              : "Available";
            return [value];
          },
        );
        const view = provider(<Component courseId="raw-course" />, locale);
        const initial = await screen.findByRole("button", {
          name:
            kind === "aim"
              ? messages.aim.startPractice
              : messages.comprehensive.openPractice,
        });
        expect(
          screen.queryByRole("button", { name: messages.common.uploadFiles }),
        ).toBeNull();
        expect(
          screen.queryByRole("button", {
            name: messages.common.submitToTeacher,
          }),
        ).toBeNull();
        fireEvent.click(initial);
        const note = await screen.findByRole("textbox", {
          name: messages.common.teacherNote,
        });
        expect(apiMock).toHaveBeenCalledWith(
          "/student/assignments/raw-assignment-17/submissions",
          { method: "POST", body: JSON.stringify({ comment: "" }) },
        );
        const answer = "RAW learner answer إجابة الطالب";
        fireEvent.change(note, { target: { value: answer } });
        fireEvent.click(
          screen.getByRole("button", { name: messages.common.saveNote }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/student/assignments/raw-assignment-17/submissions",
            { method: "POST", body: JSON.stringify({ comment: answer }) },
          ),
        );
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: messages.common.saveNote }),
          ).toBeEnabled(),
        );
        expect(
          screen.getByRole("button", { name: messages.common.submitToTeacher }),
        ).toBeDisabled();
        const input = view.container.querySelector('input[type="file"]');
        if (!input) throw new Error("Missing evidence picker");
        expect(input).toHaveAttribute(
          "accept",
          ".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.txt",
        );
        const files = [
          new File(["one"], "RAW الأول.pdf", { type: "application/pdf" }),
          new File(["two"], "RAW second.txt", { type: "text/plain" }),
        ];
        fireEvent.change(input, { target: { files } });
        fireEvent.click(
          screen.getByRole("button", { name: messages.common.uploadFiles }),
        );
        await waitFor(() => expect(uploads).toHaveLength(1));
        expect(
          screen.getByRole("button", { name: messages.common.uploadFiles }),
        ).toBeDisabled();
        expect(
          screen.getByRole("button", { name: messages.common.submitToTeacher }),
        ).toBeDisabled();
        releaseFirst?.();
        await waitFor(() => expect(uploads).toEqual(files));
        const submit = screen.getByRole("button", {
          name: messages.common.submitToTeacher,
        });
        await waitFor(() => expect(submit).toBeEnabled());
        for (const file of files)
          expect(screen.getByRole("link", { name: file.name })).toBeVisible();
        fireEvent.click(submit);
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/student/assignments/submissions/raw-submission-17/submit",
            { method: "POST" },
          ),
        );
        await waitFor(() =>
          expect(
            screen.queryByRole("textbox", {
              name: messages.common.teacherNote,
            }),
          ).toBeNull(),
        );
        expect(view.invalidate).toHaveBeenCalledWith({
          queryKey: ["learning-aim-practice", "raw-course"],
        });
        expect(view.invalidate).toHaveBeenCalledWith({
          queryKey: ["student-course-assignment-submissions"],
        });
        if (kind === "aim")
          expect(view.invalidate).toHaveBeenCalledWith({
            queryKey: ["player", "raw-course"],
          });
        cleanup();
        apiMock.mockImplementation((path: string, options?: RequestInit) =>
          options?.method
            ? Promise.reject(new Error("RAW server rejection رفض خام"))
            : Promise.resolve(
                path === "/student/assignments/mine" ? [] : [practiceUnit],
              ),
        );
        provider(<Component courseId="raw-course" />, locale);
        fireEvent.click(
          await screen.findByRole("button", {
            name:
              kind === "aim"
                ? messages.aim.startPractice
                : messages.comprehensive.openPractice,
          }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "RAW server rejection رفض خام",
        );
        if (kind === "aim")
          expect(screen.queryByText(messages.aim.actionFailed)).toBeNull();
      },
    );
  });
}
