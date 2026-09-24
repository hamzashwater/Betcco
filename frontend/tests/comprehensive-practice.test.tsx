import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import {
  StudentComprehensivePractice,
  TeacherComprehensivePractice,
} from "@/features/learning/comprehensive-practice";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {},
}));

function renderWithLocale(element: React.ReactNode, locale: "ar" | "en") {
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
        {element}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

const unit = (count: number, status: string, outcome?: string) => ({
  id: "unit",
  arabicTitle: "وحدة",
  englishTitle: "Unit",
  aims: Array.from({ length: count }, (_, index) => ({
    isComplete: status !== "Locked" || index < count - 1,
  })),
  finalPractice: {
    assignmentId: "final",
    arabicTitle: "مهمة الوحدة",
    englishTitle: "Unit Practice",
    arabicInstructions: "ارفع عملك",
    englishInstructions: "Upload your work",
    isAvailable: status === "Available",
    status,
    trainingOutcome: outcome,
    strengths: "Clear evidence",
    gaps: "Missing chart",
    improvementGuidance: "Add a chart",
    isTrainingComplete: status === "Finalized",
  },
});

describe("comprehensive practice", () => {
  it.each([3, 4])(
    "keeps a %i aim Unit Practice locked before every review is complete",
    async (count) => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/student/assignments/mine" ? [] : [unit(count, "Locked")],
        ),
      );
      renderWithLocale(
        <StudentComprehensivePractice courseId="course" />,
        "en",
      );
      expect(
        await screen.findByText(
          `Learning Aims complete: ${count - 1} / ${count}`,
        ),
      ).toBeTruthy();
      expect(
        screen.getByText("Complete all Learning Aims and their reviews first."),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Open Practice" }),
      ).toBeNull();
    },
  );

  it("shows available and submitted states without duplicate submission actions", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine" ? [] : [unit(3, "Available")],
      ),
    );
    const view = renderWithLocale(
      <StudentComprehensivePractice courseId="course" />,
      "en",
    );
    expect(
      await screen.findByRole("button", { name: "Open Practice" }),
    ).toBeTruthy();
    view.unmount();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine" ? [] : [unit(3, "Submitted")],
      ),
    );
    renderWithLocale(<StudentComprehensivePractice courseId="course" />, "en");
    expect(
      await screen.findByText("Submitted, awaiting teacher review"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Practice" })).toBeNull();
  });

  it.each(["en", "ar"] as const)(
    "shows reviewed training outcome, feedback and disclaimer in %s",
    async (locale) => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/student/assignments/mine"
            ? []
            : [unit(4, "Finalized", "Merit")],
        ),
      );
      renderWithLocale(
        <StudentComprehensivePractice courseId="course" />,
        locale,
      );
      expect(
        await screen.findByText(
          locale === "ar"
            ? /اكتمل مسار التدريب للوحدة/
            : /Unit Training Complete/,
        ),
      ).toBeTruthy();
      expect(screen.getByText(/Clear evidence/)).toBeTruthy();
      expect(screen.getByText(/Missing chart/)).toBeTruthy();
      expect(screen.getByText(/Add a chart/)).toBeTruthy();
      expect(
        screen.getByText(
          locale === "ar"
            ? /ليست نتيجة تقييم BTEC رسمي/
            : /not a formal BTEC assessment result/,
        ),
      ).toBeTruthy();
    },
  );

  it("lets the teacher create a Unit Practice", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/comprehensive-practice") ||
          path.endsWith("/comprehensive-practice/submissions")
          ? []
          : undefined,
      ),
    );
    renderWithLocale(
      <TeacherComprehensivePractice
        courseId="course"
        modules={[
          {
            id: "unit",
            unitDefinitionId: "canonical",
            arabicTitle: "وحدة",
            englishTitle: "Unit",
            criteria: [],
          },
        ]}
      />,
      "en",
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Create Unit Practice" }),
    );
    fireEvent.change(screen.getByLabelText("Arabic title"), {
      target: { value: "مهمة" },
    });
    fireEvent.change(screen.getByLabelText("English title"), {
      target: { value: "Practice" },
    });
    fireEvent.change(screen.getByLabelText("Arabic instructions"), {
      target: { value: "تعليمات" },
    });
    fireEvent.change(screen.getByLabelText("English instructions"), {
      target: { value: "Instructions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Practice" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/comprehensive-practice",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"courseModuleId":"unit"'),
        }),
      ),
    );
  });

  it("lets the teacher review a Unit Practice", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/comprehensive-practice/submissions"))
        return Promise.resolve([
          {
            id: "submission",
            courseAssignmentId: "final",
            studentUserId: "student",
            status: "Submitted",
            files: [{ id: "file", originalFileName: "unit.pdf" }],
          },
        ]);
      if (path.endsWith("/comprehensive-practice"))
        return Promise.resolve([
          {
            id: "final",
            courseModuleId: "unit",
            arabicTitle: "مهمة",
            englishTitle: "Practice",
            resources: [],
            criteria: [],
          },
        ]);
      return Promise.resolve(undefined);
    });
    renderWithLocale(
      <TeacherComprehensivePractice
        courseId="course"
        modules={[
          {
            id: "unit",
            unitDefinitionId: "canonical",
            arabicTitle: "وحدة",
            englishTitle: "Unit",
            criteria: [],
          },
        ]}
      />,
      "en",
    );
    expect(await screen.findByText("unit.pdf")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Training Outcome"), {
      target: { value: "Merit" },
    });
    fireEvent.change(screen.getByLabelText("Strengths"), {
      target: { value: "Strong" },
    });
    fireEvent.change(screen.getByLabelText("Gaps / missing evidence"), {
      target: { value: "Missing" },
    });
    fireEvent.change(screen.getByLabelText("Improvement guidance"), {
      target: { value: "Improve" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finalize review" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/comprehensive-practice/submissions/submission/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            trainingOutcome: "Merit",
            strengths: "Strong",
            gaps: "Missing",
            improvementGuidance: "Improve",
          }),
        }),
      ),
    );
  });
});
