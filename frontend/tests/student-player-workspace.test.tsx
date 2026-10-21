import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentArea } from "@/features/student/student-area";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  workspaceCourseId,
  workspaceLessonIds,
  workspaceResponse,
} from "./fixtures/player-workspace";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.unstubAllGlobals();
});
function mount(
  locale: "en" | "ar",
  options: { video?: boolean; final?: boolean; pendingMine?: boolean } = {},
) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return Promise.resolve({
        submissionId: "submission-target",
        versionNumber: 1,
      });
    if (options.pendingMine && path === "/student/assignments/mine")
      return new Promise(() => {});
    const value = workspaceResponse(
      path,
      locale,
      options.video ? workspaceLessonIds.Video : workspaceLessonIds.Text,
      options.final,
    );
    return value === undefined
      ? Promise.reject(new Error("Outside synthetic contract"))
      : Promise.resolve(value);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        <StudentArea segment={["learn", workspaceCourseId]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
describe.each(["en", "ar"] as const)(
  "%s local learning workspace",
  (locale) => {
    const copy = locale === "ar" ? ar : en;
    it("keeps note/question drafts, resource filters and the frozen AI panel mounted across local sections without writes", async () => {
      mount(locale);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("tab", {
          name: copy.studentPlayerWorkspace.notes,
        }),
      );
      const note = screen.getByPlaceholderText(
        copy.studentWorkspace.lessonWorkspace.notePlaceholder,
      );
      const question = screen.getByPlaceholderText(
        copy.studentWorkspace.lessonWorkspace.questionPlaceholder,
      );
      await user.clear(note);
      await user.type(note, "UNSAVED note مسودة");
      await user.type(question, "UNSENT question سؤال");
      const before = apiMock.mock.calls.length;
      await user.click(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.resources,
        }),
      );
      const filter = await screen.findByRole("combobox", {
        name: copy.studentWorkspace.resources.filter,
      });
      await user.selectOptions(filter, "PDF");
      await user.click(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.gradebook,
        }),
      );
      await user.click(
        screen.getByRole("tab", { name: copy.studentPlayerWorkspace.notes }),
      );
      expect(note).toHaveValue("UNSAVED note مسودة");
      expect(question).toHaveValue("UNSENT question سؤال");
      await user.click(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.resources,
        }),
      );
      expect(filter).toHaveValue("PDF");
      expect(
        screen.getByText(copy.studentWorkspace.aiTutor.title),
      ).toBeVisible();
      expect(apiMock.mock.calls.slice(before)).toEqual([]);
    });
    it("focuses the exact server Aim, preserves its comment and selected file across tabs, and never submits on navigation", async () => {
      const { container } = mount(locale);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("tab", {
          name: copy.studentPlayerWorkspace.resources,
        }),
      );
      await user.click(
        await screen.findByRole("button", {
          name: copy.studentPlayerWorkspace.openPractice,
        }),
      );
      const target = container.querySelector(
        "#player-practice-aim-aim-target",
      )!;
      await waitFor(() => expect(target).toHaveFocus());
      expect(
        screen.getByRole("tab", { name: copy.studentPlayerWorkspace.practice }),
      ).toHaveAttribute("aria-selected", "true");
      await user.click(
        within(target as HTMLElement).getByRole("button", {
          name: copy.learningPractice.common.continueDraft,
        }),
      );
      const comment = await screen.findByRole("textbox", {
        name: copy.learningPractice.common.teacherNote,
      });
      await user.type(comment, "Unsubmitted practice draft");
      const file = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const selected = new File(["private draft"], "draft.txt", {
        type: "text/plain",
      });
      await user.upload(file, selected);
      const before = apiMock.mock.calls.length;
      await user.click(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.gradebook,
        }),
      );
      await user.click(
        screen.getByRole("tab", { name: copy.studentPlayerWorkspace.practice }),
      );
      expect(comment).toHaveValue("Unsubmitted practice draft");
      expect(file.files?.[0]).toBe(selected);
      expect(screen.getByText("draft.txt")).toBeVisible();
      expect(apiMock.mock.calls.slice(before)).toEqual([]);
      expect(
        apiMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
    });
    it("uses the Final Unit target without deriving a new workflow state", async () => {
      const { container } = mount(locale, { final: true });
      await userEvent.setup().click(
        await screen.findByRole("button", {
          name: copy.studentPlayerWorkspace.openPractice,
        }),
      );
      await waitFor(() =>
        expect(
          container.querySelector("#player-practice-unit-unit-one"),
        ).toHaveFocus(),
      );
      expect(apiMock.mock.calls.every(([, init]) => !init)).toBe(true);
    });
    it("keeps video element/position and manual completion guard unchanged while switching local context", async () => {
      const { container } = mount(locale, { video: true });
      await screen.findByRole("tab", {
        name: copy.studentPlayerWorkspace.resources,
      });
      const video = container.querySelector("video")!;
      fireEvent.loadedMetadata(video);
      video.currentTime = 57;
      const before = apiMock.mock.calls.length;
      fireEvent.click(
        screen.getByRole("tab", { name: copy.studentPlayerWorkspace.notes }),
      );
      fireEvent.click(
        screen.getByRole("tab", { name: copy.studentPlayerWorkspace.practice }),
      );
      expect(container.querySelector("video")).toBe(video);
      expect(video.currentTime).toBe(57);
      expect(
        screen.getByRole("button", {
          name: copy.studentWorkspace.coursePlayer.videoCompletion,
        }),
      ).toBeDisabled();
      expect(apiMock.mock.calls.slice(before)).toEqual([]);
    });
    it("supports logical RTL/LTR arrow, Home/End and tab-panel relationships", async () => {
      mount(locale);
      const user = userEvent.setup();
      const practice = await screen.findByRole("tab", {
        name: copy.studentPlayerWorkspace.practice,
      });
      practice.focus();
      await user.keyboard(locale === "ar" ? "{ArrowLeft}" : "{ArrowRight}");
      expect(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.resources,
        }),
      ).toHaveFocus();
      await user.keyboard("{End}");
      expect(
        screen.getByRole("tab", {
          name: copy.studentPlayerWorkspace.gradebook,
        }),
      ).toHaveFocus();
      await user.keyboard("{Home}");
      expect(practice).toHaveFocus();
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        practice.id,
      );
    });
  },
);
