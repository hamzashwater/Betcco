import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherArea } from "@/features/teacher/teacher-area";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  workloadCourses,
  workloadAnalytics,
  workloadAssignments,
} from "./fixtures/teacher-workload";
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const clients: QueryClient[] = [];
function mount(locale: "en" | "ar", segment: string[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const messages = locale === "ar" ? ar : en;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <TeacherArea segment={segment} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, copy: messages.teacherWorkloadPresentation, messages };
}
beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});
describe.each(["en", "ar"] as const)(
  "Teacher workload presentation (%s)",
  (locale) => {
    it.each([false, true])(
      "puts work and courses before context, one creation link (empty=%s)",
      async (empty) => {
        api.mockImplementation((path: string) =>
          Promise.resolve(
            path === "/teacher/courses"
              ? empty
                ? []
                : workloadCourses
              : {
                  ...workloadAnalytics,
                  studentsAtRisk: empty ? [] : workloadAnalytics.studentsAtRisk,
                },
          ),
        );
        const { copy, messages } = mount(locale);
        await screen.findByText(
          empty
            ? messages.teacherCoursesManagement.empty.noCourses
            : locale === "ar"
              ? workloadCourses[0].arabicTitle
              : workloadCourses[0].englishTitle,
        );
        const workload = screen.getByRole("heading", { name: copy.workload }),
          courses = screen.getByRole("heading", {
            name: messages.teacherCoursesManagement.title,
          }),
          context = screen.getByRole("heading", { name: copy.context });
        expect(
          workload.compareDocumentPosition(courses) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          courses.compareDocumentPosition(context) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          screen
            .getAllByRole("link")
            .filter(
              (a) =>
                a.getAttribute("href") === `/${locale}/teacher/courses/new`,
            ),
        ).toHaveLength(1);
        expect(screen.getByText(copy.separate)).toBeVisible();
        expect(api.mock.calls.map(([p]) => p).sort()).toEqual([
          "/teacher/analytics",
          "/teacher/courses",
        ]);
        expect(
          screen.queryByText(messages.teacherWorkspace.shared.open),
        ).not.toBeInTheDocument();
      },
    );
    it("filters only loaded assigned rows, preserves exact links and server order including unknown/Resit/Retake", async () => {
      api.mockResolvedValue(workloadAssignments);
      const { copy, messages } = mount(locale, ["evaluations"]);
      const region = await screen.findByRole("region", {
        name: copy.assignedList,
      });
      await screen.findByText("UnknownServerState", { selector: "span" });
      const links = () =>
        within(region)
          .getAllByRole("link")
          .map((a) => a.getAttribute("href"));
      expect(links()).toEqual(
        workloadAssignments.map(
          (a) => `/${locale}/teacher/evaluations/${a.id}`,
        ),
      );
      expect(screen.getByText(copy.formalScope)).toBeVisible();
      expect(
        within(region).getByText(
          messages.teacherWorkspace.evaluations.resitFinalReview,
        ),
      ).toBeVisible();
      expect(
        within(region).getByText(
          messages.teacherWorkspace.evaluations.assignedRetake,
        ),
      ).toBeVisible();
      await userEvent.selectOptions(
        screen.getByLabelText(copy.queueStatus),
        "Assigned",
      );
      expect(links()).toEqual(
        workloadAssignments
          .filter((a) => a.status === "Assigned")
          .map((a) => `/${locale}/teacher/evaluations/${a.id}`),
      );
      await userEvent.type(
        screen.getByRole("searchbox", { name: copy.queueSearch }),
        "no matching request",
      );
      expect(await screen.findByText(copy.noMatches)).toBeVisible();
      expect(within(region).queryByRole("link")).not.toBeInTheDocument();
      await userEvent.clear(
        screen.getByRole("searchbox", { name: copy.queueSearch }),
      );
      await userEvent.selectOptions(
        screen.getByLabelText(copy.queueStatus),
        "",
      );
      expect(links()).toHaveLength(55);
      expect(api).toHaveBeenCalledExactlyOnceWith("/evaluations/assigned");
    });
    it.each(["pending", "error"])(
      "keeps %s assigned data distinct from successful empty",
      async (mode) => {
        api.mockImplementation(() =>
          mode === "pending"
            ? new Promise(() => {})
            : Promise.reject(new Error("RAW transport failure")),
        );
        const { messages } = mount(locale, ["evaluations"]);
        if (mode === "error")
          expect(await screen.findByRole("alert")).toHaveTextContent(
            messages.teacherWorkspace.evaluations.loadError,
          );
        else
          expect(await screen.findByRole("status")).toHaveTextContent(
            messages.teacherWorkspace.shared.loading,
          );
        expect(
          screen.queryByText(messages.teacherWorkspace.evaluations.empty),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(api).toHaveBeenCalledExactlyOnceWith("/evaluations/assigned");
      },
    );
    it("keeps cached formal queue and selected filters after refresh error, without mutation", async () => {
      api.mockResolvedValue(workloadAssignments);
      const { client, copy, messages } = mount(locale, ["evaluations"]);
      await screen.findByText("UnknownServerState", { selector: "span" });
      await userEvent.type(
        screen.getByLabelText(copy.queueSearch),
        "request-54",
      );
      const link = screen.getByRole("link");
      api.mockRejectedValue(new Error("RAW refresh failed"));
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["teacher-evaluations"],
          exact: true,
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        messages.teacherWorkspace.evaluations.loadError,
      );
      expect(screen.getByLabelText(copy.queueSearch)).toHaveValue("request-54");
      expect(screen.getByRole("link")).toBe(link);
      expect(link).toHaveAttribute(
        "href",
        `/${locale}/teacher/evaluations/request-54`,
      );
      expect(api.mock.calls.map(([p]) => p)).toEqual([
        "/evaluations/assigned",
        "/evaluations/assigned",
      ]);
    });
    it("keeps cached course search, sort and rows after refresh error and retries the original query", async () => {
      api.mockResolvedValue(workloadCourses);
      const { client, copy, messages } = mount(locale, ["courses"]);
      const m = messages.teacherCoursesManagement;
      await screen.findByRole("list", { name: m.courseListLabel });
      await userEvent.type(screen.getByLabelText(m.searchLabel), "Zeta");
      await userEvent.selectOptions(
        screen.getByLabelText(m.sortLabel),
        "content",
      );
      const link = within(
        screen.getByRole("list", { name: m.courseListLabel }),
      ).getByRole("link");
      api.mockRejectedValue(new Error("RAW refresh failure"));
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["teacher-courses"],
          exact: true,
        });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(m.loadError);
      expect(screen.getByLabelText(m.searchLabel)).toHaveValue("Zeta");
      expect(screen.getByLabelText(m.sortLabel)).toHaveValue("content");
      expect(link).toBeVisible();
      expect(screen.getByText(copy.courseScope)).toBeVisible();
      api.mockResolvedValue(workloadCourses);
      await userEvent.click(screen.getByRole("button", { name: m.retry }));
      expect(api.mock.calls.map(([p]) => p)).toEqual([
        "/teacher/courses",
        "/teacher/courses",
        "/teacher/courses",
      ]);
    });
  },
);
