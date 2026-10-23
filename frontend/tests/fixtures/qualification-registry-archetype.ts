// Synthetic data only — MOCKED UI-CONTRACT EVIDENCE.
export const registryQualifications = [
  {
    id: "qualification-z",
    code: "Z-RAW",
    arabicName:
      "مؤهل عربي طويل لتوثيق الهوية الأكاديمية دون استنتاج حالة الإصدار ".repeat(
        3,
      ),
    englishName: "Raw Z qualification",
    isActive: false,
    versions: [
      {
        id: "version-old",
        versionCode: "RAW-2024",
        sourceReference:
          "https://source.example.invalid/" +
          "unbroken-source-reference".repeat(15),
        effectiveFromUtc: "2024-01-02T00:00:00Z",
        effectiveUntilUtc: "2025-01-02T00:00:00Z",
        isActive: false,
      },
      {
        id: "version-new",
        versionCode: "RAW-2027",
        sourceReference: "Raw centre source reference — مرجع المركز",
        effectiveFromUtc: "2027-03-04T00:00:00Z",
        effectiveUntilUtc: null,
        isActive: true,
      },
    ],
  },
  {
    id: "qualification-a",
    code: "A-NO-VERSION",
    arabicName: "مؤهل بلا إصدار",
    englishName: "Raw qualification without versions",
    isActive: true,
    versions: [],
  },
  {
    id: "qualification-m",
    code: "M-RAW",
    arabicName: "مؤهل ثالث",
    englishName: "Raw third qualification",
    isActive: true,
    versions: [
      {
        id: "version-third",
        versionCode: "RAW-2026",
        sourceReference: "Raw third source reference",
        effectiveFromUtc: "2026-01-02T00:00:00Z",
        effectiveUntilUtc: null,
        isActive: true,
      },
    ],
  },
];
export const registryRubrics = [
  {
    rubricTemplateId: "rubric-z",
    arabicTitle: "روبرك مرتبط بإصدار محدد",
    englishTitle: "Raw Z bound rubric",
    qualificationVersionId: "version-old",
    qualificationCode: "Z-RAW",
    qualificationVersionCode: "RAW-2024",
  },
  {
    rubricTemplateId: "rubric-a",
    arabicTitle:
      "عنوان روبرك عربي طويل لا يغير هوية الربط أو قواعد التقييم ".repeat(4),
    englishTitle:
      "Raw A rubric with a long title that retains its exact supplied identity and version binding",
    qualificationVersionId: null,
    qualificationCode: null,
    qualificationVersionCode: null,
  },
  {
    rubricTemplateId: "rubric-m",
    arabicTitle: "هوية إصدار دون رمز مؤهل",
    englishTitle: "Raw version ID without qualification code",
    qualificationVersionId: "version-new",
    qualificationCode: null,
    qualificationVersionCode: "RAW-2027",
  },
  {
    rubricTemplateId: "rubric-n",
    arabicTitle: "رمز مؤهل دون رمز إصدار",
    englishTitle: "Raw qualification code without version code",
    qualificationVersionId: "version-third",
    qualificationCode: "M-RAW",
    qualificationVersionCode: null,
  },
];
