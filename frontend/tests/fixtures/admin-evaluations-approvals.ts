// Synthetic data for mocked UI-contract evidence, never real account data.
export const pendingEvaluations = [
  {
    id: "pending-1",
    status: "Paid",
    studentComment: "Raw pending comment",
    filesCount: 2,
    criteria: ["A.P1"],
    isResit: false,
    resitOfEvaluationRequestId: null,
  },
];
export const underReviewEvaluations = [
  {
    id: "evaluation-1",
    filesCount: 2,
    calculatedGrade: "Distinction",
    sectionResults: [{ section: "A' {raw}", grade: "Pass" }],
    results: [
      {
        criterionCode: "A.P1",
        achievement: "Achieved",
        comment: "Raw assessor comment",
        evidence: "Raw result evidence",
      },
    ],
    evidence: [{ criterionCode: "A.P1", narrative: "Raw student narrative" }],
  },
  {
    id: "evaluation-2",
    filesCount: 0,
    calculatedGrade: null,
    sectionResults: [],
    results: [],
    evidence: [],
  },
];
export const courseApprovals = [
  {
    id: "course-1",
    arabicTitle: "عنوان الخادم الأول",
    englishTitle: "Server course one",
    subjectArabicName: "مادة الخادم",
    subjectEnglishName: "Server subject",
    subjectPendingReview: true,
    status: "SubmittedForReview",
    price: 19.5,
    isFree: false,
    hasCover: true,
    moduleCount: 2,
    lessonCount: 3,
    resourceCount: 4,
  },
  {
    id: "course-2",
    arabicTitle: "عنوان الخادم الثاني",
    englishTitle: "Server course two",
    status: "Approved",
    price: 0,
    isFree: true,
    hasCover: false,
    moduleCount: 0,
    lessonCount: 0,
    resourceCount: 0,
  },
  {
    id: "course-3",
    arabicTitle: "عنوان الخادم الثالث",
    englishTitle: "Server course three",
    status: "SubmittedForReview",
    price: 0,
    isFree: true,
    hasCover: false,
    moduleCount: 0,
    lessonCount: 0,
    resourceCount: 0,
  },
];
export function courseDetail(id = "course-1") {
  return {
    ...courseApprovals.find((c) => c.id === id)!,
    arabicDescription: "وصف الخادم",
    englishDescription: "Server description",
    outcomes: [
      {
        arabicText: "ناتج التعلم من الخادم",
        englishText: "Server learning outcome",
      },
    ],
    modules: [
      {
        arabicTitle: "وحدة الخادم",
        englishTitle: "Server module",
        lessons: [
          {
            arabicTitle: "درس الخادم",
            englishTitle: "Server lesson",
            arabicBody: "محتوى الدرس من الخادم",
            englishBody: "Server lesson body",
            type: "Video",
            durationSeconds: 125,
            resources: [{ id: "resource-1", displayName: "raw-ملف.pdf" }],
          },
          {
            arabicTitle: "درس بلا ملفات",
            englishTitle: "Lesson without resources",
            type: "Text",
            durationSeconds: 30,
            resources: [],
          },
        ],
      },
    ],
    assignments: [
      {
        arabicTitle: "مهمة الخادم",
        englishTitle: "Server assignment",
        arabicInstructions: "تعليمات الخادم",
        englishInstructions: "Server instructions",
        maxSubmissionAttempts: 3,
        maxFileSizeBytes: 25 * 1024 * 1024,
        allowedFileExtensions: [".pdf", ".docx"],
        allowResubmission: true,
        isPublished: true,
        criteria: [
          {
            code: "A.P1",
            band: "Pass",
            arabicDescription: "وصف المعيار من الخادم",
            englishDescription: "Server criterion description",
          },
        ],
      },
      {
        arabicTitle: "مسودة الخادم",
        englishTitle: "Server draft",
        arabicInstructions: "تعليمات مسودة الخادم",
        englishInstructions: "Server draft instructions",
        maxSubmissionAttempts: 1,
        maxFileSizeBytes: 10 * 1024 * 1024,
        allowedFileExtensions: [".txt"],
        allowResubmission: false,
        isPublished: false,
        criteria: [],
      },
    ],
  };
}
