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
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";
import { invalidateCsrfToken } from "@/lib/api";

const courseId = "00000000-0000-0000-0000-000000000100";
const firstId = "00000000-0000-0000-0000-000000000101";
const resumeId = "00000000-0000-0000-0000-000000000102";
const lockedId = "00000000-0000-0000-0000-000000000103";
const fourthId = "00000000-0000-0000-0000-000000000104";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

function playerResponse(
  options: {
    currentLessonId?: string;
    requestedLessonRejected?: boolean;
    lockedReason?: string;
    availableAtUtc?: string;
  } = {},
) {
  return {
    id: courseId,
    title: "Resume course",
    resumeLessonId: resumeId,
    currentLessonId: options.currentLessonId ?? resumeId,
    previousLessonId: firstId,
    nextLessonId: fourthId,
    requestedLessonRejected: options.requestedLessonRejected ?? false,
    modules: [
      {
        id: "00000000-0000-0000-0000-000000000110",
        title: "Unit one",
        isLocked: false,
        lessons: [
          {
            id: firstId,
            title: "Completed introduction",
            body: "Introduction",
            durationSeconds: 0,
            type: "Text",
            isLocked: false,
            resources: [],
            isCompleted: true,
            lastPositionSeconds: 0,
          },
          {
            id: resumeId,
            title: "Resume video",
            body: "Video body",
            durationSeconds: 100,
            type: "Video",
            isLocked: false,
            video: {
              id: "00000000-0000-0000-0000-000000000120",
              displayName: "resume.mp4",
              contentType: "video/mp4",
            },
            resources: [],
            isCompleted: false,
            lastPositionSeconds: 42,
            lastVisitedAtUtc: "2026-09-16T08:00:00Z",
          },
          {
            id: lockedId,
            title: "Locked lesson",
            durationSeconds: 0,
            type: "Text",
            isLocked: true,
            lockReason: options.lockedReason ?? "CompletePrerequisite",
            availableAtUtc: options.availableAtUtc,
            resources: [],
            isCompleted: false,
            lastPositionSeconds: 0,
          },
          {
            id: fourthId,
            title: "Available follow-up",
            body: "Follow-up",
            durationSeconds: 0,
            type: "Text",
            isLocked: false,
            resources: [],
            isCompleted: false,
            lastPositionSeconds: 0,
          },
        ],
      },
    ],
  };
}

function installFetch(
  response = playerResponse(),
  extra?: (url: URL, init?: RequestInit) => Response | undefined,
) {
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), "https://betcco.test");
      if (url.pathname.endsWith(`/learning/courses/${courseId}/player`))
        return Response.json(response);
      if (url.pathname.endsWith("/security/antiforgery"))
        return Response.json({ token: "csrf-token" });
      if (url.pathname.endsWith(`/learning/lessons/${resumeId}/progress`)) {
        const request = JSON.parse(String(init?.body)) as {
          lastPositionSeconds: number;
          markCompleted: boolean;
        };
        return Response.json({
          isCompleted: request.markCompleted,
          lastPositionSeconds: request.lastPositionSeconds,
          lastVisitedAtUtc: "2026-09-16T08:01:00Z",
        });
      }
      const extraResponse = extra?.(url, init);
      if (extraResponse) return extraResponse;
      return Response.json(
        { message: "Not part of this focused test" },
        { status: 404 },
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPlayer(locale: "ar" | "en" = "en", requestedLessonId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <StudentArea
          segment={["learn", courseId]}
          requestedLessonId={requestedLessonId}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function installLearningFetch() {
  return installFetch(
    playerResponse({
      lockedReason: "AvailableOnDate",
      availableAtUtc: "2026-10-01T09:00:00Z",
    }),
    (url) => {
      if (
        url.pathname.endsWith(
          `/student-tools/courses/${courseId}/announcements`,
        )
      )
        return Response.json({ message: "Unavailable" }, { status: 503 });
      if (url.pathname.endsWith(`/learning/courses/${courseId}/resources`))
        return Response.json([
          {
            id: "resource-1",
            lessonId: resumeId,
            lessonTitle: "Server lesson title",
            displayName: "Course handout",
            contentType: "application/pdf",
            category: "PDF",
          },
          {
            id: "resource-2",
            lessonId: resumeId,
            lessonTitle: "Server lesson title",
            displayName: "Legacy file",
            contentType: "application/octet-stream",
            category: "LegacyPack",
          },
          {
            id: "resource-3",
            lessonId: resumeId,
            lessonTitle: "Server lesson title",
            displayName: "Code sample",
            contentType: "text/plain",
            category: "Code",
          },
        ]);
      if (url.pathname.endsWith("/student-tools/overview"))
        return Response.json({
          notes: [{ lessonId: resumeId, body: "Server note" }],
          bookmarks: [],
          calendar: [],
          certificates: [],
          upcomingAssignments: [],
          unreadNotifications: 0,
          achievements: [],
          pendingActions: [],
        });
      if (
        url.pathname.endsWith(`/course-community/courses/${courseId}/questions`)
      )
        return Response.json([
          {
            id: "question-1",
            lessonId: resumeId,
            body: "Server question",
            isResolved: true,
            replies: [
              { id: "reply-1", body: "Server reply", authorName: "Tutor" },
            ],
          },
        ]);
      if (url.pathname.endsWith(`/gradebook/student/courses/${courseId}`)) {
        const grade = {
          predictedGrade: "Pass",
          passAchieved: 1,
          passRequired: 2,
          meritAchieved: 0,
          meritRequired: 1,
          distinctionAchieved: 0,
          distinctionRequired: 1,
        };
        return Response.json({
          courseId,
          courseTitle: "Server course title",
          lessonProgressPercent: 50,
          lessonsCompleted: 1,
          lessonsTotal: 2,
          assignmentsCompleted: 1,
          assignmentsTotal: 1,
          predictedGrade: grade,
          units: [
            {
              unitId: "unit-1",
              unitTitle: "Server unit title",
              lessonProgressPercent: 50,
              lessonsCompleted: 1,
              lessonsTotal: 2,
              predictedGrade: { ...grade, predictedGrade: "LegacyGrade" },
              learningAims: [],
            },
          ],
          criteria: [
            {
              assignmentId: "assignment-1",
              assignmentTitle: "Server assignment",
              code: "P1",
              band: "Pass",
              status: "InReview",
            },
            {
              assignmentId: "assignment-2",
              assignmentTitle: "Server assignment",
              code: "M1",
              band: "Merit",
              status: "LegacyStatus",
            },
          ],
        });
      }
      if (url.pathname.endsWith(`/ai/courses/${courseId}/chat`))
        return Response.json({
          text: "Server AI reply",
          citations: ["Server citation\nprivate line"],
        });
      if (
        url.pathname.endsWith("/student-tools/notes") ||
        url.pathname.endsWith(`/student-tools/notes/${resumeId}`) ||
        url.pathname.endsWith(`/student-tools/bookmarks/${resumeId}`)
      )
        return Response.json({});
      return undefined;
    },
  );
}

describe("Student course player resume", () => {
  afterEach(() => {
    cleanup();
    invalidateCsrfToken();
    vi.restoreAllMocks();
  });

  it("renders the server-selected resume lesson and completed state", async () => {
    installFetch();
    renderPlayer();

    expect((await screen.findAllByText("Resume video"))[0]).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Completed introduction/ }),
    ).toHaveAttribute(
      "href",
      `/en/student/learn/${courseId}?lessonId=${firstId}`,
    );
    expect(screen.getByLabelText("Completed")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Locked lesson" }),
    ).toBeDisabled();
  });

  it("uses server-provided accessible previous and next targets", async () => {
    installFetch();
    renderPlayer();

    expect(
      await screen.findByRole("link", { name: "Previous lesson" }),
    ).toHaveAttribute(
      "href",
      `/en/student/learn/${courseId}?lessonId=${firstId}`,
    );
    expect(screen.getByRole("link", { name: "Next lesson" })).toHaveAttribute(
      "href",
      `/en/student/learn/${courseId}?lessonId=${fourthId}`,
    );
  });

  it("sends the explicit lesson target to the server but renders only its authorized response", async () => {
    const fetchMock = installFetch(
      playerResponse({ requestedLessonRejected: true }),
    );
    renderPlayer("en", lockedId);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That lesson is unavailable",
    );
    expect(screen.getAllByText("Resume video")[0]).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes(`lessonId=${lockedId}`),
      ),
    ).toBe(true);
  });

  it("restores the saved video position and bounds periodic progress writes", async () => {
    const fetchMock = installFetch();
    const { container } = renderPlayer();
    await screen.findAllByText("Resume video");
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    Object.defineProperty(video!, "duration", {
      value: 100,
      configurable: true,
    });

    fireEvent.loadedMetadata(video!);
    expect(video!.currentTime).toBe(42);
    video!.currentTime = 56;
    fireEvent.timeUpdate(video!);
    expect(progressCalls(fetchMock)).toHaveLength(0);
    video!.currentTime = 57;
    fireEvent.timeUpdate(video!);
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));
    video!.currentTime = 70;
    fireEvent.timeUpdate(video!);
    expect(progressCalls(fetchMock)).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Completes after 80% watched" }),
    ).toBeDisabled();
  });

  it("keeps Arabic direction and localized resume controls", async () => {
    installFetch();
    const { container } = renderPlayer("ar");

    expect(
      await screen.findByRole("link", { name: "الدرس التالي" }),
    ).toBeVisible();
    const region = container.querySelector("section[dir]");
    expect(region).not.toBeNull();
    expect(region!).toHaveAttribute("dir", "rtl");
  });

  it.each(["en", "ar"] as const)(
    "shows %s video loading, playback error, and a keyboard usable retry",
    async (locale) => {
      installFetch();
      const { container } = renderPlayer(locale);
      const loading =
        locale === "ar" ? "جارٍ تحميل الفيديو…" : "Loading video…";
      const retry = locale === "ar" ? "إعادة المحاولة" : "Retry video";
      expect(await screen.findByText(loading)).toHaveAttribute(
        "role",
        "status",
      );
      const firstVideo = container.querySelector("video")!;
      const media = within(firstVideo.parentElement!);
      fireEvent.error(firstVideo);
      expect(media.getByRole("alert")).toBeVisible();
      const retryButton = media.getByRole("button", { name: retry });
      retryButton.focus();
      await userEvent.setup().keyboard("{Enter}");
      expect(media.getByRole("status")).toHaveTextContent(loading);
      const retriedVideo = container.querySelector("video")!;
      expect(retriedVideo).not.toBe(firstVideo);
      expect(retriedVideo.getAttribute("src")).toContain("retry=1");
      fireEvent.canPlay(retriedVideo);
      expect(media.queryByRole("status")).not.toBeInTheDocument();
    },
  );
});

describe.each([
  [
    "en",
    {
      previous: "Previous lesson",
      next: "Next lesson",
      locked: "This content opens on",
      video: "Resume video video",
      videoLoading: "Loading video…",
      videoRetry: "Retry video",
      announcements: "Course announcements",
      announcementError: "Announcements could not be loaded now.",
      resources: "Resource center",
      filter: "Filter resources",
      all: "All types",
      code: "Code",
      note: "Private note",
      notePlaceholder: "Write a note only you can see…",
      saveNote: "Save note",
      delete: "Delete",
      bookmark: "Save bookmark",
      askTeacher: "Ask the course teacher",
      questionPlaceholder: "Ask about this lesson…",
      sendQuestion: "Send question",
      answered: "Answered",
      tutor: "BETCCO AI Tutor",
      plan: "Plan",
      aiPlaceholder: "Ask about this lesson or request a practice plan…",
      askForHelp: "Ask for help",
      sources: "Sources used:",
      gradebook: "Your progress and predicted grade",
      predicted: "Predicted grade",
      grade: "Pass",
      criterionHeading: "BTEC criterion status",
      criterion: "In review",
    },
  ],
  [
    "ar",
    {
      previous: "الدرس السابق",
      next: "الدرس التالي",
      locked: "يفتح هذا المحتوى في",
      video: "فيديو Resume video",
      videoLoading: "جارٍ تحميل الفيديو…",
      videoRetry: "إعادة المحاولة",
      announcements: "إعلانات الدورة",
      announcementError: "تعذر تحميل الإعلانات الآن.",
      resources: "مركز الموارد",
      filter: "تصفية الموارد",
      all: "كل الأنواع",
      code: "كود",
      note: "ملاحظة خاصة",
      notePlaceholder: "اكتب ملاحظة لا يراها سواك…",
      saveNote: "حفظ الملاحظة",
      delete: "حذف",
      bookmark: "حفظ إشارة مرجعية",
      askTeacher: "اسأل معلم الدورة",
      questionPlaceholder: "اكتب سؤالك المتعلق بهذا الدرس…",
      sendQuestion: "إرسال السؤال",
      answered: "تمت الإجابة",
      tutor: "مساعد BETCCO الذكي",
      plan: "خطّط",
      aiPlaceholder: "اسأل عن محتوى هذا الدرس أو اطلب خطة تدريب…",
      askForHelp: "اطلب المساعدة",
      sources: "المصادر المستخدمة:",
      gradebook: "تقدّمك ودرجتك المتوقعة",
      predicted: "النتيجة المتوقعة",
      grade: "نجاح",
      criterionHeading: "حالة معايير BTEC",
      criterion: "قيد المراجعة",
    },
  ],
] as const)("localized course learning in %s", (locale, copy) => {
  afterEach(() => {
    cleanup();
    invalidateCsrfToken();
    vi.restoreAllMocks();
  });

  it("renders player, video, announcements and resource labels", async () => {
    installLearningFetch();
    const { container } = renderPlayer(locale);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Resume video" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Unit one" })).toBeVisible();
    expect(screen.getByRole("link", { name: copy.previous })).toHaveAttribute(
      "href",
      `/${locale}/student/learn/${courseId}?lessonId=${firstId}`,
    );
    expect(screen.getByRole("link", { name: copy.next })).toHaveAttribute(
      "href",
      `/${locale}/student/learn/${courseId}?lessonId=${fourthId}`,
    );
    expect(
      screen.getByRole("button", { name: "Locked lesson" }),
    ).toHaveAttribute("title", expect.stringContaining(copy.locked));
    expect(container.querySelector("section[dir]")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    expect(screen.getByLabelText(copy.video)).toBeVisible();
    expect(screen.getByText(copy.videoLoading)).toHaveAttribute(
      "role",
      "status",
    );
    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByRole("button", { name: copy.videoRetry })).toBeVisible();
    expect(await screen.findByText(copy.announcements)).toBeVisible();
    expect(screen.getByText(copy.announcementError)).toBeVisible();
    expect(await screen.findByText(copy.resources)).toBeVisible();
    const filter = screen.getByRole("combobox", { name: copy.filter });
    expect(filter).toHaveValue("All");
    expect(screen.getByRole("option", { name: copy.all })).toBeVisible();
    expect(screen.getByRole("option", { name: copy.code })).toBeVisible();
    expect(screen.getByRole("option", { name: "LegacyPack" })).toBeVisible();
    expect(screen.getByText("Course handout")).toBeVisible();
    expect(screen.getAllByText(/LegacyPack/).length).toBeGreaterThan(1);
  });

  it("renders notes, questions, tutor and gradebook while keeping API enums and fallbacks", async () => {
    const fetchMock = installLearningFetch();
    renderPlayer(locale);
    expect(await screen.findByText(copy.note)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByPlaceholderText(copy.notePlaceholder)).toHaveValue(
        "Server note",
      ),
    );
    expect(screen.getByRole("button", { name: copy.saveNote })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.delete })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.bookmark })).toBeVisible();
    expect(screen.getByText(copy.askTeacher)).toBeVisible();
    expect(screen.getByPlaceholderText(copy.questionPlaceholder)).toBeVisible();
    expect(
      screen.getByRole("button", { name: copy.sendQuestion }),
    ).toBeVisible();
    expect(screen.getByText(copy.answered)).toBeVisible();
    expect(screen.getByText("Server question")).toBeVisible();
    expect(screen.getByText(copy.tutor)).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.saveNote }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/student-tools/notes") &&
            init?.method === "POST" &&
            JSON.parse(String(init.body)).lessonId === resumeId &&
            JSON.parse(String(init.body)).body === "Server note",
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: copy.delete }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(`/student-tools/notes/${resumeId}`) &&
            init?.method === "DELETE",
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: copy.bookmark }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(`/student-tools/bookmarks/${resumeId}`) &&
            init?.method === "POST",
        ),
      ).toBe(true),
    );
    await user.type(
      screen.getByPlaceholderText(copy.questionPlaceholder),
      "How does this work?",
    );
    await user.click(screen.getByRole("button", { name: copy.sendQuestion }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(
              `/course-community/courses/${courseId}/questions`,
            ) &&
            init?.method === "POST" &&
            JSON.parse(String(init.body)).body === "How does this work?" &&
            JSON.parse(String(init.body)).lessonId === resumeId,
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: copy.plan }));
    await user.type(
      screen.getByPlaceholderText(copy.aiPlaceholder),
      "Help me study",
    );
    await user.click(screen.getByRole("button", { name: copy.askForHelp }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(`/ai/courses/${courseId}/chat`) &&
            JSON.parse(String(init?.body)).mode === "Plan",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Server AI reply")).toBeVisible();
    expect(screen.getByText(new RegExp(copy.sources))).toBeVisible();
    expect(await screen.findByText(copy.gradebook)).toBeVisible();
    expect(screen.getByText(copy.predicted)).toBeVisible();
    expect(screen.getByText(copy.grade)).toBeVisible();
    expect(screen.getByText(copy.criterionHeading)).toBeVisible();
    await user.click(screen.getByText(copy.criterionHeading));
    expect(screen.getByText(copy.criterion)).toBeVisible();
    expect(screen.getByText(/LegacyGrade/)).toBeVisible();
    expect(screen.getByText("LegacyStatus")).toBeVisible();
  });
});

function progressCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).endsWith(`/learning/lessons/${resumeId}/progress`),
  );
}
describe("lesson-first workspace", () => {
  afterEach(() => {
    cleanup();
    invalidateCsrfToken();
    vi.restoreAllMocks();
  });
  it("places content and navigation before real Unit/Aim context and unchanged practice slots", async () => {
    const units = [
      {
        id: "unit-real",
        englishTitle: "Authoritative Unit",
        arabicTitle: "الوحدة المعتمدة",
        aims: [
          {
            id: "aim-real",
            code: "A",
            englishTitle: "Authoritative Aim",
            arabicTitle: "الهدف المعتمد",
            isUnlocked: true,
            contentTotal: 2,
            contentCompleted: 1,
            contentComplete: false,
            practiceAvailable: false,
            practiceStatus: "Locked",
            isComplete: false,
            maxAttempts: 0,
            attemptsUsed: 0,
            attemptsRemaining: 0,
            attemptHistory: [],
          },
        ],
        finalPractice: {
          isAvailable: false,
          status: "NotConfigured",
          isTrainingComplete: false,
        },
      },
    ];
    installFetch(playerResponse(), (url) =>
      url.pathname.endsWith("/learning-aim-practice")
        ? Response.json(units)
        : undefined,
    );
    const { container } = renderPlayer();
    const progress = await screen.findByRole("heading", {
      name: "My progress",
    });
    const lesson = screen.getByRole("heading", {
      level: 1,
      name: "Resume video",
    });
    const next = screen.getByRole("link", { name: "Next lesson" });
    expect(
      lesson.compareDocumentPosition(progress) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      next.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const secondary = progress.closest("section")!.parentElement!;
    expect(secondary.children.length).toBeGreaterThan(3);
    expect(lesson.closest("header")).not.toHaveTextContent("Authoritative Aim");
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(container).not.toHaveTextContent("Lesson Objective");
  });
  it("collapses and reopens the contextual desktop outline", async () => {
    installFetch();
    renderPlayer();
    const hide = await screen.findByRole("button", { name: "Hide content" });
    expect(screen.getByRole("link", { name: "Resume video" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.setup().click(hide);
    expect(
      screen.queryByRole("heading", { name: "Unit one" }),
    ).not.toBeInTheDocument();
    const show = screen.getByRole("button", { name: "Show content" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(show);
    expect(screen.getByRole("heading", { name: "Unit one" })).toBeVisible();
  });
  it.each(["en", "ar"] as const)(
    "traps and restores %s mobile outline focus",
    async (locale) => {
      installFetch();
      renderPlayer(locale);
      await screen.findByRole("heading", { level: 1, name: "Resume video" });
      const user = userEvent.setup(),
        opener = screen.getByRole("button", {
          name: locale === "ar" ? "محتوى الدورة" : "Course content",
        });
      const previousOverflow = document.body.style.overflow;
      await user.click(opener);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      expect(
        within(dialog).getByRole("link", { name: "Resume video" }),
      ).toHaveFocus();
      expect(document.body.style.overflow).toBe("hidden");
      within(dialog).getByRole("link", { name: "Available follow-up" }).focus();
      await user.keyboard("{Tab}");
      expect(
        within(dialog).getByRole("button", {
          name: locale === "ar" ? "إخفاء المحتوى" : "Hide content",
        }),
      ).toHaveFocus();
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(
        within(dialog).getByRole("link", { name: "Available follow-up" }),
      ).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(document.body.style.overflow).toBe(previousOverflow);
    },
  );
  it("keeps locked reasons inline and excludes private content and resources", async () => {
    const response = playerResponse({
      currentLessonId: lockedId,
      lockedReason: "AvailableOnDate",
      availableAtUtc: "2026-11-01T09:00:00Z",
    });
    const locked = response.modules[0].lessons[2];
    Object.assign(locked, {
      body: "Private lesson body",
      resources: [
        {
          id: "private-file",
          displayName: "Private resource",
          contentType: "application/pdf",
        },
      ],
    });
    installFetch(response);
    renderPlayer();
    await screen.findByRole("heading", { level: 1, name: "Locked lesson" });
    const button = screen.getByRole("button", { name: "Locked lesson" });
    expect(button).toBeDisabled();
    expect(
      document.getElementById(button.getAttribute("aria-describedby")!),
    ).toHaveTextContent("This content opens on");
    expect(screen.queryByText("Private lesson body")).not.toBeInTheDocument();
    expect(screen.queryByText("Private resource")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Locked lesson" }),
    ).not.toBeInTheDocument();
  });
  it("retains native video attributes and the exact 80 percent completion boundary", async () => {
    const fetchMock = installFetch();
    const { container } = renderPlayer();
    await screen.findByRole("heading", { level: 1, name: "Resume video" });
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
    Object.defineProperty(video, "duration", {
      value: 100,
      configurable: true,
    });
    fireEvent.loadedMetadata(video);
    video.currentTime = 79;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));
    expect(
      JSON.parse(String(progressCalls(fetchMock)[0][1].body)).markCompleted,
    ).toBe(false);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Completes after 80% watched" }),
      ).not.toHaveAttribute("aria-busy", "true"),
    );
    video.currentTime = 80;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(2));
    expect(JSON.parse(String(progressCalls(fetchMock)[1][1].body))).toEqual({
      lastPositionSeconds: 80,
      markCompleted: true,
    });
  });
  it("preserves manual text completion and prevents duplicate pending submissions", async () => {
    const response = playerResponse();
    Object.assign(response.modules[0].lessons[1], {
      type: "Text",
      video: undefined,
    });
    const fetchMock = installFetch(response);
    const baseFetch = fetchMock.getMockImplementation()!;
    let finishSave!: (response: Response) => void;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith(`/learning/lessons/${resumeId}/progress`))
        return new Promise<Response>((resolve) => {
          finishSave = resolve;
        });
      return baseFetch(input, init);
    });
    renderPlayer();
    const complete = await screen.findByRole("button", {
      name: "Mark complete",
    });
    await userEvent.setup().click(complete);
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));
    expect(complete).toBeDisabled();
    fireEvent.click(complete);
    expect(progressCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(progressCalls(fetchMock)[0][1].body))).toEqual({
      lastPositionSeconds: 42,
      markCompleted: true,
    });
    finishSave(Response.json({ isCompleted: true, lastPositionSeconds: 42 }));
  });
  it("preserves internal and external resource destinations", async () => {
    const response = playerResponse();
    Object.assign(response.modules[0].lessons[1], {
      resources: [
        {
          id: "internal",
          displayName: "Lesson handout",
          contentType: "application/pdf",
        },
        {
          id: "external",
          displayName: "Official reference",
          contentType: "text/html",
          externalUrl: "https://example.org/reference",
        },
      ],
    });
    installFetch(response);
    renderPlayer();
    expect(
      await screen.findByRole("link", { name: "Lesson handout" }),
    ).toHaveAttribute(
      "href",
      `/api/v1/learning/lessons/${resumeId}/resources/internal`,
    );
    const external = screen.getByRole("link", { name: "Official reference" });
    expect(external).toHaveAttribute("href", "https://example.org/reference");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noreferrer");
  });
});
