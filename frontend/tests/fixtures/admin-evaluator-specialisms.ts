// Synthetic data; mocked UI-contract evidence, not routing-policy proof.
export const staff = [
  { id: "evaluator-1", displayName: "Raw Evaluator' {name}" },
  { id: "evaluator-2", displayName: "مقيّم من الخادم" },
];
const unit = {
  id: "unit-1",
  code: "U1",
  qualificationCode: "QUAL",
  qualificationVersionCode: "V1",
  qualificationVersionId: "version-1",
  arabicTitle: "  عنوان عربي من الخادم  ",
  englishTitle: "  Raw English Unit  ",
};
export const units = [
  unit,
  {
    ...unit,
    id: "unit-2",
    code: "U2",
    arabicTitle: "",
    englishTitle: "English fallback must not enter Arabic option",
  },
  {
    ...unit,
    id: "unit-3",
    code: "U3",
    englishTitle: "",
    arabicTitle: "لا تستخدم fallback للخيار الإنجليزي",
  },
];
const grant = {
  id: "grant-1",
  evaluatorUserId: staff[0].id,
  evaluatorName: "Raw Active Evaluator One",
  unitDefinitionId: unit.id,
  unitCode: "H1",
  unitArabicTitle: "  ",
  unitEnglishTitle: "  Raw English history fallback  ",
  qualificationVersionId: unit.qualificationVersionId,
  grantedAtUtc: "2026-09-23T10:00:00Z",
  revokedAtUtc: null as string | null,
};
export const grants = [
  grant,
  {
    ...grant,
    id: "grant-2",
    evaluatorName: "مقيّم السجل الثاني",
    unitCode: "H2",
    unitArabicTitle: "  عنوان السجل العربي  ",
    unitEnglishTitle: "  ",
  },
  {
    ...grant,
    id: "grant-3",
    evaluatorName: "Raw Revoked Evaluator",
    unitCode: "H3",
    unitArabicTitle: "سجل عربي",
    unitEnglishTitle: "English history",
    revokedAtUtc: "2026-09-24T10:00:00Z",
  },
];
export function historyPage(page = 1, totalCount = 51) {
  return { items: grants, page, pageSize: 25, totalCount };
}
export const paths = {
  staff: "/admin/evaluator-specialisms/staff",
  units: "/admin/evaluator-specialisms/units",
  grant: "/admin/evaluator-specialisms",
  history: (page = 1) =>
    `/admin/evaluator-specialisms?page=${page}&pageSize=25`,
  revoke: (id: string) => `/admin/evaluator-specialisms/${id}/revoke`,
};
