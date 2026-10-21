// Synthetic server snapshots only — MOCKED UI-CONTRACT EVIDENCE.
export const evaluationScope = {
  assessmentScopeId: "scope-1",
  qualificationCode: "Q",
  qualificationVersionCode: "V1",
  qualificationArabicName: "المؤهل التطبيقي",
  qualificationEnglishName: "Applied qualification",
  gradeCode: "g",
  gradeArabicName: "الصف",
  gradeEnglishName: "Grade",
  specializationCode: "s",
  specializationArabicName: "تخصص الحوسبة",
  specializationEnglishName: "Computing",
  unitCode: "U1",
  unitArabicTitle: "الوحدة التطبيقية",
  unitEnglishTitle: "Applied unit",
  assessmentCode: "TASK",
  assessmentVersion: 1,
  assessmentArabicTitle: "مهمة أدلة عملية طويلة للحل والتحليل والمراجعة",
  assessmentEnglishTitle: "Application evidence task",
  scopeVersion: 1,
  learningAimCodes: ["A"],
  criteria: [{ code: "A.P1", band: "Pass" }],
};
export function evaluationDraft(
  id = "standard-draft",
  status = "Draft",
  isResit = false,
) {
  return {
    id,
    status,
    price: 12.5,
    currency: "JOD",
    studentComment: "RAW saved student comment",
    assessmentScopeId: "scope-1",
    isRetake: false,
    isResit,
    resitOfEvaluationRequestId: isResit ? "original-request" : null,
    hasAuthenticityDeclaration: true,
    academic: evaluationScope,
    criteria: ["A.P1"],
    files: [
      {
        id: "saved-file",
        originalFileName: "saved-evidence.pdf",
        scanStatus: "Clean",
        createdAtUtc: "2026-10-01T12:00:00Z",
      },
    ],
    evidence: [
      { criterionCode: "A.P1", narrative: "RAW saved evidence narrative" },
    ],
    calculatedGrade: status === "Completed" ? "NotYetAchieved" : null,
    sectionResults: [],
    results:
      status === "Completed"
        ? [
            {
              criterionCode: "A.P1",
              achievement: "NotAchieved",
              comment: "RAW result comment",
            },
          ]
        : [],
    feedback:
      status === "Completed"
        ? [
            {
              body: "RAW result feedback",
              createdAtUtc: "2026-10-03T12:00:00Z",
            },
          ]
        : [],
  };
}
export function evaluationRow(
  id: string,
  status: string,
  branch: "standard" | "resit" | "retake" = "standard",
) {
  return {
    id,
    status,
    price: 0,
    currency: "JOD",
    isRetake: branch === "retake",
    isResit: branch === "resit",
    resitOfEvaluationRequestId: branch === "resit" ? "original-request" : null,
    retakeOfEvaluationRequestId: branch === "retake" ? "old-original" : null,
    criteria: ["A.P1"],
    academic: {
      ...evaluationScope,
      assessmentEnglishTitle: id,
      assessmentArabicTitle: `${id} · مهمة تطبيقية تتطلب توضيح الأدلة ومراجعتها`,
    },
    selectedCriteria: ["A.P1"],
    submissionAttemptNumber: 2,
    revisionDueAtUtc: "2030-01-01T12:00:00Z",
    effectiveRevisionDueAtUtc: "2030-01-03T12:00:00Z",
    calculatedGrade: ["Completed", "NeedsRevision"].includes(status)
      ? "NotYetAchieved"
      : null,
    sectionResults: [{ section: "A", grade: "NotYetAchieved" }],
    results: ["Completed", "NeedsRevision"].includes(status)
      ? [
          {
            criterionCode: "A.P1",
            achievement: "NotAchieved",
            evidence: null,
            comment: "RAW criterion feedback",
          },
        ]
      : [],
    evidence: [],
    feedback:
      status === "NeedsRevision"
        ? [
            {
              body: "RAW first revision note",
              requestsResubmission: true,
              createdAtUtc: "2026-10-01T12:00:00Z",
            },
            {
              body: "RAW second note",
              requestsResubmission: false,
              createdAtUtc: "2026-10-02T12:00:00Z",
            },
          ]
        : [],
  };
}
export const evaluationPage = (
  items: ReturnType<typeof evaluationRow>[],
  hasNextPage = false,
  page = 1,
) => ({ items, page, pageSize: 20, totalCount: items.length, hasNextPage });
