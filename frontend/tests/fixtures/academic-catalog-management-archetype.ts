// Synthetic academic data. MOCKED UI-CONTRACT EVIDENCE only.
export function academicAuthoringFixture() {
  const item = {
    id: "spec-z",
    learningTrackId: "btec",
    slug: "z-visible",
    arabicName: "تخصص مخصص طويل للاختبار في الإدارة وتقنية المعلومات",
    englishName:
      "A long custom specialization in management and information technology",
    isVisible: true,
    sortOrder: 17,
  };
  const version = {
    id: "version-inactive",
    versionCode: "Z-2026",
    source: "AdminCustom",
    sourceReference:
      "Synthetic source reference / " + "long-reference-".repeat(15),
    isActive: false,
  };
  const qualification = {
    id: "qualification-z",
    code: "Z-CUSTOM",
    specializationId: item.id,
    arabicName:
      "مؤهل مخصص طويل للاختبار في الإدارة وتقنية المعلومات وتطبيقاتها في بيئات العمل متعددة التخصصات",
    englishName:
      "A long custom qualification in management and information technology with interdisciplinary workplace applications",
    source: "AdminCustom",
    isActive: true,
    versions: [
      version,
      {
        ...version,
        id: "version-active",
        versionCode: "A-2025",
        isActive: true,
      },
    ],
  };
  return {
    taxonomy: {
      tracks: [
        { id: "other", name: "Other track", isBtecFocused: false },
        { id: "btec", name: "BTEC", isBtecFocused: true },
      ],
    },
    specializations: [
      item,
      { ...item, id: "spec-archived", slug: "a-archived", isVisible: false },
      {
        ...item,
        id: "spec-other",
        learningTrackId: "other",
        slug: "other-track",
      },
    ],
    grades: [
      {
        ...item,
        id: "grade-z",
        slug: "grade-11",
        arabicName: "الصف الحادي عشر",
        englishName: "Grade 11",
      },
      {
        ...item,
        id: "grade-archived",
        slug: "grade-12",
        arabicName: "الصف الثاني عشر",
        englishName: "Grade 12",
        isVisible: false,
      },
    ],
    qualifications: [
      qualification,
      {
        ...qualification,
        id: "official",
        code: "A-OFFICIAL",
        source: "PearsonOfficial",
        versions: [
          { ...version, id: "official-version", source: "PearsonOfficial" },
        ],
      },
      {
        ...qualification,
        id: "inactive-qualification",
        code: "B-INACTIVE",
        isActive: false,
        versions: [{ ...version, id: "inactive-parent-version" }],
      },
    ],
  };
}
