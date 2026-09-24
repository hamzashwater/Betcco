import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { TeacherArea } from "@/features/teacher/teacher-area";
import {
  TeacherStudentFollowUp,
  type FollowUpReason,
  type TeacherFollowUpStudent,
} from "@/features/teacher/teacher-student-follow-up";

const students: TeacherFollowUpStudent[] = [
  {
    studentUserId: "alice",
    studentName: "Alice high",
    riskLevel: "High",
    reasons: ["LowProgress", "MissedAssignments", "Inactive14Days"],
    progressPercent: 20,
    missedAssignments: 2,
    lastActiveAtUtc: "2026-08-01T10:00:00Z",
  },
  {
    studentUserId: "basma",
    studentName: "Basma server medium",
    riskLevel: "Medium",
    reasons: ["LowProgress", "MissedAssignments"],
    progressPercent: 30,
    missedAssignments: 0,
    lastActiveAtUtc: null,
  },
  {
    studentUserId: "celine",
    studentName: "Celine assignments",
    riskLevel: "High",
    reasons: ["MissedAssignments"],
    progressPercent: 70,
    missedAssignments: 3,
    lastActiveAtUtc: "2026-09-10T10:00:00Z",
  },
  {
    studentUserId: "dalia",
    studentName: "Dalia inactive",
    riskLevel: "Medium",
    reasons: ["Inactive14Days"],
    progressPercent: 90,
    missedAssignments: 0,
    lastActiveAtUtc: "2026-08-20T10:00:00Z",
  },
  ...Array.from({ length: 8 }, (_, index): TeacherFollowUpStudent => ({
    studentUserId: `extra-${index + 1}`,
    studentName: `Extra ${String(index + 1).padStart(2, "0")}`,
    riskLevel: "Medium",
    reasons: ["LowProgress"],
    progressPercent: 35 + index,
    missedAssignments: 0,
    lastActiveAtUtc: null,
  })),
];

function responseFor(url: string, source = students) {
  const parsed = new URL(url, "http://localhost");
  const followUp = parsed.searchParams.get("followUp") === "true";
  if (!followUp) {
    return analyticsResponse(source.slice(0, 8), source.length, source.length);
  }
  const search = parsed.searchParams.get("search")?.toLowerCase();
  const attention = parsed.searchParams.get("attention");
  const reason = parsed.searchParams.get("reason");
  const sort = parsed.searchParams.get("sort") ?? "priority";
  const page = Number(parsed.searchParams.get("page") ?? 1);
  const pageSize = Number(parsed.searchParams.get("pageSize") ?? 10);
  let filtered = source.filter(
    (student) =>
      (!search || student.studentName.toLowerCase().includes(search)) &&
      (!attention || student.riskLevel === attention) &&
      (!reason || student.reasons.includes(reason as FollowUpReason)),
  );
  filtered = [...filtered].sort((left, right) => {
    const byName = left.studentName.localeCompare(right.studentName);
    if (sort === "progress")
      return left.progressPercent - right.progressPercent || byName;
    if (sort === "missedAssignments")
      return right.missedAssignments - left.missedAssignments || byName;
    if (sort === "lastActivity")
      return (
        nullableDate(left.lastActiveAtUtc, right.lastActiveAtUtc) || byName
      );
    return (
      Number(right.riskLevel === "High") - Number(left.riskLevel === "High") ||
      right.reasons.length - left.reasons.length ||
      byName
    );
  });
  const start = (page - 1) * pageSize;
  return {
    ...analyticsResponse(
      filtered.slice(start, start + pageSize),
      source.length,
      filtered.length,
    ),
    page,
    pageSize,
  };
}

function analyticsResponse(
  visible: TeacherFollowUpStudent[],
  total: number,
  filtered: number,
) {
  return {
    courses: 2,
    students: 20,
    pendingReviews: 1,
    averageLessonProgress: 50,
    studentsAtRisk: visible,
    studentsAtRiskCount: total,
    filteredStudentsAtRiskCount: filtered,
  };
}

function nullableDate(left?: string | null, right?: string | null) {
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

function installFetch(source = students) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/teacher/courses")
      ? []
      : responseFor(url, source);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

function renderWorkspace(locale: "ar" | "en" = "en") {
  return renderWithProviders(<TeacherStudentFollowUp />, locale);
}

describe("TeacherStudentFollowUp", () => {
  beforeEach(() => installFetch());

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("routes /teacher/students to the dedicated workspace and renders server signals", async () => {
    renderWithProviders(<TeacherArea segment={["students"]} />);

    expect(
      await screen.findByRole("heading", { name: "Student follow-up" }),
    ).toBeVisible();
    expect(await screen.findByText("Alice high")).toBeVisible();
    expect(
      screen.getByText(
        "These are support signals for teacher follow-up, not final academic judgements.",
      ),
    ).toBeVisible();
  });

  it("searches the complete server result and exposes missing values honestly", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alice high");

    await user.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "Basma",
    );

    expect(await screen.findByText("Basma server medium")).toBeVisible();
    expect(screen.getAllByText("Not available")).toHaveLength(1);
    expect(screen.queryByText("Alice high")).not.toBeInTheDocument();
  });

  it.each([
    ["High", 2],
    ["Medium", 10],
  ])("requests the %s server attention filter", async (filter, expected) => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alice high");

    await user.click(screen.getByRole("button", { name: filter }));

    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`of ${expected} matching`)),
      ).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: filter })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it.each([
    ["Low progress", "LowProgress"],
    ["Missed assignments", "MissedAssignments"],
    ["Inactive for 14 days", "Inactive14Days"],
  ])(
    "requests the %s reason across the complete result",
    async (label, value) => {
      const user = userEvent.setup();
      const fetchMock = installFetch();
      renderWorkspace();
      await screen.findByText("Alice high");

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Filter by follow-up reason" }),
        label,
      );

      await waitFor(() =>
        expect(String(fetchMock.mock.lastCall?.[0])).toContain(
          `reason=${value}`,
        ),
      );
    },
  );

  it.each([
    ["Attention priority", "priority"],
    ["Lowest progress first", "progress"],
    ["Most missed assignments", "missedAssignments"],
    ["Oldest activity first", "lastActivity"],
  ])("supports the %s server sort", async (label, value) => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderWorkspace();
    await screen.findByText("Alice high");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort follow-up students" }),
      label,
    );

    await waitFor(() =>
      expect(String(fetchMock.mock.lastCall?.[0])).toContain(`sort=${value}`),
    );
    if (value === "missedAssignments")
      expect(await screen.findByText("Celine assignments")).toBeVisible();
  });

  it("paginates with correct boundaries and identifies the current page", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alice high");

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Extra 07")).toBeVisible();
    expect(screen.getByText("Page 2 of 2")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("returns to page one when search changes", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderWorkspace();
    await screen.findByText("Alice high");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");

    await user.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "Dalia",
    );

    expect(await screen.findByText("Dalia inactive")).toBeVisible();
    expect(String(fetchMock.mock.lastCall?.[0])).toContain("page=1");
  });

  it("shows a no-match state and resets search and filters", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alice high");

    await user.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "Nobody",
    );
    expect(
      await screen.findByText("No follow-up students match this name."),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Clear search and filters" }),
    );
    expect(await screen.findByText("Alice high")).toBeVisible();
  });

  it("shows the no-follow-up empty state", async () => {
    installFetch([]);
    renderWorkspace();

    expect(
      await screen.findByText("There are no follow-up signals at the moment."),
    ).toBeVisible();
  });

  it("shows an API error and retries the same query", async () => {
    const user = userEvent.setup();
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (fail) {
          fail = false;
          return new Response(JSON.stringify({ message: "Failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(responseFor(String(input))), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    renderWorkspace();

    expect(
      await screen.findByText("Follow-up signals could not be loaded."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alice high")).toBeVisible();
  });

  it("preserves the server risk level without client-side reclassification", async () => {
    renderWorkspace();

    const student = await screen.findByText("Basma server medium");
    const card = student.closest("article");
    expect(card).toHaveAttribute("data-risk-level", "Medium");
    expect(within(card!).getByText("Follow-up needed")).toBeVisible();
  });

  it("uses the Arabic catalog and RTL direction", async () => {
    renderWorkspace("ar");

    const heading = await screen.findByRole("heading", {
      name: "متابعة الطلاب",
    });
    expect(heading.closest("section")).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("searchbox", { name: "البحث عن الطلاب" }),
    ).toBeVisible();
  });

  it("keeps the dashboard preview compact and links to the full workspace", async () => {
    renderWithProviders(<TeacherArea segment={[]} />);

    const heading = await screen.findByRole("heading", {
      name: "Students requiring attention",
    });
    const preview = heading.closest("section")!;
    expect(await within(preview).findAllByRole("listitem")).toHaveLength(4);
    expect(
      within(preview).getByRole("link", {
        name: "View all follow-up students",
      }),
    ).toHaveAttribute("href", "/en/teacher/students");
    expect(
      within(preview).queryByRole("searchbox", { name: "Search students" }),
    ).not.toBeInTheDocument();
    expect(
      within(preview).queryByRole("combobox", {
        name: "Sort follow-up students",
      }),
    ).not.toBeInTheDocument();
  });
});
