import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseEditor,
  CurriculumEditor,
  CourseworkDeadlineExtensionPanel,
} from "@/features/teacher/course-editor";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";

// MOCKED UI-CONTRACT EVIDENCE: real components/providers, mocked transport.
type Course = ComponentProps<typeof CurriculumEditor>["course"];
type Assignment = ComponentProps<
  typeof CourseworkDeadlineExtensionPanel
>["assignment"];
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const extensions = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".zip",
  ".txt",
];
const btec = {
  id: "btec-1",
  code: "A.M1",
  band: "Merit" as const,
  arabicDescription: "معيار ربط الخادم",
  englishDescription: "Server linked criterion",
  publicationStatus: "Published",
  sortOrder: 1,
};
const course: Course = {
  id: "course-1",
  isBtecFocused: false,
  arabicTitle: "دورة الخادم",
  englishTitle: "Server course",
  arabicDescription: "وصف",
  englishDescription: "Description",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: true,
  outcomes: [],
  modules: [
    {
      id: "module-1",
      arabicTitle: "وحدة الخادم",
      englishTitle: "Server unit",
      unitCode: "RAW-U1",
      publicationStatus: "Published",
      sortOrder: 1,
      criteria: [btec],
      learningAims: [
        {
          id: "aim-1",
          code: "A",
          arabicTitle: "هدف الخادم",
          englishTitle: "Server aim",
          publicationStatus: "Published",
          sortOrder: 1,
          topics: [],
        },
      ],
      lessons: [
        {
          id: "lesson-1",
          arabicTitle: "درس مهمة الخادم",
          englishTitle: "Server assignment lesson",
          type: "Assignment",
          durationSeconds: 0,
          isPreview: false,
          publicationStatus: "Published",
          sortOrder: 1,
          resources: [],
        },
        {
          id: "video-1",
          arabicTitle: "فيديو الخادم",
          englishTitle: "Server video",
          type: "Video",
          durationSeconds: 30,
          isPreview: false,
          publicationStatus: "Published",
          sortOrder: 2,
          resources: [],
        },
      ],
    },
  ],
};
const assignment: Assignment = {
  id: "assignment-1",
  courseId: "course-1",
  courseModuleId: "module-1",
  lessonId: "lesson-1",
  btecLearningAimId: "aim-1",
  arabicTitle: "مهمة الخادم",
  englishTitle: "Server assignment",
  arabicInstructions: "تعليمات الخادم",
  englishInstructions: "Server instructions",
  dueAtUtc: "2030-01-01T12:00:00Z",
  maxSubmissionAttempts: 2,
  maxScore: 100,
  allowResubmission: true,
  maxFileSizeBytes: 100 * 1024 * 1024,
  allowedFileExtensions: extensions,
  isPublished: false,
  publicationStatus: "Draft",
  resources: [
    {
      id: "resource-1",
      displayName: "RAW اسم resource.pdf",
      contentType: "application/pdf",
      scanStatus: "Clean",
    },
  ],
  criteria: [
    {
      id: "criterion-1",
      code: "A.P1",
      band: "Pass",
      arabicDescription: "معيار الخادم",
      englishDescription: "Server criterion",
      sortOrder: 1,
    },
  ],
};
const submission = {
  id: "submission-1",
  assignmentId: "assignment-1",
  studentUserId: "RAW-student-1",
  status: "Submitted",
  calculatedGrade: "RAW-GRADE",
  files: [{ id: "file-1", originalFileName: "RAW اسم evidence.pdf" }],
  feedback: [
    {
      createdAtUtc: "2030-01-01T12:00:00Z",
      body: "RAW private history",
      isPrivate: true,
      requestsResubmission: true,
    },
    {
      createdAtUtc: "2030-01-01T13:00:00Z",
      body: "RAW public history",
      isPrivate: false,
      requestsResubmission: false,
    },
  ],
};
const clients: QueryClient[] = [];
let assignments: Assignment[],
  submissions: (typeof submission)[],
  currentCourse: Course;
let history: Array<Record<string, unknown>>;
let failures: Set<string>, reviewResult: { passed: boolean; reasons: string[] };
beforeEach(() => {
  apiMock.mockReset();
  assignments = [structuredClone(assignment)];
  submissions = [structuredClone(submission)];
  currentCourse = structuredClone(course);
  history = [];
  failures = new Set();
  reviewResult = { passed: true, reasons: [] };
  apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (failures.has(path)) throw new Error("RAW server error");
    if (options?.method) {
      if (path.endsWith("/submit")) return reviewResult;
      if (path.endsWith("/revoke")) {
        history[0].revokedAtUtc = "2030-01-01T13:00:00Z";
        return {};
      }
      if (path.endsWith("/deadline-extensions")) {
        history.push({
          id: "extension-1",
          ...JSON.parse(String(options.body)),
          grantedAtUtc: "2030-01-01T12:00:00Z",
          revokedAtUtc: null,
        });
        return {};
      }
      return { id: "created-1" };
    }
    if (path === "/teacher/courses/course-1") return currentCourse;
    if (path === "/teacher/courses/course-1/assignments")
      return [...assignments];
    if (path === "/teacher/assignments/submissions?courseId=course-1")
      return [...submissions];
    if (path.endsWith("/eligible-students"))
      return [{ studentUserId: "student-1", displayName: "RAW Student" }];
    if (path.endsWith("/deadline-extensions")) return [...history];
    if (path.startsWith("/gradebook/"))
      return {
        students: [
          "NotYetAchieved",
          "Pass",
          "Merit",
          "Distinction",
          "RAW_UNKNOWN",
          "toString",
        ].map((grade, i) => ({
          studentUserId: `raw-${i}`,
          studentName: `RAW name ${i}`,
          lessonProgressPercent: 50,
          assignmentsCompleted: 1,
          assignmentsTotal: 2,
          predictedGrade: { predictedGrade: grade },
        })),
        totalStudents: 5,
        page: 1,
        pageSize: 25,
      };
    if (path.endsWith("/learning-access"))
      return {
        items: [],
        prerequisiteCourses: [],
        rules: [],
        prerequisites: [],
      };
    return [];
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
});
function mount(locale: "ar" | "en", panel = false, disabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const messages = locale === "ar" ? arMessages : enMessages;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {panel ? (
          <CourseworkDeadlineExtensionPanel
            assignment={assignments[0]}
            disabled={disabled}
          />
        ) : (
          <CourseEditor courseId="course-1" />
        )}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, m: messages.teacherWorkspace };
}
function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}
function writes(path: string, method: string) {
  return apiMock.mock.calls.filter(
    ([url, options]) => url === path && options?.method === method,
  );
}
function body(path: string, method = "POST") {
  return JSON.parse(String(writes(path, method).at(-1)![1].body));
}
async function formFor(m: typeof enMessages.teacherWorkspace) {
  return (
    await screen.findByRole("heading", { name: m.assignments.new })
  ).closest("form")!;
}
async function cardFor(locale: "ar" | "en") {
  return (
    await screen.findByRole("heading", {
      name: locale === "ar" ? assignment.arabicTitle : assignment.englishTitle,
    })
  ).closest("article")!;
}
async function submissionFor() {
  return (
    await screen.findByRole("link", { name: "RAW اسم evidence.pdf" })
  ).closest("article")!;
}

describe.each(["ar", "en"] as const)(
  "teacher coursework/review %s (mocked UI contracts)",
  (locale) => {
    it("creates with raw bilingual input, ISO dates, numbers, extensions, resets and both invalidations", async () => {
      const { client, m } = mount(locale);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const form = await formFor(m);
      const q = within(form);
      expect(q.getByText(m.assignmentFileTypes.legend)).toBeVisible();
      const selects = q.getAllByRole("combobox");
      expect(selects[1]).toBeDisabled();
      expect(selects[2]).toBeDisabled();
      change(selects[0], "module-1");
      expect(
        within(selects[1]).queryByRole("option", {
          name: locale === "ar" ? "فيديو الخادم" : "Server video",
        }),
      ).toBeNull();
      change(selects[1], "lesson-1");
      change(selects[2], "aim-1");
      change(q.getByPlaceholderText(m.assignments.arabicTitle), " عنوان خام ");
      change(q.getByPlaceholderText(m.assignments.englishTitle), " Raw title ");
      change(
        q.getByPlaceholderText(m.assignments.arabicInstructions),
        " تعليمات خام ",
      );
      change(
        q.getByPlaceholderText(m.assignments.englishInstructions),
        " Raw instructions ",
      );
      change(q.getByLabelText(m.assignments.availableFrom), "2030-01-01T10:00");
      change(q.getByLabelText(m.assignments.dueOptional), "2030-01-03T10:00");
      change(q.getByLabelText(m.assignments.attempts), "3");
      change(q.getByLabelText(m.assignments.maxScore), "75");
      change(q.getByLabelText(m.assignments.maxFileSize), "7");
      fireEvent.click(q.getByLabelText(m.assignments.allowResubmission));
      fireEvent.click(q.getByLabelText("PDF"));
      fireEvent.submit(form);
      await waitFor(() =>
        expect(writes("/teacher/assignments", "POST")).toHaveLength(1),
      );
      expect(body("/teacher/assignments")).toEqual({
        courseId: "course-1",
        moduleId: "module-1",
        lessonId: "lesson-1",
        learningAimId: "aim-1",
        arabicTitle: " عنوان خام ",
        englishTitle: " Raw title ",
        arabicInstructions: " تعليمات خام ",
        englishInstructions: " Raw instructions ",
        availableFromUtc: new Date("2030-01-01T10:00").toISOString(),
        dueAtUtc: new Date("2030-01-03T10:00").toISOString(),
        maxSubmissionAttempts: 3,
        maxScore: 75,
        allowResubmission: false,
        maxFileSizeBytes: 7 * 1024 * 1024,
        allowedFileExtensions: extensions.slice(1),
      });
      await waitFor(() =>
        expect(q.getByPlaceholderText(m.assignments.arabicTitle)).toHaveValue(
          "",
        ),
      );
      for (const placeholder of [
        m.assignments.englishTitle,
        m.assignments.arabicInstructions,
        m.assignments.englishInstructions,
      ])
        expect(q.getByPlaceholderText(placeholder)).toHaveValue("");
      for (const select of selects) expect(select).toHaveValue("");
      expect(q.getByLabelText(m.assignments.availableFrom)).toHaveValue("");
      expect(q.getByLabelText(m.assignments.dueOptional)).toHaveValue("");
      expect(q.getByLabelText(m.assignments.attempts)).toHaveValue(2);
      expect(q.getByLabelText(m.assignments.maxScore)).toHaveValue(100);
      expect(q.getByLabelText(m.assignments.maxFileSize)).toHaveValue(100);
      expect(
        q
          .getAllByRole("checkbox")
          .every((e) => (e as HTMLInputElement).checked),
      ).toBe(true);
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["teacher-course-assignments", "course-1"],
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["teacher-course-assignment-submissions", "course-1"],
      });
    });
    it("keeps course-wide null semantics, module reset and raw selector values", async () => {
      const { m } = mount(locale);
      const form = await formFor(m);
      const q = within(form);
      const selects = q.getAllByRole("combobox");
      change(selects[0], "module-1");
      change(selects[1], "lesson-1");
      change(selects[2], "aim-1");
      change(selects[0], "");
      expect(selects[1]).toHaveValue("");
      expect(selects[2]).toHaveValue("");
      for (const [label, raw] of [
        [m.assignments.arabicTitle, "AR"],
        [m.assignments.englishTitle, "EN"],
        [m.assignments.arabicInstructions, "ARI"],
        [m.assignments.englishInstructions, "ENI"],
      ])
        change(q.getByPlaceholderText(label), raw);
      const fieldset = q
        .getByText(m.assignmentFileTypes.legend)
        .closest("fieldset")!;
      const checks = within(fieldset).getAllByRole("checkbox");
      expect(checks).toHaveLength(9);
      checks.forEach((c) => fireEvent.click(c));
      expect(
        q.getByRole("button", { name: m.assignments.create }),
      ).toBeDisabled();
      fireEvent.click(q.getByLabelText("TXT"));
      fireEvent.click(q.getByLabelText("PDF"));
      fireEvent.submit(form);
      await waitFor(() =>
        expect(writes("/teacher/assignments", "POST")).toHaveLength(1),
      );
      expect(body("/teacher/assignments")).toEqual({
        courseId: "course-1",
        moduleId: null,
        lessonId: null,
        learningAimId: null,
        arabicTitle: "AR",
        englishTitle: "EN",
        arabicInstructions: "ARI",
        englishInstructions: "ENI",
        availableFromUtc: null,
        dueAtUtc: null,
        maxSubmissionAttempts: 2,
        maxScore: 100,
        allowResubmission: true,
        maxFileSizeBytes: 100 * 1024 * 1024,
        allowedFileExtensions: [".txt", ".pdf"],
      });
    });
    it("renders read-only gradebook, locale key/URL, four grades and unknown raw fallback", async () => {
      const { client, m } = mount(locale);
      await screen.findByText("RAW_UNKNOWN");
      expect(screen.getByText("toString")).toBeVisible();
      const section = screen
        .getByRole("heading", { name: m.gradebook.title })
        .closest("section")!;
      const q = within(section);
      expect(q.getByText(m.gradebook.description)).toBeVisible();
      for (const name of [
        m.gradebook.student,
        m.gradebook.lessons,
        m.gradebook.coursework,
        m.gradebook.predictedGrade,
      ])
        expect(q.getByRole("columnheader", { name })).toBeVisible();
      for (const name of Object.values(m.gradebook.grades))
        expect(q.getByText(name)).toBeVisible();
      expect(q.getByText("RAW name 0")).toBeVisible();
      expect(q.queryAllByRole("button")).toHaveLength(0);
      expect(
        client.getQueryCache().find({
          queryKey: ["teacher-course-gradebook", "course-1", locale],
          exact: true,
        }),
      ).toBeDefined();
      expect(apiMock).toHaveBeenCalledWith(
        `/gradebook/teacher/courses/course-1?locale=${locale}&page=1&pageSize=25`,
      );
    });
    it("retains localized assignment/submission empty states and gradebook error", async () => {
      assignments = [];
      submissions = [];
      failures.add(
        `/gradebook/teacher/courses/course-1?locale=${locale}&page=1&pageSize=25`,
      );
      const { m } = mount(locale);
      expect(await screen.findByText(m.assignments.empty)).toBeVisible();
      expect(
        await screen.findByText(m.assignments.noSubmissions),
      ).toBeVisible();
      expect(await screen.findByText(m.gradebook.loadError)).toBeVisible();
    });
    it("opens lazy extension queries, validates date/reason, grants, resets, invalidates and revokes", async () => {
      const { client, m } = mount(locale, true);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      expect(apiMock).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: m.deadlineExtensions.title }),
      );
      await screen.findByRole("option", { name: "RAW Student" });
      const base = "/teacher/assignments/assignment-1/deadline-extensions";
      expect(apiMock).toHaveBeenCalledWith(base);
      expect(apiMock).toHaveBeenCalledWith(base + "/eligible-students");
      expect(
        client.getQueryCache().find({
          queryKey: ["coursework-deadline-extensions", "assignment-1"],
          exact: true,
        }),
      ).toBeDefined();
      expect(
        client.getQueryCache().find({
          queryKey: ["coursework-extension-eligible-students", "assignment-1"],
          exact: true,
        }),
      ).toBeDefined();
      expect(
        screen.getByText(m.deadlineExtensions.privacyWarning),
      ).toBeVisible();
      const student = screen.getByLabelText(m.deadlineExtensions.student),
        date = screen.getByLabelText(m.deadlineExtensions.extendedDeadline),
        reason = screen.getByLabelText(m.deadlineExtensions.reason),
        grant = screen.getByRole("button", {
          name: m.deadlineExtensions.grant,
        });
      expect(reason).toHaveAttribute("maxlength", "500");
      change(student, "student-1");
      change(reason, " operational reason ");
      change(date, "2029-12-31T10:00");
      expect(grant).toBeDisabled();
      change(date, "2030-01-02T12:00");
      change(reason, " ");
      expect(grant).toBeDisabled();
      change(reason, "x".repeat(501));
      expect(grant).toBeDisabled();
      change(reason, "x".repeat(500));
      expect(grant).toBeEnabled();
      change(reason, " operational reason ");
      fireEvent.click(grant);
      await screen.findByText(m.deadlineExtensions.active);
      expect(body(base)).toEqual({
        studentUserId: "student-1",
        extendedDueAtUtc: new Date("2030-01-02T12:00").toISOString(),
        reason: "operational reason",
      });
      expect(student).toHaveValue("");
      expect(date).toHaveValue("");
      expect(reason).toHaveValue("");
      expect(
        screen.getByRole("option", { name: "RAW Student" }),
      ).toBeDisabled();
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["coursework-deadline-extensions", "assignment-1"],
      });
      const revoke = screen.getByRole("button", {
        name: m.deadlineExtensions.revoke,
      });
      confirm.mockReturnValueOnce(false);
      fireEvent.click(revoke);
      expect(writes(base + "/extension-1/revoke", "POST")).toHaveLength(0);
      fireEvent.click(revoke);
      await screen.findByText(m.deadlineExtensions.revoked);
      expect(confirm).toHaveBeenCalledWith(m.deadlineExtensions.revokeConfirm);
      expect(body(base + "/extension-1/revoke")).toEqual({ reason: null });
    });
    it("keeps extension access errors, no-base-deadline and disabled gates", async () => {
      assignments[0].dueAtUtc = undefined;
      failures.add("/teacher/assignments/assignment-1/deadline-extensions");
      const { m } = mount(locale, true, true);
      fireEvent.click(
        screen.getByRole("button", { name: m.deadlineExtensions.title }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        m.deadlineExtensions.loadError,
      );
      expect(
        screen.queryByRole("button", { name: m.deadlineExtensions.grant }),
      ).toBeNull();
      expect(screen.queryByLabelText(m.deadlineExtensions.student)).toBeNull();
    });
    it("keeps server titles/instructions, raw resource names/URLs, publish and scheduling guard", async () => {
      const { m } = mount(locale);
      const card = await cardFor(locale),
        q = within(card);
      expect(
        q.getByText(
          locale === "ar"
            ? assignment.arabicInstructions
            : assignment.englishInstructions,
        ),
      ).toBeVisible();
      expect(
        q.getByRole("link", { name: "RAW اسم resource.pdf" }),
      ).toHaveAttribute(
        "href",
        "/api/v1/assignments/assignment-1/resources/resource-1",
      );
      const state = q.getByLabelText(m.assignmentCard.state);
      expect(
        within(state)
          .getAllByRole("option")
          .map((o) => (o as HTMLOptionElement).value),
      ).toEqual(["Draft", "Published", "Scheduled", "Archived"]);
      const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
      change(state, "Scheduled");
      expect(alert).toHaveBeenCalledWith(m.assignmentCard.scheduleGuard);
      expect(
        writes("/teacher/assignments/assignment-1/publication", "POST"),
      ).toHaveLength(0);
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.publish }),
      );
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/assignment-1/publish", "POST"),
        ).toHaveLength(1),
      );
      expect(body("/teacher/assignments/assignment-1/publish")).toEqual({
        publish: true,
      });
      change(state, "Archived");
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/assignment-1/publication", "POST"),
        ).toHaveLength(1),
      );
      expect(body("/teacher/assignments/assignment-1/publication")).toEqual({
        publicationStatus: "Archived",
        availableFromUtc: null,
      });
    });
    it("keeps scheduled ISO publication, unpublish, and Draft-only edit/delete controls", async () => {
      assignments[0] = {
        ...assignments[0],
        publicationStatus: "Published",
        isPublished: true,
        availableFromUtc: "2030-01-01T12:00:00Z",
      };
      const { m } = mount(locale);
      const q = within(await cardFor(locale));
      expect(
        q.queryByRole("button", { name: m.assignmentCard.edit }),
      ).toBeNull();
      expect(
        q.queryByRole("button", { name: m.announcements.delete }),
      ).toBeNull();
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.unpublish }),
      );
      change(q.getByLabelText(m.assignmentCard.state), "Scheduled");
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/assignment-1/publication", "POST"),
        ).toHaveLength(1),
      );
      expect(body("/teacher/assignments/assignment-1/publish")).toEqual({
        publish: false,
      });
      expect(body("/teacher/assignments/assignment-1/publication")).toEqual({
        publicationStatus: "Scheduled",
        availableFromUtc: "2030-01-01T12:00:00Z",
      });
    });
    it("updates exact raw fields/numbers/date/IDs and closes editor; cancel restores persisted values", async () => {
      const { m } = mount(locale);
      const card = await cardFor(locale),
        q = within(card);
      fireEvent.click(q.getByRole("button", { name: m.assignmentCard.edit }));
      let form = q
          .getByRole("heading", { name: m.assignmentCard.editDetails })
          .closest("form")!,
        f = within(form);
      change(f.getByPlaceholderText(m.courseDetails.arabicTitle), "discard me");
      fireEvent.click(f.getByRole("button", { name: m.shared.cancel }));
      fireEvent.click(q.getByRole("button", { name: m.assignmentCard.edit }));
      form = q
        .getByRole("heading", { name: m.assignmentCard.editDetails })
        .closest("form")!;
      f = within(form);
      expect(f.getByPlaceholderText(m.courseDetails.arabicTitle)).toHaveValue(
        assignment.arabicTitle,
      );
      change(f.getByPlaceholderText(m.courseDetails.arabicTitle), " عربي خام ");
      change(
        f.getByPlaceholderText(m.courseDetails.englishTitle),
        " English raw ",
      );
      const textareas = f
        .getAllByRole("textbox")
        .filter((e) => e.tagName === "TEXTAREA");
      change(textareas[0], " تعليمات ");
      change(textareas[1], " Instructions ");
      change(
        f.getByLabelText(m.assignmentCard.availableFrom),
        "2030-01-02T09:00",
      );
      change(f.getByLabelText(m.assignmentCard.dueDate), "");
      change(f.getByLabelText(m.assignments.attempts), "4");
      change(f.getByLabelText(m.assignments.maxScore), "60");
      change(f.getByLabelText(m.assignments.maxFileSize), "8");
      fireEvent.click(f.getByLabelText(m.assignmentCard.allowResubmission));
      fireEvent.click(f.getByLabelText("ZIP"));
      fireEvent.submit(form);
      await waitFor(() =>
        expect(writes("/teacher/assignments/assignment-1", "PUT")).toHaveLength(
          1,
        ),
      );
      expect(body("/teacher/assignments/assignment-1", "PUT")).toEqual({
        moduleId: "module-1",
        lessonId: "lesson-1",
        learningAimId: "aim-1",
        arabicTitle: " عربي خام ",
        englishTitle: " English raw ",
        arabicInstructions: " تعليمات ",
        englishInstructions: " Instructions ",
        availableFromUtc: new Date("2030-01-02T09:00").toISOString(),
        dueAtUtc: null,
        maxSubmissionAttempts: 4,
        maxScore: 60,
        allowResubmission: false,
        maxFileSizeBytes: 8 * 1024 * 1024,
        allowedFileExtensions: extensions.filter((e) => e !== ".zip"),
      });
      await waitFor(() =>
        expect(
          q.queryByRole("heading", { name: m.assignmentCard.editDetails }),
        ).toBeNull(),
      );
    });
    it("uploads each file as FormData, clears selection and deletes raw resource ID", async () => {
      const { m } = mount(locale);
      const card = await cardFor(locale),
        q = within(card);
      const picker =
        card.querySelector<HTMLInputElement>('input[type="file"]')!;
      expect(picker.accept).toBe(
        ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png,.webp",
      );
      expect(picker.multiple).toBe(true);
      const files = [
        new File(["one"], "RAW-one.pdf", { type: "application/pdf" }),
        new File(["two"], "RAW-two.txt", { type: "text/plain" }),
      ];
      fireEvent.change(picker, { target: { files } });
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.uploadResources }),
      );
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/assignment-1/resources", "POST"),
        ).toHaveLength(2),
      );
      const calls = writes(
        "/teacher/assignments/assignment-1/resources",
        "POST",
      );
      calls.forEach((call, i) => {
        expect(call[1].body).toBeInstanceOf(FormData);
        expect(call[1].body.get("file")).toBe(files[i]);
        expect([...call[1].body.keys()]).toEqual(["file"]);
      });
      await waitFor(() =>
        expect(
          q.getByRole("button", { name: m.assignmentCard.uploadResources }),
        ).toBeDisabled(),
      );
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.deleteResource }),
      );
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/resources/resource-1", "DELETE"),
        ).toHaveLength(1),
      );
    });
    it("retains localized confirmations, exact criterion linking/custom payloads and resets", async () => {
      const { m } = mount(locale);
      const q = within(await cardFor(locale));
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const deletes = q.getAllByRole("button", {
        name: m.announcements.delete,
      });
      fireEvent.click(deletes[0]);
      expect(confirm).toHaveBeenLastCalledWith(m.assignmentCard.deleteConfirm);
      expect(
        writes("/teacher/assignments/assignment-1", "DELETE"),
      ).toHaveLength(0);
      confirm.mockReturnValue(true);
      fireEvent.click(deletes[0]);
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/assignment-1", "DELETE"),
        ).toHaveLength(1),
      );
      fireEvent.click(deletes[1]);
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/criteria/criterion-1", "DELETE"),
        ).toHaveLength(1),
      );
      expect(confirm).toHaveBeenLastCalledWith(
        m.assignmentCard.deleteCriterionConfirm,
      );
      const linked = q
        .getByRole("option", { name: new RegExp("A.M1") })
        .closest("select")!;
      change(linked, "btec-1");
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.attachCriterion }),
      );
      await waitFor(() =>
        expect(writes("/teacher/assignments/criteria", "POST")).toHaveLength(1),
      );
      expect(body("/teacher/assignments/criteria")).toEqual({
        assignmentId: "assignment-1",
        sortOrder: 2,
        btecCriterionId: "btec-1",
      });
      await waitFor(() => expect(linked).toHaveValue(""));
      change(q.getByPlaceholderText("A.P1"), " RAW.D2 ");
      const band = q
        .getByRole("option", { name: "D — Distinction" })
        .closest("select")!;
      change(band, "Distinction");
      change(
        q.getByPlaceholderText(m.assignmentCard.arabicDescription),
        " وصف خام ",
      );
      change(
        q.getByPlaceholderText(m.assignmentCard.englishDescription),
        " Raw description ",
      );
      fireEvent.click(
        q.getByRole("button", { name: m.assignmentCard.addCustomCriterion }),
      );
      await waitFor(() =>
        expect(writes("/teacher/assignments/criteria", "POST")).toHaveLength(2),
      );
      expect(body("/teacher/assignments/criteria")).toEqual({
        assignmentId: "assignment-1",
        sortOrder: 2,
        code: " RAW.D2 ",
        band: "Distinction",
        arabicDescription: " وصف خام ",
        englishDescription: " Raw description ",
      });
      await waitFor(() =>
        expect(q.getByPlaceholderText("A.P1")).toHaveValue(""),
      );
      expect(band).toHaveValue("Pass");
      expect(
        q.getByPlaceholderText(m.assignmentCard.arabicDescription),
      ).toHaveValue("");
      expect(
        q.getByPlaceholderText(m.assignmentCard.englishDescription),
      ).toHaveValue("");
    });
    it("keeps achievement values, feedback privacy/history/files and exact raw grading payload", async () => {
      const { m } = mount(locale);
      const q = within(await submissionFor());
      expect(
        q.getByRole("link", { name: "RAW اسم evidence.pdf" }),
      ).toHaveAttribute(
        "href",
        "/api/v1/assignments/submissions/submission-1/files/file-1",
      );
      expect(q.getByText(/RAW private history/)).toHaveTextContent(
        `${m.submissionReview.privatePrefix}↻ RAW private history`,
      );
      expect(q.getByText("RAW public history")).toBeVisible();
      expect(q.getByText("RAW-GRADE")).toBeVisible();
      const select = q.getByRole("combobox");
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => (o as HTMLOptionElement).value),
      ).toEqual([
        "Achieved",
        "PartiallyAchieved",
        "NotAchieved",
        "NotApplicable",
      ]);
      expect(select).toHaveValue("NotAchieved");
      change(select, "PartiallyAchieved");
      const criterion = q.getByPlaceholderText(
          m.submissionReview.criterionFeedback.replace("{code}", "A.P1"),
        ),
        overall = q.getByPlaceholderText(m.submissionReview.overallFeedback),
        privateNotes = q.getByPlaceholderText(m.submissionReview.privateNotes);
      expect(criterion).toHaveAttribute("maxlength", "4000");
      expect(privateNotes).toHaveAttribute("maxlength", "4000");
      change(criterion, " criterion raw ");
      change(overall, " overall raw ");
      change(privateNotes, " private raw ");
      fireEvent.click(q.getByRole("button", { name: m.submissionReview.save }));
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/submissions/submission-1/grade", "POST"),
        ).toHaveLength(1),
      );
      expect(
        body("/teacher/assignments/submissions/submission-1/grade"),
      ).toEqual({
        results: [
          {
            criterionId: "criterion-1",
            achievement: "PartiallyAchieved",
            feedback: " criterion raw ",
          },
        ],
        overallFeedback: " overall raw ",
        privateTeacherNotes: " private raw ",
      });
    });
    it("retains null grading feedback and whitespace revision gating/raw body", async () => {
      const { m } = mount(locale);
      const q = within(await submissionFor());
      fireEvent.click(q.getByRole("button", { name: m.submissionReview.save }));
      await waitFor(() =>
        expect(
          writes("/teacher/assignments/submissions/submission-1/grade", "POST"),
        ).toHaveLength(1),
      );
      expect(
        body("/teacher/assignments/submissions/submission-1/grade"),
      ).toEqual({
        results: [
          {
            criterionId: "criterion-1",
            achievement: "NotAchieved",
            feedback: null,
          },
        ],
        overallFeedback: null,
        privateTeacherNotes: null,
      });
      const revision = q.getByRole("button", {
          name: m.submissionReview.revision,
        }),
        feedback = q.getByPlaceholderText(m.submissionReview.overallFeedback);
      expect(revision).toBeDisabled();
      change(feedback, "  ");
      expect(revision).toBeDisabled();
      change(feedback, " raw revision ");
      fireEvent.click(revision);
      await waitFor(() =>
        expect(
          writes(
            "/teacher/assignments/submissions/submission-1/revision",
            "POST",
          ),
        ).toHaveLength(1),
      );
      expect(
        body("/teacher/assignments/submissions/submission-1/revision"),
      ).toEqual({ feedback: " raw revision " });
    });
    it.each(["Draft", "Graded", "RevisionRequested"])(
      "does not offer grading or revision for %s",
      async (status) => {
        submissions[0].status = status;
        const { m } = mount(locale);
        const q = within(await submissionFor());
        expect(
          q.queryByRole("button", { name: m.submissionReview.save }),
        ).toBeNull();
        expect(
          q.queryByRole("button", { name: m.submissionReview.revision }),
        ).toBeNull();
      },
    );
    it("keeps disabled course review gate", async () => {
      currentCourse.status = "Submitted";
      const { m } = mount(locale);
      const q = within(await submissionFor());
      expect(
        q.queryByRole("button", { name: m.submissionReview.save }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: m.reviewSubmission.submit }),
      ).toBeDisabled();
    });
    it("submits course bodylessly, invalidates only its existing key and localizes success", async () => {
      const { client, m } = mount(locale);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      expect(await screen.findByText(m.reviewSubmission.success)).toBeVisible();
      expect(writes("/teacher/courses/course-1/submit", "POST")[0][1]).toEqual({
        method: "POST",
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["teacher-course", "course-1"],
      });
    });
    it("retains known course validation mapping and unknown server reasons", async () => {
      reviewResult = {
        passed: false,
        reasons: ["Course title is required.", "RAW server reason"],
      };
      const { m } = mount(locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      expect(await screen.findByText("RAW server reason")).toBeVisible();
      expect(
        screen.getByText(
          locale === "ar" ? "أدخل عنوان الدورة." : "Course title is required.",
        ),
      ).toBeVisible();
      expect(screen.queryByText(m.reviewSubmission.success)).toBeNull();
    });
  },
);
