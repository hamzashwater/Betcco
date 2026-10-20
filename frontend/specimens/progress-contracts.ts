// Presentation snapshots only. These do not replace API DTOs or eligibility rules.
// Optional fields allow the specimen to demonstrate unknown/partial information.
export type AimSnapshot = Readonly<{
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isUnlocked?: boolean;
  contentTotal?: number;
  contentCompleted?: number;
  contentComplete?: boolean;
  practiceStatus?: string;
  practiceAvailable?: boolean;
  attemptsRemaining?: number;
  trainingOutcome?: string | null;
  bestTrainingOutcome?: string | null;
  strengths?: string | null;
  gaps?: string | null;
  improvementGuidance?: string | null;
  isComplete?: boolean;
}>;
export type FinalPracticeSnapshot = Readonly<{
  assignmentId?: string | null;
  status?: string;
  isAvailable?: boolean;
  unavailableReason?: string | null;
  effectiveDueAtUtc?: string | null;
  isTrainingComplete?: boolean;
}>;
export type UnitSnapshot = Readonly<{
  id: string;
  arabicTitle: string;
  englishTitle: string;
  aims?: readonly AimSnapshot[];
  finalPractice?: FinalPracticeSnapshot | null;
}>;
export type TaskSnapshot = Readonly<{
  title: string;
  status?: string;
  effectiveDueAtUtc?: string | null;
}>;
export type EvaluationSnapshot = Readonly<{
  id: string;
  status?: string;
  isResit: boolean;
  isRetake: boolean;
  resitOfEvaluationRequestId: string | null;
  retakeOfEvaluationRequestId: string | null;
  submissionAttemptNumber: number;
  effectiveRevisionDueAtUtc: string | null;
  calculatedGrade: string | null;
  feedback: readonly {
    body: string;
    requestsResubmission: boolean;
    createdAtUtc: string;
  }[];
}>;
export type DashboardSnapshot = Readonly<{
  courseId: string;
  localizedTitle: string;
  completedLessons?: number;
  totalLessons?: number;
  progressState?: string;
  // Kept as source data. Never used to infer grade, state, access or milestones.
  progressPercent?: number;
  accessAvailable?: boolean;
}>;

export type ProgressCopy = typeof import("./progress-copy.en.json");
export type ProgressLocale = "en" | "ar";
