import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseEditor } from "@/features/teacher/course-editor";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import knownMessages from "./fixtures/teacher-course-error-messages.json";

// MOCKED UI-CONTRACT EVIDENCE: real components/providers, mocked transport.
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const course = {
  id: "course-1",
  isBtecFocused: false,
  arabicTitle: "دورة الخادم",
  englishTitle: "RAW Course",
  arabicDescription: "وصف",
  englishDescription: "RAW Description",
  status: "Draft",
  price: 0,
  isFree: true,
  hasCover: true,
  outcomes: [],
  modules: [],
};
let reasons: string[], failure: unknown;
const clients: QueryClient[] = [];
beforeEach(() => {
  reasons = [];
  failure = undefined;
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method) {
      if (failure !== undefined) throw failure;
      if (path.endsWith("/submit")) return { passed: false, reasons };
      return {};
    }
    if (path === "/teacher/courses/course-1") return course;
    if (path.startsWith("/gradebook/"))
      return { totalStudents: 0, students: [], page: 1, pageSize: 25 };
    if (path.endsWith("/learning-access"))
      return {
        items: [],
        prerequisiteCourses: [],
        rules: [],
        prerequisites: [],
      };
    return [];
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});
function mount(locale: "ar" | "en", injectedFileCopy = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const originalMessages = locale === "ar" ? arMessages : enMessages;
  const messages = injectedFileCopy
    ? {
        ...originalMessages,
        teacherWorkspace: {
          ...originalMessages.teacherWorkspace,
          filePicker: {
            ...originalMessages.teacherWorkspace.filePicker,
            noFilesSelected: "CATALOG empty",
            oneFileSelected: "CATALOG one {count}",
            filesSelected: "CATALOG many {count}",
            selectedFiles: "CATALOG selected",
            chooseInput: "CATALOG input {label}",
            removeFile: "CATALOG remove {fileName}",
            oversizedFile: "CATALOG oversized {fileName} {limit}",
          },
        },
      }
    : originalMessages;
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={client}>
        <CourseEditor courseId="course-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { client, m: messages.teacherWorkspace };
}
describe.each(["ar", "en"] as const)(
  "Teacher residual course errors %s",
  (locale) => {
    it("renders FilePicker catalogue copy from the real Teacher caller and keeps its explicit chooseLabel", async () => {
      const { m } = mount(locale, true);
      await screen.findByText("CATALOG empty");
      expect(
        screen.getByRole("button", { name: m.cover.choose }),
      ).toBeVisible();
      const input = screen.getByLabelText(`CATALOG input ${m.cover.image}`);
      const file = new File(["ok"], "raw cover.png", { type: "image/png" });
      fireEvent.change(input, { target: { files: [file] } });
      expect(screen.getByText("CATALOG one 1")).toBeVisible();
      expect(
        screen.getByRole("list", { name: "CATALOG selected" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "CATALOG remove raw cover.png" }),
      ).toBeVisible();
      const oversized = new File(["large"], "large.png", { type: "image/png" });
      Object.defineProperty(oversized, "size", { value: 5 * 1024 * 1024 + 1 });
      fireEvent.change(input, { target: { files: [oversized] } });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "CATALOG oversized large.png 5.00 MB",
      );
      expect(screen.getByText(file.name)).toBeVisible();
    });
    it.each(knownMessages)(
      "keeps the exact known display for $match",
      async (item) => {
        reasons = [item.match];
        const { m, client } = mount(locale);
        const invalidate = vi.spyOn(client, "invalidateQueries");
        fireEvent.click(
          await screen.findByRole("button", {
            name: m.reviewSubmission.submit,
          }),
        );
        expect(await screen.findByText(item[locale])).toBeVisible();
        expect(apiMock).toHaveBeenCalledWith(
          "/teacher/courses/course-1/submit",
          { method: "POST" },
        );
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["teacher-course", "course-1"],
        });
      },
    );
    it("retains raw unknown/empty/prototype-like reasons without hiding them or throwing", async () => {
      reasons = [
        "RAW unknown server reason — تفاصيل",
        "constructor",
        "toString",
        "",
      ];
      const { m } = mount(locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      expect(await screen.findByText(reasons[0])).toBeVisible();
      expect(screen.getByText("constructor")).toBeVisible();
      expect(screen.getByText("toString")).toBeVisible();
    });
    it.each(knownMessages)(
      "localizes Error.message for $match before the provided fallback",
      async (item) => {
        failure = new Error(item.match);
        const { m } = mount(locale);
        fireEvent.click(
          await screen.findByRole("button", {
            name: m.reviewSubmission.submit,
          }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          item[locale],
        );
      },
    );
    it("preserves non-Error fallback routing and role=alert", async () => {
      failure = { diagnostic: "RAW diagnostic object" };
      const { m } = mount(locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        m.courseEditor.requestFailed,
      );
      expect(screen.queryByText("RAW diagnostic object")).toBeNull();
    });
    it("preserves raw unknown Error.message", async () => {
      failure = new Error("RAW unknown Error.message");
      const { m } = mount(locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "RAW unknown Error.message",
      );
    });
    it("does not display a falsey rejection, preserving the original error visibility guard", async () => {
      failure = "";
      const { m } = mount(locale);
      fireEvent.click(
        await screen.findByRole("button", { name: m.reviewSubmission.submit }),
      );
      await waitFor(() =>
        expect(
          apiMock.mock.calls.some(
            ([path, options]) =>
              path.endsWith("/submit") && options?.method === "POST",
          ),
        ).toBe(true),
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });
  },
);
