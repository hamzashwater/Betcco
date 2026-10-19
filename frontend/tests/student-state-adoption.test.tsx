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
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseAssignmentPanel,
  StudentCourseGradebookPanel,
} from "@/features/student/student-area";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  courseworkAssignment as assignment,
  courseworkSubmission as submission,
  studentGradebook as gradebook,
  deferred,
} from "./fixtures/student-state";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const clients: QueryClient[] = [];
const assignmentPath = "/student/courses/course-raw/assignments";
const minePath = "/student/assignments/mine";
const assignmentKey = ["student-course-assignments", "course-raw"];
const mineKey = ["student-course-assignment-submissions"];
beforeEach(() => {
  apiMock.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function mount(locale: "en" | "ar", view: "coursework" | "gradebook") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const result = render(
    <div dir={locale === "ar" ? "rtl" : "ltr"}>
      <QueryClientProvider client={client}>
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "ar" ? ar : en}
        >
          {view === "coursework" ? (
            <CourseAssignmentPanel
              courseId="course-raw"
              lessonId="lesson-raw"
            />
          ) : (
            <StudentCourseGradebookPanel courseId="course-raw" />
          )}
        </NextIntlClientProvider>
      </QueryClientProvider>
    </div>,
  );
  return { ...result, client };
}

describe.each(["en", "ar"] as const)(
  "UI-D01-04 Student factual states in %s",
  (locale) => {
    const copy = (locale === "ar" ? ar : en).studentWorkspace;
    const title =
      locale === "ar" ? assignment.arabicTitle : assignment.englishTitle;
    const gradePath = `/gradebook/student/courses/course-raw?locale=${locale}`;
    const gradeKey = ["student-course-gradebook", "course-raw", locale];

    it("exposes initial coursework loading without false empty or status", async () => {
      const waiting = deferred<unknown>();
      apiMock.mockReturnValue(waiting.promise);
      mount(locale, "coursework");
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByText(copy.coursework.empty)).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      await act(async () => waiting.resolve([]));
      expect(await screen.findByText(copy.coursework.empty)).toBeVisible();
    });

    it.each([assignmentPath, minePath])(
      "shows cold failure for %s without calling it empty",
      async (failed) => {
        apiMock.mockImplementation((path: string) =>
          path === failed
            ? Promise.reject(new Error("Raw retrieval error"))
            : Promise.resolve([]),
        );
        mount(locale, "coursework");
        expect(await screen.findByRole("alert")).toHaveTextContent(
          copy.coursework.errors.load,
        );
        expect(
          screen.queryByText(copy.coursework.empty),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Passed")).not.toBeInTheDocument();
      },
    );

    it("shows successful lesson-filtered empty without an error", async () => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === assignmentPath
            ? [{ ...assignment, lessonId: "other-lesson" }]
            : [],
        ),
      );
      mount(locale, "coursework");
      expect(await screen.findByText(copy.coursework.empty)).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    });

    it.each([[assignmentKey], [mineKey]])(
      "retains cached coursework, order, raw states and deep links after failed refresh %j",
      async (key) => {
        let fail = false;
        apiMock.mockImplementation((path: string) =>
          fail
            ? Promise.reject(new Error("Refresh failed"))
            : Promise.resolve(
                path === assignmentPath
                  ? [
                      assignment,
                      {
                        ...assignment,
                        id: "second",
                        englishTitle: "Second raw",
                        arabicTitle: "الثانية",
                      },
                    ]
                  : [submission],
              ),
        );
        const { client, container } = mount(locale, "coursework");
        await screen.findByText(title);
        const links = [...container.querySelectorAll("a")].map((link) =>
          link.getAttribute("href"),
        );
        expect(screen.getByText("Submitted")).toHaveClass(
          "text-state-info-foreground",
        );
        fail = true;
        await act(async () => {
          await client.refetchQueries({ queryKey: key, exact: true });
        });
        expect(await screen.findByRole("alert")).toHaveTextContent(
          copy.coursework.errors.load,
        );
        expect(screen.getByText(title)).toBeVisible();
        expect(screen.getByText("Submitted")).toBeVisible();
        expect(
          [...container.querySelectorAll("article h3")].map(
            (node) => node.textContent,
          ),
        ).toEqual([title, locale === "ar" ? "الثانية" : "Second raw"]);
        expect(
          [...container.querySelectorAll("a")].map((link) =>
            link.getAttribute("href"),
          ),
        ).toEqual(links);
        expect(links).toContain(
          "/api/v1/assignments/assignment-raw/resources/resource-raw",
        );
        expect(links).toContain(
          "/api/v1/assignments/submissions/submission-raw/files/file-raw",
        );
        expect(
          screen.queryByText(copy.coursework.empty),
        ).not.toBeInTheDocument();
        expect(client.getQueryState(key)).toMatchObject({
          status: "error",
          data: expect.any(Array),
        });
      },
    );

    it("keeps start pending native, labelled, keyboard operable and single-invocation", async () => {
      const waiting = deferred<{ submissionId: string }>();
      apiMock.mockImplementation(
        (path: string, options?: { method?: string }) =>
          options?.method === "POST"
            ? waiting.promise
            : Promise.resolve(path === assignmentPath ? [assignment] : []),
      );
      const { container } = mount(locale, "coursework");
      const action = await screen.findByRole("button", {
        name: copy.coursework.actions.startSubmission,
      });
      const user = userEvent.setup();
      action.focus();
      await user.keyboard("{Enter}");
      await waitFor(() => expect(action).toHaveAttribute("aria-busy", "true"));
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute("type", "button");
      expect(action).toHaveTextContent(copy.coursework.actions.startSubmission);
      await user.click(action);
      await user.keyboard("{Enter}");
      expect(
        apiMock.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(1);
      await act(async () => waiting.resolve({ submissionId: "draft-raw" }));
      expect(
        await screen.findByRole("button", {
          name: copy.coursework.submission.uploadFiles,
        }),
      ).toBeDisabled();
      expect(container.querySelector('input[type="file"]')).toHaveAttribute(
        "accept",
        ".pdf,.docx",
      );
    });

    it.each(["upload", "submit"] as const)(
      "preserves %s pending guard, payload and raw local error",
      async (operation) => {
        const waiting = deferred<unknown>();
        apiMock.mockImplementation(
          (path: string, options?: { method?: string }) => {
            if (!options?.method)
              return Promise.resolve(
                path === assignmentPath ? [assignment] : [],
              );
            if (path === "/student/assignments/assignment-raw/submissions")
              return Promise.resolve({ submissionId: "draft-raw" });
            return waiting.promise;
          },
        );
        const { container } = mount(locale, "coursework");
        const user = userEvent.setup();
        await user.click(
          await screen.findByRole("button", {
            name: copy.coursework.actions.startSubmission,
          }),
        );
        const file = new File(["Raw bytes"], "raw.pdf", {
          type: "application/pdf",
        });
        if (operation === "upload")
          fireEvent.change(container.querySelector('input[type="file"]')!, {
            target: { files: [file] },
          });
        const action = screen.getByRole("button", {
          name:
            operation === "upload"
              ? copy.coursework.submission.uploadFiles
              : copy.coursework.submission.submit,
        });
        await user.click(action);
        await waitFor(() =>
          expect(action).toHaveAttribute("aria-busy", "true"),
        );
        expect(action).toBeDisabled();
        await user.click(action);
        const calls = apiMock.mock.calls.filter(([path]) =>
          path.endsWith(operation === "upload" ? "/files" : "/submit"),
        );
        expect(calls).toHaveLength(1);
        expect(calls[0][1].method).toBe("POST");
        if (operation === "upload")
          expect(calls[0][1].body.get("file")).toBe(file);
        else expect(calls[0][1]).toEqual({ method: "POST" });
        await act(async () => waiting.reject(new Error("Raw-خطأ-الخادم-P1")));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Raw-خطأ-الخادم-P1",
        );
      },
    );

    it("distinguishes gradebook loading, cold error and successful zero criterion records", async () => {
      const waiting = deferred<unknown>();
      apiMock.mockReturnValue(waiting.promise);
      const { client } = mount(locale, "gradebook");
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
      await act(async () => waiting.reject(new Error("Request failed")));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.gradebook.loadError,
      );
      expect(
        screen.queryByText(copy.gradebook.heading),
      ).not.toBeInTheDocument();
      apiMock.mockResolvedValue({
        ...gradebook,
        criteria: [],
        units: [],
        lessonsCompleted: 0,
        lessonsTotal: 0,
        assignmentsCompleted: 0,
        assignmentsTotal: 0,
      });
      await act(async () => {
        await client.refetchQueries({ queryKey: gradeKey, exact: true });
      });
      expect(
        await screen.findByText(copy.gradebook.emptyCriteria),
      ).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getAllByText("0 / 0")).toHaveLength(2);
      expect(apiMock.mock.calls.map(([path]) => path)).toEqual([
        gradePath,
        gradePath,
      ]);
    });

    it("keeps server grades, units, criterion labels and unknown raw values across cached error", async () => {
      let fail = false;
      apiMock.mockImplementation(() =>
        fail
          ? Promise.reject(new Error("Refresh failed"))
          : Promise.resolve(gradebook),
      );
      const { client, container } = mount(locale, "gradebook");
      await screen.findByText(copy.gradebook.heading);
      await userEvent
        .setup()
        .click(screen.getByText(copy.gradebook.criterionStatus));
      for (const label of Object.values(copy.gradebook.criterionStatuses))
        expect(screen.getByText(label)).toBeVisible();
      const raw = screen.getByText("Raw-status-حالة-الخادم");
      expect(raw).toHaveClass("text-state-neutral-foreground");
      expect(
        screen.getByText(copy.gradebook.criterionStatuses.achieved),
      ).toHaveClass("text-state-success-foreground");
      expect(
        screen.getByText(copy.gradebook.criterionStatuses.notAchieved),
      ).toHaveClass("text-state-danger-foreground");
      expect(
        within(container.querySelector("details")!)
          .getAllByRole("listitem")
          .map((node) => node.querySelector("strong")?.textContent),
      ).toEqual(gradebook.criteria.map((row) => row.code));
      fail = true;
      await act(async () => {
        await client.refetchQueries({ queryKey: gradeKey, exact: true });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.gradebook.loadError,
      );
      expect(screen.getByText(copy.gradebook.heading)).toBeVisible();
      expect(raw).toBeVisible();
      expect(container.querySelector("details")).toHaveAttribute("open");
      expect(screen.getByText(gradebook.units[0].unitTitle)).toBeVisible();
      expect(
        screen.getAllByText(copy.gradebook.grades.merit).length,
      ).toBeGreaterThan(0);
      expect(client.getQueryState(gradeKey)).toMatchObject({
        status: "error",
        data: gradebook,
      });
    });
  },
);
