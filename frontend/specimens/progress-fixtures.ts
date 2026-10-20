import type {
  AimSnapshot,
  DashboardSnapshot,
  EvaluationSnapshot,
  UnitSnapshot,
} from "./progress-contracts";

// MOCKED UI-CONTRACT EVIDENCE. Values use existing response fields; no API is mocked
// inside production. The real producers and intentionally missing contracts are documented.
export const progressScenarios = [
  "available",
  "locked",
  "in-progress",
  "waiting-review",
  "aim-waiting-review",
  "complete",
  "missing-configuration",
  "expired",
  "restricted",
  "revision",
  "resit",
  "historical-retake",
  "zero",
  "partial-data",
  "pending",
  "cold-error",
  "empty",
  "cached-error",
  "disabled",
] as const;
export type ProgressScenario = (typeof progressScenarios)[number];
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const baseAim: AimSnapshot = {
  id: "aim-A",
  code: "A.P1",
  arabicTitle:
    "تحليل احتياجات المؤسسة وربطها بحلول تقنية المعلومات ضمن سياق تعلّم واضح",
  englishTitle:
    "Understand organisational needs and information technology solutions",
  isUnlocked: true,
  contentTotal: 4,
  contentCompleted: 2,
  contentComplete: false,
  practiceStatus: "Locked",
  practiceAvailable: false,
  attemptsRemaining: 2,
  isComplete: false,
};
const baseUnit: UnitSnapshot = {
  id: "unit-2",
  arabicTitle: "الوحدة الثانية · تحليل الحلول وتطوير الدليل",
  englishTitle: "Unit two · analyse solutions and develop evidence",
  aims: [baseAim],
  finalPractice: {
    assignmentId: "final-2",
    isAvailable: false,
    status: "Locked",
    unavailableReason: "LearningAimsIncomplete",
    isTrainingComplete: false,
  },
};
const confirmed: UnitSnapshot = {
  id: "unit-1",
  arabicTitle: "الوحدة الأولى · أسس التعلّم",
  englishTitle: "Unit one · learning foundations",
  aims: [
    {
      ...baseAim,
      id: "aim-confirmed",
      contentCompleted: 4,
      contentComplete: true,
      practiceStatus: "Finalized",
      isComplete: true,
    },
  ],
  finalPractice: {
    assignmentId: "final-1",
    status: "Finalized",
    isAvailable: true,
    isTrainingComplete: true,
  },
};

export function progressFixture(
  scenario: ProgressScenario,
  locale: "en" | "ar",
  courseIndex = 0,
) {
  let aim: AimSnapshot = { ...baseAim },
    unit: UnitSnapshot = structuredClone(baseUnit);
  const course: Mutable<DashboardSnapshot> = {
    courseId: courseIndex === 0 ? "course-it" : "course-business",
    localizedTitle:
      locale === "ar"
        ? courseIndex === 0
          ? "تطبيقات تقنية المعلومات في المؤسسات"
          : "أساسيات الأعمال ودراسة احتياجات العملاء"
        : courseIndex === 0
          ? "Information technology in organisations"
          : "Business foundations and customer needs",
    completedLessons: 2,
    totalLessons: 8,
    progressPercent: 25,
    progressState: "InProgress",
    accessAvailable: true,
  };
  const request: Mutable<EvaluationSnapshot> = {
    id: "eval-original",
    status: "UnderReview",
    isResit: false,
    isRetake: false,
    resitOfEvaluationRequestId: null,
    retakeOfEvaluationRequestId: null,
    submissionAttemptNumber: 1,
    effectiveRevisionDueAtUtc: null,
    calculatedGrade: null,
    feedback: [],
  };
  if (
    [
      "available",
      "waiting-review",
      "complete",
      "missing-configuration",
      "expired",
      "restricted",
    ].includes(scenario)
  )
    aim = { ...aim, contentCompleted: 4, contentComplete: true };
  if (scenario === "available") {
    aim = {
      ...aim,
      practiceStatus: "Finalized",
      practiceAvailable: true,
      isComplete: true,
      trainingOutcome: "Merit",
    };
    unit = {
      ...unit,
      finalPractice: {
        ...unit.finalPractice,
        status: "Available",
        isAvailable: true,
        unavailableReason: null,
      },
    };
  }
  if (scenario === "locked")
    aim = { ...aim, isUnlocked: false, contentCompleted: 0 };
  if (scenario === "waiting-review") {
    aim = {
      ...aim,
      practiceStatus: "Finalized",
      practiceAvailable: true,
      isComplete: true,
      trainingOutcome: "Merit",
    };
    unit = {
      ...unit,
      finalPractice: {
        ...unit.finalPractice,
        status: "Submitted",
        isAvailable: true,
        unavailableReason: null,
      },
    };
  }
  if (scenario === "aim-waiting-review")
    aim = {
      ...aim,
      contentCompleted: 4,
      contentComplete: true,
      practiceStatus: "Submitted",
      practiceAvailable: true,
    };
  if (scenario === "complete") {
    aim = {
      ...aim,
      practiceStatus: "Finalized",
      practiceAvailable: true,
      isComplete: true,
      trainingOutcome: "Merit",
      bestTrainingOutcome: "Distinction",
      strengths: "RAW feedback · شرح واضح للأدلة",
      gaps: "RAW gap · support the comparison",
      improvementGuidance: "RAW guidance · اربط القرار بالدليل",
    };
    unit = {
      ...unit,
      finalPractice: {
        ...unit.finalPractice,
        status: "Finalized",
        isAvailable: true,
        unavailableReason: null,
        isTrainingComplete: true,
      },
    };
    course.completedLessons = 8;
    course.progressPercent = 100;
    course.progressState = "Completed";
    request.status = "Completed";
    request.calculatedGrade = "Pass";
  }
  if (scenario === "missing-configuration") {
    aim = { ...aim, practiceStatus: "NotConfigured", practiceAvailable: false };
    unit = {
      ...unit,
      finalPractice: {
        status: "NotConfigured",
        isAvailable: false,
        unavailableReason: "NotConfigured",
        isTrainingComplete: false,
      },
    };
  }
  if (scenario === "expired" || scenario === "restricted") {
    const reason =
      scenario === "expired" ? "DeadlineExpired" : "AccessRestricted";
    unit = {
      ...unit,
      finalPractice: {
        ...unit.finalPractice,
        status: "Locked",
        isAvailable: false,
        unavailableReason: reason,
        effectiveDueAtUtc: "2026-01-05T09:00:00Z",
      },
    };
    if (scenario === "restricted") course.accessAvailable = false;
    else
      aim = {
        ...aim,
        practiceStatus: "Finalized",
        isComplete: true,
        trainingOutcome: "Merit",
      };
  }
  if (scenario === "revision") {
    request.status = "NeedsRevision";
    request.submissionAttemptNumber = 2;
    request.effectiveRevisionDueAtUtc = "2026-12-20T09:00:00Z";
    request.feedback = [
      {
        body: "RAW feedback · أرفق الدليل المحدّث مع إعلان الأصالة",
        requestsResubmission: true,
        createdAtUtc: "2026-10-01T10:00:00Z",
      },
    ];
  }
  if (scenario === "resit") {
    request.id = "eval-new-resit";
    request.status = "PendingPayment";
    request.isResit = true;
    request.resitOfEvaluationRequestId = "eval-original";
  }
  if (scenario === "historical-retake") {
    request.isRetake = true;
    request.retakeOfEvaluationRequestId = "eval-historical-original";
  }
  if (scenario === "zero") {
    aim = {
      ...aim,
      contentTotal: 0,
      contentCompleted: 0,
      contentComplete: false,
    };
    course.completedLessons = 0;
    course.totalLessons = 0;
    course.progressPercent = 0;
    course.progressState = "NotStarted";
  }
  if (scenario === "partial-data") {
    aim = {
      id: baseAim.id,
      code: baseAim.code,
      arabicTitle: baseAim.arabicTitle,
      englishTitle: baseAim.englishTitle,
    };
    unit = {
      id: baseUnit.id,
      arabicTitle: baseUnit.arabicTitle,
      englishTitle: baseUnit.englishTitle,
    };
    delete course.completedLessons;
    delete course.progressState;
    delete course.accessAvailable;
    request.status = undefined;
  } else unit = { ...unit, aims: [aim] };
  return {
    aim,
    unit,
    course,
    request,
    units: [
      confirmed,
      unit,
      {
        ...baseUnit,
        id: "unit-3",
        arabicTitle: "الوحدة الثالثة · التطبيق",
        englishTitle: "Unit three · application",
        aims: [
          {
            ...baseAim,
            id: "aim-future",
            isUnlocked: false,
            contentCompleted: 0,
          },
        ],
      },
    ] satisfies UnitSnapshot[],
  };
}
