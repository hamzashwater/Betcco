import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import {
  TeacherCoursesManagement,
  type TeacherCourse,
} from "@/features/teacher/teacher-courses-management";

const courses: TeacherCourse[] = [
  {
    id: "draft",
    arabicTitle: "دورة ألف",
    englishTitle: "Alpha course",
    status: "Draft",
    price: 0,
    isFree: true,
    hasCover: true,
    moduleCount: 1,
    lessonCount: 2,
  },
  {
    id: "submitted",
    arabicTitle: "دورة باء",
    englishTitle: "Beta review",
    status: "SubmittedForReview",
    price: 12.5,
    isFree: false,
    hasCover: false,
    moduleCount: 2,
    lessonCount: 4,
  },
  {
    id: "published",
    arabicTitle: "دورة جيم",
    englishTitle: "Gamma published",
    status: "Published",
    price: 20,
    isFree: false,
    hasCover: true,
    moduleCount: 3,
    lessonCount: 6,
  },
  {
    id: "rejected",
    arabicTitle: "دورة دال",
    englishTitle: "Delta rejected",
    status: "Rejected",
    price: 0,
    isFree: true,
    hasCover: false,
    moduleCount: 1,
    lessonCount: 0,
  },
  {
    id: "approved",
    arabicTitle: "دورة هاء",
    englishTitle: "Epsilon approved",
    status: "Approved",
    price: 8,
    isFree: false,
    hasCover: true,
    moduleCount: 0,
    lessonCount: 0,
  },
  {
    id: "scheduled",
    arabicTitle: "دورة واو",
    englishTitle: "Eta scheduled",
    status: "Scheduled",
    price: 0,
    isFree: true,
    hasCover: true,
    moduleCount: 0,
    lessonCount: 2,
  },
  {
    id: "archived",
    arabicTitle: "دورة زاي",
    englishTitle: "Zeta archived",
    status: "Archived",
    price: 5,
    isFree: false,
    hasCover: false,
    moduleCount: 0,
    lessonCount: 1,
  },
];

function renderCourses(locale: "ar" | "en" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const messages = locale === "ar" ? arMessages : enMessages;
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <TeacherCoursesManagement />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function courseTitles(listName = "Teacher courses") {
  const list = await screen.findByRole("list", { name: listName });
  return within(list)
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

describe("TeacherCoursesManagement", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(courses), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders existing course metadata", async () => {
    renderCourses();
    expect(await screen.findByText("Alpha course")).toBeVisible();
    expect(screen.getAllByText("1 module").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 lessons").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cover ready").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/JOD/).length).toBeGreaterThan(0);
  });

  it("searches Arabic titles from the English interface", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "باء",
    );
    expect(screen.getByText("Beta review")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("searches English titles from the Arabic interface", async () => {
    const user = userEvent.setup();
    renderCourses("ar");
    await screen.findByText("دورة ألف");
    await user.type(
      screen.getByRole("searchbox", { name: "البحث في الدورات" }),
      "gamma",
    );
    expect(screen.getByText("دورة جيم")).toBeVisible();
    expect(screen.queryByText("دورة ألف")).not.toBeInTheDocument();
  });

  it("filters Draft courses", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Draft" }));
    expect(screen.getByText("Alpha course")).toBeVisible();
    expect(screen.queryByText("Beta review")).not.toBeInTheDocument();
  });

  it("filters SubmittedForReview courses", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(
      screen.getByRole("button", { name: "Submitted for review" }),
    );
    expect(screen.getByText("Beta review")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("filters Published courses", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Published" }));
    expect(screen.getByText("Gamma published")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("filters Rejected courses", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Rejected" }));
    expect(screen.getByText("Delta rejected")).toBeVisible();
    expect(screen.queryByText("Alpha course")).not.toBeInTheDocument();
  });

  it("keeps Approved, Archived, and Scheduled courses under All", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Draft" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Epsilon approved")).toBeVisible();
    expect(screen.getByText("Eta scheduled")).toBeVisible();
    expect(screen.getByText("Zeta archived")).toBeVisible();
  });

  it("sorts by localized title", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort courses" }),
      "content",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort courses" }),
      "title",
    );
    expect(await courseTitles()).toEqual([
      "Alpha course",
      "Beta review",
      "Delta rejected",
      "Epsilon approved",
      "Eta scheduled",
      "Gamma published",
      "Zeta archived",
    ]);
  });

  it("sorts statuses in a stable lifecycle order", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort courses" }),
      "status",
    );
    expect(await courseTitles()).toEqual([
      "Alpha course",
      "Delta rejected",
      "Beta review",
      "Epsilon approved",
      "Eta scheduled",
      "Gamma published",
      "Zeta archived",
    ]);
  });

  it("sorts by combined module and lesson content amount", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort courses" }),
      "content",
    );
    expect((await courseTitles()).slice(0, 3)).toEqual([
      "Gamma published",
      "Beta review",
      "Alpha course",
    ]);
  });

  it("combines search with the active status filter", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "course",
    );
    await user.click(screen.getByRole("button", { name: "Draft" }));
    expect(screen.getByText("Alpha course")).toBeVisible();
    expect(screen.queryByText("Gamma published")).not.toBeInTheDocument();
  });

  it("clears the current search", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    const search = screen.getByRole("searchbox", { name: "Search courses" });
    await user.type(search, "beta");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(screen.getByText("Alpha course")).toBeVisible();
  });

  it("shows the search-specific no-results state", async () => {
    const user = userEvent.setup();
    renderCourses();
    await screen.findByText("Alpha course");
    await user.type(
      screen.getByRole("searchbox", { name: "Search courses" }),
      "missing",
    );
    expect(screen.getByText("No courses match your search.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Show all courses" }),
    ).toBeVisible();
  });

  it("shows a filter-specific no-results state", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              courses.filter((course) => course.status !== "Published"),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    renderCourses();
    await screen.findByText("Alpha course");
    await user.click(screen.getByRole("button", { name: "Published" }));
    expect(screen.getByText("No published courses.")).toBeVisible();
  });

  it("shows the first-course state when the teacher has no courses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    renderCourses();
    expect(
      await screen.findByText(
        "You do not have any courses yet. Start by creating your first draft.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("preserves Edit for editable states and View for all others", async () => {
    renderCourses();
    expect(
      await screen.findByRole("link", { name: "Edit Alpha course" }),
    ).toHaveAttribute("href", "/en/teacher/courses/draft");
    expect(
      screen.getByRole("link", { name: "Edit Delta rejected" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View Beta review" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View Epsilon approved" }),
    ).toBeVisible();
  });

  it("uses Arabic catalog labels, RTL direction, and active filter semantics", async () => {
    const user = userEvent.setup();
    renderCourses("ar");
    const region = await screen.findByRole("region", { name: "دوراتي" });
    expect(region).toHaveAttribute("dir", "rtl");
    const draftFilter = screen.getByRole("button", { name: "مسودة" });
    await user.click(draftFilter);
    expect(draftFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "تحرير دورة ألف" })).toBeVisible();
  });
});
