// Synthetic data only. These fixtures prove UI contracts, not backend policy.
export const version = {
  id: "version",
  versionCode: "Raw V1",
  sourceReference: "Raw approved reference — مصدر المركز",
  effectiveFromUtc: "2026-09-25T00:00:00Z",
  effectiveUntilUtc: null,
  isActive: true,
};
export const qualifications = [
  {
    id: "qualification",
    code: "RAW-QUAL",
    arabicName: "اسم المؤهل الخام",
    englishName: "Raw Qualification",
    isActive: true,
    versions: [version],
  },
  {
    id: "empty-ar",
    code: "BLANK-AR",
    arabicName: "",
    englishName: "Never Arabic Fallback",
    isActive: true,
    versions: [],
  },
  {
    id: "empty-en",
    code: "BLANK-EN",
    arabicName: "لا تستبدل الاسم الفارغ",
    englishName: "",
    isActive: true,
    versions: [],
  },
];
export const rubrics = [
  {
    rubricTemplateId: "rubric",
    arabicTitle: "عنوان الروبرك الخام",
    englishTitle: "Raw rubric",
    qualificationVersionId: null,
    qualificationCode: null,
    qualificationVersionCode: null,
  },
  {
    rubricTemplateId: "bound",
    arabicTitle: "",
    englishTitle: "",
    qualificationVersionId: "version",
    qualificationCode: "RAW-QUAL",
    qualificationVersionCode: "Raw V1",
  },
];
export const appeal = {
  id: "appeal",
  evaluationRequestId: "evaluation",
  status: "RawAppealStatus",
  reason: "Raw student appeal reason — سبب كتبه الطالب",
  decisionRationale: null,
  createdAtUtc: "2026-09-25T10:30:00Z",
};
export const staff = [
  {
    id: "assessor",
    displayName: "Raw Assessor",
    email: "assessor@example.invalid",
    roles: ["Assessor", "InternalVerifier"],
  },
  {
    id: "teacher",
    displayName: "Raw Teacher",
    email: null,
    roles: ["Teacher"],
  },
  {
    id: "verifier",
    displayName: "Raw Verifier",
    email: "verifier@example.invalid",
    roles: ["InternalVerifier"],
  },
  {
    id: "lead",
    displayName: "Raw Lead",
    email: null,
    roles: ["LeadInternalVerifier"],
  },
  { id: "admin", displayName: "Raw Admin", email: null, roles: ["Admin"] },
  {
    id: "mixed",
    displayName: "Raw Mixed",
    email: null,
    roles: ["Teacher", "Admin"],
  },
  {
    id: "student",
    displayName: "Raw Student",
    email: null,
    roles: ["Student"],
  },
];
export const taxonomy = {
  grades: [{ id: "grade", name: "Raw grade name" }],
  specializations: [{ id: "specialization", name: "Raw specialization name" }],
  taskTypes: [{ id: "task", name: "Raw assessment type" }],
};
export const plan = {
  id: "plan",
  assessorUserId: "assessor",
  gradeId: null,
  specializationId: null,
  taskTypeId: null,
  targetOutcome: "Merit",
  selectionRationale: "Raw stored sampling rationale",
  activeFromUtc: "2026-09-25T10:30:00Z",
  activeUntilUtc: null,
  isActive: true,
  samplesCount: 7,
};
export const candidate = {
  evaluationRequestId: "evaluation",
  submissionAttemptNumber: 3,
  assessorUserId: "assessor",
  gradeId: "grade",
  specializationId: "specialization",
  taskTypeId: "task",
  calculatedOutcome: "Distinction",
  submittedForVerificationAtUtc: "2026-09-26T11:00:00Z",
};
