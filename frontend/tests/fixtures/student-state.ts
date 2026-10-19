// Fixed synthetic UI contracts. These records do not prove backend eligibility.
export const courseworkAssignment = {
  id: "assignment-raw",
  lessonId: "lesson-raw",
  arabicTitle: "عنوان المهمة الخامّ — BTEC Level 3 / P1",
  englishTitle: "Raw assignment — BTEC Level 3 / P1",
  arabicInstructions: "تعليمات الخادم الخامّة ١٢/٢٤ — احتفظ بهذا النص.",
  englishInstructions: "Raw server instructions 12/24 — retain this text.",
  availableFromUtc: "2020-01-01T12:00:00Z",
  effectiveDueAtUtc: "2099-12-31T12:00:00Z",
  hasDeadlineExtension: true,
  maxSubmissionAttempts: 2,
  allowResubmission: true,
  maxFileSizeBytes: 5 * 1024 * 1024,
  allowedFileExtensions: [".pdf", ".docx"],
  publicationStatus: "Published",
  resources: [
    {
      id: "resource-raw",
      displayName: "Raw rubric — ملف المعايير.pdf",
      contentType: "application/pdf",
      scanStatus: "Clean",
    },
  ],
  criteria: [
    {
      id: "criterion-raw",
      code: "P1",
      band: "P",
      arabicDescription: "وصف المعيار الخامّ",
      englishDescription: "Raw criterion description",
    },
  ],
};

export const courseworkSubmission = {
  id: "submission-raw",
  assignmentId: courseworkAssignment.id,
  status: "Submitted",
  currentVersionNumber: 1,
  calculatedGrade: null,
  results: [
    {
      code: "P1",
      band: "P",
      achievement: "Raw criterion result",
      feedback: "Raw teacher feedback — ملاحظة المعلم",
    },
  ],
  feedback: [
    {
      body: "Raw local review — ملاحظات خامّ",
      requestsResubmission: false,
      createdAtUtc: "2026-10-01T12:00:00Z",
    },
  ],
  versions: [
    {
      versionNumber: 1,
      files: [
        {
          id: "file-raw",
          originalFileName: "Raw-اسم-الملف-الطويل-مع-رمز-BTEC-Level-3-P1.pdf",
          contentType: "application/pdf",
          lengthBytes: 100,
          scanStatus: "Clean",
        },
      ],
    },
  ],
};

const gradeSummary = {
  predictedGrade: "Merit",
  passAchieved: 1,
  passRequired: 2,
  meritAchieved: 1,
  meritRequired: 2,
  distinctionAchieved: 0,
  distinctionRequired: 1,
};
export const studentGradebook = {
  courseId: "course-raw",
  courseTitle: "Raw course — عنوان الدورة",
  lessonProgressPercent: 25,
  lessonsCompleted: 1,
  lessonsTotal: 4,
  assignmentsCompleted: 1,
  assignmentsTotal: 2,
  predictedGrade: gradeSummary,
  units: [
    {
      unitId: "unit-raw",
      unitTitle: "Raw unit — الوحدة BTEC Level 3",
      lessonProgressPercent: 25,
      lessonsCompleted: 1,
      lessonsTotal: 4,
      predictedGrade: gradeSummary,
      learningAims: [
        {
          learningAimId: "aim-raw",
          code: "A",
          title: "Raw aim — هدف التعلم",
          lessonProgressPercent: 25,
          lessonsCompleted: 1,
          lessonsTotal: 4,
          predictedGrade: gradeSummary,
        },
      ],
    },
  ],
  criteria: [
    "NotStarted",
    "InReview",
    "Achieved",
    "NotAchieved",
    "NeedsImprovement",
    "ResubmissionRequired",
    "NotApplicable",
    "Raw-status-حالة-الخادم",
  ].map((status, index) => ({
    assignmentId: "assignment-raw",
    assignmentTitle: "Raw assignment — عنوان المهمة",
    code: `P${index + 1}`,
    band: "P",
    status,
    feedback: "Raw criterion feedback — ملاحظات خامّ",
  })),
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
