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
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { StudentArea } from "@/features/student/student-area";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

const academic = {
  qualificationCode: "Q",
  qualificationArabicName: "مؤهل",
  qualificationEnglishName: "Qualification",
  qualificationVersionCode: "V1",
  unitCode: "U1",
  unitArabicTitle: "وحدة",
  unitEnglishTitle: "Unit One",
  assessmentCode: "A1",
  assessmentVersion: 1,
  assessmentArabicTitle: "مهمة",
  assessmentEnglishTitle: "Assignment One",
  learningAimCodes: ["A"],
};

type ActionKind =
  "EvaluationDraft" | "EvaluationRevision" | "ResitAuthorized" | "ResitDraft";

function action(kind: ActionKind, id: string, due: string | null = null) {
  return {
    kind,
    evaluationRequestId: id,
    originalEvaluationRequestId: kind.startsWith("Resit") ? "original-1" : null,
    authorizationId: kind.startsWith("Resit") ? "authorization-1" : null,
    effectiveDueAtUtc: due,
    occurredAtUtc: "2026-09-29T09:00:00Z",
    academic,
  };
}

function renderDashboard(
  actions: ReturnType<typeof action>[],
  options: {
    overviewError?: boolean;
    coursesError?: boolean;
    overviewEmpty?: boolean;
    coursesEmpty?: boolean;
    failFirstOverview?: boolean;
    failFirstCourses?: boolean;
    locale?: "ar" | "en";
  } = {},
) {
  const locale = options.locale ?? "en";
  let overviewCalls = 0;
  let courseCalls = 0;
  apiMock.mockImplementation((path: string) => {
    if (path === `/student-tools/overview?locale=${locale}`) {
      overviewCalls += 1;
      if (
        options.overviewError ||
        (options.failFirstOverview && overviewCalls === 1)
      )
        return Promise.reject(new Error("Overview unavailable"));
      return Promise.resolve({
        notes: [],
        bookmarks: [],
        calendar: [],
        certificates: options.overviewEmpty
          ? []
          : [
              {
                verificationCode: "certificate-1",
                title: "Course",
                issuedAtUtc: "2026-09-28T09:00:00Z",
              },
            ],
        upcomingAssignments: options.overviewEmpty
          ? []
          : [
              {
                id: "coursework-1",
                courseId: "course-1",
                title: "Coursework",
                courseTitle: "Course",
                dueAtUtc: "2026-10-01T09:00:00Z",
              },
            ],
        unreadNotifications: options.overviewEmpty ? 0 : 2,
        achievements: options.overviewEmpty
          ? []
          : [
              {
                code: "FIRST_LESSON",
                title: "First lesson complete",
                description: "Milestone",
                currentValue: 1,
                targetValue: 1,
                isCompleted: true,
              },
            ],
        pendingActions: actions,
      });
    }
    if (path.startsWith("/learning/my-courses?")) {
      courseCalls += 1;
      if (
        options.coursesError ||
        (options.failFirstCourses && courseCalls === 1)
      )
        return Promise.reject(new Error("Courses unavailable"));
      return Promise.resolve({
        items: [],
        page: 1,
        pageSize: 3,
        totalCount: options.coursesEmpty ? 0 : 1,
        summary: {
          totalCourses: options.coursesEmpty ? 0 : 1,
          notStarted: 0,
          inProgress: options.coursesEmpty ? 0 : 1,
          completed: 0,
          completedLessons: options.coursesEmpty ? 0 : 2,
          totalLessons: options.coursesEmpty ? 0 : 4,
          progressPercent: options.coursesEmpty ? 0 : 50,
        },
      });
    }
    throw new Error(`Unexpected dashboard request: ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider client={client}>
        <StudentArea segment={[]} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("student dashboard pending actions", () => {
  it("renders English student navigation, dashboard copy, and quick links", async () => {
    renderDashboard([]);
    const nav = screen.getByRole("navigation", {
      name: "Student workspace navigation",
    });
    for (const [name, href] of [
      ["Overview", "/en/student"],
      ["My courses", "/en/student/courses"],
      ["My evaluations", "/en/student/evaluations"],
      ["My account", "/en/student/account"],
      ["Account security", "/en/student/security"],
    ]) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
    expect(screen.getByText("Student dashboard")).toBeVisible();
    expect(screen.getByText("Continue learning")).toBeVisible();
    expect(screen.getByText("Enrolled courses")).toBeVisible();
    expect(screen.getByText("What needs your attention")).toBeVisible();
    expect(screen.getByText("Learning milestones")).toBeVisible();
    expect(screen.getByText("Upcoming deadlines")).toBeVisible();
    expect(screen.getByText("Evaluate my assignment")).toBeVisible();
    await screen.findByText("You have no pending actions right now.");
  });

  it("renders Arabic student navigation, dashboard copy, and all pending action kinds", async () => {
    renderDashboard(
      [
        action("EvaluationDraft", "draft-1"),
        action("EvaluationRevision", "revision-1", "2026-10-03T12:00:00Z"),
        action("ResitAuthorized", "original-1"),
        action("ResitDraft", "resit-draft-1"),
      ],
      { locale: "ar" },
    );
    const nav = screen.getByRole("navigation", { name: "تنقل مساحة الطالب" });
    for (const [name, href] of [
      ["الملخص", "/ar/student"],
      ["دوراتي", "/ar/student/courses"],
      ["تقييماتي", "/ar/student/evaluations"],
      ["حسابي", "/ar/student/account"],
      ["أمان الحساب", "/ar/student/security"],
    ]) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
    expect(screen.getByText("لوحة الطالب")).toBeVisible();
    expect(screen.getByText("متابعة التعلّم")).toBeVisible();
    expect(screen.getByText("الدورات المسجل بها")).toBeVisible();
    expect(screen.getByText("إنجازات التعلّم")).toBeVisible();
    expect(screen.getByText("مواعيد التسليم القادمة")).toBeVisible();
    expect(screen.getByText("قيّم مهمتك")).toBeVisible();
    const pending = await screen.findByRole("region", {
      name: "المطلوب منك الآن",
    });
    for (const title of [
      "تقييم بانتظار التجهيز",
      "لديك نسخة معدلة مطلوبة",
      "فرصة إعادة تقييم متاحة",
      "جهّز إعادة التقييم",
    ]) {
      expect(await within(pending).findByText(title)).toBeVisible();
    }
    expect(
      within(pending).getByRole("link", { name: "متابعة تجهيز التقييم" }),
    ).toHaveAttribute("href", "/ar/student/evaluations/new?resume=draft-1");
    expect(
      within(pending).getByRole("link", { name: "فتح التقييم والملاحظات" }),
    ).toHaveAttribute("href", "/ar/student/evaluations");
    expect(
      within(pending).getByRole("link", { name: "عرض فرصة إعادة التقييم" }),
    ).toHaveAttribute("href", "/ar/student/evaluations");
    expect(
      within(pending).getByRole("link", { name: "متابعة تجهيز إعادة التقييم" }),
    ).toHaveAttribute("href", "/ar/student/evaluations/resit-draft-1");
    expect(
      within(pending).getByText(/آخر موعد للمراجعة الثانية:/),
    ).toBeVisible();
    expect(apiMock).toHaveBeenCalledWith("/student-tools/overview?locale=ar");
  });

  it("links a standard draft to N8-A resume and shows immutable academic context", async () => {
    renderDashboard([action("EvaluationDraft", "draft-1")]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByText(/U1 · Unit One · Assignment One/),
    ).toBeVisible();
    expect(
      within(section).getByRole("link", { name: "Continue evaluation" }),
    ).toHaveAttribute("href", "/en/student/evaluations/new?resume=draft-1");
  });

  it("shows the effective revision deadline and links to My Evaluations", async () => {
    renderDashboard([
      action("EvaluationRevision", "revision-1", "2026-10-03T12:00:00Z"),
    ]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByText(/Revision check deadline:/),
    ).toBeVisible();
    expect(
      within(section).getByRole("link", {
        name: "Open evaluation and feedback",
      }),
    ).toHaveAttribute("href", "/en/student/evaluations");
  });

  it("links an authorized Resit to its existing activation page without rationale", async () => {
    const withPrivateRationale = {
      ...action("ResitAuthorized", "original-1"),
      reason: "Private rationale",
    };
    renderDashboard([withPrivateRationale]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByText("A Resit opportunity is available"),
    ).toBeVisible();
    expect(
      within(section).queryByText("Private rationale"),
    ).not.toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: "View Resit opportunity" }),
    ).toHaveAttribute("href", "/en/student/evaluations");
  });

  it("links an activated Resit draft directly to its detail", async () => {
    renderDashboard([action("ResitDraft", "resit-draft-1")]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByRole("link", {
        name: "Continue Resit preparation",
      }),
    ).toHaveAttribute("href", "/en/student/evaluations/resit-draft-1");
  });

  it("shows the section-only empty state while retaining existing dashboard blocks", async () => {
    renderDashboard([]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByText(
        "You have no pending actions right now.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Enrolled courses")).toBeVisible();
    expect(screen.getByText("Lessons completed")).toBeVisible();
    expect(screen.getByText("Overall progress")).toBeVisible();
    expect(screen.getByText("Upcoming coursework")).toBeVisible();
    expect(screen.getByText("Unread notifications")).toBeVisible();
    expect(screen.getByText("Completion certificates")).toBeVisible();
    expect(screen.getByText("Learning milestones")).toBeVisible();
    expect(screen.getByText("Upcoming deadlines")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: /My courses/ }).length,
    ).toBeGreaterThan(1);
    expect(
      await screen.findByRole("region", { name: "Continue learning" }),
    ).toBeVisible();
    expect(
      apiMock.mock.calls
        .map(([path]) => path)
        .filter(
          (path: string) =>
            path.startsWith("/evaluations/") ||
            path.startsWith("/student/resit-authorizations"),
        ),
    ).toEqual([]);
  });

  it("preserves the server order across mixed action kinds", async () => {
    renderDashboard([
      action("ResitDraft", "resit-draft-1"),
      action("EvaluationRevision", "revision-1"),
      action("EvaluationDraft", "draft-1"),
      action("ResitAuthorized", "original-1"),
    ]);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    await within(section).findByText("Prepare your Resit");
    expect(
      Array.from(
        section.querySelectorAll("article h3"),
        (heading) => heading.textContent,
      ),
    ).toEqual([
      "Prepare your Resit",
      "Your assignment needs a revision",
      "Evaluation draft to prepare",
      "A Resit opportunity is available",
    ]);
  });

  it("shows an error without stale actions when overview fails", async () => {
    renderDashboard([], { overviewError: true });
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(
      await within(section).findByText(
        "Unable to load pending actions right now.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dashboard data could not be loaded",
    );
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not present failed course data as zero and retries the courses query", async () => {
    renderDashboard([], { failFirstCourses: true });
    const enrolled = screen.getByText("Enrolled courses").closest("article");
    const lessons = screen.getByText("Lessons completed").closest("article");
    const progress = screen.getByText("Overall progress").closest("article");
    expect(
      await screen.findByRole("button", { name: "Retry course data" }),
    ).toBeVisible();
    expect(within(enrolled!).getByText("—")).toBeVisible();
    expect(within(lessons!).getByText("—")).toBeVisible();
    expect(within(progress!).getByText("—")).toBeVisible();
    expect(
      screen.getAllByText("Course data could not be loaded").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry course data" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
    expect(within(enrolled!).getByText("1")).toBeVisible();
  });

  it("shows zero course metrics only after a successful empty response", async () => {
    renderDashboard([], { coursesEmpty: true });
    expect(await screen.findByText("0")).toBeVisible();
    const enrolled = screen.getByText("Enrolled courses").closest("article");
    const lessons = screen.getByText("Lessons completed").closest("article");
    const progress = screen.getByText("Overall progress").closest("article");
    expect(within(enrolled!).getByText("0")).toBeVisible();
    expect(within(lessons!).getByText("0/0")).toBeVisible();
    expect(within(progress!).getByText("0%")).toBeVisible();
  });

  it("shows overview errors instead of zero metrics and retries the same query", async () => {
    renderDashboard([], { failFirstOverview: true });
    for (const label of [
      "Upcoming coursework",
      "Unread notifications",
      "Completion certificates",
    ]) {
      const metric = screen.getByText(label).closest("article");
      expect(await within(metric!).findByText("—")).toBeVisible();
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Retry dashboard data" }),
    );
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
    expect(
      screen.getByText("Upcoming coursework").closest("article"),
    ).toHaveTextContent("1");
  });

  it("distinguishes overview failure from empty deadlines and achievements", async () => {
    renderDashboard([], { overviewError: true });
    expect(
      await screen.findByText("Upcoming deadlines could not be loaded."),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "There are no upcoming coursework deadlines in your courses.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Learning milestones could not be loaded."),
    ).toBeVisible();
    expect(
      screen.queryByText("No learning milestones have been recorded yet."),
    ).not.toBeInTheDocument();
  });

  it("shows successful empty states for deadlines and achievements", async () => {
    renderDashboard([], { overviewEmpty: true });
    expect(
      await screen.findByText(
        "There are no upcoming coursework deadlines in your courses.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("No learning milestones have been recorded yet."),
    ).toBeVisible();
    expect(
      screen.queryByText("Learning milestones could not be loaded."),
    ).not.toBeInTheDocument();
  });
});
