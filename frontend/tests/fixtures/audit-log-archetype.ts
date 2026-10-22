// Synthetic, deliberately unsorted data. MOCKED UI-CONTRACT EVIDENCE.
export const auditItems = [
  "RiskObserved",
  "Success",
  "Failure",
  "ProviderRaw:Review",
].map((outcome, index) => ({
  id: `audit-${index}`,
  actorName:
    index === 0
      ? "المسؤول عن الحوكمة ومراجعة سجل العمليات الإدارية الحساسة"
      : `Operator ${index}`,
  action: [
    "Z.LastAlphabetically",
    "A.FirstAlphabetically",
    "Access.Rejected",
    "Provider.Reported",
  ][index],
  entityType: "AdministrativeRecord",
  entityId: `entity-${index}-${"0123456789abcdef".repeat(8)}`,
  createdAtUtc: [
    "2026-10-20T12:00:00Z",
    "2026-10-22T12:00:00Z",
    "2026-10-19T12:00:00Z",
    "2026-10-21T12:00:00Z",
  ][index],
  outcome,
  metadataJson: '{\n  "raw": "<untouched> \\u0627", "number": 1.00\n}',
  oldValuesJson: '{ "previous": "keep  whitespace", "nil": null }',
  newValuesJson: '{ "new": "قيمة عربية محفوظة", "order": [3,1,2] }',
  ipAddress: "192.0.2.41",
  correlationId: `correlation-${"a1b2c3d4".repeat(15)}`,
  userAgent: `SyntheticBrowser/1.0 ${"long-machine-provided-value/".repeat(18)}`,
}));
export const auditPage = (page = 1, items = auditItems, totalCount = 51) => ({
  items,
  page,
  pageSize: 25,
  totalCount,
});
