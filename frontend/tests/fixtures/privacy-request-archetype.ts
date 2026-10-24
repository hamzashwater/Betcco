// Synthetic request review facts, deliberately unsorted: retain server order.
export const requestTypes = [
  "Access",
  "Rectification",
  "Restriction",
  "ErasureOrConcealment",
  "ObjectionToProfiling",
  "Portability",
  "WithdrawMarketingConsent",
] as const;
export const requestStatuses = [
  "Submitted",
  "IdentityVerificationRequired",
  "InReview",
  "Completed",
  "Rejected",
  "Cancelled",
] as const;
export const longDescription =
  "RAW <description> نص عربي طويل لعرض بيانات الطلب كما وصلت دون تفسير أو تلخيص.\n".repeat(
    12,
  ) + "unbroken-content-".repeat(24);
export const longResolution =
  "RAW قرار مراجعة ظاهر لصاحب الطلب · مسودة طويلة متعددة الأسطر\n".repeat(20);
export const privacyRows = requestTypes.map((requestType, i) => ({
  id: `00000000-0000-4000-8000-${String(70 - i).padStart(12, "0")}`,
  requestType,
  status: requestStatuses[i % 6],
  description:
    i === 2 ? null : i === 0 ? longDescription : `RAW description ${i}`,
  resolutionSummary:
    i === 0
      ? null
      : i === 1
        ? "  RAW resolution with retained spaces  "
        : `RAW resolution ${i}`,
  identityVerifiedAtUtc: i >= 2 ? "2026-10-12T09:12:00Z" : null,
  createdAtUtc: i % 2 === 0 ? "2026-10-09T12:00:00Z" : "2026-10-10T12:00:00Z",
  resolvedAtUtc: i >= 3 && i <= 5 ? "2026-10-14T11:00:00Z" : null,
}));
export const privacyPage = (items = privacyRows) => ({
  items,
  page: 1,
  pageSize: 50,
  totalCount: 843,
});
