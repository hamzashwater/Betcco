import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { CourseAssignmentPanel } from "@/features/student/student-area";
import { CourseworkDeadlineExtensionPanel } from "@/features/teacher/course-editor";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderWithProviders(component: React.ReactNode, locale: "ar" | "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {component}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.restoreAllMocks();
});

describe("individual coursework deadlines", () => {
  it.each(["en", "ar"] as const)(
    "shows only the effective student deadline and neutral indicator in %s",
    async (locale) => {
      const base = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const effective = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/student/assignments/mine"
            ? []
            : [
                {
                  id: "assignment-1",
                  lessonId: "lesson-1",
                  arabicTitle: "مهمة",
                  englishTitle: "Assignment",
                  arabicInstructions: "تعليمات",
                  englishInstructions: "Instructions",
                  dueAtUtc: base,
                  baseDueAtUtc: base,
                  effectiveDueAtUtc: effective,
                  hasDeadlineExtension: true,
                  reason: "Private staff rationale",
                  maxSubmissionAttempts: 1,
                  allowResubmission: false,
                  maxFileSizeBytes: 1000000,
                  allowedFileExtensions: [".pdf"],
                  criteria: [],
                  resources: [],
                },
              ],
        ),
      );
      renderWithProviders(
        <CourseAssignmentPanel courseId="course-1" lessonId="lesson-1" />,
        locale,
      );
      expect(
        await screen.findByText(
          locale === "ar"
            ? "تمديد فردي لموعد التسليم"
            : "Individual deadline adjustment",
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          new RegExp(locale === "ar" ? "الموعد النهائي" : "Due:"),
        ),
      ).toHaveTextContent(
        new Date(effective).toLocaleString(locale === "ar" ? "ar-JO" : "en-US"),
      );
      expect(
        screen.queryByText("Private staff rationale"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: locale === "ar" ? "بدء التسليم" : "Start submission",
        }),
      ).toBeEnabled();
    },
  );

  it("disables starting coursework after the effective deadline", async () => {
    const base = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const effective = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine"
          ? []
          : [
              {
                id: "assignment-1",
                lessonId: "lesson-1",
                arabicTitle: "مهمة",
                englishTitle: "Assignment",
                arabicInstructions: "تعليمات",
                englishInstructions: "Instructions",
                dueAtUtc: base,
                baseDueAtUtc: base,
                effectiveDueAtUtc: effective,
                hasDeadlineExtension: true,
                maxSubmissionAttempts: 1,
                allowResubmission: false,
                maxFileSizeBytes: 1000000,
                allowedFileExtensions: [".pdf"],
                criteria: [],
                resources: [],
              },
            ],
      ),
    );
    renderWithProviders(
      <CourseAssignmentPanel courseId="course-1" lessonId="lesson-1" />,
      "en",
    );
    expect(
      await screen.findByRole("button", { name: "Submission deadline passed" }),
    ).toBeDisabled();
  });

  it("does not show an extension indicator for the shared deadline", async () => {
    const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine"
          ? []
          : [
              {
                id: "assignment-1",
                lessonId: "lesson-1",
                arabicTitle: "مهمة",
                englishTitle: "Assignment",
                arabicInstructions: "تعليمات",
                englishInstructions: "Instructions",
                dueAtUtc: due,
                baseDueAtUtc: due,
                effectiveDueAtUtc: due,
                hasDeadlineExtension: false,
                maxSubmissionAttempts: 1,
                allowResubmission: false,
                maxFileSizeBytes: 1000000,
                allowedFileExtensions: [".pdf"],
                criteria: [],
                resources: [],
              },
            ],
      ),
    );
    renderWithProviders(
      <CourseAssignmentPanel courseId="course-1" lessonId="lesson-1" />,
      "en",
    );
    expect(
      await screen.findByRole("button", { name: "Start submission" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Individual deadline adjustment"),
    ).not.toBeInTheDocument();
  });

  it("lets the teacher grant and revoke an enrolled student extension", async () => {
    const base = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const history: Array<Record<string, unknown>> = [];
    apiMock.mockImplementation(
      (path: string, options?: { method?: string; body?: string }) => {
        if (path.endsWith("/eligible-students"))
          return Promise.resolve([
            { studentUserId: "student-1", displayName: "Student One" },
          ]);
        if (path.endsWith("/revoke")) {
          history[0].revokedAtUtc = new Date().toISOString();
          return Promise.resolve(history[0]);
        }
        if (options?.method === "POST") {
          const body = JSON.parse(options.body!);
          history.unshift({
            id: "extension-1",
            ...body,
            grantedAtUtc: new Date().toISOString(),
            revokedAtUtc: null,
          });
          return Promise.resolve(history[0]);
        }
        return Promise.resolve([...history]);
      },
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(
      <CourseworkDeadlineExtensionPanel
        assignment={{ id: "assignment-1", dueAtUtc: base } as never}
        disabled={false}
      />,
      "en",
    );
    const user = userEvent.setup();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Student deadline extensions" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "Student One" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Enrolled student"),
      "student-1",
    );
    const later = new Date(Date.now() + 3 * 60 * 60 * 1000);
    fireEvent.change(screen.getByLabelText("Extended deadline"), {
      target: {
        value: `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}T${String(later.getHours()).padStart(2, "0")}:${String(later.getMinutes()).padStart(2, "0")}`,
      },
    });
    await user.type(
      screen.getByLabelText("Staff rationale"),
      "Operational adjustment",
    );
    await user.click(screen.getByRole("button", { name: "Grant extension" }));
    expect(await screen.findByText("Active")).toBeVisible();
    expect(screen.getByRole("option", { name: "Student One" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.getByText("Revoked")).toBeVisible());
  });

  it("shows Arabic labels and an access error when staff data cannot load", async () => {
    apiMock.mockRejectedValue(new Error("forbidden"));
    renderWithProviders(
      <CourseworkDeadlineExtensionPanel
        assignment={
          { id: "assignment-1", dueAtUtc: new Date().toISOString() } as never
        }
        disabled={false}
      />,
      "ar",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "تمديدات مواعيد الطلاب" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر تحميل بيانات التمديد",
    );
    expect(screen.getByLabelText("الطالب المسجل")).toBeVisible();
  });
});
