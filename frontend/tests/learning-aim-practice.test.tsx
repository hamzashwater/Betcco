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
  StudentLearningAimPractice,
  TeacherLearningAimPractice,
} from "@/features/learning/learning-aim-practice";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

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

describe("learning aim practice", () => {
  it.each([3, 4])(
    "renders %i canonical aims with separate content and practice states",
    async (count) => {
      const aims = Array.from({ length: count }, (_, index) => ({
        id: `aim-${index}`,
        code: String.fromCharCode(65 + index),
        arabicTitle: `هدف ${index}`,
        englishTitle: `Aim ${index}`,
        isUnlocked: index === 0,
        contentTotal: 2,
        contentCompleted: index === 0 ? 2 : 0,
        contentComplete: index === 0,
        assignmentId: index === 0 ? "practice-1" : null,
        assignmentEnglishTitle: "Practice",
        englishInstructions: "Upload work",
        practiceAvailable: index === 0,
        practiceStatus: index === 0 ? "Finalized" : "Locked",
        trainingOutcome: index === 0 ? "Merit" : null,
        strengths: "Clear argument",
        gaps: "Missing chart",
        improvementGuidance: "Add a chart",
        isComplete: index === 0,
      }));
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/student/assignments/mine"
            ? []
            : [{ id: "unit", englishTitle: "Unit", arabicTitle: "وحدة", aims }],
        ),
      );
      renderWithLocale(<StudentLearningAimPractice courseId="course" />, "en");
      expect(
        await screen.findByText(`Aim ${count - 1}`, { exact: false }),
      ).toBeTruthy();
      expect(screen.getAllByRole("article")).toHaveLength(count);
      expect(screen.getAllByText("Content: 2 / 2")).toHaveLength(1);
      expect(screen.getByText("Training Outcome: Merit")).toBeTruthy();
      expect(screen.getByText(/This formative training result/)).toBeTruthy();
      expect(screen.getByText(/Clear argument/)).toBeTruthy();
      expect(screen.getByText(/Missing chart/)).toBeTruthy();
      expect(screen.getByText(/Add a chart/)).toBeTruthy();
    },
  );

  it("shows attempt history and lets the learner start an improvement attempt", async () => {
    apiMock.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/student/assignments/mine")
          return Promise.resolve([
            {
              id: "submission",
              assignmentId: "practice",
              status: "Finalized",
              currentVersionNumber: 2,
              versions: [
                {
                  versionNumber: 1,
                  files: [{ id: "file-1", originalFileName: "first.pdf" }],
                },
                {
                  versionNumber: 2,
                  files: [{ id: "file-2", originalFileName: "second.pdf" }],
                },
              ],
            },
          ]);
        if (path === "/student/courses/course/learning-aim-practice")
          return Promise.resolve([
            {
              id: "unit",
              englishTitle: "Unit",
              arabicTitle: "وحدة",
              aims: [
                {
                  id: "aim",
                  code: "A",
                  arabicTitle: "هدف",
                  englishTitle: "Aim",
                  isUnlocked: true,
                  contentTotal: 1,
                  contentCompleted: 1,
                  contentComplete: true,
                  assignmentId: "practice",
                  assignmentEnglishTitle: "Practice",
                  englishInstructions: "Upload work",
                  practiceAvailable: true,
                  practiceStatus: "Finalized",
                  maxAttempts: 3,
                  attemptsUsed: 2,
                  attemptsRemaining: 1,
                  canStartNewAttempt: true,
                  trainingOutcome: "Merit",
                  bestTrainingOutcome: "Merit",
                  strengths: "Better structure",
                  gaps: "More evidence",
                  improvementGuidance: "Add evidence",
                  attemptHistory: [
                    {
                      attemptNumber: 1,
                      status: "Finalized",
                      submittedAtUtc: "2026-09-10T10:00:00Z",
                      reviewedAtUtc: "2026-09-10T12:00:00Z",
                      trainingOutcome: "Pass",
                      strengths: "First strength",
                      gaps: "First gap",
                      improvementGuidance: "First guidance",
                    },
                    {
                      attemptNumber: 2,
                      status: "Finalized",
                      submittedAtUtc: "2026-09-15T10:00:00Z",
                      reviewedAtUtc: "2026-09-15T12:00:00Z",
                      trainingOutcome: "Merit",
                      strengths: "Better structure",
                      gaps: "More evidence",
                      improvementGuidance: "Add evidence",
                    },
                  ],
                  isComplete: true,
                },
              ],
            },
          ]);
        if (
          path === "/student/assignments/practice/submissions" &&
          options?.method === "POST"
        )
          return Promise.resolve({
            submissionId: "submission",
            versionNumber: 3,
          });
        return Promise.resolve(undefined);
      },
    );

    renderWithLocale(<StudentLearningAimPractice courseId="course" />, "en");
    expect(await screen.findByText(/Attempts: 2 \/ 3/)).toBeTruthy();
    expect(screen.getByText(/Remaining: 1/)).toBeTruthy();
    expect(
      screen.getByText("Best achieved:", { exact: false }).parentElement
        ?.textContent,
    ).toContain("Merit");
    expect(
      screen.getByText("Progress:", { exact: false }).parentElement
        ?.textContent,
    ).toContain("Pass → Merit");
    expect(
      screen.getByRole("link", { name: "first.pdf" }).getAttribute("href"),
    ).toBe("/api/v1/assignments/submissions/submission/files/file-1");
    expect(
      document.querySelector('time[datetime="2026-09-10T10:00:00Z"]'),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Start improvement attempt" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/student/assignments/practice/submissions",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows Arabic practice status and training disclaimer", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/student/assignments/mine"
          ? []
          : [
              {
                id: "unit",
                englishTitle: "Unit",
                arabicTitle: "وحدة",
                aims: [
                  {
                    id: "aim",
                    code: "A",
                    arabicTitle: "هدف أ",
                    englishTitle: "Aim A",
                    isUnlocked: true,
                    contentTotal: 1,
                    contentCompleted: 1,
                    contentComplete: true,
                    assignmentId: "practice",
                    practiceAvailable: false,
                    practiceStatus: "Finalized",
                    trainingOutcome: "Pass",
                    strengths: "قوة",
                    gaps: "نقص",
                    improvementGuidance: "تحسين",
                    isComplete: true,
                  },
                ],
              },
            ],
      ),
    );
    renderWithLocale(<StudentLearningAimPractice courseId="course" />, "ar");
    expect(await screen.findByText(/هدف أ/)).toBeTruthy();
    expect(screen.getByText(/هذه نتيجة تدريبية تكوينية/)).toBeTruthy();
    expect(screen.getByText(/المحتوى: 1 \/ 1/)).toBeTruthy();
  });

  it("lets the course teacher finalize a practice review with structured feedback", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/practice/submissions"))
        return Promise.resolve([
          {
            id: "submission",
            courseAssignmentId: "practice",
            studentUserId: "student",
            status: "Submitted",
            currentVersionNumber: 2,
            maxSubmissionAttempts: 2,
            attemptHistory: [
              {
                attemptNumber: 1,
                status: "Finalized",
                submittedAtUtc: "2026-09-12T09:00:00Z",
                reviewedAtUtc: "2026-09-12T11:00:00Z",
                trainingOutcome: "Pass",
                trainingStrengths: "Earlier strength",
                trainingGaps: "Earlier gap",
                trainingImprovementGuidance: "Earlier guidance",
                files: [
                  { id: "old-file", originalFileName: "first-attempt.pdf" },
                ],
              },
            ],
            files: [{ id: "file", originalFileName: "work.pdf" }],
          },
        ]);
      if (path.endsWith("/practice"))
        return Promise.resolve([
          {
            id: "practice",
            btecLearningAimId: "aim",
            englishTitle: "Practice",
            arabicTitle: "نشاط",
            maxSubmissionAttempts: 2,
          },
        ]);
      return Promise.resolve(undefined);
    });
    renderWithLocale(
      <TeacherLearningAimPractice
        courseId="course"
        modules={[
          {
            id: "unit",
            unitDefinitionId: "definition",
            arabicTitle: "وحدة",
            englishTitle: "Unit",
            learningAims: [
              { id: "aim", code: "A", arabicTitle: "هدف", englishTitle: "Aim" },
            ],
          },
        ]}
      />,
      "en",
    );
    expect(await screen.findByText("work.pdf")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "first-attempt.pdf" })
        .getAttribute("href"),
    ).toBe("/api/v1/assignments/submissions/submission/files/old-file");
    expect(
      document.querySelector('time[datetime="2026-09-12T09:00:00Z"]'),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Maximum attempts"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save attempt limit" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/practice/practice/attempt-limit",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ maxSubmissionAttempts: 3 }),
        }),
      ),
    );

    fireEvent.change(screen.getByLabelText("Training Outcome"), {
      target: { value: "Merit" },
    });
    fireEvent.change(screen.getByLabelText("Strengths"), {
      target: { value: "Strong evidence" },
    });
    fireEvent.change(screen.getByLabelText("Missing / gaps"), {
      target: { value: "Missing chart" },
    });
    fireEvent.change(screen.getByLabelText("Improvement guidance"), {
      target: { value: "Add chart" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finalize review" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/teacher/practice/submissions/submission/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            trainingOutcome: "Merit",
            strengths: "Strong evidence",
            gaps: "Missing chart",
            improvementGuidance: "Add chart",
          }),
        }),
      ),
    );
  });
});
