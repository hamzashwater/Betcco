import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentArea } from "@/features/student/student-area";
import { StudentCoursesLearningHub } from "@/features/student/student-courses-learning-hub";
import StudentPage from "../src/app/[locale]/student/[[...segment]]/page";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  continuityCourses,
  continuityOverview,
  continuityLessonId,
} from "./fixtures/student-continuity";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

function mount(locale: "en" | "ar", kind: "dashboard" | "full" | "compact") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        {kind === "dashboard" ? (
          <StudentArea segment={[]} />
        ) : (
          <StudentCoursesLearningHub variant={kind} />
        )}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe.each(["en", "ar"] as const)("%s Student home continuity", (locale) => {
  const copy = locale === "ar" ? ar : en;
  const title = continuityCourses(locale).items[0].localizedTitle;
  it("retains cached dashboard continuation, pending destinations and assignment lesson after both refreshes fail with exactly two reads", async () => {
    let fail = false;
    apiMock.mockImplementation((path: string) =>
      fail
        ? Promise.reject(new Error("refresh failed"))
        : Promise.resolve(
            path.startsWith("/learning/my-courses?")
              ? continuityCourses(locale)
              : continuityOverview(locale),
          ),
    );
    const client = mount(locale, "dashboard");
    await screen.findByRole("heading", { name: title });
    const continuation = screen.getByRole("region", {
      name: copy.studentWorkspace.dashboard.continueLearning,
    });
    expect(
      within(continuation).getByText(
        copy.studentCoursesLearningHub.lessons
          .replace("{completed}", "2")
          .replace("{total}", "7"),
      ),
    ).toBeVisible();
    expect(
      within(continuation).queryByRole("progressbar"),
    ).not.toBeInTheDocument();
    expect(within(continuation).queryByRole("img")).not.toBeInTheDocument();
    const links = () =>
      Array.from(
        screen
          .getByRole("region", {
            name: copy.studentWorkspace.dashboard.pendingActions.heading,
          })
          .querySelectorAll("a"),
        (a) => a.getAttribute("href"),
      );
    const expected = [
      `/${locale}/student/evaluations/resit-draft`,
      `/${locale}/student/evaluations`,
      `/${locale}/student/evaluations/new?resume=draft`,
      `/${locale}/student/evaluations`,
    ];
    expect(links()).toEqual(expected);
    const deadline = screen.getByRole("link", {
      name: new RegExp(
        locale === "ar" ? "تكليف التطبيق العملي" : "Practical assignment",
      ),
    });
    const href = deadline.getAttribute("href");
    expect(href).toContain(`?lessonId=${continuityLessonId}`);
    expect(apiMock).toHaveBeenCalledTimes(2);
    fail = true;
    await act(async () => {
      await client.refetchQueries();
    });
    expect(
      (
        await screen.findAllByText(
          copy.studentWorkspace.dashboard.courseRefreshError,
        )
      )[0],
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(links()).toEqual(expected);
    expect(deadline).toHaveAttribute("href", href);
    expect(apiMock).toHaveBeenCalledTimes(4);
    expect(apiMock.mock.calls.every((args) => args.length === 1)).toBe(true);
    expect(document.body.textContent).not.toMatch(/overdue|متأخر|Passed|ناجح/);
    client.clear();
  });

  it.each([undefined, "lesson / ?&ع"])(
    "preserves optional/encoded lesson context %s without changing server order",
    async (lessonId) => {
      const overview = {
        ...continuityOverview(locale),
        upcomingAssignments: continuityOverview(locale).upcomingAssignments.map(
          (assignment) => ({ ...assignment, lessonId }),
        ),
      };
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path.startsWith("/learning/") ? continuityCourses(locale) : overview,
        ),
      );
      const client = mount(locale, "dashboard");
      const deadline = await screen.findByRole("link", {
        name: new RegExp(overview.upcomingAssignments[0].title),
      });
      expect(deadline).toHaveAttribute(
        "href",
        `/${locale}/student/learn/${overview.upcomingAssignments[0].courseId}${lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : ""}`,
      );
      client.clear();
    },
  );

  describe.each(["full", "compact"] as const)("%s hub", (kind) => {
    it("retains cached rows, server order, disabled access and correct actions alongside a refresh error", async () => {
      let fail = false;
      apiMock.mockImplementation(() =>
        fail
          ? Promise.reject(new Error("refresh failed"))
          : Promise.resolve(continuityCourses(locale)),
      );
      const client = mount(locale, kind);
      await screen.findByRole("heading", { name: title });
      const headings = () =>
        screen
          .getAllByRole("heading")
          .map((h) => h.textContent)
          .filter((h) =>
            continuityCourses(locale).items.some((c) => c.localizedTitle === h),
          );
      const expected = continuityCourses(locale).items.map(
        (c) => c.localizedTitle,
      );
      expect(headings()).toEqual(expected);
      const links = () =>
        Array.from(
          document.querySelectorAll('a[href*="/student/learn/"]'),
          (a) => a.getAttribute("href"),
        );
      const originalLinks = links();
      expect(originalLinks).toHaveLength(2);
      expect(originalLinks.join()).not.toContain("locked-course");
      fail = true;
      await act(async () => {
        await client.refetchQueries();
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.studentWorkspace.dashboard.courseRefreshError,
      );
      expect(headings()).toEqual(expected);
      expect(links()).toEqual(originalLinks);
      expect(
        screen.queryByText(copy.studentCoursesLearningHub.empty.noCourses),
      ).not.toBeInTheDocument();
      client.clear();
    });
    it("distinguishes pending and cold error from successful empty", async () => {
      let reject!: (error: Error) => void;
      apiMock.mockImplementation(
        () =>
          new Promise((_, no) => {
            reject = no;
          }),
      );
      const client = mount(locale, kind);
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
      expect(document.querySelector('a[href*="/student/learn/"]')).toBeNull();
      await act(async () => {
        reject(new Error("cold failure"));
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.studentCoursesLearningHub.loadError,
      );
      expect(
        screen.queryByText(copy.studentCoursesLearningHub.empty.noCourses),
      ).not.toBeInTheDocument();
      const empty = continuityCourses(locale);
      empty.items = [];
      empty.totalCount = 0;
      empty.summary.totalCourses = 0;
      apiMock.mockResolvedValue(empty);
      await act(async () => {
        await client.refetchQueries();
      });
      await waitFor(() =>
        expect(
          screen.getByText(copy.studentCoursesLearningHub.empty.noCourses),
        ).toBeVisible(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(document.querySelector('a[href*="/student/learn/"]')).toBeNull();
      client.clear();
    });
  });
});

it.each(["assignment-distinct", ["assignment-first", "ignored"], undefined])(
  "the existing catchall forwards supplied lessonId %j unchanged",
  async (lessonId) => {
    const element = await StudentPage({
      params: Promise.resolve({ segment: ["learn", "course"] }),
      searchParams: Promise.resolve({ lessonId }),
    });
    expect(element.props.requestedLessonId).toBe(
      Array.isArray(lessonId) ? lessonId[0] : lessonId,
    );
  },
);
