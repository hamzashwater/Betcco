import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
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
  overviewError = false,
) {
  apiMock.mockImplementation((path: string) => {
    if (path === "/student-tools/overview?locale=en") {
      if (overviewError)
        return Promise.reject(new Error("Overview unavailable"));
      return Promise.resolve({
        notes: [],
        bookmarks: [],
        calendar: [],
        certificates: [
          {
            verificationCode: "certificate-1",
            title: "Course",
            issuedAtUtc: "2026-09-28T09:00:00Z",
          },
        ],
        upcomingAssignments: [
          {
            id: "coursework-1",
            courseId: "course-1",
            title: "Coursework",
            courseTitle: "Course",
            dueAtUtc: "2026-10-01T09:00:00Z",
          },
        ],
        unreadNotifications: 2,
        achievements: [
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
    if (path.startsWith("/learning/my-courses?"))
      return Promise.resolve({
        items: [],
        page: 1,
        pageSize: 3,
        totalCount: 1,
        summary: {
          totalCourses: 1,
          notStarted: 0,
          inProgress: 1,
          completed: 0,
          completedLessons: 2,
          totalLessons: 4,
          progressPercent: 50,
        },
      });
    throw new Error(`Unexpected dashboard request: ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
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
    renderDashboard([], true);
    const section = await screen.findByRole("region", {
      name: "What needs your attention",
    });
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "Unable to load pending actions right now.",
    );
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
  });
});
