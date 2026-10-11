// UI-contract fixtures only; these do not prove real document identity or backend behavior.
export const trustSettings = {
  LegalRegistrationNumber: "RAW REG/2026-17",
  LegalAddress: "RAW server address عنوان",
  BrandSecondaryMessage: "RAW server brand description وصف",
  BtecDisclaimer: "RAW server disclaimer إخلاء",
};
export const trustDocument = {
  slug: "terms",
  version: "RAW-v3",
  title: "RAW Legal Title عنوان",
  content:
    "## RAW heading عنوان\n\nRegistration: {{LegalRegistrationNumber}}\n\nAddress: {{LegalAddress}}\n\nRAW legal content نص",
  effectiveAtUtc: "2026-03-17T14:05:00Z",
};
export const trustCertificate = {
  studentName: "RAW Learner متعلم",
  courseTitle: "RAW Course دورة",
  issuedAtUtc: "2026-03-17T14:05:00Z",
  verificationCode: "RAW-DOCUMENT-17",
};
export const trustRating = {
  id: "own-rating",
  courseQualityScore: 4,
  easeOfUseScore: 3,
  supportScore: 2,
  recommendationScore: 5,
  comment: "RAW own comment تعليق",
  allowPublicDisplay: true,
  isPublished: false,
};
export const trustRatingSummary = {
  ratingsCount: 2,
  averageScore: 4.5,
  courseQualityScore: 4,
  easeOfUseScore: 3,
  supportScore: 2,
  recommendationScore: 5,
  reviews: [
    {
      id: "review-17",
      score: 4,
      comment: "RAW published review تعليق",
      updatedAtUtc: "2026-03-17T14:05:00Z",
      authorLabel: "RAW server author كاتب",
    },
  ],
};
export const trustTrack = {
  slug: "raw-track",
  name: "RAW Track مسار",
  description: "RAW track description وصف",
  isBtecFocused: true,
  courseCount: 3,
  moduleCount: 6,
  lessonCount: 12,
  guidedLearningHours: 30,
  grades: [],
  specializations: [],
  subjects: [],
};
