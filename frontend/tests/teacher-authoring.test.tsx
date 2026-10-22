import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseEditor } from "@/features/teacher/course-editor";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  authoringCourse,
  authoringResponse,
} from "./fixtures/teacher-authoring";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const clients: QueryClient[] = [];
const path = `/teacher/courses/${authoringCourse.id}`;
const region = (name: string) =>
  document.querySelector<HTMLElement>(`[data-authoring-region="${name}"]`)!;
const writes = () => api.mock.calls.filter(([, options]) => options?.method);
function mount(locale: "en" | "ar") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        <CourseEditor courseId={authoringCourse.id} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (p: string, options?: RequestInit) =>
    options?.method ? {} : authoringResponse(p),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  window.history.replaceState(null, "", "/");
});

describe.each(["en", "ar"] as const)(
  "%s mutable Teacher authoring",
  (locale) => {
    const m = (locale === "ar" ? ar : en).teacherWorkspace;
    const presentation = (locale === "ar" ? ar : en)
      .teacherAuthoringPresentation;
    it("keeps the same unsaved fields, selected files and review draft across all six sections and a failed cached refresh", async () => {
      const client = mount(locale);
      await screen.findByDisplayValue(authoringCourse.englishTitle);
      await screen.findByText("RAW submission.pdf");
      const title = within(region("CourseDetailsForm")).getByLabelText(
        m.courseDetails.englishTitle,
      );
      const lessonTitle = within(region("LessonEditor")).getByDisplayValue(
        authoringCourse.modules[0].lessons[0].englishTitle,
      );
      const feedback = within(
        region("AssignmentSubmissionCard"),
      ).getByPlaceholderText(m.submissionReview.overallFeedback);
      fireEvent.change(title, { target: { value: "UNSAVED title" } });
      fireEvent.change(lessonTitle, { target: { value: "UNSAVED lesson" } });
      fireEvent.change(feedback, { target: { value: "UNSAVED raw review" } });
      const cover = new File(["image"], "unsaved-cover.png", {
        type: "image/png",
      });
      const evidence = new File(["evidence"], "unsaved-evidence.pdf", {
        type: "application/pdf",
      });
      const coverInput =
        region("CoverManager").querySelector<HTMLInputElement>(
          'input[type="file"]',
        )!;
      const lessonInput =
        region("LessonEditor").querySelectorAll<HTMLInputElement>(
          'input[type="file"]',
        )[1];
      fireEvent.change(coverInput, { target: { files: [cover] } });
      fireEvent.change(lessonInput, { target: { files: [evidence] } });
      const nav = screen.getByRole("navigation", {
        name: (locale === "ar" ? ar : en).teacherCourseWorkspace.navigation
          .label,
      });
      for (const link of within(nav).getAllByRole("link")) {
        fireEvent.click(link);
        expect(link).toHaveAttribute("aria-current", "location");
        expect(title).toHaveValue("UNSAVED title");
        expect(lessonTitle).toHaveValue("UNSAVED lesson");
        expect(feedback).toHaveValue("UNSAVED raw review");
      }
      api.mockImplementation(async (p: string) => {
        if (p === path) throw new Error("RAW refresh failure");
        return authoringResponse(p);
      });
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["teacher-course", authoringCourse.id],
        });
      });
      await screen.findByText(presentation.loadError);
      expect(
        within(region("CourseDetailsForm")).getByLabelText(
          m.courseDetails.englishTitle,
        ),
      ).toBe(title);
      expect(title).toHaveValue("UNSAVED title");
      expect(feedback).toHaveValue("UNSAVED raw review");
      expect(region("CoverManager").querySelector('input[type="file"]')).toBe(
        coverInput,
      );
      expect(screen.getByText(cover.name)).toBeVisible();
      expect(screen.getByText(evidence.name)).toBeVisible();
      expect(
        within(region("CoverManager")).getByRole("button", {
          name: m.cover.upload,
        }),
      ).toBeEnabled();
      expect(writes()).toEqual([]);
    });
    it.each(["pending", "error"])(
      "does not expose authoring controls on %s without course data",
      async (mode) => {
        api.mockImplementation((p: string) =>
          p === path
            ? mode === "pending"
              ? new Promise(() => {})
              : Promise.reject(new Error("RAW cold error"))
            : Promise.resolve(authoringResponse(p)),
        );
        mount(locale);
        await screen.findByText(
          mode === "pending" ? m.shared.loading : presentation.loadError,
        );
        expect(region("CourseDetailsForm")).toBeNull();
        expect(
          screen.queryByRole("button", { name: m.reviewSubmission.submit }),
        ).not.toBeInTheDocument();
        expect(writes()).toEqual([]);
      },
    );
    it.each(["Draft", "Rejected", "Published", "SubmittedForReview"])(
      "preserves existing editable and assignment guards for %s",
      async (status) => {
        const course = { ...authoringCourse, status };
        api.mockImplementation(async (p: string) =>
          authoringResponse(p, course),
        );
        mount(locale);
        await screen.findByDisplayValue(authoringCourse.englishTitle);
        const title = within(region("CourseDetailsForm")).getByLabelText(
          m.courseDetails.englishTitle,
        );
        const submit = within(region("ReviewSubmission")).getByRole("button", {
          name: m.reviewSubmission.submit,
        });
        if (["Draft", "Rejected"].includes(status)) {
          expect(title).toBeEnabled();
          expect(submit).toBeEnabled();
        } else {
          expect(title).toBeDisabled();
          expect(submit).toBeDisabled();
        }
        const accessButton = await within(
          region("LearningAccessEditor"),
        ).findByLabelText(m.learningAccess.target);
        if (["Draft", "Rejected", "Published"].includes(status))
          expect(accessButton).toBeEnabled();
        else expect(accessButton).toBeDisabled();
        expect(writes()).toEqual([]);
      },
    );
    it("keeps sequential multipart upload order, pending duplicate prevention and failure draft retention", async () => {
      let resolveFirst!: (value: unknown) => void;
      const uploadPath = "/teacher/courses/lessons/lesson-raw/resources";
      api.mockImplementation(async (p: string, options?: RequestInit) => {
        if (p === uploadPath && options?.method === "POST") {
          if (writes().filter(([p]) => p === uploadPath).length === 1)
            return new Promise((resolve) => {
              resolveFirst = resolve;
            });
          throw new Error("RAW upload conflict");
        }
        return authoringResponse(p);
      });
      mount(locale);
      await screen.findByDisplayValue(authoringCourse.englishTitle);
      const lesson = within(region("LessonEditor"));
      const title = lesson.getByDisplayValue(
        authoringCourse.modules[0].lessons[0].englishTitle,
      );
      fireEvent.change(title, { target: { value: "UNSAVED upload lesson" } });
      const files = [
        new File(["a"], "first.pdf"),
        new File(["b"], "second.pdf"),
      ];
      fireEvent.change(
        region("LessonEditor").querySelectorAll('input[type="file"]')[1],
        { target: { files } },
      );
      const upload = lesson.getByRole("button", {
        name: m.lesson.uploadResources,
      });
      fireEvent.click(upload);
      await waitFor(() => expect(upload).toBeDisabled());
      fireEvent.click(upload);
      expect(writes()).toHaveLength(1);
      const first = writes()[0][1].body as FormData;
      expect([...first.keys()]).toEqual(["file", "isDownloadable"]);
      expect(first.get("file")).toBe(files[0]);
      expect(first.get("isDownloadable")).toBe("true");
      await act(async () => {
        resolveFirst({});
      });
      await screen.findByText("RAW upload conflict");
      expect(writes()).toHaveLength(2);
      expect((writes()[1][1].body as FormData).get("file")).toBe(files[1]);
      files.forEach((f) => expect(screen.getByText(f.name)).toBeVisible());
      expect(title).toHaveValue("UNSAVED upload lesson");
      expect(upload).toBeEnabled();
    });
    it("preserves update payload and bodyless review request with server validation order", async () => {
      api.mockImplementation(async (p: string, options?: RequestInit) => {
        if (p === `${path}/submit`)
          return {
            passed: false,
            reasons: ["RAW first reason", "RAW second reason"],
          };
        if (options?.method) return {};
        return authoringResponse(p);
      });
      mount(locale);
      await screen.findByDisplayValue(authoringCourse.englishTitle);
      const details = within(region("CourseDetailsForm"));
      fireEvent.change(details.getByLabelText(m.courseDetails.englishTitle), {
        target: { value: "RAW updated title" },
      });
      fireEvent.click(
        details.getByRole("button", { name: m.courseDetails.save }),
      );
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]).toEqual([
        path,
        {
          method: "PUT",
          body: JSON.stringify({
            arabicTitle: authoringCourse.arabicTitle,
            englishTitle: "RAW updated title",
            arabicDescription: authoringCourse.arabicDescription,
            englishDescription: authoringCourse.englishDescription,
            price: 12.5,
            isFree: false,
          }),
        },
      ]);
      fireEvent.click(
        within(region("ReviewSubmission")).getByRole("button", {
          name: m.reviewSubmission.submit,
        }),
      );
      await screen.findByText("RAW second reason");
      expect(writes()[1]).toEqual([`${path}/submit`, { method: "POST" }]);
      expect(
        within(region("ReviewSubmission"))
          .getAllByRole("listitem")
          .map((e) => e.textContent),
      ).toEqual(["RAW first reason", "RAW second reason"]);
    });
  },
);
