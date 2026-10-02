import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentProgressIntelligence } from "@/features/student/student-progress-intelligence";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderProgress(locale: "ar" | "en" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <StudentProgressIntelligence courseId="course-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});
describe("StudentProgressIntelligence", () => {
  it("derives the next step from saved content and practice progress", async () => {
    apiMock.mockResolvedValue([
      {
        id: "unit-1",
        arabicTitle: "الوحدة الأولى",
        englishTitle: "Unit one",
        aims: [
          {
            id: "aim-a",
            code: "A",
            arabicTitle: "الهدف أ",
            englishTitle: "Aim A",
            isUnlocked: true,
            contentTotal: 2,
            contentCompleted: 2,
            contentComplete: true,
            assignmentId: "practice-a",
            practiceAvailable: true,
            practiceStatus: "Finalized",
            maxAttempts: 3,
            attemptsUsed: 2,
            attemptsRemaining: 1,
            trainingOutcome: "Merit",
            bestTrainingOutcome: "Distinction",
            isComplete: true,
          },
          {
            id: "aim-b",
            code: "B",
            arabicTitle: "الهدف ب",
            englishTitle: "Aim B",
            isUnlocked: true,
            contentTotal: 3,
            contentCompleted: 1,
            contentComplete: false,
            assignmentId: "practice-b",
            practiceAvailable: false,
            practiceStatus: "Locked",
            maxAttempts: 2,
            attemptsUsed: 0,
            attemptsRemaining: 2,
            isComplete: false,
          },
        ],
        finalPractice: {
          assignmentId: "final-1",
          isAvailable: false,
          status: "Locked",
          unavailableReason: "LearningAimsIncomplete",
          isTrainingComplete: false,
        },
      },
    ]);
    renderProgress();

    expect(
      await screen.findByRole("heading", { name: "My progress" }),
    ).toBeVisible();
    expect(
      screen.getAllByText("Continue Aim B content (1/3 complete).").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Learning content").closest("article"),
    ).toHaveTextContent("3/5");
    expect(
      screen.getByText("Learning Aims complete").closest("article"),
    ).toHaveTextContent("1/2");
    expect(screen.getByText(/Attempts 2\/3 · 1 remaining/)).toBeVisible();
    expect(screen.getByText(/Latest: Merit/)).toBeVisible();
    expect(screen.getByText(/Best: Distinction/)).toBeVisible();
    expect(apiMock).toHaveBeenCalledWith(
      "/student/courses/course-1/learning-aim-practice",
    );
  });

  it("shows Final Unit Practice readiness when every Learning Aim is complete", async () => {
    apiMock.mockResolvedValue([
      {
        id: "unit-1",
        arabicTitle: "الوحدة الأولى",
        englishTitle: "Unit one",
        aims: [
          {
            id: "aim-a",
            code: "A",
            arabicTitle: "الهدف أ",
            englishTitle: "Aim A",
            isUnlocked: true,
            contentTotal: 1,
            contentCompleted: 1,
            contentComplete: true,
            assignmentId: "practice-a",
            practiceAvailable: false,
            practiceStatus: "Finalized",
            maxAttempts: 1,
            attemptsUsed: 1,
            attemptsRemaining: 0,
            trainingOutcome: "Pass",
            bestTrainingOutcome: "Pass",
            isComplete: true,
          },
        ],
        finalPractice: {
          assignmentId: "final-1",
          isAvailable: true,
          status: "Available",
          isTrainingComplete: false,
        },
      },
    ]);

    renderProgress();

    expect(
      await screen.findByText("Ready for Final Unit Practice"),
    ).toBeVisible();
    expect(
      screen.getAllByText(
        "All Learning Aims are complete. Start the Final Unit Practice.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Units ready for Final Practice").closest("article"),
    ).toHaveTextContent("1");
  });

  it("does not mislabel a fully locked Unit as a previous-Aim blocker", async () => {
    apiMock.mockResolvedValue([
      {
        id: "unit-1",
        arabicTitle: "الوحدة الأولى",
        englishTitle: "Unit one",
        aims: [
          {
            id: "aim-a",
            code: "A",
            arabicTitle: "الهدف أ",
            englishTitle: "Aim A",
            isUnlocked: false,
            contentTotal: 2,
            contentCompleted: 0,
            contentComplete: false,
            practiceAvailable: false,
            practiceStatus: "Locked",
            maxAttempts: 0,
            attemptsUsed: 0,
            attemptsRemaining: 0,
            isComplete: false,
          },
        ],
        finalPractice: {
          isAvailable: false,
          status: "Locked",
          unavailableReason: "AccessRestricted",
          isTrainingComplete: false,
        },
      },
    ]);

    renderProgress();

    expect(
      (
        await screen.findAllByText(
          "This Unit is currently unavailable. Return when your course access opens it.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("waits for published learning content instead of showing a 0/0 action", async () => {
    apiMock.mockResolvedValue([
      {
        id: "unit-1",
        arabicTitle: "الوحدة الأولى",
        englishTitle: "Unit one",
        aims: [
          {
            id: "aim-a",
            code: "A",
            arabicTitle: "الهدف أ",
            englishTitle: "Aim A",
            isUnlocked: true,
            contentTotal: 0,
            contentCompleted: 0,
            contentComplete: false,
            practiceAvailable: false,
            practiceStatus: "NotConfigured",
            maxAttempts: 0,
            attemptsUsed: 0,
            attemptsRemaining: 0,
            isComplete: false,
          },
        ],
        finalPractice: {
          isAvailable: false,
          status: "NotConfigured",
          unavailableReason: "LearningAimsIncomplete",
          isTrainingComplete: false,
        },
      },
    ]);

    renderProgress();

    expect(
      (
        await screen.findAllByText(
          "Aim A does not have published learning content yet. Wait for the teacher to publish it.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("renders localized Arabic guidance without changing the stored state", async () => {
    apiMock.mockResolvedValue([
      {
        id: "unit-1",
        arabicTitle: "الوحدة الأولى",
        englishTitle: "Unit one",
        aims: [
          {
            id: "aim-a",
            code: "A",
            arabicTitle: "الهدف أ",
            englishTitle: "Aim A",
            isUnlocked: true,
            contentTotal: 2,
            contentCompleted: 2,
            contentComplete: true,
            assignmentId: "practice-a",
            practiceAvailable: false,
            practiceStatus: "Submitted",
            maxAttempts: 2,
            attemptsUsed: 1,
            attemptsRemaining: 1,
            isComplete: false,
          },
        ],
        finalPractice: {
          assignmentId: "final-1",
          isAvailable: false,
          status: "Locked",
          unavailableReason: "LearningAimsIncomplete",
          isTrainingComplete: false,
        },
      },
    ]);
    renderProgress("ar");

    expect(await screen.findByRole("heading", { name: "تقدمي" })).toBeVisible();
    expect(
      screen.getAllByText("تم تسليم تدريب الهدف A. انتظر مراجعة المعلم.")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/لا يستخدم الذكاء الاصطناعي/)).toBeVisible();
  });
});

function contextualUnit() {
  return {
    id: "context-unit",
    englishTitle: "Context Unit",
    arabicTitle: "الوحدة",
    aims: [
      {
        id: "context-aim",
        code: "A",
        englishTitle: "Context Aim",
        arabicTitle: "الهدف",
        isUnlocked: true,
        contentTotal: 2,
        contentCompleted: 2,
        contentComplete: true,
        assignmentId: "practice",
        practiceAvailable: true,
        practiceStatus: "Available",
        maxAttempts: 2,
        attemptsUsed: 0,
        attemptsRemaining: 2,
        isComplete: false,
      },
    ],
    finalPractice: {
      assignmentId: "final",
      isAvailable: false,
      status: "Locked",
      isTrainingComplete: false,
    },
  };
}
describe("contextual progress disclosure", () => {
  it.each([
    ["Draft", "Finish and submit your Aim A practice attempt."],
    [
      "Submitted",
      "Aim A practice is submitted. Wait for the teacher's review.",
    ],
    ["Available", "Aim A content is complete. Start its practice activity."],
  ])(
    "retains the authoritative %s practice guidance",
    async (status, expected) => {
      const unit = contextualUnit();
      unit.aims[0].practiceStatus = status;
      apiMock.mockResolvedValue([unit]);
      renderProgress();
      expect(await screen.findByText(expected)).toBeVisible();
    },
  );
  it.each([
    [
      "Submitted",
      false,
      "Your Final Unit Practice is submitted. Wait for the teacher's review.",
    ],
    [
      "Available",
      false,
      "All Learning Aims are complete. Start the Final Unit Practice.",
    ],
    ["Finalized", true, "This Unit's formative training path is complete."],
  ])(
    "retains %s Final Unit Practice semantics",
    async (status, complete, expected) => {
      const unit = contextualUnit();
      unit.aims[0].isComplete = true;
      Object.assign(unit.finalPractice, {
        status,
        isAvailable: status === "Available",
        isTrainingComplete: complete,
      });
      apiMock.mockResolvedValue([unit]);
      renderProgress();
      expect(await screen.findByText(expected)).toBeVisible();
    },
  );
  it("opens the first unfinished Unit and keeps completed Unit information accessible", async () => {
    const completed = contextualUnit(),
      unfinished = contextualUnit();
    completed.id = "completed";
    completed.englishTitle = "Completed Unit";
    completed.aims[0].isComplete = true;
    completed.finalPractice.isTrainingComplete = true;
    unfinished.id = "unfinished";
    unfinished.englishTitle = "Unfinished Unit";
    apiMock.mockResolvedValue([completed, unfinished]);
    const { container } = renderProgress();
    await screen.findByText("Unfinished Unit");
    const details = container.querySelectorAll("details");
    expect(details[0]).not.toHaveAttribute("open");
    expect(details[1]).toHaveAttribute("open");
    expect(details[0]).toHaveTextContent("Context Aim", {
      normalizeWhitespace: true,
    });
  });
});
