import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";

const courseResult = {
  items: [
    {
      courseId: "course-1",
      arabicTitle: "دورة تقنية المعلومات",
      englishTitle: "Information Technology",
      localizedTitle: "Information Technology",
      completedLessons: 2,
      totalLessons: 8,
      publishedModuleCount: 2,
      progressPercent: 25,
      progressState: "InProgress",
      hasCover: false,
      teacherName: "Teacher One",
      enrolledAtUtc: "2026-09-20T10:00:00Z",
      accessAvailable: true,
    },
  ],
  page: 1,
  pageSize: 100,
  totalCount: 1,
  summary: {
    totalCourses: 1,
    notStarted: 0,
    inProgress: 1,
    completed: 0,
    completedLessons: 2,
    totalLessons: 8,
    progressPercent: 25,
  },
};

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = new URL(String(input), "https://betcco.test");
      if (url.pathname.endsWith("/student-tools/overview")) {
        return Response.json({
          notes: [],
          bookmarks: [],
          calendar: [],
          certificates: [],
          upcomingAssignments: [],
          unreadNotifications: 0,
          achievements: [],
        });
      }
      if (url.pathname.endsWith("/learning/my-courses")) {
        const locale = url.searchParams.get("locale") ?? "en";
        return Response.json({
          ...courseResult,
          items: courseResult.items.map((course) => ({
            ...course,
            localizedTitle:
              locale === "ar" ? course.arabicTitle : course.englishTitle,
          })),
        });
      }
      return Response.json({});
    }),
  );
}

function renderStudent(segment: string[], locale: "ar" | "en" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <StudentArea segment={segment} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
describe("AI Practice UI shell", () => {
  beforeEach(installFetch);

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes the AI practice workspace from My Courses", async () => {
    renderStudent(["courses"]);

    expect(
      await screen.findByRole("heading", { name: "AI Practice Assistant" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open AI practice" }),
    ).toHaveAttribute("href", "/en/student/ai-practice");
  });

  it("renders a non-operational formative workspace with real enrolled courses", async () => {
    const user = userEvent.setup();
    renderStudent(["ai-practice"]);

    expect(
      screen.getByRole("heading", { level: 1, name: "AI Practice Assistant" }),
    ).toBeVisible();
    const course = screen.getByRole("combobox", { name: "Course" });
    await screen.findByRole("option", { name: "Information Technology" });
    await user.selectOptions(course, "course-1");
    expect(screen.getByText("Information Technology selected")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Upload not enabled yet" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Analyze practice" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/does not issue official BTEC grades/i),
    ).toBeVisible();
    expect(screen.getByText(/No AI request is made/i)).toBeVisible();
  });

  it("renders the Arabic shell and keeps the AI engine clearly unavailable", async () => {
    renderStudent(["ai-practice"], "ar");

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "مساعد التدريب بالذكاء الاصطناعي",
      }),
    ).toBeVisible();
    expect(await screen.findByText("المحرك قريبًا")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "الرفع غير مفعّل بعد" }),
    ).toBeDisabled();
  });
});
