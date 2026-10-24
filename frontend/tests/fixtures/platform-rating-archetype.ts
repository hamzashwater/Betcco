// Synthetic data only — MOCKED UI-CONTRACT EVIDENCE.
const raw = {
  courseQualityScore: 1,
  easeOfUseScore: 2,
  supportScore: 4,
  recommendationScore: 5,
};
export const moderationRatings = [
  {
    id: "rating-z",
    ...raw,
    comment: "Raw private learner comment <feedback>",
    allowPublicDisplay: false,
    isPublished: false,
    moderationReason: "Raw saved internal reason",
    updatedAtUtc: "2026-10-20T12:34:00Z",
  },
  {
    id: "rating-a",
    courseQualityScore: 5,
    easeOfUseScore: 3,
    supportScore: 4,
    recommendationScore: 1,
    comment:
      "تعليق طالب طويل يحافظ على النص والموافقة كما وردا من الخادم دون ترجمة أو استنتاج حالة المراجعة. ".repeat(
        6,
      ) + "\nRaw exact second line.",
    allowPublicDisplay: true,
    isPublished: false,
    moderationReason:
      "سبب داخلي طويل يظل خاصًا بهذه المراجعة ولا ينشئ موافقة على النشر ".repeat(
        5,
      ),
    updatedAtUtc: "2026-10-19T08:00:00Z",
  },
  {
    id: "rating-m",
    courseQualityScore: 5,
    easeOfUseScore: 5,
    supportScore: 4,
    recommendationScore: 4,
    comment: "Raw published review",
    allowPublicDisplay: true,
    isPublished: true,
    moderationReason: "",
    updatedAtUtc: "2026-10-23T10:00:00Z",
  },
  {
    id: "rating-legacy",
    ...raw,
    comment: "Raw inconsistent legacy flags",
    allowPublicDisplay: false,
    isPublished: true,
    moderationReason: "Raw legacy reason",
    updatedAtUtc: "2026-10-22T08:00:00Z",
  },
  {
    id: "rating-no-comment",
    ...raw,
    comment: "",
    allowPublicDisplay: true,
    isPublished: false,
    moderationReason: "",
    updatedAtUtc: "2026-10-21T08:00:00Z",
  },
];
export const moderationSummary = {
  totalCount: 843,
  publishedCount: 300,
  awaitingModerationCount: 400,
  privateWithoutConsentCount: 143,
  averageScore: 4.3,
  courseQualityScore: 4.1,
  easeOfUseScore: 4.2,
  supportScore: 4.4,
  recommendationScore: 4.5,
};
