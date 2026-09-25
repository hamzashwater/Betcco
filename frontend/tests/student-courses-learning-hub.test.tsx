import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";
import {
  StudentCoursesLearningHub,
  type StudentCourseLearningHubItem,
  type StudentCoursesLearningHubResult,
} from "@/features/student/student-courses-learning-hub";

const now = "2026-09-15T10:00:00Z";
const courses: StudentCourseLearningHubItem[] = [
  {
    courseId: "alpha",
    arabicTitle: "دورة ألفا",
    englishTitle: "Alpha course",
    localizedTitle: "Alpha course",
    completedLessons: 0,
    totalLessons: 4,
    publishedModuleCount: 2,
    progressPercent: 0,
    progressState: "NotStarted",
    hasCover: false,
    teacherName: "Teacher One",
    enrolledAtUtc: now,
    accessAvailable: true,
  },
  {
    courseId: "beta",
    arabicTitle: "دورة بيتا",
    englishTitle: "Beta course",
    localizedTitle: "Beta course",
    completedLessons: 1,
    totalLessons: 3,
    publishedModuleCount: 1,
    progressPercent: 33.33,
    progressState: "InProgress",
    hasCover: true,
    teacherName: null,
    enrolledAtUtc: now,
    recentProgressAtUtc: now,
    accessAvailable: true,
  },
  {
    courseId: "gamma",
    arabicTitle: "دورة جاما",
    englishTitle: "Gamma course",
    localizedTitle: "Gamma course",
    completedLessons: 2,
    totalLessons: 2,
    publishedModuleCount: 1,
    progressPercent: 100,
    progressState: "Completed",
    hasCover: false,
    teacherName: "Teacher Two",
    enrolledAtUtc: now,
    accessAvailable: true,
  },
];

function response(
  items: StudentCourseLearningHubItem[] = courses,
  options: Partial<StudentCoursesLearningHubResult> = {},
): StudentCoursesLearningHubResult {
  return {
    items,
    page: 1,
    pageSize: 12,
    totalCount: items.length,
    summary: {
      totalCourses: items.length,
      notStarted: items.filter((item) => item.progressState === "NotStarted")
        .length,
      inProgress: items.filter((item) => item.progressState === "InProgress")
        .length,
      completed: items.filter((item) => item.progressState === "Completed")
        .length,
      completedLessons: 3,
      totalLessons: 9,
      progressPercent: 33.33,
    },
    ...options,
  };
}

function localized(items: StudentCourseLearningHubItem[], locale: string) {
  return items.map((item) => ({
    ...item,
    localizedTitle: locale === "ar" ? item.arabicTitle : item.englishTitle,
  }));
}

function installDefaultFetch() {
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
      const locale = url.searchParams.get("locale") ?? "en";
      const search = (url.searchParams.get("search") ?? "").toLocaleLowerCase();
      const filter = url.searchParams.get("progress") ?? "All";
      const sort = url.searchParams.get("sort") ?? "Recent";
      let items = localized(courses, locale).filter(
        (course) =>
          (!search ||
            course.arabicTitle.toLocaleLowerCase().includes(search) ||
            course.englishTitle.toLocaleLowerCase().includes(search)) &&
          (filter === "All" || course.progressState === filter),
      );
      if (sort === "Title")
        items = [...items].sort((left, right) =>
          left.localizedTitle.localeCompare(right.localizedTitle),
        );
      if (sort === "Progress")
        items = [...items].sort(
          (left, right) => right.progressPercent - left.progressPercent,
        );
      return Response.json(response(items));
    }),
  );
}

function renderWithProviders(
  content: React.ReactNode,
  locale: "ar" | "en" = "en",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        {content}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("StudentCoursesLearningHub", () => {
  beforeEach(installDefaultFetch);

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the full learning hub on the dedicated student courses route", async () => {
    renderWithProviders(<StudentArea segment={["courses"]} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "My courses" }),
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Search courses" }),
    ).toBeVisible();
  });

  it("renders a compact dashboard preview without full controls", async () => {
    renderWithProviders(<StudentArea segment={[]} />);
    expect(
      await screen.findByRole("heading", { name: "Continue learning" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View all courses" }),
    ).toHaveAttribute("href", "/en/student/courses");
    expect(
      screen.queryByRole("searchbox", { name: "Search courses" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Sort courses" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Filter courses by progress" }),
    ).not.toBeInTheDocument();
  });

  it("renders enrolled course data and the exact server percentage", async () => {
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(await screen.findByText("Beta course")).toBeVisible();
    expect(screen.getByText("33.33%")).toBeVisible();
    expect(screen.getByText("1/3 lessons completed")).toBeVisible();
  });

  it.each([
    ["Start learning", "/en/student/learn/alpha"],
    ["Continue learning", "/en/student/learn/beta"],
    ["Review course", "/en/student/learn/gamma"],
  ])("uses the server progress state for the %s action", async (name, href) => {
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(
      await screen.findByRole("link", { name: new RegExp(`^${name}:`) }),
    ).toHaveAttribute("href", href);
  });

  it("searches Arabic titles from the English interface", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    await screen.findByText("Alpha course");
    await user.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "بيتا",
    );
    expect(await screen.findByText("Beta course")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("searches English titles from the Arabic interface", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />, "ar");
    await screen.findByText("دورة ألفا");
    await user.type(
      screen.getByRole("searchbox", { name: "البحث في الدورات" }),
      "gamma",
    );
    expect(await screen.findByText("دورة جاما")).toBeVisible();
    expect(screen.queryByText("دورة ألفا")).not.toBeInTheDocument();
  });

  it("requests and renders a server progress filter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(await screen.findByText("Gamma course")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("requests and renders server title and progress sorting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    const sort = await screen.findByRole("combobox", { name: "Sort courses" });
    await user.selectOptions(sort, "Progress");
    let list = screen.getByRole("list", { name: "Student courses" });
    expect(
      within(list).getAllByRole("heading", { level: 3 })[0],
    ).toHaveTextContent("Gamma course");
    await user.selectOptions(sort, "Title");
    list = screen.getByRole("list", { name: "Student courses" });
    expect(
      within(list).getAllByRole("heading", { level: 3 })[0],
    ).toHaveTextContent("Alpha course");
  });

  it("provides accessible bounded pagination", async () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      ...courses[0],
      courseId: `course-${index}`,
      englishTitle: `Course ${index + 1}`,
      localizedTitle: `Course ${index + 1}`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input), "https://betcco.test");
        const page = Number(url.searchParams.get("page") ?? 1);
        return Response.json(
          response(page === 1 ? many.slice(0, 12) : many.slice(12), {
            page,
            pageSize: 12,
            totalCount: 13,
            summary: { ...response().summary, totalCourses: 13 },
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    const next = await screen.findByRole("button", { name: "Next" });
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
    await user.click(next);
    expect(await screen.findByText("Course 13")).toBeVisible();
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
  });

  it("shows the empty enrollment state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(response([]))),
    );
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(
      await screen.findByText(
        "You are not enrolled in a published course yet.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("shows and resets the no-match state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    await screen.findByText("Alpha course");
    await user.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "missing",
    );
    expect(
      await screen.findByText(
        "No courses match the selected search and progress filter.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show all courses" }));
    expect(await screen.findByText("Alpha course")).toBeVisible();
  });

  it("shows an accessible loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(screen.getByText("Loading your courses…")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows an API error and retries", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1)
          return Response.json({ message: "Failed" }, { status: 500 });
        return Response.json(response());
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your courses could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alpha course")).toBeVisible();
  });

  it("renders a missing-cover fallback and handles optional teacher names", async () => {
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(
      (await screen.findAllByTestId("course-cover-fallback")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Teacher One")).toBeVisible();
    expect(screen.queryByText("Teacher unavailable")).not.toBeInTheDocument();
  });

  it("does not derive completion from lesson counts in the frontend", async () => {
    const inconsistent = {
      ...courses[1],
      completedLessons: 3,
      totalLessons: 3,
      progressPercent: 41.5,
      progressState: "InProgress" as const,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(response([inconsistent]))),
    );
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(
      await screen.findByRole("link", {
        name: "Continue learning: Beta course",
      }),
    ).toBeVisible();
    expect(screen.getByText("41.5%")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Review course/ }),
    ).not.toBeInTheDocument();
  });

  it("does not create an actionable learning link when server access is unavailable", async () => {
    const locked = {
      ...courses[0],
      accessAvailable: false,
      accessReason: "CompletePrerequisite",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(response([locked]))),
    );
    renderWithProviders(<StudentCoursesLearningHub />);
    expect(
      await screen.findByText("Learning access is currently unavailable"),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("link", { name: /Start learning/ }),
    ).not.toBeInTheDocument();
  });

  it("uses Arabic catalog copy and RTL direction", async () => {
    renderWithProviders(<StudentCoursesLearningHub />, "ar");
    const region = await screen.findByRole("region", { name: "دوراتي" });
    expect(region).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("group", { name: "تصفية الدورات حسب التقدم" }),
    ).toBeVisible();
  });

  it("uses English catalog copy and LTR direction", async () => {
    renderWithProviders(<StudentCoursesLearningHub />);
    const region = await screen.findByRole("region", { name: "My courses" });
    expect(region).toHaveAttribute("dir", "ltr");
  });

  it("keeps search, filters, and sorting keyboard reachable with visible focus classes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentCoursesLearningHub />);
    await screen.findByText("Alpha course");
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Open AI practice" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("searchbox", { name: "Search courses" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("searchbox", { name: "Search courses" }),
    ).toHaveClass("focus-ring");
  });
});
