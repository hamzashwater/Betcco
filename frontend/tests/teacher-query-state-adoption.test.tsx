import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherArea } from "@/features/teacher/teacher-area";
import { TeacherStudentFollowUp } from "@/features/teacher/teacher-student-follow-up";
import en from "../messages/en.json";
import ar from "../messages/ar.json";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api }));
const clients: QueryClient[] = [];
const course = {
  id: "RAW-course",
  arabicTitle: "عنوان الخادم",
  englishTitle: "RAW course title",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: false,
  moduleCount: 1,
  lessonCount: 2,
};
const students = [
  {
    studentUserId: "RAW-1",
    studentName: "RAW student اسم الطالب",
    riskLevel: "High",
    reasons: ["NotYetAchieved"],
    progressPercent: 25,
    missedAssignments: 0,
    formativeSignals: [],
  },
  {
    studentUserId: "RAW-2",
    studentName: "RAW second طالب آخر",
    riskLevel: "Medium",
    reasons: ["LowProgress"],
    progressPercent: 30,
    missedAssignments: 1,
    formativeSignals: [],
  },
];
const analytics = {
  courses: 1,
  students: 7,
  pendingReviews: 2,
  averageLessonProgress: 25,
  studentsAtRisk: students,
  studentsAtRiskCount: 13,
  filteredStudentsAtRiskCount: 13,
  page: 1,
  pageSize: 10,
};

function mount(locale: "en" | "ar", followUp = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const messages = locale === "ar" ? ar : en;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {followUp ? <TeacherStudentFollowUp /> : <TeacherArea segment={[]} />}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return {
    client,
    copy: messages.teacherStudentFollowUp,
    dashboard: messages.teacherWorkspace.dashboard,
  };
}
function metric(label: string) {
  const card = screen.getByText(label).closest("article");
  expect(card).not.toBeNull();
  return within(card!);
}

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

describe.each(["en", "ar"] as const)(
  "truthful Teacher query-state adoption (%s)",
  (locale) => {
    it("never renders analytics failure without data as healthy zeros or an empty preview", async () => {
      api.mockImplementation((path: string) =>
        path === "/teacher/courses"
          ? Promise.resolve([course])
          : Promise.reject(new Error("RAW transport failure")),
      );
      const { client, copy, dashboard } = mount(locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadError,
      );
      for (const label of [
        dashboard.enrolledStudents,
        dashboard.averageProgress,
        dashboard.studentsNeedingAttention,
      ])
        expect(metric(label).getByText("—")).toBeVisible();
      expect(metric(dashboard.drafts).getByText("1")).toBeVisible();
      expect(screen.queryByText(copy.empty.noFollowUp)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: copy.viewAll })).toHaveAttribute(
        "href",
        `/${locale}/teacher/students`,
      );
      expect(
        screen.queryByRole("button", { name: copy.retry }),
      ).not.toBeInTheDocument();
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["teacher-analytics"], exact: true })?.state.status,
      ).toBe("error");
      expect(api.mock.calls.map(([path]) => path)).toEqual(
        expect.arrayContaining(["/teacher/courses", "/teacher/analytics"]),
      );
      expect(api.mock.calls).toHaveLength(2);
    });

    it("keeps actual successful zero values and the real empty preview", async () => {
      api.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/teacher/courses"
            ? []
            : {
                ...analytics,
                students: 0,
                pendingReviews: 0,
                averageLessonProgress: 0,
                studentsAtRiskCount: 0,
                studentsAtRisk: [],
              },
        ),
      );
      const { copy, dashboard } = mount(locale);
      expect(await screen.findByText(copy.empty.noFollowUp)).toBeVisible();
      expect(metric(dashboard.drafts).getByText("0")).toBeVisible();
      expect(metric(dashboard.enrolledStudents).getByText("0")).toBeVisible();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("retains cached analytics and raw student names when refresh fails", async () => {
      let fail = false;
      api.mockImplementation((path: string) =>
        path === "/teacher/courses"
          ? Promise.resolve([course])
          : fail
            ? Promise.reject(new Error("RAW refresh failure"))
            : Promise.resolve(analytics),
      );
      const { client, copy, dashboard } = mount(locale);
      expect(await screen.findByText(students[0].studentName)).toBeVisible();
      fail = true;
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["teacher-analytics"],
          exact: true,
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadError,
      );
      expect(screen.getByText(students[0].studentName)).toBeVisible();
      expect(metric(dashboard.enrolledStudents).getByText("7")).toBeVisible();
      expect(screen.queryByText(copy.empty.noFollowUp)).not.toBeInTheDocument();
      expect(client.getQueryData(["teacher-analytics"])).toEqual(analytics);
      expect(
        api.mock.calls.filter(([path]) => path === "/teacher/analytics"),
      ).toHaveLength(2);
    });

    it("shows missing course counts as unavailable rather than zero", async () => {
      api.mockImplementation((path: string) =>
        path === "/teacher/courses"
          ? Promise.reject(new Error("RAW courses failure"))
          : Promise.resolve(analytics),
      );
      const { dashboard } = mount(locale);
      await screen.findByRole("alert");
      for (const label of [dashboard.drafts, dashboard.publishedCourses])
        expect(metric(label).getByText("—")).toBeVisible();
      expect(metric(dashboard.enrolledStudents).getByText("7")).toBeVisible();
    });

    it("keeps a cold follow-up failure separate from empty and retries the exact existing request", async () => {
      let fail = true;
      api.mockImplementation(() =>
        fail
          ? Promise.reject(new Error("RAW follow-up failure"))
          : Promise.resolve(analytics),
      );
      const { copy } = mount(locale, true);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadError,
      );
      expect(screen.queryByText(copy.empty.noFollowUp)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: copy.paginationLabel }),
      ).not.toBeInTheDocument();
      fail = false;
      await userEvent.click(screen.getByRole("button", { name: copy.retry }));
      expect(await screen.findByText(students[0].studentName)).toBeVisible();
      expect(api.mock.calls.map(([path]) => path)).toEqual([
        "/teacher/analytics?followUp=true&page=1&pageSize=10&sort=priority",
        "/teacher/analytics?followUp=true&page=1&pageSize=10&sort=priority",
      ]);
    });

    it("retains cached follow-up rows, count, labels and pagination after refresh failure", async () => {
      let fail = false;
      api.mockImplementation(() =>
        fail
          ? Promise.reject(new Error("RAW follow-up refresh failure"))
          : Promise.resolve(analytics),
      );
      const { client, copy } = mount(locale, true);
      expect(await screen.findByText(students[0].studentName)).toBeVisible();
      expect(screen.getByText(copy.attention.High)).toHaveClass(
        "text-state-danger-foreground",
      );
      expect(screen.getByText(copy.attention.Medium)).toHaveClass(
        "text-state-warning-foreground",
      );
      expect(
        within(
          screen.getByRole("list", { name: copy.studentListLabel }),
        ).getByText(copy.reasons.NotYetAchieved),
      ).toBeVisible();
      fail = true;
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["teacher-analytics-follow-up"],
          exact: false,
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadError,
      );
      expect(screen.getByText(students[0].studentName)).toBeVisible();
      expect(screen.getByText(students[1].studentName)).toBeVisible();
      const pagination = screen.getByRole("navigation", {
        name: copy.paginationLabel,
      });
      expect(
        within(pagination).getByRole("button", { name: copy.previous }),
      ).toBeDisabled();
      expect(
        within(pagination).getByRole("button", { name: copy.next }),
      ).toBeEnabled();
      expect(screen.queryByText(copy.empty.noFollowUp)).not.toBeInTheDocument();
      expect(api.mock.calls).toHaveLength(2);
      await waitFor(() =>
        expect(
          client.getQueryData([
            "teacher-analytics-follow-up",
            1,
            "",
            "All",
            "All",
            "priority",
          ]),
        ).toEqual(analytics),
      );
    });
  },
);
