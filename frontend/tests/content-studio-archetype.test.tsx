import { ContentStudio } from "@/features/admin/content-studio";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
import { studioFixture } from "./fixtures/content-studio-archetype";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
let fixture = studioFixture();
const paths = [
  "/admin/content/teachers",
  "/admin/content/courses",
  "/admin/content/blog",
  "/admin/content/packages",
  "/admin/content/live-sessions",
  "/admin/content/live-session-providers",
  "/admin/users?role=Student&pageSize=100",
];
function reads(path: string) {
  const values = [
    fixture.teachers,
    fixture.courses,
    fixture.blog,
    fixture.packages,
    fixture.sessions,
    fixture.providers,
    fixture.students,
  ];
  return path.endsWith("/attendance")
    ? fixture.attendance
    : values[paths.indexOf(path)];
}
beforeEach(() => {
  fixture = studioFixture();
  apiMock.mockReset();
  apiMock.mockImplementation((path: string, options?: RequestInit) =>
    Promise.resolve(options?.method ? {} : reads(path)),
  );
});
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
const payload = () => JSON.parse(writes().at(-1)![1].body);

for (const locale of ["en", "ar"] as const) {
  const copy = (locale === "en" ? en : ar).adminContent;
  const navigate = (label: string) =>
    fireEvent.click(
      screen
        .getByRole("navigation", { name: copy.workspaceNavigation })
        .querySelectorAll("button")[
        [
          copy.articlesNav,
          copy.teachersNav,
          copy.packagesNav,
          copy.sessionsNav,
          copy.attendance,
        ].indexOf(label)
      ],
    );
  const form = (name: string) => within(screen.getByRole("form", { name }));
  const change = (
    scope: ReturnType<typeof within>,
    label: string,
    value: string,
  ) =>
    fireEvent.change(scope.getByLabelText(label, {}), {
      target: { value },
    });
  async function ready() {
    await waitFor(() =>
      expect(
        document.querySelector('option[value="teacher-a"]'),
      ).not.toBeNull(),
    );
  }
  describe(`Content Studio independent workspace contracts ${locale}`, () => {
    it("keeps eight exact query families, first-server ordering and no attendance request without selection", async () => {
      const { client } = mount(locale, <ContentStudio />);
      await ready();
      expect(apiMock.mock.calls.map(([p]) => p)).toEqual(paths);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["admin-content-teachers"],
        ["admin-content-courses"],
        ["admin-content-blog"],
        ["admin-content-packages"],
        ["admin-content-sessions"],
        ["admin-live-session-providers"],
        ["admin-content-students"],
        ["admin-live-attendance", ""],
      ]);
      navigate(copy.teachersNav);
      const options = form(copy.teacher)
        .getByLabelText(copy.chooseTeacher)
        .querySelectorAll("option");
      expect(Array.from(options).map((o) => o.value)).toEqual([
        "",
        "teacher-a",
        "teacher-b",
      ]);
      navigate(copy.sessionsNav);
      expect(
        Array.from(
          form(copy.sessionsNav)
            .getByLabelText(copy.host)
            .querySelectorAll("option"),
        ).map((o) => o.value),
      ).toEqual(["", "teacher-a", "teacher-b"]);
    });
    it("retains article, profile, package, session and attendance drafts across section navigation", async () => {
      mount(locale, <ContentStudio />);
      await ready();
      change(form(copy.article), copy.englishBody, "Unsaved long body");
      navigate(copy.teachersNav);
      change(form(copy.teacher), copy.chooseTeacher, "teacher-a");
      change(form(copy.teacher), copy.englishBio, "Unsaved bio");
      navigate(copy.packagesNav);
      change(form(copy.packagesNav), copy.price, "12.345");
      navigate(copy.sessionsNav);
      change(form(copy.sessionsNav), copy.englishTitle, "Unsaved session");
      navigate(copy.attendance);
      fireEvent.change(
        screen.getByLabelText(copy.attendanceSession, { selector: "select" }),
        { target: { value: "session-a" } },
      );
      await screen.findByText("Synthetic learner 0");
      const select = screen.getByLabelText(
        copy.attendanceStatus + " · Synthetic learner 0",
      );
      fireEvent.change(select, { target: { value: "Excused" } });
      navigate(copy.articlesNav);
      expect(form(copy.article).getByLabelText(copy.englishBody)).toHaveValue(
        "Unsaved long body",
      );
      navigate(copy.teachersNav);
      expect(form(copy.teacher).getByLabelText(copy.englishBio)).toHaveValue(
        "Unsaved bio",
      );
      navigate(copy.packagesNav);
      expect(form(copy.packagesNav).getByLabelText(copy.price)).toHaveValue(
        12.345,
      );
      navigate(copy.sessionsNav);
      expect(
        form(copy.sessionsNav).getByLabelText(copy.englishTitle),
      ).toHaveValue("Unsaved session");
      navigate(copy.attendance);
      expect(
        screen.getByLabelText(copy.attendanceStatus + " · Synthetic learner 0"),
      ).toHaveValue("Excused");
    });
    it("posts exact bilingual article payload and resets only after success", async () => {
      const { invalidations } = mount(locale, <ContentStudio />);
      await ready();
      const f = form(copy.article);
      const data = {
        slug: "new-article",
        arabicTitle: "عنوان عربي",
        englishTitle: "English title",
        arabicExcerpt: "ملخص عربي",
        englishExcerpt: "English excerpt",
        arabicBody: "نص طويل",
        englishBody: "Long English text",
      };
      for (const [k, v] of Object.entries(data))
        change(f, copy[k as keyof typeof copy], v);
      fireEvent.click(f.getByLabelText(copy.publish));
      fireEvent.submit(screen.getByRole("form", { name: copy.article }));
      await screen.findByText(copy.articleSaved);
      expect(writes()).toHaveLength(1);
      expect(writes()[0][0]).toBe("/admin/content/blog");
      expect(writes()[0][1].method).toBe("POST");
      expect(payload()).toEqual({ ...data, isPublished: true });
      expect(f.getByLabelText(copy.slug)).toHaveValue("");
      expect(refreshKeys(invalidations)).toEqual([["admin-content-blog"]]);
    });
    it("initializes a selected teacher, sends nullable public fields and clears stale operation identity on selection", async () => {
      const { invalidations } = mount(locale, <ContentStudio />);
      await ready();
      navigate(copy.teachersNav);
      const f = form(copy.teacher);
      expect(f.getByRole("button", { name: copy.save })).toBeDisabled();
      change(f, copy.chooseTeacher, "teacher-a");
      expect(f.getByLabelText(copy.englishBio)).toHaveValue("English bio");
      for (const key of [
        "arabicBio",
        "englishBio",
        "arabicSpecializations",
        "englishSpecializations",
      ] as const)
        change(f, copy[key], "");
      fireEvent.submit(screen.getByRole("form", { name: copy.teacher }));
      await screen.findByText(copy.profileSaved);
      expect(writes()[0][0]).toBe("/admin/content/teachers/teacher-a/profile");
      expect(writes()[0][1].method).toBe("PUT");
      expect(payload()).toEqual({
        arabicBio: null,
        englishBio: null,
        arabicSpecializations: null,
        englishSpecializations: null,
        isPublic: true,
      });
      expect(refreshKeys(invalidations)).toEqual([["admin-content-teachers"]]);
      change(f, copy.chooseTeacher, "teacher-b");
      expect(f.getByLabelText(copy.englishBio)).toHaveValue("");
      expect(screen.queryByText(copy.profileSaved)).toBeNull();
    });
    it.each([false, true])(
      "keeps package POST/PUT, price precision, course composition and UTC dates (edit=%s)",
      async (edit) => {
        const { invalidations } = mount(locale, <ContentStudio />);
        await ready();
        navigate(copy.packagesNav);
        const f = form(copy.packagesNav);
        if (edit) {
          change(f, copy.managePackage, "package-a");
          expect(f.getByLabelText(copy.slug)).toHaveValue("existing-package");
          expect(f.getByLabelText(copy.price)).toHaveValue(12.345);
          fireEvent.click(
            f.getByRole("checkbox", { name: /Synthetic course/ }),
          );
        }
        change(f, copy.price, "19.987");
        change(f, copy.availableFrom, "2026-10-29T12:00");
        change(f, copy.availableUntil, "2026-10-30T12:00");
        fireEvent.click(f.getByRole("checkbox", { name: /Second course/ }));
        const before = payloadSafePackage(edit);
        fireEvent.submit(screen.getByRole("form", { name: copy.packagesNav }));
        await screen.findByText(copy.packageSaved);
        expect(writes()[0][0]).toBe(
          edit
            ? "/admin/content/packages/package-a"
            : "/admin/content/packages",
        );
        expect(writes()[0][1].method).toBe(edit ? "PUT" : "POST");
        expect(payload()).toEqual(before);
        expect(f.getByLabelText(copy.managePackage)).toHaveValue("");
        expect(f.getByLabelText(copy.price)).toHaveValue(null);
        expect(refreshKeys(invalidations)).toEqual([
          ["admin-content-packages"],
        ]);
      },
    );
    function payloadSafePackage(edit: boolean) {
      return {
        slug: edit ? "existing-package" : "",
        arabicTitle: edit ? "باقة محفوظة" : "",
        englishTitle: edit ? "Existing package" : "",
        arabicDescription: edit ? "وصف الباقة" : "",
        englishDescription: edit ? "Package description" : "",
        price: 19.987,
        availableFromUtc: new Date("2026-10-29T12:00").toISOString(),
        availableUntilUtc: new Date("2026-10-30T12:00").toISOString(),
        isPublished: edit,
        courseIds: ["course-b"],
      };
    }
    it("New Package explicitly resets selected edit state", async () => {
      mount(locale, <ContentStudio />);
      await ready();
      navigate(copy.packagesNav);
      const f = form(copy.packagesNav);
      change(f, copy.managePackage, "package-a");
      change(f, copy.englishTitle, "Unsaved edit");
      change(f, copy.managePackage, "");
      expect(f.getByLabelText(copy.englishTitle)).toHaveValue("");
      expect(f.getByLabelText(copy.publish)).not.toBeChecked();
    });
    it.each([false, true])(
      "posts session with exact optional/UTC/capacity semantics (filled=%s)",
      async (filled) => {
        const { invalidations } = mount(locale, <ContentStudio />);
        await ready();
        navigate(copy.sessionsNav);
        const f = form(copy.sessionsNav);
        expect(f.getByLabelText(copy.provider)).toHaveValue("Manual");
        expect(
          screen.getByText(
            fixture.providers[0][
              locale === "ar" ? "arabicDescription" : "englishDescription"
            ],
          ),
        ).toBeVisible();
        change(f, copy.host, "teacher-a");
        change(f, copy.arabicTitle, "جلسة");
        change(f, copy.englishTitle, "Session");
        change(f, copy.starts, "2026-10-29T12:00");
        change(f, copy.ends, "2026-10-29T13:00");
        if (filled) {
          change(f, copy.courseOptional, "course-a");
          change(f, copy.provider, "Zoom");
          change(f, copy.capacity, "5000");
          change(f, copy.joinUrl, "https://example.test/join");
          change(f, copy.recordingUrl, "https://example.test/recording");
          change(f, copy.arabicDescription, "وصف");
          change(f, copy.englishDescription, "Description");
          fireEvent.click(f.getByLabelText(copy.publish));
        }
        fireEvent.submit(screen.getByRole("form", { name: copy.sessionsNav }));
        await screen.findByText(copy.sessionSaved);
        expect(writes()).toHaveLength(1);
        expect(writes()[0][0]).toBe("/admin/content/live-sessions");
        expect(writes()[0][1].method).toBe("POST");
        expect(payload()).toEqual({
          courseId: filled ? "course-a" : null,
          hostUserId: "teacher-a",
          arabicTitle: "جلسة",
          englishTitle: "Session",
          arabicDescription: filled ? "وصف" : null,
          englishDescription: filled ? "Description" : null,
          provider: filled ? "Zoom" : "Manual",
          joinUrl: filled ? "https://example.test/join" : null,
          recordingUrl: filled ? "https://example.test/recording" : null,
          startsAtUtc: new Date("2026-10-29T12:00").toISOString(),
          endsAtUtc: new Date("2026-10-29T13:00").toISOString(),
          capacity: filled ? 5000 : null,
          isPublished: filled,
        });
        expect(f.getByLabelText(copy.starts)).toHaveValue("");
        expect(refreshKeys(invalidations)).toEqual([
          ["admin-content-sessions"],
        ]);
      },
    );
    it("records attendance with exact session identity and clears student on success/session change", async () => {
      const { invalidations } = mount(locale, <ContentStudio />);
      await ready();
      navigate(copy.attendance);
      const session = screen.getByLabelText(copy.attendanceSession, {
        selector: "select",
      });
      fireEvent.change(session, { target: { value: "session-a" } });
      await screen.findByText("Synthetic learner 0");
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/content/live-sessions/session-a/attendance",
      );
      fireEvent.change(screen.getByLabelText(copy.attendanceStudent), {
        target: { value: "student-a" },
      });
      fireEvent.change(screen.getByLabelText(copy.attendanceStatus, {}), {
        target: { value: "Late" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: copy.markAttendance }),
      );
      await screen.findByText(copy.attendanceSaved);
      expect(payload()).toEqual({ studentUserId: "student-a", status: "Late" });
      expect(writes()[0][0]).toBe(
        "/admin/content/live-sessions/session-a/attendance",
      );
      expect(refreshKeys(invalidations)).toEqual([
        ["admin-live-attendance", "session-a"],
      ]);
      expect(screen.getByLabelText(copy.attendanceStudent)).toHaveValue("");
      fireEvent.change(screen.getByLabelText(copy.attendanceStudent), {
        target: { value: "student-b" },
      });
      fireEvent.change(session, { target: { value: "session-b" } });
      expect(screen.getByLabelText(copy.attendanceStudent)).toHaveValue("");
      expect(screen.queryByText(copy.attendanceSaved)).toBeNull();
    });
    it("keeps row drafts isolated, only updates a changed status and sends no fabricated timestamp", async () => {
      mount(locale, <ContentStudio />);
      await ready();
      navigate(copy.attendance);
      fireEvent.change(
        screen.getByLabelText(copy.attendanceSession, { selector: "select" }),
        { target: { value: "session-a" } },
      );
      await screen.findByText("Synthetic learner 0");
      const rows = screen.getAllByRole("button", {
        name: copy.updateAttendance,
      });
      expect(rows).toHaveLength(4);
      rows.forEach((b) => expect(b).toBeDisabled());
      fireEvent.change(
        screen.getByLabelText(copy.attendanceStatus + " · Synthetic learner 0"),
        { target: { value: "Excused" } },
      );
      expect(rows[0]).toBeEnabled();
      expect(rows[1]).toBeDisabled();
      fireEvent.click(rows[0]);
      await screen.findByText(copy.attendanceSaved);
      expect(payload()).toEqual({
        studentUserId: "student-0",
        status: "Excused",
      });
    });
    it.each([
      "article",
      "teacher",
      "package",
      "session",
      "attendance",
    ] as const)(
      "blocks duplicate %s submissions while preserving independent operations",
      async (op) => {
        let release!: (value: unknown) => void;
        const pending = new Promise((r) => (release = r));
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? pending : Promise.resolve(reads(p)),
        );
        mount(locale, <ContentStudio />);
        await ready();
        const nav = {
          article: copy.articlesNav,
          teacher: copy.teachersNav,
          package: copy.packagesNav,
          session: copy.sessionsNav,
          attendance: copy.attendance,
        };
        navigate(nav[op]);
        if (op === "teacher")
          change(form(copy.teacher), copy.chooseTeacher, "teacher-a");
        if (op === "session") {
          change(form(copy.sessionsNav), copy.starts, "2026-10-29T12:00");
          change(form(copy.sessionsNav), copy.ends, "2026-10-29T13:00");
        }
        if (op === "attendance") {
          fireEvent.change(
            screen.getByLabelText(copy.attendanceSession, {
              selector: "select",
            }),
            { target: { value: "session-a" } },
          );
          await screen.findByText("Synthetic learner 0");
          fireEvent.change(screen.getByLabelText(copy.attendanceStudent), {
            target: { value: "student-a" },
          });
          fireEvent.click(
            screen.getByRole("button", { name: copy.markAttendance }),
          );
          await waitFor(() =>
            expect(
              screen.getByRole("button", { name: copy.markAttendance }),
            ).toBeDisabled(),
          );
          fireEvent.click(
            screen.getByRole("button", { name: copy.markAttendance }),
          );
        } else {
          const name = {
            article: copy.article,
            teacher: copy.teacher,
            package: copy.packagesNav,
            session: copy.sessionsNav,
          }[op];
          const node = screen.getByRole("form", { name });
          fireEvent.submit(node);
          await waitFor(() =>
            expect(
              within(node).getByRole("button", {
                name: copy.saving,
              }),
            ).toBeDisabled(),
          );
          fireEvent.submit(node);
        }
        expect(writes()).toHaveLength(1);
        navigate(op === "article" ? copy.packagesNav : copy.articlesNav);
        screen
          .queryAllByText(copy.saving)
          .forEach((node) => expect(node).not.toBeVisible());
        await act(async () => release({}));
      },
    );
    it.each(["article", "teacher", "package", "session"] as const)(
      "keeps the %s draft and operation error on failed save",
      async (op) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(new Error("RAW server failure"))
            : Promise.resolve(reads(p)),
        );
        const { invalidations } = mount(locale, <ContentStudio />);
        await ready();
        const mapping = {
          article: [copy.articlesNav, copy.article, copy.englishTitle],
          teacher: [copy.teachersNav, copy.teacher, copy.englishBio],
          package: [copy.packagesNav, copy.packagesNav, copy.englishTitle],
          session: [copy.sessionsNav, copy.sessionsNav, copy.englishTitle],
        };
        const [nav, name, label] = mapping[op];
        navigate(nav);
        const f = form(name);
        if (op === "teacher") change(f, copy.chooseTeacher, "teacher-a");
        if (op === "session") {
          change(f, copy.starts, "2026-10-29T12:00");
          change(f, copy.ends, "2026-10-29T13:00");
        }
        change(f, label, "Unsaved draft");
        fireEvent.submit(screen.getByRole("form", { name }));
        await screen.findByText("RAW server failure");
        expect(f.getByLabelText(label)).toHaveValue("Unsaved draft");
        expect(invalidations).not.toHaveBeenCalled();
        navigate(
          nav === copy.articlesNav ? copy.packagesNav : copy.articlesNav,
        );
        expect(screen.getByText("RAW server failure")).not.toBeVisible();
        navigate(nav);
        expect(screen.getByText("RAW server failure")).toBeVisible();
      },
    );
    it.each(paths)(
      "distinguishes cold error from empty and retains cached data for %s",
      async (path) => {
        const { client } = mount(locale, <ContentStudio />);
        await ready();
        const index = paths.indexOf(path),
          nav = [
            copy.teachersNav,
            copy.packagesNav,
            copy.articlesNav,
            copy.packagesNav,
            copy.sessionsNav,
            copy.sessionsNav,
            copy.attendance,
          ][index];
        navigate(nav);
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          !o?.method && p === path
            ? Promise.reject(new Error("Synthetic refresh"))
            : Promise.resolve(reads(p)),
        );
        const key = [
          "admin-content-teachers",
          "admin-content-courses",
          "admin-content-blog",
          "admin-content-packages",
          "admin-content-sessions",
          "admin-live-session-providers",
          "admin-content-students",
        ][index];
        await act(async () => {
          await client.refetchQueries({ queryKey: [key] });
        });
        await waitFor(() =>
          expect(
            screen
              .getAllByRole("alert")
              .some((e) => e.textContent?.includes(copy.refreshFailed)),
          ).toBe(true),
        );
        expect(client.getQueryData([key])).toEqual(reads(path));
        expect(screen.queryByText(copy.loadFailed)).toBeNull();
      },
    );
    it("exposes required constraints and uses four raw attendance enums", async () => {
      mount(locale, <ContentStudio />);
      await ready();
      const f = form(copy.article);
      expect(f.getByLabelText(copy.slug)).toHaveAttribute(
        "pattern",
        "[a-z0-9]+(-[a-z0-9]+)*",
      );
      for (const k of [
        "slug",
        "arabicTitle",
        "englishTitle",
        "arabicExcerpt",
        "englishExcerpt",
        "arabicBody",
        "englishBody",
      ] as const)
        expect(f.getByLabelText(copy[k])).toBeRequired();
      navigate(copy.packagesNav);
      expect(form(copy.packagesNav).getByLabelText(copy.price)).toHaveAttribute(
        "step",
        "0.001",
      );
      expect(form(copy.packagesNav).getByLabelText(copy.price)).toHaveAttribute(
        "min",
        "0",
      );
      navigate(copy.sessionsNav);
      const s = form(copy.sessionsNav);
      expect(s.getByLabelText(copy.capacity)).toHaveAttribute("min", "1");
      expect(s.getByLabelText(copy.capacity)).toHaveAttribute("max", "5000");
      for (const k of ["host", "provider", "starts", "ends"] as const)
        expect(s.getByLabelText(copy[k])).toBeRequired();
      navigate(copy.attendance);
      expect(
        Array.from(
          screen
            .getByLabelText(copy.attendanceStatus, {})
            .querySelectorAll("option"),
        ).map((o) => o.value),
      ).toEqual(["Present", "Late", "Absent", "Excused"]);
    });
  });
}
