// Synthetic raw data; these fixtures prove UI contracts, not backend decisions.
export const practiceAim = {
  id: "raw-aim-17",
  code: "RAW-A.P1",
  arabicTitle: "هدف خادم خام",
  englishTitle: "RAW Server Aim",
  isUnlocked: true,
  isComplete: false,
  contentTotal: 2,
  contentCompleted: 2,
  contentComplete: true,
  assignmentId: "raw-assignment-17",
  assignmentArabicTitle: "عنوان نشاط من الخادم",
  assignmentEnglishTitle: "RAW Server Activity",
  arabicInstructions: "تعليمات خادم خام",
  englishInstructions: "RAW Server Instructions",
  practiceAvailable: true,
  practiceStatus: "Available",
  maxAttempts: 3,
  attemptsUsed: 1,
  attemptsRemaining: 2,
  canStartNewAttempt: false,
  trainingOutcome: "Merit",
  bestTrainingOutcome: "Distinction",
  strengths: "RAW Strengths نقاط",
  gaps: "RAW Gaps فجوات",
  improvementGuidance: "RAW Guidance إرشاد",
  attemptHistory: [
    {
      attemptNumber: 1,
      status: "Finalized",
      trainingOutcome: "Pass",
      submittedAtUtc: "2026-01-02T09:00:00Z",
      reviewedAtUtc: "2026-01-03T09:00:00Z",
      strengths: "RAW Earlier Strengths",
      gaps: "RAW Earlier Gaps",
      improvementGuidance: "RAW Earlier Guidance",
    },
  ],
};
export const finalUnitPractice = {
  assignmentId: "raw-assignment-17",
  arabicTitle: "عنوان مهمة من الخادم",
  englishTitle: "RAW Server Final Practice",
  arabicInstructions: "تعليمات خادم خام",
  englishInstructions: "RAW Server Instructions",
  effectiveDueAtUtc: "2026-12-31T09:00:00Z",
  resources: [{ id: "raw-resource-17", displayName: "RAW Brief ملف.pdf" }],
  criteria: [
    {
      code: "RAW-A.P1",
      arabicDescription: "وصف معيار من الخادم",
      englishDescription: "RAW Server Criterion",
    },
  ],
  isAvailable: true,
  status: "Available",
  trainingOutcome: "Merit",
  strengths: "RAW Strengths نقاط",
  gaps: "RAW Gaps فجوات",
  improvementGuidance: "RAW Guidance إرشاد",
  isTrainingComplete: false,
};
export const practiceUnit = {
  id: "raw-unit-17",
  arabicTitle: "وحدة خادم خام",
  englishTitle: "RAW Server Unit",
  aims: [practiceAim],
  finalPractice: finalUnitPractice,
};
export const practiceSubmission = {
  id: "raw-submission-17",
  assignmentId: "raw-assignment-17",
  status: "Draft",
  currentVersionNumber: 2,
  versions: [
    {
      versionNumber: 1,
      files: [
        { id: "raw-old-file-17", originalFileName: "RAW Earlier ملف.pdf" },
      ],
    },
    {
      versionNumber: 2,
      files: [{ id: "raw-file-17", originalFileName: "RAW Current ملف.pdf" }],
    },
  ],
};
