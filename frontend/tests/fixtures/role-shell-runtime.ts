import dashboard from "./admin-dashboard.json" with { type: "json" };

// Synthetic response data for current-shell browser evidence only.
export function roleShellRuntimeResponse(
  path: string,
  locale: string,
  roles: string[],
) {
  const course = {
    id: "course-raw",
    isBtecFocused: false,
    arabicTitle: "دورة اختبار طويلة لتوضيح سياق العمل الحالي",
    englishTitle: "A synthetic course for current workspace context",
    arabicDescription: "وصف اختبار",
    englishDescription: "Synthetic description",
    status: "Published",
    price: 12.5,
    isFree: false,
    hasCover: false,
    outcomes: [],
    modules: [],
    moduleCount: 1,
    lessonCount: 4,
  };
  if (path === "/auth/me")
    return roles.length
      ? {
          status: 200,
          json: {
            displayName: "Synthetic account",
            roles,
            requiresMfaEnrollment: false,
          },
        }
      : { status: 401, json: { message: "Unauthenticated fixture" } };
  if (path === "/settings/public") return { status: 200, json: {} };
  if (path === "/notifications" || path === "/public/teachers")
    return { status: 200, json: [] };
  if (path === "/cart") return { status: 200, json: { items: [] } };
  if (path === "/taxonomy")
    return {
      status: 200,
      json: { tracks: [], grades: [], specializations: [], subjects: [] },
    };
  if (path === "/catalog/courses")
    return {
      status: 200,
      json: { items: [], page: 1, pageSize: 5, totalCount: 0 },
    };
  if (path === "/teacher/courses") return { status: 200, json: [course] };
  if (path === "/teacher/courses/course-raw")
    return { status: 200, json: course };
  if (path === "/teacher/analytics")
    return {
      status: 200,
      json: {
        courses: 1,
        students: 8,
        pendingReviews: 2,
        averageLessonProgress: 25,
        studentsAtRisk: [],
        studentsAtRiskCount: 0,
      },
    };
  if (path === "/admin/dashboard") return { status: 200, json: dashboard };
  if (
    path === "/evaluations/pending-assignment" ||
    path === "/evaluations/under-review"
  )
    return { status: 200, json: [] };
  if (
    path === "/assessment-coordination/queue" ||
    path === "/resits/authorizations"
  )
    return {
      status: 200,
      json: {
        items: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        hasNextPage: false,
      },
    };
  if (path === "/admin/users/freeze-targets")
    return { status: 200, json: { items: [], totalCount: 0 } };
  if (path === "/learning/my-courses")
    return {
      status: 200,
      json: {
        items: [
          {
            courseId: course.id,
            arabicTitle: course.arabicTitle,
            englishTitle: course.englishTitle,
            localizedTitle:
              locale === "ar" ? course.arabicTitle : course.englishTitle,
            completedLessons: 1,
            totalLessons: 4,
            publishedModuleCount: 1,
            progressPercent: 25,
            progressState: "InProgress",
            hasCover: false,
            teacherName: "Synthetic teacher",
            enrolledAtUtc: "2026-10-01T10:00:00Z",
            accessAvailable: true,
          },
        ],
        page: 1,
        pageSize: 12,
        totalCount: 1,
        summary: {
          totalCourses: 1,
          notStarted: 0,
          inProgress: 1,
          completed: 0,
          completedLessons: 1,
          totalLessons: 4,
          progressPercent: 25,
        },
      },
    };
  return {
    status: 503,
    json: { message: "Unavailable synthetic subpanel fixture" },
  };
}
