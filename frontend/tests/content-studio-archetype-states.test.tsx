import { ContentStudio } from "@/features/admin/content-studio";
import {
  act,
  fireEvent,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { mount } from "./helpers/admin-governance-gradebook-render";
import { studioFixture } from "./fixtures/content-studio-archetype";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const paths = [
  "/admin/content/teachers",
  "/admin/content/courses",
  "/admin/content/blog",
  "/admin/content/packages",
  "/admin/content/live-sessions",
  "/admin/content/live-session-providers",
  "/admin/users?role=Student&pageSize=100",
  "/admin/content/live-sessions/session-a/attendance",
];
let fixture = studioFixture();
function response(path: string) {
  return [
    fixture.teachers,
    fixture.courses,
    fixture.blog,
    fixture.packages,
    fixture.sessions,
    fixture.providers,
    fixture.students,
    fixture.attendance,
  ][paths.indexOf(path)];
}
beforeEach(() => {
  fixture = studioFixture();
  apiMock.mockReset();
});
for (const locale of ["en", "ar"] as const) {
  const t = (locale === "en" ? en : ar).adminContent;
  const sections = [
    t.teachersNav,
    t.packagesNav,
    t.articlesNav,
    t.packagesNav,
    t.sessionsNav,
    t.sessionsNav,
    t.attendance,
    t.attendance,
  ];
  const panel = () =>
    within(
      document.querySelector(
        'section[id^="content-"]:not([hidden])',
      ) as HTMLElement,
    );
  async function select(index: number) {
    fireEvent.click(
      screen
        .getByRole("navigation", { name: t.workspaceNavigation })
        .querySelector(
          `button[aria-controls="content-${["teachers", "packages", "articles", "packages", "sessions", "sessions", "attendance", "attendance"][index]}"]`,
        )!,
    );
    if (index === 7) {
      await waitFor(() =>
        expect(
          document.querySelector('option[value="session-a"]'),
        ).not.toBeNull(),
      );
      fireEvent.change(
        screen.getByLabelText(t.attendanceSession, { selector: "select" }),
        { target: { value: "session-a" } },
      );
    }
  }
  it.each(paths)(
    `cold errors stay errors and one explicit retry restores %s (${locale})`,
    async (path) => {
      let failed = true;
      apiMock.mockImplementation((p: string) =>
        p === path && failed
          ? Promise.reject(new Error("Synthetic read failure"))
          : Promise.resolve(structuredClone(response(p))),
      );
      mount(locale, <ContentStudio />);
      const i = paths.indexOf(path);
      await select(i);
      const error = await panel().findByRole("alert");
      expect(error).toHaveTextContent(
        i === 7 ? t.attendanceLoadError : t.loadFailed,
      );
      expect(error).not.toHaveTextContent(t.refreshFailed);
      expect(apiMock.mock.calls.filter(([p]) => p === path)).toHaveLength(1);
      failed = false;
      fireEvent.click(panel().getByRole("button", { name: t.retry }));
      await waitFor(() => expect(panel().queryByRole("alert")).toBeNull());
      expect(apiMock.mock.calls.filter(([p]) => p === path)).toHaveLength(2);
      expect(sections[i]).toBeTruthy();
    },
  );
  it.each(paths)(
    `successful empty query has factual empty state for %s (${locale})`,
    async (path) => {
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p === path
            ? p.includes("/admin/users")
              ? { items: [] }
              : []
            : structuredClone(response(p)),
        ),
      );
      mount(locale, <ContentStudio />);
      const i = paths.indexOf(path);
      await select(i);
      const empty = [
        t.noTeachers,
        t.noCourses,
        t.noArticles,
        t.noPackages,
        t.noSessions,
        t.noProviders,
        t.noStudents,
        t.attendanceEmpty,
      ][i];
      await waitFor(() => expect(panel().getByText(empty)).toBeVisible());
      expect(panel().queryByRole("alert")).toBeNull();
    },
  );
  it(
    "retains attendance cache on refresh failure and resets row drafts on a server status or session change (" +
      locale +
      ")",
    async () => {
      let fail = false;
      apiMock.mockImplementation((p: string) =>
        p.endsWith("/attendance") && fail
          ? Promise.reject(new Error("Synthetic refresh failure"))
          : Promise.resolve(
              p.endsWith("/attendance")
                ? structuredClone(fixture.attendance)
                : structuredClone(response(p)),
            ),
      );
      const { client } = mount(locale, <ContentStudio />);
      await select(7);
      await screen.findByText("Synthetic learner 0");
      let row = screen.getByLabelText(
        t.attendanceStatus + " · Synthetic learner 0",
      );
      fireEvent.change(row, { target: { value: "Excused" } });
      fixture.attendance[0].status = "Late";
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["admin-live-attendance", "session-a"],
        });
      });
      await waitFor(() =>
        expect(
          screen.getByLabelText(t.attendanceStatus + " · Synthetic learner 0"),
        ).toHaveValue("Late"),
      );
      row = screen.getByLabelText(
        t.attendanceStatus + " · Synthetic learner 0",
      );
      fireEvent.change(row, { target: { value: "Absent" } });
      fireEvent.change(
        screen.getByLabelText(t.attendanceSession, { selector: "select" }),
        { target: { value: "session-b" } },
      );
      await waitFor(() =>
        expect(
          screen.getByLabelText(t.attendanceStatus + " · Synthetic learner 0"),
        ).toHaveValue("Late"),
      );
      fail = true;
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["admin-live-attendance", "session-b"],
        });
      });
      expect(await panel().findByRole("alert")).toHaveTextContent(
        t.refreshFailed,
      );
      expect(screen.getByText("Synthetic learner 0")).toBeVisible();
    },
  );
}
