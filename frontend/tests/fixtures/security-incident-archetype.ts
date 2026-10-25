// Synthetic UI facts only: not a legal rationale or operational recommendation.
export const incidentStatuses = [
  "Open",
  "Assessing",
  "Contained",
  "Closed",
] as const;
export const incidentSeverities = [
  "Low",
  "Medium",
  "High",
  "Critical",
] as const;
export type FixtureDeadline = {
  id: string;
  audience: "AffectedIndividuals" | "RegulatoryAuthority";
  dueAtUtc: string;
  recordedAtUtc: string | null;
};
export type FixtureAssessment = {
  potentialPersonalDataImpact: boolean;
  legalConfirmationRequired: boolean;
  legalNotificationRequired: boolean;
  legalConfirmedAtUtc: string | null;
  legalConfirmedByUserId: string | null;
  legalDecisionSummary: string | null;
  notificationDeadlines: FixtureDeadline[];
};
export type FixtureIncident = {
  id: string;
  title: string;
  summary: string;
  reasonCode: string;
  severity: (typeof incidentSeverities)[number];
  status: (typeof incidentStatuses)[number];
  detectedAtUtc: string;
  containedAtUtc: string | null;
  closureSummary: string | null;
  breachAssessment: FixtureAssessment | null;
  createdAtUtc: string;
};
export const longSummary =
  "RAW SYNTHETIC operational summary · ملخص واقعي وارد من الخادم دون تفسير آلي.\n".repeat(
    18,
  ) + "unbroken-summary-".repeat(20);
export const longLegal =
  "RAW SYNTHETIC external human-review note · نص قرار مسجل للاختبار فقط.\n".repeat(
    18,
  );
export const longClosure =
  "RAW SYNTHETIC saved closure · ملخص إغلاق طويل للاختبار فقط.\n".repeat(18);
export const deadlines: FixtureDeadline[] = [
  {
    id: "00000000-0000-4000-8000-000000000024",
    audience: "AffectedIndividuals",
    dueAtUtc: "2026-10-11T09:00:00Z",
    recordedAtUtc: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000072",
    audience: "RegulatoryAuthority",
    dueAtUtc: "2026-10-13T09:00:00Z",
    recordedAtUtc: null,
  },
];
export const assessment = (
  overrides: Partial<FixtureAssessment> = {},
): FixtureAssessment => ({
  potentialPersonalDataImpact: false,
  legalConfirmationRequired: true,
  legalNotificationRequired: false,
  legalConfirmedAtUtc: null,
  legalConfirmedByUserId: null,
  legalDecisionSummary: null,
  notificationDeadlines: [],
  ...overrides,
});
export const incidents: FixtureIncident[] = Array.from(
  { length: 8 },
  (_, i) => ({
    id: `00000000-0000-4000-9000-${String(80 - i).padStart(12, "0")}`,
    title:
      i === 5
        ? "RAW long incident title · حادث اختبار طويل لتوضيح ترتيب السجل واختيار الحادث"
        : "RAW Incident " + i,
    summary: i === 0 ? longSummary : "RAW summary " + i,
    reasonCode: "RAW_REASON_" + i,
    severity: incidentSeverities[i % 4],
    status: incidentStatuses[i % 4],
    detectedAtUtc:
      i % 2 === 0 ? "2026-10-10T09:00:00Z" : "2026-10-09T10:00:00Z",
    containedAtUtc: i === 2 || i === 3 ? "2026-10-11T10:30:00Z" : null,
    closureSummary: i === 3 ? longClosure : null,
    breachAssessment: assessment(),
    createdAtUtc: "2026-10-10T11:00:00Z",
  }),
);
incidents[1].breachAssessment = assessment({
  potentialPersonalDataImpact: true,
});
incidents[2].breachAssessment = assessment({
  potentialPersonalDataImpact: true,
  legalNotificationRequired: true,
  legalConfirmedAtUtc: "2026-10-10T10:00:00Z",
  legalConfirmedByUserId: "RAW-LEGAL-USER",
  legalDecisionSummary: longLegal,
  notificationDeadlines: deadlines.map((d, i) => ({
    ...d,
    recordedAtUtc: i === 1 ? "2026-10-12T12:00:00Z" : null,
  })),
});
incidents[3].breachAssessment = assessment({
  ...incidents[2].breachAssessment,
  notificationDeadlines: deadlines.map((d) => ({
    ...d,
    recordedAtUtc: "2026-10-12T12:00:00Z",
  })),
});
incidents[4].breachAssessment = assessment({
  potentialPersonalDataImpact: true,
  legalConfirmedAtUtc: "2026-10-10T10:00:00Z",
  legalDecisionSummary: "RAW SYNTHETIC recorded trigger rejected",
  legalConfirmedByUserId: null,
});
incidents[5].breachAssessment = assessment({
  ...incidents[2].breachAssessment,
  notificationDeadlines: deadlines.map((d) => ({ ...d })),
});
incidents[6].breachAssessment = null;
incidents[7].breachAssessment = assessment({
  ...incidents[2].breachAssessment,
  notificationDeadlines: deadlines.map((d) => ({ ...d })),
});
export const incidentPage = (items = incidents) => ({
  items,
  page: 1,
  pageSize: 50,
  totalCount: 843,
});
