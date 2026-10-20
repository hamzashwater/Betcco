import type { StudentCoursesLearningHubResult } from "../../src/features/student/student-courses-learning-hub";

// Synthetic GET payloads only: MOCKED UI-CONTRACT EVIDENCE.
export const continuityCourseId = "00000000-0000-0000-0000-000000000701";
export const continuityLessonId = "00000000-0000-0000-0000-000000000704";
export const resumeLessonId = "00000000-0000-0000-0000-000000000703";
export function continuityCourses(
  locale: string,
): StudentCoursesLearningHubResult {
  const first = {
    courseId: continuityCourseId,
    arabicTitle: "تطوير التطبيقات وإدارة المشاريع العملية",
    englishTitle: "Application development and practical project delivery",
    localizedTitle:
      locale === "ar"
        ? "تطوير التطبيقات وإدارة المشاريع العملية"
        : "Application development and practical project delivery",
    completedLessons: 2,
    totalLessons: 7,
    publishedModuleCount: 2,
    progressPercent: 28.57,
    progressState: "InProgress" as const,
    hasCover: true,
    teacherName: locale === "ar" ? "مدرس الاختبار" : "Synthetic teacher",
    enrolledAtUtc: "2026-10-01T10:00:00Z",
    accessAvailable: true,
  };
  return {
    items: [
      first,
      {
        ...first,
        courseId: "locked-course",
        localizedTitle:
          locale === "ar" ? "مقرر لم يتوفر بعد" : "Course not yet available",
        hasCover: false,
        accessAvailable: false,
        accessAvailableAtUtc: "2027-01-01T10:00:00Z",
      },
      {
        ...first,
        courseId: "later-course",
        localizedTitle:
          locale === "ar"
            ? "مقرر لاحق في ترتيب الخادم"
            : "Later course in server order",
        hasCover: false,
        progressPercent: 90,
      },
    ],
    page: 1,
    pageSize: 12,
    totalCount: 3,
    summary: {
      totalCourses: 3,
      notStarted: 0,
      inProgress: 3,
      completed: 0,
      completedLessons: 6,
      totalLessons: 21,
      progressPercent: 28.57,
    },
  };
}

export function continuityOverview(locale: string) {
  return {
    notes: [],
    bookmarks: [],
    calendar: [],
    certificates: [],
    unreadNotifications: 0,
    achievements: [],
    upcomingAssignments: [
      {
        id: "assignment-context",
        courseId: continuityCourseId,
        lessonId: continuityLessonId,
        title:
          locale === "ar" ? "تكليف التطبيق العملي" : "Practical assignment",
        courseTitle: continuityCourses(locale).items[0].localizedTitle,
        dueAtUtc: "2026-11-01T12:00:00Z",
      },
    ],
    pendingActions: [
      { kind: "ResitDraft", evaluationRequestId: "resit-draft" },
      {
        kind: "EvaluationRevision",
        evaluationRequestId: "revision",
        effectiveDueAtUtc: "2026-11-02T12:00:00Z",
      },
      { kind: "EvaluationDraft", evaluationRequestId: "draft" },
      { kind: "ResitAuthorized", evaluationRequestId: "original" },
    ],
  };
}
