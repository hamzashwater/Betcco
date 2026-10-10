import { ContentStudio } from "@/features/admin/content-studio";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { mount } from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
beforeEach(() => {
  apiMock.mockReset();
});
const mutations = [
  { name: "article", path: "/admin/content/blog", method: "POST", form: 0 },
  {
    name: "teacher profile",
    path: "/admin/content/teachers/teacher/profile",
    method: "PUT",
    form: 1,
  },
  { name: "package", path: "/admin/content/packages", method: "POST", form: 2 },
  {
    name: "session",
    path: "/admin/content/live-sessions",
    method: "POST",
    form: 3,
  },
  {
    name: "attendance",
    path: "/admin/content/live-sessions/session/attendance",
    method: "PUT",
    form: -1,
  },
];
for (const locale of ["ar", "en"] as const) {
  const copy = (locale === "ar" ? ar : en).adminContent;
  describe(`Content Studio residual fallback in ${locale} (mocked API contracts)`, () => {
    it.each(mutations)(
      "localizes the non-Error fallback for $name without changing its request",
      async (mutation) => {
        apiMock.mockImplementation((path: string, options?: RequestInit) => {
          if (options?.method)
            return Promise.reject({ code: "NON_ERROR_REJECTION" });
          if (path === "/admin/content/teachers")
            return Promise.resolve([
              {
                id: "teacher",
                displayName: "RAW Teacher",
                email: "teacher@example.test",
                isFrozen: false,
              },
            ]);
          if (path === "/admin/content/live-sessions")
            return Promise.resolve([
              {
                id: "session",
                arabicTitle: "جلسة خام",
                englishTitle: "RAW Session",
                provider: "Manual",
                startsAtUtc: "2026-10-10T12:00:00Z",
                isPublished: false,
              },
            ]);
          if (path.startsWith("/admin/users"))
            return Promise.resolve({
              items: [
                {
                  id: "student",
                  displayName: "RAW Student",
                  email: "student@example.test",
                },
              ],
            });
          return Promise.resolve([]);
        });
        const { invalidations } = mount(locale, <ContentStudio />);
        await screen.findByRole("option", { name: "RAW Teacher" });
        const forms = document.querySelectorAll("form");
        if (mutation.form === 1)
          fireEvent.change(forms[1].querySelector("select")!, {
            target: { value: "teacher" },
          });
        if (mutation.form === 3) {
          const dates = forms[3].querySelectorAll(
            'input[type="datetime-local"]',
          );
          fireEvent.change(dates[0], { target: { value: "2026-10-10T12:00" } });
          fireEvent.change(dates[1], { target: { value: "2026-10-10T13:00" } });
        }
        if (mutation.form === -1) {
          fireEvent.change(screen.getByLabelText(copy.attendanceSession), {
            target: { value: "session" },
          });
          fireEvent.change(screen.getByLabelText(copy.attendanceStudent), {
            target: { value: "student" },
          });
          fireEvent.click(
            screen.getByRole("button", { name: copy.markAttendance }),
          );
        } else fireEvent.submit(forms[mutation.form]);
        expect(await screen.findByRole("status")).toHaveTextContent(
          copy.requestFailed,
        );
        const writes = apiMock.mock.calls.filter(
          ([, options]) => options?.method,
        );
        expect(writes).toHaveLength(1);
        expect(writes[0][0]).toBe(mutation.path);
        expect(writes[0][1].method).toBe(mutation.method);
        const body: Record<string, unknown> = JSON.parse(writes[0][1].body);
        if (mutation.form === 0)
          expect(body).toEqual({
            slug: "",
            arabicTitle: "",
            englishTitle: "",
            arabicExcerpt: "",
            englishExcerpt: "",
            arabicBody: "",
            englishBody: "",
            isPublished: false,
          });
        if (mutation.form === 1)
          expect(body).toEqual({
            arabicBio: null,
            englishBio: null,
            arabicSpecializations: null,
            englishSpecializations: null,
            isPublic: false,
          });
        if (mutation.form === 2)
          expect(body).toEqual({
            slug: "",
            arabicTitle: "",
            englishTitle: "",
            arabicDescription: "",
            englishDescription: "",
            price: 0,
            availableFromUtc: null,
            availableUntilUtc: null,
            isPublished: false,
            courseIds: [],
          });
        if (mutation.form === 3)
          expect(body).toEqual({
            courseId: null,
            hostUserId: "",
            arabicTitle: "",
            englishTitle: "",
            arabicDescription: null,
            englishDescription: null,
            provider: "Manual",
            joinUrl: null,
            recordingUrl: null,
            startsAtUtc: new Date("2026-10-10T12:00").toISOString(),
            endsAtUtc: new Date("2026-10-10T13:00").toISOString(),
            capacity: null,
            isPublished: false,
          });
        if (mutation.form === -1)
          expect(body).toEqual({ studentUserId: "student", status: "Present" });
        expect(invalidations).not.toHaveBeenCalled();
      },
    );
    it("preserves Error.message verbatim and protects empty teacher/attendance selections", async () => {
      apiMock.mockImplementation((_path: string, options?: RequestInit) =>
        options?.method
          ? Promise.reject(new Error("RAW server <error>"))
          : Promise.resolve(
              _path.startsWith("/admin/users") ? { items: [] } : [],
            ),
      );
      mount(locale, <ContentStudio />);
      const forms = document.querySelectorAll("form");
      fireEvent.submit(forms[1]);
      expect(
        screen.getByRole("button", { name: copy.markAttendance }),
      ).toBeDisabled();
      expect(
        apiMock.mock.calls.filter(([, options]) => options?.method),
      ).toHaveLength(0);
      fireEvent.submit(forms[0]);
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "RAW server <error>",
        ),
      );
      expect(screen.getByRole("status").querySelector("error")).toBeNull();
    });
  });
}
