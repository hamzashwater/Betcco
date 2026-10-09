// Synthetic staff/student data for mocked UI-contract evidence only.
export const requestId = "12345678-1111-2222-3333-444444444444";
export const revisionId = "REVISION-1111-2222-3333-444444444444";
const base = {
  id: requestId,
  status: "PendingAssignment",
  createdAtUtc: "2026-09-23T09:00:00Z",
  updatedAtUtc: "2026-09-23T10:00:00Z",
  isRetake: false,
  isResit: false,
  resitOfEvaluationRequestId: null,
  qualificationCode: "QUAL",
  qualificationVersionCode: "V1",
  unitCode: "UNIT-7",
  unitArabicTitle: "عنوان الوحدة من الخادم",
  unitEnglishTitle: "Server Unit title",
  evaluatorDisplayName: null as string | null,
  assignedAtUtc: null,
  hasEligibleEvaluator: true as boolean | null,
  blockerCode: null as string | null,
  expectedCompletionAtUtc: null as string | null,
  expectedCompletionState: "NotSet",
  revisionDueAtUtc: null as string | null,
  effectiveRevisionDueAtUtc: null as string | null,
  activeDeadlineAdjustmentId: null as string | null,
};
export const queueItems = [
  {
    ...base,
    isResit: true,
    resitOfEvaluationRequestId: "ORIGINAL-1234-2222-3333-444444444444",
  },
  {
    ...base,
    id: "ASSIGNED-1111-2222-3333-444444444444",
    status: "Assigned",
    isRetake: true,
    evaluatorDisplayName: "Raw Evaluator' {name} معلّم",
    hasEligibleEvaluator: null,
    expectedCompletionState: "Overdue",
    expectedCompletionAtUtc: "2020-01-01T10:00:00Z",
  },
  {
    ...base,
    id: "UNDERREV-1111-2222-3333-444444444444",
    status: "UnderReview",
    hasEligibleEvaluator: false,
    expectedCompletionState: "OnTrack",
    expectedCompletionAtUtc: "2030-01-01T10:00:00Z",
  },
  {
    ...base,
    id: revisionId,
    status: "NeedsRevision",
    hasEligibleEvaluator: null,
    revisionDueAtUtc: "2030-01-02T10:00:00Z",
    effectiveRevisionDueAtUtc: "2030-01-03T10:00:00Z",
    activeDeadlineAdjustmentId: "adjustment-1",
  },
  {
    ...base,
    id: "MAPPING1-1111-2222-3333-444444444444",
    qualificationCode: null,
    unitCode: null,
    blockerCode: "AcademicMappingRequired",
    hasEligibleEvaluator: false,
  },
  {
    ...base,
    id: "NOEVAL01-1111-2222-3333-444444444444",
    blockerCode: "NoEligibleEvaluator",
    hasEligibleEvaluator: false,
  },
  {
    ...base,
    id: "CHANGED1-1111-2222-3333-444444444444",
    blockerCode: "StateChanged",
    hasEligibleEvaluator: false,
  },
];
export function queuePage(
  path = "/assessment-coordination/queue?page=1&pageSize=10",
) {
  const url = new URL(path, "http://mock.invalid");
  return {
    items: queueItems,
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: 10,
    totalCount: 21,
  };
}
export const pendingEvaluation = {
  id: requestId,
  status: "Paid",
  studentComment: "Raw student-authored comment",
  filesCount: 3,
  criteria: ["A.P1", "B.M1"],
  isResit: true,
  resitOfEvaluationRequestId: "ORIGINAL-1234-2222-3333-444444444444",
};
export const candidates = [
  { id: "candidate-1", displayName: "Raw Evaluator One" },
  { id: "candidate-2", displayName: "مقيّم من الخادم" },
];
const authorizationBase = {
  authorizationId: "authorization-1",
  originalEvaluationRequestId: "ORIGINAL-1234-2222-3333-444444444444",
  resitEvaluationRequestId: null as string | null,
  authorizedAtUtc: "2026-09-23T10:00:00Z",
  activatedAtUtc: null as string | null,
  revokedAtUtc: null as string | null,
  reason: "Raw PRIVATE staff reason {keep}",
  revocationReason: null as string | null,
};
export const authorizations = [
  { ...authorizationBase },
  {
    ...authorizationBase,
    authorizationId: "authorization-2",
    activatedAtUtc: "2026-09-24T10:00:00Z",
    resitEvaluationRequestId: "RESITREQ-1234-2222-3333-444444444444",
  },
  {
    ...authorizationBase,
    authorizationId: "authorization-3",
    activatedAtUtc: "2026-09-24T10:00:00Z",
    resitEvaluationRequestId: "RESITREQ-1234-2222-3333-444444444444",
    revokedAtUtc: "2026-09-25T10:00:00Z",
    revocationReason: "Raw PRIVATE revocation reason",
  },
  // Activation timestamp alone must retain Authorized presentation.
  {
    ...authorizationBase,
    authorizationId: "authorization-4",
    activatedAtUtc: "2026-09-24T10:00:00Z",
  },
];
export function resitPage(page = 1) {
  return { items: authorizations, page, pageSize: 10, hasNextPage: page === 1 };
}
export const adjustmentSummary = {
  evaluationRequestId: revisionId,
  baseDueAtUtc: "2030-01-02T10:00:00Z",
  effectiveDueAtUtc: "2030-01-03T10:00:00Z",
  activeAdjustmentId: null as string | null,
  history: [
    {
      id: "adjustment-old",
      evaluationRequestId: revisionId,
      baseDueAtUtcSnapshot: "2030-01-02T10:00:00Z",
      extendedDueAtUtc: "2030-01-03T10:00:00Z",
      grantedAtUtc: "2030-01-01T10:00:00Z",
      reason: "Raw PRIVATE adjustment reason",
      revokedAtUtc: "2030-01-01T11:00:00Z",
      revocationReason: "Raw PRIVATE adjustment revocation",
    },
  ],
};
