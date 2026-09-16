import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";
import { invalidateCsrfToken } from "@/lib/api";

const courseId = "00000000-0000-0000-0000-000000000100";
const firstId = "00000000-0000-0000-0000-000000000101";
const resumeId = "00000000-0000-0000-0000-000000000102";
const lockedId = "00000000-0000-0000-0000-000000000103";
const fourthId = "00000000-0000-0000-0000-000000000104";

function playerResponse(
  options: {
    currentLessonId?: string;
    requestedLessonRejected?: boolean;
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
            lockReason: "CompletePrerequisite",
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

function installFetch(response = playerResponse()) {
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
      expect(await screen.findByRole("status")).toHaveTextContent(loading);
      const firstVideo = container.querySelector("video")!;
      fireEvent.error(firstVideo);
      expect(screen.getByRole("alert")).toBeVisible();
      const retryButton = screen.getByRole("button", { name: retry });
      retryButton.focus();
      await userEvent.setup().keyboard("{Enter}");
      expect(screen.getByRole("status")).toHaveTextContent(loading);
      const retriedVideo = container.querySelector("video")!;
      expect(retriedVideo).not.toBe(firstVideo);
      expect(retriedVideo.getAttribute("src")).toContain("retry=1");
      fireEvent.canPlay(retriedVideo);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );
});

function progressCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).endsWith(`/learning/lessons/${resumeId}/progress`),
  );
}
