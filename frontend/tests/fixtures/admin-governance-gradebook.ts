// Synthetic data only. These fixtures prove UI contracts, not backend policy.
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
