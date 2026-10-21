import { practiceUnit } from "../helpers/learning-practice-fixtures";

// Synthetic response contracts, not live progression or assessment evidence.
export const formativeStates = [
  "locked",
  "missing",
  "content",
  "draft",
  "submitted",
  "reviewed",
  "complete",
  "improvement",
] as const;
export type FormativeState = (typeof formativeStates)[number];
export function formativeUnits(state: FormativeState) {
  const unit = structuredClone(practiceUnit);
  const aim = unit.aims[0];
  const reviewed = ["reviewed", "complete", "improvement"].includes(state);
  const status = reviewed
    ? "Finalized"
    : state === "submitted"
      ? "Submitted"
      : state === "draft"
        ? "Draft"
        : state === "missing"
          ? "NotConfigured"
          : "Locked";
  const available = ["draft", "improvement"].includes(state);
  Object.assign(aim, {
    assignmentId: state === "missing" ? undefined : "aim-practice",
    practiceStatus: status,
    practiceAvailable: available,
    isUnlocked: state !== "locked",
    contentComplete: state !== "content",
    contentCompleted: state === "content" ? 1 : 2,
    isComplete: state === "complete",
    canStartNewAttempt: state === "improvement",
    attemptsUsed: reviewed ? 3 : 1,
    attemptsRemaining: reviewed ? (state === "improvement" ? 1 : 0) : 2,
    maxAttempts: state === "improvement" ? 4 : 3,
    trainingOutcome: reviewed
      ? state === "complete"
        ? "Merit"
        : "NotYetAchieved"
      : undefined,
    bestTrainingOutcome: reviewed
      ? state === "complete"
        ? "Distinction"
        : "NotYetAchieved"
      : undefined,
    attemptHistory: reviewed
      ? [
          {
            attemptNumber: 1,
            status: "Finalized",
            trainingOutcome: "NotYetAchieved",
            submittedAtUtc: "2026-10-01T12:00:00Z",
            reviewedAtUtc: "2026-10-02T12:00:00Z",
            strengths: "RAW first strengths",
            gaps: "RAW first gap",
            improvementGuidance: "RAW first guidance",
          },
          {
            attemptNumber: 3,
            status: "Finalized",
            trainingOutcome: state === "complete" ? "Merit" : "NotYetAchieved",
            submittedAtUtc: "2026-10-03T12:00:00Z",
            reviewedAtUtc: "2026-10-04T12:00:00Z",
            strengths: "RAW latest strengths",
            gaps: "RAW latest gap",
            improvementGuidance: "RAW latest guidance",
          },
        ]
      : state === "submitted"
        ? [
            {
              attemptNumber: 1,
              status: "Submitted",
              submittedAtUtc: "2026-10-03T12:00:00Z",
            },
          ]
        : [],
    arabicInstructions:
      "تعليمات تدريبية طويلة لتوضيح الحل وإرفاق الأدلة ومراجعة ملاحظات المعلم، مع بقاء التدريب التكويني منفصلًا عن التقييم الرسمي. ".repeat(
        3,
      ),
  });
  Object.assign(unit.finalPractice, {
    assignmentId: state === "missing" ? undefined : "final-practice",
    status,
    isAvailable: available,
    unavailableReason:
      state === "missing" ? "NotConfigured" : "LearningAimsIncomplete",
    isTrainingComplete: state === "complete",
    trainingOutcome: reviewed
      ? state === "complete"
        ? "Merit"
        : "NotYetAchieved"
      : undefined,
  });
  return [unit];
}
export function formativeMine(uploaded = false, submitted = false) {
  return ["aim", "final"].map((kind) => ({
    id: `${kind}-submission`,
    assignmentId: `${kind}-practice`,
    status: submitted ? "Submitted" : "Draft",
    currentVersionNumber: 1,
    versions: [
      {
        versionNumber: 1,
        files: uploaded
          ? [{ id: `${kind}-file`, originalFileName: `${kind}-evidence.pdf` }]
          : [],
      },
    ],
  }));
}
