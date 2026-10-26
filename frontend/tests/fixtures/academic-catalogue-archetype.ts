// Synthetic catalogue structure, not real Pearson or learner-result data.
export function catalogueFixture() {
  const versions = [
    {
      id: "version-z",
      qualificationCode: "Z-QUAL",
      versionCode: "Z-2026",
      isActive: false,
      qualificationArabicName:
        "مؤهل طويل للاختبار في التطبيقات المتخصصة والإدارة وتقنية المعلومات",
      qualificationEnglishName:
        "A long qualification for specialist applications, management and information technology",
    },
    {
      id: "version-a",
      qualificationCode: "A-QUAL",
      versionCode: "A-2025",
      isActive: true,
      qualificationArabicName: "مؤهل آخر",
      qualificationEnglishName: "Other qualification",
    },
  ];
  const scope = {
    id: "scope-valid",
    version: 3,
    gradeArabicName: "الصف الحادي عشر",
    gradeEnglishName: "Grade 11",
    specializationArabicName: "تقنية المعلومات",
    specializationEnglishName: "Information technology",
    rubricArabicTitle:
      "روبرك طويل للاختبار في معايير التقييم وبنية التعلم المترابطة",
    rubricEnglishTitle:
      "A long rubric title for assessment criteria and linked learning structure",
    isActive: false,
    validation: [] as string[],
  };
  const definition = {
    id: "definition-valid",
    code: "D-VALID",
    version: 2,
    arabicTitle: "تعريف تقييم مخصص",
    englishTitle: "Custom assessment definition",
    sourceReference:
      "Synthetic source reference / " + "long-reference-".repeat(12),
    isActive: false,
    aimIds: ["aim-a", "unknown-aim"],
    criterionIds: ["criterion-Pass", "unknown-criterion"],
    validation: [] as string[],
    scopes: [
      scope,
      {
        ...scope,
        id: "scope-invalid",
        isActive: true,
        validation: ["RubricMismatch", "FutureUnknown"],
      },
      { ...scope, id: "scope-active", isActive: true },
    ],
  };
  const unit = {
    id: "official-1",
    code: "U1",
    arabicTitle: "وحدة رسمية للاختبار ذات عنوان عربي طويل",
    englishTitle:
      "A long official unit title for catalogue inspection and structured validation",
    source: "PearsonOfficial",
    arabicTitleSource: "BetccoLocalized",
    isActive: true,
    aims: [
      {
        id: "aim-a",
        code: "A",
        arabicTitle: "هدف تعلم للاختبار",
        englishTitle: "Synthetic learning aim",
        criteria: (["Pass", "Merit", "Distinction"] as const).map((band) => ({
          id: "criterion-" + band,
          code: "A." + band[0] + "1",
          band,
          arabicDescription:
            "وصف معيار طويل للاختبار في بنية التعلم والتطبيقات المهنية",
          englishDescription:
            "A long synthetic criterion description for learning structure and workplace applications",
        })),
      },
      {
        id: "aim-b",
        code: "B",
        arabicTitle: "هدف دون معايير",
        englishTitle: "Aim without criteria",
        criteria: [],
      },
    ],
    definitions: [
      definition,
      {
        ...definition,
        id: "definition-invalid",
        code: "D-INVALID",
        isActive: true,
        validation: [
          "Draft",
          "MissingSource",
          "MissingAims",
          "MissingCriteria",
          "InactiveQualificationVersion",
          "InvalidMapping",
          "DuplicateCriterionCode",
          "RubricMismatch",
          "RubricCriteriaMismatch",
          "FutureUnknown",
        ],
        scopes: [],
      },
      {
        ...definition,
        id: "definition-active",
        code: "D-ACTIVE",
        isActive: true,
        scopes: [],
      },
      {
        ...definition,
        id: "definition-unresolved",
        code: "D-UNRESOLVED",
        aimIds: ["other-unit-aim"],
        criterionIds: ["other-unit-criterion"],
        validation: ["InvalidMapping"],
        scopes: [],
      },
    ],
  };
  return {
    versions,
    catalogue: {
      version: versions[0],
      units: [
        unit,
        {
          ...unit,
          id: "official-2",
          code: "U2",
          arabicTitle: "عنوان عربي ثانٍ",
          isActive: false,
          aims: [],
          definitions: [],
        },
        {
          ...unit,
          id: "custom",
          code: "U3",
          source: "AdminCustom",
          isActive: false,
          aims: [],
          definitions: [],
        },
        {
          ...unit,
          id: "unknown",
          code: "U4",
          source: "FutureSource",
          isActive: false,
          aims: [],
          definitions: [],
        },
      ],
    },
  };
}
