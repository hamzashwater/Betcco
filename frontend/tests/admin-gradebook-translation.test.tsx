import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGradebook } from "@/features/admin/gradebook";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  gradebookFilters,
  gradebookPage,
  gradebookRow,
} from "./fixtures/admin-governance-gradebook";
import { deferred, mount } from "./helpers/admin-governance-gradebook-render";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
function read(p: string) {
  const url = new URL(p, "https://mock.invalid");
  if (url.pathname.endsWith("/filters")) return gradebookFilters;
  return gradebookPage(Number(url.searchParams.get("page")));
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string) => Promise.resolve(read(p)));
});
function setup(locale: "en" | "ar") {
  const v = mount(locale, <AdminGradebook />),
    c = v.copy.gradebook,
    s = v.copy.shared;
  return {
    ...v,
    c,
    s,
    ready: () => screen.findByText("Raw row student 1"),
    next: () => screen.getByRole("button", { name: s.next }),
    previous: () => screen.getByRole("button", { name: s.previous }),
    apply: () =>
      fireEvent.submit(
        screen.getByRole("button", { name: c.apply }).closest("form")!,
      ),
  };
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function queries() {
  return apiMock.mock.calls
    .map(([p]) => p as string)
    .filter((p) => p.startsWith("/admin/gradebook?"));
}
function params(p: string) {
  return Object.fromEntries(new URL(p, "https://mock.invalid").searchParams);
}
describe.each(["en", "ar"] as const)(
  "Gradebook %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("keeps locale filter GET, exact params/query key, pageSize=25, raw filter options and read-only policy", async () => {
      const v = setup(locale);
      await v.ready();
      expect(screen.getByRole("heading", { name: v.c.title })).toBeVisible();
      expect(screen.getByText(v.c.description)).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith(
        `/admin/gradebook/filters?locale=${locale}`,
      );
      expect(queries()).toEqual([
        `/admin/gradebook?locale=${locale}&page=1&pageSize=25`,
      ]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["admin-gradebook-filters", locale],
        ["admin-gradebook", `locale=${locale}&page=1&pageSize=25`],
      ]);
      for (const [label, value, title] of [
        [v.c.course, "course", "Raw course"],
        [v.c.unit, "unit", "Raw unit"],
        [v.c.teacher, "teacher", "Raw gradebook teacher"],
        [v.c.student, "student", "Raw gradebook student"],
      ])
        expect(
          within(screen.getByLabelText(label)).getByRole("option", {
            name: title,
          }),
        ).toHaveValue(value);
      expect(apiMock.mock.calls.every(([, o]) => !o)).toBe(true);
    });
    it("keeps every raw status/grade option value and raw row data including status/grade", async () => {
      const v = setup(locale);
      await v.ready();
      for (const status of [
        "Draft",
        "Submitted",
        "NeedsRevision",
        "Graded",
        "Finalized",
      ])
        expect(
          within(screen.getByLabelText(v.c.submissionStatus)).getByRole(
            "option",
            { name: status },
          ),
        ).toHaveValue(status);
      for (const grade of ["NotYetAchieved", "Pass", "Merit", "Distinction"])
        expect(
          within(screen.getByLabelText(v.c.grade)).getByRole("option", {
            name: grade,
          }),
        ).toHaveValue(grade);
      const table = within(screen.getByRole("table"));
      for (const value of [
        "Raw row student 1",
        gradebookRow.teacherName,
        gradebookRow.courseTitle,
        gradebookRow.unitTitle,
        gradebookRow.assignmentTitle,
        gradebookRow.status,
        gradebookRow.grade,
      ])
        expect(table.getByText(value)).toBeVisible();
      expect(
        table.getAllByRole("columnheader").map((e) => e.textContent),
      ).toEqual([
        v.c.student,
        v.c.teacher,
        v.c.courseUnit,
        v.c.coursework,
        v.c.status,
        v.c.grade,
        v.c.date,
      ]);
    });
    it("filters Unit by draft Course and clears unitId on every Course change without applying early", async () => {
      const v = setup(locale);
      await v.ready();
      const units = () =>
        Array.from(
          screen.getByLabelText(v.c.unit).querySelectorAll("option"),
        ).map((o) => o.value);
      expect(units()).toEqual(["", "unit", "unit2"]);
      change(v.c.unit, "unit2");
      change(v.c.course, "course");
      expect(screen.getByLabelText(v.c.unit)).toHaveValue("");
      expect(units()).toEqual(["", "unit"]);
      change(v.c.unit, "unit");
      change(v.c.course, "course2");
      expect(screen.getByLabelText(v.c.unit)).toHaveValue("");
      expect(units()).toEqual(["", "unit2"]);
      change(v.c.course, "");
      expect(units()).toEqual(["", "unit", "unit2"]);
      expect(queries()).toHaveLength(1);
    });
    it("applies only nonempty draft fields, keeps search raw and converts dates to ISO without requesting draft edits", async () => {
      const v = setup(locale);
      await v.ready();
      change(v.c.course, "course");
      change(v.c.unit, "unit");
      change(v.c.teacher, "teacher");
      change(v.c.student, "student");
      change(v.c.submissionStatus, "NeedsRevision");
      change(v.c.grade, "NotYetAchieved");
      change(v.c.fromDate, "2026-09-01T10:30");
      change(v.c.toDate, "2026-10-01T11:45");
      fireEvent.change(screen.getByPlaceholderText(v.c.search), {
        target: { value: " Raw search " },
      });
      expect(queries()).toHaveLength(1);
      v.apply();
      await waitFor(() => expect(queries()).toHaveLength(2));
      expect(params(queries()[1])).toEqual({
        locale,
        page: "1",
        pageSize: "25",
        courseId: "course",
        unitId: "unit",
        teacherUserId: "teacher",
        studentUserId: "student",
        status: "NeedsRevision",
        grade: "NotYetAchieved",
        fromUtc: new Date("2026-09-01T10:30").toISOString(),
        toUtc: new Date("2026-10-01T11:45").toISOString(),
        search: " Raw search ",
      });
      change(v.c.teacher, "");
      expect(queries()).toHaveLength(2);
      v.apply();
      await waitFor(() => expect(queries()).toHaveLength(3));
      expect(params(queries()[2])).not.toHaveProperty("teacherUserId");
    });
    it("computes page count from SERVER pageSize, keeps bounded Previous/Next transitions and applies back to page one", async () => {
      const v = setup(locale);
      await v.ready();
      await waitFor(() => expect(v.next()).toBeEnabled());
      expect(v.previous()).toBeDisabled();
      expect(screen.getByText("1 / 3")).toBeVisible();
      fireEvent.click(v.next());
      await screen.findByText("Raw row student 2");
      await waitFor(() => expect(v.next()).toBeEnabled());
      expect(v.previous()).toBeEnabled();
      expect(screen.getByText("2 / 3")).toBeVisible();
      fireEvent.click(v.next());
      await screen.findByText("Raw row student 3");
      expect(v.next()).toBeDisabled();
      expect(screen.getByText("3 / 3")).toBeVisible();
      fireEvent.click(v.previous());
      await screen.findByText("Raw row student 2");
      change(v.c.grade, "Pass");
      v.apply();
      await waitFor(() =>
        expect(params(queries().at(-1)!)).toEqual({
          locale,
          page: "1",
          pageSize: "25",
          grade: "Pass",
        }),
      );
      await screen.findByText("Raw row student 1");
      expect(v.previous()).toBeDisabled();
    });
    it("retains previous data while fetching another page and disables both pagination buttons", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string) =>
        p.includes("page=2&") ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.ready();
      await waitFor(() => expect(v.next()).toBeEnabled());
      fireEvent.click(v.next());
      await waitFor(() => expect(v.next()).toBeDisabled());
      expect(v.previous()).toBeDisabled();
      expect(screen.getByText("Raw row student 1")).toBeVisible();
      expect(screen.queryByText("…")).not.toBeInTheDocument();
      await act(async () => pending.resolve(gradebookPage(2)));
      expect(await screen.findByText("Raw row student 2")).toBeVisible();
      await waitFor(() => expect(v.previous()).toBeEnabled());
    });
    it("Clear resets every draft/applied field and page without keeping stale filters", async () => {
      const v = setup(locale);
      await v.ready();
      change(v.c.course, "course");
      change(v.c.unit, "unit");
      change(v.c.teacher, "teacher");
      change(v.c.student, "student");
      change(v.c.submissionStatus, "Graded");
      change(v.c.grade, "Pass");
      change(v.c.fromDate, "2026-09-01T10:00");
      change(v.c.toDate, "2026-10-01T10:00");
      fireEvent.change(screen.getByPlaceholderText(v.c.search), {
        target: { value: "Raw search" },
      });
      v.apply();
      await waitFor(() => expect(v.next()).toBeEnabled());
      fireEvent.click(v.next());
      await screen.findByText("Raw row student 2");
      fireEvent.click(screen.getByRole("button", { name: v.c.clear }));
      await screen.findByText("Raw row student 1");
      for (const label of [
        v.c.course,
        v.c.unit,
        v.c.teacher,
        v.c.student,
        v.c.submissionStatus,
        v.c.grade,
        v.c.fromDate,
        v.c.toDate,
      ])
        expect(screen.getByLabelText(label)).toHaveValue("");
      expect(screen.getByPlaceholderText(v.c.search)).toHaveValue("");
      expect(v.previous()).toBeDisabled();
      // Cleared state may reuse its original cached query rather than issue a GET.
      const active = v.client
        .getQueryCache()
        .getAll()
        .filter((q) => q.getObserversCount() > 0)
        .map((q) => q.queryKey);
      expect(active).toContainEqual([
        "admin-gradebook",
        `locale=${locale}&page=1&pageSize=25`,
      ]);
    });
    it.each(["graded", "submitted", "none"] as const)(
      "keeps %s date precedence, locale formatter and neutral grade/date markers",
      async (kind) => {
        apiMock.mockImplementation((p: string) =>
          Promise.resolve(
            p.includes("/filters")
              ? gradebookFilters
              : {
                  total: 1,
                  page: 1,
                  pageSize: 25,
                  rows: [
                    {
                      ...gradebookRow,
                      gradedAtUtc:
                        kind === "graded"
                          ? gradebookRow.gradedAtUtc
                          : undefined,
                      submittedAtUtc:
                        kind === "none"
                          ? undefined
                          : gradebookRow.submittedAtUtc,
                      grade: undefined,
                    },
                  ],
                },
          ),
        );
        const v = setup(locale);
        await screen.findByText(gradebookRow.studentName);
        const row = within(
          screen.getByText(gradebookRow.studentName).closest("tr")!,
        );
        if (kind === "none") expect(row.getAllByText("—")).toHaveLength(2);
        else
          expect(
            row.getByText(
              (_, e) =>
                e?.tagName === "TD" &&
                e.textContent ===
                  formatLocalizedDateTime(
                    kind === "graded"
                      ? gradebookRow.gradedAtUtc
                      : gradebookRow.submittedAtUtc,
                    locale,
                  ),
            ),
          ).toBeVisible();
        expect(v.next()).toBeDisabled();
        expect(screen.getByText("1 / 1")).toBeVisible();
      },
    );
    it.each(["pending", "empty", "error"] as const)(
      "keeps localized %s state distinct",
      async (state) => {
        const pending = deferred();
        apiMock.mockImplementation((p: string) =>
          p.includes("/filters")
            ? Promise.resolve(gradebookFilters)
            : state === "pending"
              ? pending.promise
              : state === "error"
                ? Promise.reject(Error("RAW_GRADEBOOK_ERROR"))
                : Promise.resolve({
                    total: 0,
                    page: 1,
                    pageSize: 25,
                    rows: [],
                  }),
        );
        const v = setup(locale);
        if (state === "pending") {
          expect(screen.getByText("…").closest("[aria-busy]")).not.toBeNull();
          expect(screen.queryByText(v.c.empty)).not.toBeInTheDocument();
          await act(async () =>
            pending.resolve({ total: 0, page: 1, pageSize: 25, rows: [] }),
          );
          expect(await screen.findByText(v.c.empty)).toBeVisible();
        } else if (state === "empty")
          expect(await screen.findByText(v.c.empty)).toBeVisible();
        else {
          expect(await screen.findByRole("alert")).toHaveTextContent(
            v.c.loadError,
          );
          expect(
            screen.queryByText("RAW_GRADEBOOK_ERROR"),
          ).not.toBeInTheDocument();
        }
      },
    );
  },
);
