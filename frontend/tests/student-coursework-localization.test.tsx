import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { CourseAssignmentPanel } from "@/features/student/student-area";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

const copy = {
  en: {
    heading: "Coursework",
    description:
      "Upload your work privately. Results appear only after teacher review and server-side criterion calculation.",
    due: "Due:",
    extension: "Individual deadline adjustment",
    opens: "Opens:",
    files: "Files:",
    title: "Server assignment title",
    instructions: "Server assignment instructions",
    criterion: "Server criterion description",
    criterionResult: "Criterion result",
    deadlinePassed: "Submission deadline passed",
    notOpen: "This coursework is not open yet",
    resubmissionUnavailable: "Resubmission is unavailable",
    startResubmission: "Start resubmission",
    continueDraft: "Continue draft",
    start: "Start submission",
    notePlaceholder: "Optional note to your teacher",
    workFiles: "Your work files",
    chooseFiles: "Choose work files",
    fileHelp:
      "You can add multiple files; the limit is 5MB per file. Files are security-scanned before storage.",
    saveNote: "Save note",
    upload: "Upload files",
    submit: "Submit to teacher",
    startError: "Unable to start the submission.",
    actionError: "The action could not be completed.",
    loadError: "Unable to load coursework.",
  },
  ar: {
    heading: "مهمة الدورة",
    description:
      "ارفع عملك بشكل خاص. لا تظهر النتيجة إلا بعد تدقيق المعلم واحتسابها من المعايير.",
    due: "الموعد النهائي:",
    extension: "تمديد فردي لموعد التسليم",
    opens: "تفتح المهمة:",
    files: "الملفات:",
    title: "عنوان المهمة من الخادم",
    instructions: "تعليمات المهمة من الخادم",
    criterion: "وصف المعيار من الخادم",
    criterionResult: "نتيجة المعايير",
    deadlinePassed: "انتهى موعد التسليم",
    notOpen: "المهمة لم تُفتح بعد",
    resubmissionUnavailable: "إعادة التسليم غير متاحة",
    startResubmission: "بدء إعادة التسليم",
    continueDraft: "متابعة المسودة",
    start: "بدء التسليم",
    notePlaceholder: "ملاحظة اختيارية للمعلم",
    workFiles: "ملفات الحل",
    chooseFiles: "اختيار ملفات الحل",
    fileHelp:
      "يمكن إضافة أكثر من ملف؛ الحد 5MB لكل ملف. تفحص الملفات أمنيًا قبل حفظها.",
    saveNote: "حفظ الملاحظة",
    upload: "رفع الملفات",
    submit: "تسليم للمعلم",
    startError: "تعذر بدء التسليم.",
    actionError: "تعذر تنفيذ العملية.",
    loadError: "تعذر تحميل مهمة الدورة.",
  },
} as const;

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    lessonId: "lesson-1",
    arabicTitle: "عنوان المهمة من الخادم",
    englishTitle: "Server assignment title",
    arabicInstructions: "تعليمات المهمة من الخادم",
    englishInstructions: "Server assignment instructions",
    availableFromUtc: new Date(Date.now() - 60_000).toISOString(),
    effectiveDueAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
    hasDeadlineExtension: true,
    maxSubmissionAttempts: 2,
    allowResubmission: true,
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedFileExtensions: [".pdf", ".docx"],
    resources: [{ id: "resource-1", displayName: "Server rubric" }],
    criteria: [
      {
        id: "criterion-1",
        code: "P1",
        arabicDescription: "وصف المعيار من الخادم",
        englishDescription: "Server criterion description",
      },
    ],
    ...overrides,
  };
}

function submission(status: string) {
  return {
    id: "submission-1",
    assignmentId: "assignment-1",
    status,
    calculatedGrade: null,
    results: [
      {
        code: "P1",
        achievement: "Server result",
        feedback: "Server result feedback",
      },
    ],
    feedback: [
      {
        body: "Teacher feedback",
        requestsResubmission: true,
        createdAtUtc: "2026-09-30T00:00:00Z",
      },
    ],
    versions: [
      { files: [{ id: "file-1", originalFileName: "submitted.pdf" }] },
    ],
  };
}

function renderCoursework(locale: "ar" | "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
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
        <CourseAssignmentPanel courseId="course-1" lessonId="lesson-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe.each(["en", "ar"] as const)("student coursework in %s", (locale) => {
  const labels = copy[locale];

  it("renders localized copy and server data while preserving start, upload, and submit", async () => {
    apiMock.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/student/courses/course-1/assignments")
          return Promise.resolve([assignment()]);
        if (path === "/student/assignments/mine") return Promise.resolve([]);
        if (
          path === "/student/assignments/assignment-1/submissions" &&
          options?.method === "POST"
        )
          return Promise.resolve({ submissionId: "submission-1" });
        if (
          path === "/student/assignments/submissions/submission-1/files" &&
          options?.method === "POST"
        )
          return Promise.resolve({});
        if (
          path === "/student/assignments/submissions/submission-1/submit" &&
          options?.method === "POST"
        )
          return Promise.resolve({});
        throw new Error("Unexpected coursework request: " + path);
      },
    );
    const { container } = renderCoursework(locale);
    expect(
      await screen.findByRole("heading", { name: labels.heading }),
    ).toBeVisible();
    expect(screen.getByText(labels.description)).toBeVisible();
    expect(screen.getByText(labels.title)).toBeVisible();
    expect(screen.getByText(labels.instructions)).toBeVisible();
    expect(screen.getByText(new RegExp(labels.criterion))).toBeVisible();
    expect(screen.getByText(new RegExp(labels.due))).toBeVisible();
    expect(screen.getByText(labels.extension)).toBeVisible();
    expect(screen.getByText(new RegExp(labels.opens))).toBeVisible();
    expect(screen.getByText(new RegExp(labels.files))).toBeVisible();
    expect(screen.getByRole("link", { name: "Server rubric" })).toHaveAttribute(
      "href",
      "/api/v1/assignments/assignment-1/resources/resource-1",
    );
    expect(apiMock).toHaveBeenCalledWith(
      "/student/courses/course-1/assignments",
    );
    expect(apiMock).toHaveBeenCalledWith("/student/assignments/mine");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: labels.start }));
    expect(
      await screen.findByPlaceholderText(labels.notePlaceholder),
    ).toBeVisible();
    expect(screen.getByText(labels.workFiles)).toBeVisible();
    expect(
      screen.getByRole("button", { name: labels.chooseFiles }),
    ).toBeVisible();
    expect(screen.getByText(labels.fileHelp)).toBeVisible();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", ".pdf,.docx");
    expect(screen.getByRole("button", { name: labels.saveNote })).toBeVisible();
    expect(screen.getByRole("button", { name: labels.upload })).toBeDisabled();
    expect(screen.getByRole("button", { name: labels.submit })).toBeVisible();
    await user.type(
      screen.getByPlaceholderText(labels.notePlaceholder),
      "Teacher note",
    );
    await user.click(screen.getByRole("button", { name: labels.saveNote }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/student/assignments/assignment-1/submissions",
        { method: "POST", body: JSON.stringify({ comment: "Teacher note" }) },
      ),
    );
    const file = new File(["coursework"], "answer.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: labels.upload }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.some(
          ([path, options]) =>
            path === "/student/assignments/submissions/submission-1/files" &&
            options?.method === "POST" &&
            options.body instanceof FormData &&
            options.body.get("file") === file,
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: labels.submit }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/student/assignments/submissions/submission-1/submit",
        { method: "POST" },
      ),
    );
  });

  it.each([
    "deadlinePassed",
    "notOpen",
    "resubmissionUnavailable",
    "startResubmission",
    "continueDraft",
    "start",
  ] as const)("preserves %s action state", async (state) => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const currentAssignment = assignment({
      effectiveDueAtUtc: state === "deadlinePassed" ? past : future,
      availableFromUtc: state === "notOpen" ? future : past,
      allowResubmission: state !== "resubmissionUnavailable",
    });
    const currentSubmission =
      state === "resubmissionUnavailable" || state === "startResubmission"
        ? submission("NeedsRevision")
        : state === "continueDraft"
          ? submission("Draft")
          : null;
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine"
          ? currentSubmission
            ? [currentSubmission]
            : []
          : [currentAssignment],
      ),
    );
    renderCoursework(locale);
    const button = await screen.findByRole("button", { name: labels[state] });
    if (
      state === "deadlinePassed" ||
      state === "notOpen" ||
      state === "resubmissionUnavailable"
    )
      expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
    if (currentSubmission) {
      expect(screen.getByText(labels.criterionResult)).toBeVisible();
      expect(screen.getByText(/Server result/)).toBeVisible();
      expect(screen.getByText(/Teacher feedback/)).toBeVisible();
      expect(
        screen.getByRole("link", { name: "submitted.pdf" }),
      ).toHaveAttribute(
        "href",
        "/api/v1/assignments/submissions/submission-1/files/file-1",
      );
    }
  });

  it("localizes fallback errors and preserves real server errors", async () => {
    apiMock.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/student/courses/course-1/assignments")
          return Promise.resolve([assignment()]);
        if (path === "/student/assignments/mine") return Promise.resolve([]);
        if (options?.method === "POST") return Promise.reject(null);
        throw new Error("Unexpected coursework request: " + path);
      },
    );
    renderCoursework(locale);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: labels.start }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.startError,
    );
    cleanup();
    apiMock.mockImplementation((path: string) =>
      path === "/student/assignments/mine"
        ? Promise.reject(new Error("Server owned error"))
        : Promise.resolve([assignment()]),
    );
    renderCoursework(locale);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.loadError,
    );
    cleanup();
    apiMock.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/student/courses/course-1/assignments")
          return Promise.resolve([assignment()]);
        if (path === "/student/assignments/mine") return Promise.resolve([]);
        if (options?.method === "POST")
          return Promise.reject(new Error("Server owned start error"));
        throw new Error("Unexpected coursework request: " + path);
      },
    );
    renderCoursework(locale);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: labels.start }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server owned start error",
    );
    cleanup();
    apiMock.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/student/courses/course-1/assignments")
          return Promise.resolve([assignment()]);
        if (path === "/student/assignments/mine") return Promise.resolve([]);
        if (path === "/student/assignments/assignment-1/submissions")
          return Promise.resolve({ submissionId: "submission-1" });
        if (
          path === "/student/assignments/submissions/submission-1/submit" &&
          options?.method === "POST"
        )
          return Promise.reject(null);
        throw new Error("Unexpected coursework request: " + path);
      },
    );
    renderCoursework(locale);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: labels.start }));
    await user.click(
      await screen.findByRole("button", { name: labels.submit }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.actionError,
    );
  });
});
